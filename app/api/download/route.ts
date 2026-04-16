import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";
import { s3, BUCKET } from "@/lib/r2";

export const runtime = "edge";

/** GET /api/download?key=xxx — R2 からファイルを取得してダウンロードさせる */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key)
    return new Response(JSON.stringify({ error: "key が必要です" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const result = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );

  const stream = result.Body?.transformToWebStream();
  if (!stream)
    return new Response(JSON.stringify({ error: "ファイルが見つかりません" }), { status: 404, headers: { "Content-Type": "application/json" } });

  const filename = key.replace(/^\d+_/, "");
  const encodedFilename = encodeURIComponent(filename);

  return new Response(stream, {
    headers: {
      "Content-Type": result.ContentType ?? "audio/mpeg",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
    },
  });
}
