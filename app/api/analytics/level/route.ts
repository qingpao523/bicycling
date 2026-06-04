// app/api/analytics/level/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listActivitiesByUser } from "@/lib/storage";
import { evaluateLevel } from "@/lib/engine/cycling-levels";
import { generateUpgradePlan } from "@/lib/engine/level-progression";
import { predictEta } from "@/lib/engine/level-eta";
import { calculatePmc } from "@/lib/engine/pmc";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const activities = await listActivitiesByUser(user.id);

    if (activities.length < 5) {
      return NextResponse.json(
        { error: "活动数据不足", minimumActivities: 5, current: activities.length },
        { status: 422 },
      );
    }

    const evaluation = evaluateLevel({ activities, user });
    const upgradePlan = generateUpgradePlan(evaluation);
    const pmcSeries = calculatePmc(activities);
    const eta = predictEta(evaluation, pmcSeries);

    return NextResponse.json({
      evaluation,
      upgradePlan,
      eta,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    // Next.js 15: redirect() throws Error with digest starting "NEXT_REDIRECT"
    // 必须 rethrow 让 Next.js 转成 307,否则被 catch 吞成 500
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
        (error as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "评级生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
