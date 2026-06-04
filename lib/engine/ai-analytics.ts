/**
 * AI-powered analytics engine for multi-dimensional training analysis
 * Reuses existing AI provider infrastructure
 */

import { normalizeAiBaseUrl, parseAiJsonResponse } from "@/lib/ai-provider";
import { decryptSecret } from "@/lib/crypto";
import { getAppConfig } from "@/lib/storage";
import type { Activity, User } from "@/lib/types";
import type { PmcDataPoint } from "./pmc";
import type { PowerCurvePoint } from "./power-curve";

export interface AnalyticsAiContext {
  user: {
    weight_kg?: number;
    ftp?: number;
    ftp_wpkg?: number;
    threshold_hr?: number;
    max_hr?: number;
    resting_hr?: number;
  };
  pmc_summary: {
    current_ctl?: number;
    current_atl?: number;
    current_tsb?: number;
    ctl_trend_30d?: number; // change over last 30 days
    avg_weekly_tss_28d?: number;
    max_ctl_all_time?: number;
  };
  power_curve: {
    best_5s?: { power: number; wpkg?: number };
    best_1min?: { power: number; wpkg?: number };
    best_5min?: { power: number; wpkg?: number };
    best_20min?: { power: number; wpkg?: number };
    best_60min?: { power: number; wpkg?: number };
  };
  volume_summary: {
    total_activities_90d: number;
    total_hours_90d: number;
    total_distance_km_90d: number;
    total_tss_90d: number;
    total_elevation_m_90d: number;
  };
  hr_power_analysis: {
    avg_ef?: number; // Efficiency Factor
    hr_to_power_ratio?: number;
    activities_with_hr_pct?: number;
  };
  zone_distribution?: {
    z1_pct?: number;
    z2_pct?: number;
    z3_pct?: number;
    z4_pct?: number;
    z5_pct?: number;
    z6_pct?: number;
    z7_pct?: number;
  };
}

export interface AnalyticsAiResult {
  overall_summary: string; // 综合评价
  strengths: string[]; // 强项
  weaknesses: string[]; // 弱项
  bottleneck_analysis: {
    primary: string; // 主要瓶颈
    description: string; // 生理机制描述
    affected_scenarios: string[]; // 受影响的赛事/场景
  };
  vo2max_estimate?: {
    value: number;
    unit: string;
    interpretation: string;
  };
  improvement_paths: {
    title: string;
    method: string;
    timeframe: string;
    priority: "high" | "medium" | "low";
  }[];
  rider_type_analysis: {
    current_type: string;
    target_suggestion?: string;
    gap_analysis?: string;
  };
  training_recommendations: string[];
}

function buildSystemPrompt(): string {
  return [
    "你是一名专业的骑行功率训练分析教练，精通运动生理学、训练负荷管理和功率形态分析。",
    "你的任务是基于用户的综合训练数据（PMC 体能管理、功率曲线、训练量、心率功率效率等），生成一份多维度的深度分析报告。",
    "分析必须基于具体数据，不要泛泛而谈，每个结论都要能找到数据依据。",
    "重点关注以下维度：",
    "1. 有氧能力瓶颈（VO2max、EF 效率因子、阈值能力）",
    "2. 生理制约因素（心血管系统 SV/CO、外周氧运输 毛细血管密度、线粒体系统 摄氧效率）",
    "3. 骑手类型定位（冲刺型/追击型/全能型/爬坡型/计时赛型）与目标类型差距",
    "4. 训练结构问题（功率区间分布是否合理、高低强度比例）",
    "5. 可执行的改善路径（包含短期 4-8 周与长期 6-12 个月）",
    "输出必须严格按照 JSON schema 返回，所有字段必填且内容具体。",
    "风格要求：专业、精准、有判断力，避免空洞鼓励话术。允许使用 W/kg、FTP%、Z1-Z7 等专业术语。",
  ].join(" ");
}

