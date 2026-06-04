import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { generateAiNarrative } from "@/lib/ai";
import { buildRequestUrl } from "@/lib/request-url";
import {
  createId,
  getActivity,
  getFuelLogByActivityId,
  listActivitiesByUser,
  listRidePlansByUser,
  saveAiReport,
} from "@/lib/storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const [activity, fuelLog, ridePlans, recentActivities] = await Promise.all([
    getActivity(id),
    getFuelLogByActivityId(id),
    listRidePlansByUser(user.id),
    listActivitiesByUser(user.id),
  ]);

  if (!activity || activity.userId !== user.id) {
    return NextResponse.redirect(buildRequestUrl(request, "/"), 303);
  }

  try {
    const ai = await generateAiNarrative({
      activity,
      user,
      fuelLog,
      referenceRidePlan: ridePlans[0],
      recentActivities,
    });

    await saveAiReport({
      id: createId("air"),
      activityId: activity.id,
      userId: user.id,
      reviewText: ai.reviewText,
      recoveryText: ai.recoveryText,
      fuelReviewText: ai.fuelReviewText,
      model: ai.model,
      generatedAt: new Date().toISOString(),
    });

    return NextResponse.redirect(
      buildRequestUrl(request, `/activities/${activity.id}?success=` + encodeURIComponent("AI 报告已生成。")),
      303,
    );
  } catch (error) {
    return NextResponse.redirect(
      buildRequestUrl(request, `/activities/${activity.id}?error=` + encodeURIComponent(error instanceof Error ? error.message : "AI 生成失败。")),
      303,
    );
  }
}
