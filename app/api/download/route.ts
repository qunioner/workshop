import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { s3, BUCKET } from "@/lib/r2";

/** GET /api/download?key=xxx — R2 からファイルを取得してダウンロードさせる */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key)
    return NextResponse.json({ error: "key が必要です" }, { status: 400 });

  const result = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );

  const body = await result.Body?.transformToByteArray();
  if (!body)
    return NextResponse.json(
      { error: "ファイルが見つかりません" },
      { status: 404 }
    );

  // タイムスタンププレフィックスを除いたファイル名
  const filename = key.replace(/^\d+_/, "");
  const encodedFilename = encodeURIComponent(filename);

  return new NextResponse(Buffer.from(body), {
    headers: {
      "Content-Type": result.ContentType ?? "audio/mpeg",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
    },
  });
}
