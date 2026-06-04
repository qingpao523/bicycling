import { NextResponse } from "next/server";

import { generateAiNarrative } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";
import {
  createId,
  getActivity,
  getAppConfig,
  getFuelLogByActivityId,
  listActivitiesByUser,
  listRidePlansByUser,
  saveAiReport,
  saveFuelLog,
} from "@/lib/storage";
import type { FuelLog } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const activity = await getActivity(id);
  if (!activity || activity.userId !== user.id) {
    return NextResponse.redirect(buildRequestUrl(request, "/"), { status: 303 });
  }
  const formData = await request.formData();
  const existing = await getFuelLogByActivityId(id);

  const symptomValues = formData.getAll("symptoms").map((item) => String(item));
  const doubleGelCountActual = Number(formData.get("doubleGelCountActual") ?? 0);
  const caffeineGelCountActual = Number(formData.get("caffeineGelCountActual") ?? 0);
  const saltCapsuleCountActual = Number(formData.get("saltCapsuleCountActual") ?? 0);
  const carbOtherGrams = Number(formData.get("carbOtherGrams") ?? 0);

  const fuelLog: FuelLog = {
    id: existing?.id ?? createId("fl"),
    activityId: id,
    gelCountActual: doubleGelCountActual + caffeineGelCountActual,
    doubleGelCountActual,
    caffeineGelCountActual,
    saltCapsuleCountActual,
    carbOtherGrams,
    waterMlActual: Number(formData.get("waterMlActual")),
    electrolyteUsed: formData.get("electrolyteUsed") === "true",
    carbOtherDesc: String(formData.get("carbOtherDesc") ?? ""),
    fatigueScore: Number(formData.get("fatigueScore")),
    legFatigueScore: Number(formData.get("legFatigueScore")),
    symptoms: symptomValues,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveFuelLog(fuelLog);
  const config = await getAppConfig();
  let successMessage = "补给记录已更新，恢复建议已刷新。";

  if (config.featureAiReview && config.aiEnabled) {
    try {
      const [ridePlans, recentActivities] = await Promise.all([
        listRidePlansByUser(user.id),
        listActivitiesByUser(user.id),
      ]);
      const ai = await generateAiNarrative({
        activity,
        user,
        fuelLog,
        referenceRidePlan: ridePlans[0],
        recentActivities,
      });

      await saveAiReport({
        id: createId("air"),
        activityId: id,
        userId: user.id,
        reviewText: ai.reviewText,
        recoveryText: ai.recoveryText,
        fuelReviewText: ai.fuelReviewText,
        model: ai.model,
        generatedAt: new Date().toISOString(),
      });
      successMessage = "补给记录已更新，AI 结论和恢复建议已按最新补给重算。";
    } catch {
      successMessage = "补给记录已更新，恢复建议已刷新。AI 报告未自动重算，可手动重新生成。";
    }
  }

  const url = buildRequestUrl(request, `/activities/${id}?success=${encodeURIComponent(successMessage)}`);
  return NextResponse.redirect(url, { status: 303 });
}
