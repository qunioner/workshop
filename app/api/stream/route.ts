import { NextRequest } from "next/server";
import { fetchObject } from "@/lib/r2";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new Response("key required", { status: 400 });

  const obj = await fetchObject(key, req.headers.get("range") ?? undefined);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": obj.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };
  if (obj.contentRange) headers["Content-Range"] = obj.contentRange;
  if (obj.contentLength != null) headers["Content-Length"] = String(obj.contentLength);

  return new Response(obj.body, { status: obj.status, headers });
}
