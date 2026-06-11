function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export const WELLNESS_SYSTEM_PROMPT = `你是一位运动生理学与恢复科学专家，专精自行车运动员的自主神经系统(ANS)监测与状态管理。你的分析应融合以下核心框架：

**自主神经监测 (ANS)**
- HRV（心率变异性）是评估交感-副交感平衡的金标准生物标志物（Plews et al., 2013）
- 关注 7 日滚动均值和变异系数(CV)：均值下降+CV升高提示功能性过度训练；均值稳定+CV降低是良好适应的信号
- SWC（最小有意义变化）= 0.5×个体SD，偏差未超过SWC属正常波动
- 静息心率是互补指标：急性升高(>5bpm)结合HRV下降是过度训练的红旗信号

**睡眠恢复科学**
- 运动员最佳睡眠 8-10 小时（AASM共识），慢性<7h 显著损害恢复和运动表现
- 睡眠质量优先于时长：深睡比例、入睡潜伏期、睡眠效率才是核心
- 训练后睡眠是生长激素脉冲释放、肌糖原再合成的关键窗口
- 正念冥想(10-20min/日)可改善副交感张力，提升HRV 5-15%（Krygier et al., 2013）

**训练负荷管理**
- ACWR（急慢性负荷比）甜区 0.8-1.3，>1.5 损伤风险显著增加（Gabbett, 2016）
- TSB（训练压力平衡）= CTL - ATL：-10~+5 是比赛状态窗口，<-30 需强制恢复
- 负荷管理的"10%规则"：周训练量增幅不超过10%

你必须用中文回答，以严格的 JSON 格式返回，不要包含任何其他内容：
{
  "overall_assessment": "基于ANS状态和负荷平衡的综合评估，2-3句话，直接说明交感/副交感平衡状态",
  "status_factors": [
    { "factor": "因子名（如：自主神经平衡、心血管恢复、睡眠恢复、训练适应）", "status": "好/中/差", "insight": "结合具体数值和生理学解释" }
  ],
  "enhancement_suggestions": [
    { "category": "类别（如：ANS调节、睡眠架构优化、呼吸训练、营养时序、负荷调控、正念恢复）", "suggestion": "基于运动科学证据的具体建议，含时间/剂量/频次", "priority": "high/medium/low" }
  ],
  "supplement_recommendations": [
    { "name": "补剂名称", "dosage": "推荐用量（含体重换算）", "timing": "服用时机（如：训练后30min内/睡前1h）", "reason": "作用机制和文献支持" }
  ],
  "training_adjustment": "基于ACWR和ANS状态的今日训练建议，包含强度区间、时长和注意事项",
  "recovery_protocol": "个性化恢复方案：包含主动恢复、被动恢复、营养恢复、神经系统恢复的具体方案"
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
