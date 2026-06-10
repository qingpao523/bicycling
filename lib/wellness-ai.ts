function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export const WELLNESS_SYSTEM_PROMPT = `你是一位运动科学和恢复专家，专注于自行车运动员的状态管理。
基于用户的生理指标数据，提供个性化的状态分析和恢复建议。

你必须用中文回答，以严格的 JSON 格式返回，不要包含任何其他内容：
{
  "overall_assessment": "对当前状态的综合评估，2-3句话",
  "status_factors": [
    { "factor": "因子名", "status": "好/中/差", "insight": "具体分析说明" }
  ],
  "enhancement_suggestions": [
    { "category": "类别（如：睡眠优化、压力管理、营养补充、训练调整）", "suggestion": "具体建议", "priority": "high/medium/low" }
  ],
  "supplement_recommendations": [
    { "name": "补剂名称", "dosage": "推荐用量", "timing": "服用时机", "reason": "推荐原因" }
  ],
  "training_adjustment": "基于当前状态的今日训练建议",
  "recovery_protocol": "恢复方案建议"
}`;

export function buildWellnessContext(user: any, readiness: any, recent7: any[], baseline30: any[], tsb?: number) {
  const hrvValues = baseline30.map((d: any) => d.hrv).filter((v: any): v is number => v != null);
  const rhrValues = baseline30.map((d: any) => d.restingHr).filter((v: any): v is number => v != null);
  const sleepValues = baseline30.map((d: any) => d.sleepSecs).filter((v: any): v is number => v != null).map((s: number) => +(s / 3600).toFixed(1));

  const recent7Trend = recent7.map((d: any) => ({
    date: d.date,
    hrv: d.hrv,
    restingHr: d.restingHr,
    sleepHours: d.sleepSecs != null ? +(d.sleepSecs / 3600).toFixed(1) : null,
    sleepScore: d.sleepScore,
    statusTag: d.statusTag,
  }));

  return {
    user: {
      ftp: user.ftp,
      weightKg: user.weightKg ?? user.syncedWeightKg,
      maxHr: user.maxHr,
    },
    readiness: {
      score: readiness.score,
      label: readiness.label,
      factors: readiness.factors.map((f: any) => ({
        name: f.name,
        score: f.score,
        detail: f.detail,
      })),
    },
    recent7Days: recent7Trend,
    baseline30: {
      avgHrv: hrvValues.length > 0 ? Math.round(mean(hrvValues)) : null,
      avgRhr: rhrValues.length > 0 ? Math.round(mean(rhrValues)) : null,
      avgSleepHours: sleepValues.length > 0 ? +mean(sleepValues).toFixed(1) : null,
      dataPoints: baseline30.length,
    },
    tsb: tsb ?? null,
    statusTag: recent7[0]?.statusTag ?? null,
  };
}

export function buildWellnessUserPrompt(context: any) {
  const parts: string[] = [];

  parts.push(`## 用户信息`);
  if (context.user.ftp) parts.push(`FTP: ${context.user.ftp}W`);
  if (context.user.weightKg) parts.push(`体重: ${context.user.weightKg}kg`);
  if (context.user.maxHr) parts.push(`最大心率: ${context.user.maxHr}bpm`);

  parts.push(`\n## 当前 Readiness 评估`);
  parts.push(`综合评分: ${context.readiness.score}/100 (${context.readiness.label})`);
  for (const f of context.readiness.factors) {
    parts.push(`- ${f.name}: ${f.score}/100 — ${f.detail}`);
  }

  if (context.tsb != null) {
    parts.push(`\n## 训练负荷`);
    parts.push(`当前 TSB: ${context.tsb > 0 ? "+" : ""}${context.tsb}`);
  }

  if (context.statusTag) {
    parts.push(`\n## 用户自报状态标签: ${context.statusTag}`);
  }

  parts.push(`\n## 近 7 天趋势`);
  for (const d of context.recent7Days) {
    const items: string[] = [d.date];
    if (d.hrv != null) items.push(`HRV:${d.hrv}`);
    if (d.restingHr != null) items.push(`RHR:${d.restingHr}`);
    if (d.sleepHours != null) items.push(`睡眠:${d.sleepHours}h`);
    if (d.sleepScore != null) items.push(`评分:${d.sleepScore}`);
    parts.push(items.join(" | "));
  }

  parts.push(`\n## 30 天基线`);
  if (context.baseline30.avgHrv != null) parts.push(`平均 HRV: ${context.baseline30.avgHrv} ms`);
  if (context.baseline30.avgRhr != null) parts.push(`平均静息心率: ${context.baseline30.avgRhr} bpm`);
  if (context.baseline30.avgSleepHours != null) parts.push(`平均睡眠: ${context.baseline30.avgSleepHours} h`);

  parts.push(`\n请基于以上数据进行综合分析，给出状态评估、增强建议、补剂推荐和训练调整方案。`);

  return parts.join("\n");
}
