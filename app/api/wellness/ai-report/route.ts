import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listDailyWellness, listActivitiesLightByUser, getAppConfig, createId } from "@/lib/storage";
import { computeReadiness } from "@/lib/engine/readiness-engine";
import { calculatePmc, getCurrentPmc } from "@/lib/engine/pmc";
import { normalizeAiBaseUrl, parseAiJsonResponse } from "@/lib/ai-provider";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { WELLNESS_SYSTEM_PROMPT, buildWellnessContext, buildWellnessUserPrompt } from "@/lib/wellness-ai";

function getWellnessPrompt(config: { wellnessAiSystemPrompt?: string | null }) {
  return config.wellnessAiSystemPrompt?.trim() || WELLNESS_SYSTEM_PROMPT;
}

export async function GET() {
  try {
    const user = await requireUser();
    const record = await prisma.wellnessAiReport.findUnique({
      where: { userId: user.id },
    });

    if (!record) {
      return NextResponse.json({ report: null });
    }

    return NextResponse.json({
      report: JSON.parse(record.reportJson),
      context: JSON.parse(record.contextJson),
      model: record.model,
      generatedAt: record.generatedAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await requireUser();

    const [recent7, baseline30, activities] = await Promise.all([
      listDailyWellness(user.id, 7),
      listDailyWellness(user.id, 30),
      listActivitiesLightByUser(user.id),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = recent7.find((d) => d.date === today) ?? {
      id: "", userId: user.id, date: today,
      restingHr: null, hrv: null, sleepSecs: null, sleepScore: null,
      sleepQuality: null, awakeTime: null, lightSleepTime: null, remSleepTime: null, deepSleepTime: null, avgSleepBreathRate: null,
      weight: null, spO2: null, steps: null, statusTag: null, note: null,
      readinessScore: null, createdAt: new Date(), updatedAt: new Date(),
    };

    const pmcData = calculatePmc(activities);
    const currentPmc = getCurrentPmc(pmcData);
    const readiness = computeReadiness(todayEntry, recent7, baseline30, currentPmc?.tsb, currentPmc?.ctl, currentPmc?.atl);

    const context = buildWellnessContext(user, readiness, recent7, baseline30, currentPmc?.tsb);

    const config = await getAppConfig();
    if (!config.aiEnabled || !config.aiBaseUrl || !config.aiModel || !config.aiApiKeyEncrypted) {
      return NextResponse.json(
        { error: "AI 服务尚未配置，请联系管理员在 AI 配置中启用。" },
        { status: 400 },
      );
    }

    const apiKey = decryptSecret(config.aiApiKeyEncrypted);
    const payload = {
      model: config.aiModel,
      messages: [
        { role: "system", content: getWellnessPrompt(config) },
        { role: "user", content: buildWellnessUserPrompt(context) },
      ],
      response_format: { type: "json_object" },
    };

    const response = await fetch(normalizeAiBaseUrl(config.aiBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await parseAiJsonResponse(response);
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回结果为空");

    let report;
    try {
      report = JSON.parse(content);
    } catch {
      throw new Error("AI 返回的不是有效的 JSON");
    }

    const now = new Date();
    await prisma.wellnessAiReport.upsert({
      where: { userId: user.id },
      create: {
        id: createId("war"),
        userId: user.id,
        reportJson: JSON.stringify(report),
        contextJson: JSON.stringify(context),
        model: config.aiModel,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        reportJson: JSON.stringify(report),
        contextJson: JSON.stringify(context),
        model: config.aiModel,
        generatedAt: now,
        updatedAt: now,
      },
    });

    return NextResponse.json({
      success: true,
      report,
      context,
      model: config.aiModel,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 分析生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
