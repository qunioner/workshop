import { NextRequest } from "next/server";
import { fetchObject } from "@/lib/r2";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key)
    return new Response(JSON.stringify({ error: "key が必要です" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });

  const obj = await fetchObject(key);
  if (!obj)
    return new Response(JSON.stringify({ error: "ファイルが見つかりません" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });

  const filename = key.replace(/^\d+_/, "");
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
