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
    if (error instanceof Error && error.message.includes("redirect")) throw error;
    const message = error instanceof Error ? error.message : "评级生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
