import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { calculatePmc } from "@/lib/engine/pmc";
import { buildPowerCurve } from "@/lib/engine/power-curve";
import { buildAnalyticsContext, generateAnalyticsReport } from "@/lib/engine/ai-analytics";
import { prisma } from "@/lib/prisma";
import { getAppConfig } from "@/lib/storage";

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function GET() {
  try {
    const user = await requireUser();
    const record = await prisma.analyticsAiReport.findUnique({
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
    const { activities } = await loadAnalyticsData(user);

    if (activities.length < 5) {
      return NextResponse.json(
        { error: "活动数据不足，至少需要 5 条活动记录才能生成 AI 分析。" },
        { status: 400 }
      );
    }

    const pmcData = calculatePmc(activities);
    const weightKg = user.weightKg ?? user.syncedWeightKg;
    const { curve } = buildPowerCurve(activities, weightKg ?? undefined);

    const context = buildAnalyticsContext({
      user,
      activities,
      pmcData,
      powerCurve: curve,
    });

    const report = await generateAnalyticsReport(context);
    const config = await getAppConfig();
    const model = config.aiModel ?? "unknown";
    const now = new Date();

    await prisma.analyticsAiReport.upsert({
      where: { userId: user.id },
      create: {
        id: createId("aar"),
        userId: user.id,
        reportJson: JSON.stringify(report),
        contextJson: JSON.stringify(context),
        model,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        reportJson: JSON.stringify(report),
        contextJson: JSON.stringify(context),
        model,
        generatedAt: now,
        updatedAt: now,
      },
    });

    return NextResponse.json({
      success: true,
      report,
      context,
      model,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 分析生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
