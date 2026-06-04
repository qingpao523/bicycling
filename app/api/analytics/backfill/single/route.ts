import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { backfillSingleActivity } from "@/lib/engine/stream-backfill";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const activityId = String(body?.activityId ?? "").trim();
    if (!activityId) {
      return NextResponse.json({ error: "缺少 activityId" }, { status: 400 });
    }

    const result = await backfillSingleActivity(user.id, activityId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "拉取失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
