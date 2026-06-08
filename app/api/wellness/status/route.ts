import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { upsertDailyWellnessTag } from "@/lib/storage";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: { date?: string; statusTag?: string | null; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const date = body.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "日期格式错误" }, { status: 400 });
  }

  const validTags = ["tired", "sick", "stressed"];
  const statusTag = body.statusTag && validTags.includes(body.statusTag) ? body.statusTag : null;

  const result = await upsertDailyWellnessTag(user.id, date, statusTag, body.note);

  return NextResponse.json({ ok: true, date: result.date, statusTag: result.statusTag });
}