function buildUserPrompt(context: AnalyticsAiContext): string {
  return JSON.stringify({
    task: "基于以下用户的综合训练数据，生成多维度的功率分析与瓶颈评估报告。",
    user_data: context,
    output_schema: {
      overall_summary: "string · 2-3 句综合评价，点出当前训练水平和主要问题",
      strengths: "string[] · 2-4 条强项，每条要具体引用数据",
      weaknesses: "string[] · 2-4 条弱项，每条要具体引用数据",
      bottleneck_analysis: {
        primary: "string · 主要瓶颈所在系统（心血管/外周氧运输/线粒体）",
        description: "string · 详细的生理机制说明，描述为什么是这个瓶颈",
        affected_scenarios: "string[] · 该瓶颈影响的赛事类型或训练场景",
      },
      vo2max_estimate: {
        value: "number · 估算的 VO2max 值",
        unit: "string · 单位（ml/kg/min）",
        interpretation: "string · VO2max 水平的解读与潜力评估",
      },
      improvement_paths: [
        {
          title: "string · 改善方向标题",
          method: "string · 具体训练方法（时长、强度、频次）",
          timeframe: "string · 预期适应时间（短期 4-8 周 或 长期 6-12 个月）",
          priority: "high|medium|low",
        },
      ],
      rider_type_analysis: {
        current_type: "string · 当前骑手类型",
        target_suggestion: "string · 建议发展方向",
        gap_analysis: "string · 与目标类型的差距分析",
      },
      training_recommendations: "string[] · 3-5 条具体可执行的训练建议",
    },
    instructions: [
      "必须引用具体数据（如当前 CTL、W/kg、EF 值）作为判断依据",
      "VO2max 估算：基于 FTP×10.8/体重 + 7 的基础公式，但要根据 EF 效率因子做校准",
      "瓶颈分析要体现生理学深度，参考：心搏输出量(SV)、毛细血管密度、线粒体生物合成等概念",
      "改善路径必须具体到训练方法（如 '每周 2×20min @ 88-94% FTP 的 Sweet Spot 训练'）",
      "按 improvement_paths 的 priority 排序，最迫切的排第一",
      "如果数据不足（如无功率流、无心率），必须明确说明并给出替代建议",
      "**严格遵守字段类型**：strengths、weaknesses、affected_scenarios、training_recommendations 必须是字符串数组（array of strings），不能是单个字符串或用分号拼接的字符串。每个数组至少 2 项，最多 5 项。",
      "improvement_paths 必须是对象数组，每项包含 title、method、timeframe、priority 四个字段。",
    ],
  });
}

export async function generateAnalyticsReport(context: AnalyticsAiContext): Promise<AnalyticsAiResult> {
  const config = await getAppConfig();
  if (!config.aiEnabled || !config.aiBaseUrl || !config.aiModel || !config.aiApiKeyEncrypted) {
    throw new Error("AI 服务尚未配置，请联系管理员在 AI 配置中启用。");
  }

  const apiKey = decryptSecret(config.aiApiKeyEncrypted);
  const aiBaseUrl = config.aiBaseUrl;
  const aiModel = config.aiModel;

  const payload = {
    model: aiModel,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(context) },
    ],
    response_format: { type: "json_object" },
  };

  const response = await fetch(normalizeAiBaseUrl(aiBaseUrl), {
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

  let parsed: AnalyticsAiResult;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI 返回的不是有效的 JSON");
  }

  return parsed;
}

/**
 * Build analytics context from user data
 */
