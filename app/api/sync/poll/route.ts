import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { pollUserForNewActivities } from "@/lib/system-sync";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!user.intervalsApiKeyEncrypted || !user.intervalsAthleteId) {
    return NextResponse.json({
      newActivities: 0,
      totalChecked: 0,
      lastSeenId: null,
      skipped: "未配置 intervals.icu",
    });
  }

  try {
    const result = await pollUserForNewActivities(user);
    return NextResponse.json({
      newActivities: result.newActivities,
      totalChecked: result.totalChecked,
      lastSeenId: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "轮询检查失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
