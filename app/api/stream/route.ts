import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";
import { createS3Client, getBucketName } from "@/lib/r2";

export const runtime = "edge";

/**
 * GET /api/stream?key=xxx
 * R2 の音声ファイルを同一オリジンとしてストリーミング。
 * Range リクエスト対応でシーク・iOS 再生が動作する。
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new Response("key required", { status: 400 });

  const rangeHeader = req.headers.get("range") ?? undefined;

  try {
    const s3 = createS3Client();
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: key,
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      })
    );

    const headers: Record<string, string> = {
      "Content-Type": result.ContentType ?? "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    };
    if (result.ContentRange) headers["Content-Range"] = result.ContentRange;
    if (result.ContentLength != null)
      headers["Content-Length"] = String(result.ContentLength);

    const status = rangeHeader ? 206 : 200;
    const stream = result.Body?.transformToWebStream();

    return new Response(stream ?? null, { status, headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
