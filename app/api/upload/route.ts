import { NextRequest, NextResponse } from "next/server";
import {
  META_KEY, getMeta, saveMeta, ADMIN_PASSWORD,
  getPublicDomain, listFiles, uploadFile, removeFiles,
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
    const [files, meta] = await Promise.all([listFiles(), getMeta()]);
    const result = files
      .filter(f => f.key !== META_KEY)
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
      .map(f => ({
        key: f.key,
        displayName: meta[f.key]?.displayName ?? f.key.replace(/^\d+_/, "").replace(/\.[^.]+$/, ""),
        size: f.size,
        lastModified: f.lastModified.toISOString(),
        publicUrl: `${getPublicDomain()}/${f.key}`,
      }));
    return NextResponse.json({ files: result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/upload — アップロード */
export async function POST(req: NextRequest) {
  if (!checkAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file)
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 400 });

  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${Date.now()}_${sanitized}`;
  const buffer = new Uint8Array(await file.arrayBuffer());
  const displayName = sanitized.replace(/\.[^.]+$/, "");

  await uploadFile(key, buffer, file.type || "audio/mpeg");

  const meta = await getMeta();
  meta[key] = { displayName };
  await saveMeta(meta);

  return NextResponse.json({ key, publicUrl: `${getPublicDomain()}/${key}` });
}

/** DELETE /api/upload — 削除 */
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { keys?: string[] };
  const keys = body.keys ?? [];
  if (!keys.length)
    return NextResponse.json({ error: "keys が必要です" }, { status: 400 });

  await removeFiles(keys);

  const meta = await getMeta();
  for (const k of keys) delete meta[k];
  await saveMeta(meta);

  return NextResponse.json({ deleted: keys });
}
