import {
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import {
  createS3Client,
  getBucketName,
  META_KEY,
  getMeta,
  saveMeta,
  ADMIN_PASSWORD,
  getPublicDomain,
} from "@/lib/r2";

export const runtime = "edge";

function checkAuth(req: NextRequest) {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD;
}

/** GET /api/upload — ファイル一覧 */
export async function GET(req: NextRequest) {
  if (!checkAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
  const s3 = createS3Client();
  const bucket = getBucketName();

  const [listResult, meta] = await Promise.all([
    s3.send(new ListObjectsV2Command({ Bucket: bucket })),
    getMeta(),
  ]);

  const files = (listResult.Contents ?? [])
    .filter((obj) => obj.Key !== META_KEY)
    .sort(
      (a, b) =>
        (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0)
    )
    .map((obj) => ({
      key: obj.Key!,
      displayName:
        meta[obj.Key!]?.displayName ??
        obj.Key!.replace(/^\d+_/, "").replace(/\.[^.]+$/, ""),
      size: obj.Size ?? 0,
      lastModified: obj.LastModified?.toISOString() ?? null,
      publicUrl: `${getPublicDomain()}/${obj.Key}`,
    }));

  return NextResponse.json({ files });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/upload — アップロード */
export async function POST(req: NextRequest) {
  if (!checkAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file)
    return NextResponse.json(
      { error: "ファイルが見つかりません" },
      { status: 400 }
    );

  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${Date.now()}_${sanitized}`;
  const buffer = new Uint8Array(await file.arrayBuffer());
  const displayName = sanitized.replace(/\.[^.]+$/, "");

  const s3 = createS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: buffer,
      ContentType: file.type || "audio/mpeg",
    })
  );

  const meta = await getMeta();
  meta[key] = { displayName };
  await saveMeta(meta);

  return NextResponse.json({
    key,
    publicUrl: `${getPublicDomain()}/${key}`,
  });
}

/** DELETE /api/upload — 1件または複数削除 */
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { keys?: string[] };
  const keys = body.keys ?? [];
  if (!keys.length)
    return NextResponse.json({ error: "keys が必要です" }, { status: 400 });

  const s3 = createS3Client();
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: getBucketName(),
      Delete: { Objects: keys.map((k) => ({ Key: k })) },
    })
  );

  const meta = await getMeta();
  for (const k of keys) delete meta[k];
  await saveMeta(meta);

  return NextResponse.json({ deleted: keys });
}