export function buildAnalyticsContext(input: {
  user: User;
  activities: Activity[];
  pmcData: PmcDataPoint[];
  powerCurve: PowerCurvePoint[];
}): AnalyticsAiContext {
  const { user, activities, pmcData, powerCurve } = input;

  // Recent 90 days activities
  const d90 = new Date();
  d90.setDate(d90.getDate() - 90);
  const recent90 = activities.filter((a) => new Date(a.startTime) >= d90);

  // PMC metrics
  const latest = pmcData[pmcData.length - 1];
  const thirty = pmcData[pmcData.length - 30];
  const ctlTrend30 = latest && thirty ? Number((latest.ctl - thirty.ctl).toFixed(1)) : undefined;
  const maxCtl = pmcData.length ? Math.max(...pmcData.map((p) => p.ctl)) : undefined;
  const recent28Pmc = pmcData.slice(-28);
  const avgWeeklyTss = recent28Pmc.length ? (recent28Pmc.reduce((s, p) => s + p.dailyTss, 0) / 28) * 7 : undefined;

  // Power curve key points
  const weightKg = user.weightKg ?? user.syncedWeightKg;
  const findPower = (duration: number) => {
    const p = powerCurve.find((x) => x.duration === duration);
    return p ? { power: p.power, wpkg: p.wpkg } : undefined;
  };

  // HR/Power analysis (EF)
  const withHr = activities.filter((a) => a.np && a.avgHr && a.avgHr > 0);
  const avgEf = withHr.length ? Number((withHr.reduce((s, a) => s + (a.np ?? 0) / (a.avgHr ?? 1), 0) / withHr.length).toFixed(3)) : undefined;
  const hrPct = activities.length ? Math.round((activities.filter((a) => a.avgHr).length / activities.length) * 100) : 0;

  // Zone distribution from recent activities with streams
  const zoneDistribution = (() => {
    if (!user.ftp) return undefined;
    const ftp = user.ftp;
    let zoneTimes = [0, 0, 0, 0, 0, 0, 0]; // Z1..Z7
    for (const a of recent90) {
      if (!a.rawStreamsJson) continue;
      const watts = (a.rawStreamsJson as any).watts;
      if (!Array.isArray(watts)) continue;
      for (const w of watts) {
        if (typeof w !== "number") continue;
        const pct = w / ftp;
        if (pct <= 0.55) zoneTimes[0]++;
        else if (pct <= 0.75) zoneTimes[1]++;
        else if (pct <= 0.90) zoneTimes[2]++;
        else if (pct <= 1.05) zoneTimes[3]++;
        else if (pct <= 1.20) zoneTimes[4]++;
        else if (pct <= 1.50) zoneTimes[5]++;
        else zoneTimes[6]++;
      }
    }
    const total = zoneTimes.reduce((s, v) => s + v, 0);
    if (total === 0) return undefined;
    return {
      z1_pct: Number(((zoneTimes[0] / total) * 100).toFixed(1)),
      z2_pct: Number(((zoneTimes[1] / total) * 100).toFixed(1)),
      z3_pct: Number(((zoneTimes[2] / total) * 100).toFixed(1)),
      z4_pct: Number(((zoneTimes[3] / total) * 100).toFixed(1)),
      z5_pct: Number(((zoneTimes[4] / total) * 100).toFixed(1)),
      z6_pct: Number(((zoneTimes[5] / total) * 100).toFixed(1)),
      z7_pct: Number(((zoneTimes[6] / total) * 100).toFixed(1)),
    };
  })();

  return {
    user: {
      weight_kg: weightKg ?? undefined,
      ftp: user.ftp,
      ftp_wpkg: user.ftp && weightKg ? Number((user.ftp / weightKg).toFixed(2)) : undefined,
      threshold_hr: user.thresholdHr,
      max_hr: user.maxHr,
      resting_hr: user.restingHr,
    },
    pmc_summary: {
      current_ctl: latest?.ctl,
      current_atl: latest?.atl,
      current_tsb: latest?.tsb,
      ctl_trend_30d: ctlTrend30,
      avg_weekly_tss_28d: avgWeeklyTss ? Number(avgWeeklyTss.toFixed(1)) : undefined,
      max_ctl_all_time: maxCtl ? Number(maxCtl.toFixed(1)) : undefined,
    },
    power_curve: {
      best_5s: findPower(5),
      best_1min: findPower(60),
      best_5min: findPower(300),
      best_20min: findPower(1200),
      best_60min: findPower(3600),
    },
    volume_summary: {
      total_activities_90d: recent90.length,
      total_hours_90d: Number((recent90.reduce((s, a) => s + a.movingTimeMin, 0) / 60).toFixed(1)),
      total_distance_km_90d: Number(recent90.reduce((s, a) => s + a.distanceKm, 0).toFixed(0)),
      total_tss_90d: Math.round(recent90.reduce((s, a) => s + (a.tss ?? 0), 0)),
      total_elevation_m_90d: Math.round(recent90.reduce((s, a) => s + a.elevationM, 0)),
    },
    hr_power_analysis: {
      avg_ef: avgEf,
      activities_with_hr_pct: hrPct,
    },
    zone_distribution: zoneDistribution,
  };
}
