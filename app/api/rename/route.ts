import { NextRequest, NextResponse } from "next/server";
import { getMeta, saveMeta } from "@/lib/r2";

/** PATCH /api/rename — 表示名を変更 */
export async function PATCH(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { key?: string; displayName?: string };
  const { key, displayName } = body;

  if (!key || !displayName?.trim())
    return NextResponse.json(
      { error: "key と displayName が必要です" },
      { status: 400 }
    );

  const meta = await getMeta();
  meta[key] = { ...meta[key], displayName: displayName.trim() };
  await saveMeta(meta);

  return NextResponse.json({ key, displayName: displayName.trim() });
}
