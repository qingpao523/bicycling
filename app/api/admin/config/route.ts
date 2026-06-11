import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { buildRequestUrl } from "@/lib/request-url";
import { updateAppConfig } from "@/lib/storage";

function boolValue(value: FormDataEntryValue | null) {
  return value === "true";
}

export async function POST(request: Request) {
  await requireAdmin();
  const formData = await request.formData();
  const aiApiKey = String(formData.get("aiApiKey") ?? "");

  try {
    const patch = {
      appName: String(formData.get("appName") ?? "AI 骑行助手"),
      authMode: String(formData.get("authMode") ?? "invite_only") as "invite_only" | "open_registration",
      maintenanceMode: boolValue(formData.get("maintenanceMode")),
      maintenanceMessage: String(formData.get("maintenanceMessage") ?? ""),
      featureRidePlans: boolValue(formData.get("featureRidePlans")),
      featureRecovery: boolValue(formData.get("featureRecovery")),
      featureAiReview: boolValue(formData.get("featureAiReview")),
      featureIntervalsSync: boolValue(formData.get("featureIntervalsSync")),
      aiEnabled: boolValue(formData.get("aiEnabled")),
      aiBaseUrl: String(formData.get("aiBaseUrl") ?? ""),
      aiModel: String(formData.get("aiModel") ?? ""),
      aiSystemPrompt: String(formData.get("aiSystemPrompt") ?? ""),
      wellnessAiSystemPrompt: String(formData.get("wellnessAiSystemPrompt") ?? ""),
      developmentVersion: String(formData.get("developmentVersion") ?? "0.1.1-dev"),
      autoSyncEnabled: boolValue(formData.get("autoSyncEnabled")),
      autoSyncIntervalHours: Number(formData.get("autoSyncIntervalHours") ?? 6),
      autoSyncIntervals: boolValue(formData.get("autoSyncIntervals")),
      autoSyncStrava: boolValue(formData.get("autoSyncStrava")),
      ...(aiApiKey ? { aiApiKeyEncrypted: encryptSecret(aiApiKey) } : {}),
    };

    await updateAppConfig(patch);
    return NextResponse.redirect(
      buildRequestUrl(request, "/admin?success=" + encodeURIComponent("系统配置已保存。")),
      303,
    );
  } catch (error) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/admin?error=" + encodeURIComponent(error instanceof Error ? error.message : "保存失败。")),
      303,
    );
  }
}
