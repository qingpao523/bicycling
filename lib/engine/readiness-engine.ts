import type { DailyWellness } from "@prisma/client";

export interface ReadinessFactor {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface ReadinessResult {
  score: number;
  label: string;
  color: string;
  factors: ReadinessFactor[];
  suggestions: string[];
}

const LABELS: { min: number; label: string; color: string }[] = [
  { min: 85, label: "状态极佳", color: "#22c55e" },
  { min: 65, label: "状态良好", color: "#84cc16" },
  { min: 45, label: "轻度疲劳", color: "#eab308" },
  { min: 25, label: "需要恢复", color: "#f97316" },
  { min: 0, label: "建议休息", color: "#ef4444" },
];

function getLabel(score: number) {
  return LABELS.find((l) => score >= l.min) ?? LABELS[LABELS.length - 1];
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// HRV: 7-day rolling mean + CV + SWC (Plews 2013, Buchheit 2014)
// Weight: 0.30
function computeHrvScore(today: DailyWellness, recent7: DailyWellness[], baseline30: DailyWellness[]): ReadinessFactor {
  const recent7Hrv = recent7.map((d) => d.hrv).filter((v): v is number => v != null);
  const baseline30Hrv = baseline30.map((d) => d.hrv).filter((v): v is number => v != null);

  if (!today.hrv) {
    const baselineVal = recent7Hrv.length > 0 ? mean(recent7Hrv) : baseline30Hrv.length > 0 ? mean(baseline30Hrv) : 0;
    if (baselineVal > 0) {
      return { name: "HRV", score: 50, weight: 0.3, detail: `无今日数据（7日均值 ${Math.round(baselineVal)} ms）` };
    }
    return { name: "HRV", score: 50, weight: 0.3, detail: "数据不足" };
  }

  const rollingMean = recent7Hrv.length >= 3 ? mean(recent7Hrv) : baseline30Hrv.length > 0 ? mean(baseline30Hrv) : 0;

  if (rollingMean === 0) {
    return { name: "HRV", score: 50, weight: 0.3, detail: `${today.hrv} ms（基线数据不足）` };
  }

  const rollingCV = recent7Hrv.length >= 3 ? stddev(recent7Hrv) / rollingMean : 0;
  const swc = 0.5 * rollingCV * rollingMean;

  const deviation = (today.hrv - rollingMean) / rollingMean;
  const absDiff = Math.abs(today.hrv - rollingMean);

  let score: number;
  if (swc > 0 && absDiff < swc) {
    score = 60;
  } else {
    score = clamp(50 + deviation * 250, 0, 100);
  }

  // CV > 10% penalty: excessive day-to-day variability signals overreaching
  if (rollingCV > 0.10) {
    score = Math.max(0, score - 10);
  }

  const pct = Math.round(deviation * 100);
  const cvStr = rollingCV > 0 ? `, CV ${(rollingCV * 100).toFixed(1)}%` : "";
  const arrow = pct >= 0 ? `↑${pct}%` : `↓${Math.abs(pct)}%`;
  const detail = `${today.hrv} ms（7日均值 ${Math.round(rollingMean)}${cvStr}, ${arrow}）`;

  return { name: "HRV", score: Math.round(score), weight: 0.3, detail };
}

// Resting HR: 14-day baseline + trend penalty (Borresen & Lambert 2008)
// Weight: 0.15
function computeRestingHrScore(recent7: DailyWellness[], baseline30: DailyWellness[]): ReadinessFactor {
  const baseline14Values = baseline30
    .slice(0, 14)
    .map((d) => d.restingHr)
    .filter((v): v is number => v != null);
  const baselineRhr = baseline14Values.length > 0 ? mean(baseline14Values) : 0;

  const recentValues = recent7.map((d) => d.restingHr).filter((v): v is number => v != null);

  if (recentValues.length < 2) {
    if (baselineRhr > 0) {
      return { name: "静息心率", score: 50, weight: 0.15, detail: `近期数据不足（14日基线 ${Math.round(baselineRhr)} bpm）` };
    }
    return { name: "静息心率", score: 50, weight: 0.15, detail: "数据不足" };
  }

  if (baselineRhr === 0) {
    return { name: "静息心率", score: 50, weight: 0.15, detail: `${recentValues[0]} bpm（基线数据不足）` };
  }

  const todayRhr = recentValues[0];
  const diff = todayRhr - baselineRhr;

  // Refined thresholds: 0-3 normal, 3-5 moderate, 5-10 red, 10+ strong red
  let score: number;
  if (diff <= 0) {
    score = 100;
  } else if (diff <= 3) {
    score = 100 - diff * 5; // 85-100
  } else if (diff <= 5) {
    score = 85 - (diff - 3) * 15; // 55-85
  } else if (diff <= 10) {
    score = 55 - (diff - 5) * 10; // 5-55
  } else {
    score = 0;
  }

  // Trend: consecutive rise penalty
  let consecutiveRise = 0;
  for (let i = 0; i < recentValues.length - 1; i++) {
    if (recentValues[i] > recentValues[i + 1]) consecutiveRise++;
    else break;
  }

  const trendPenalty = consecutiveRise >= 3 ? 15 : consecutiveRise >= 2 ? 8 : 0;
  const finalScore = clamp(score - trendPenalty, 0, 100);

  let detail = `${todayRhr} bpm（14日基线 ${Math.round(baselineRhr)}`;
  if (diff > 0) detail += `, +${Math.round(diff)}`;
  detail += "）";
  if (consecutiveRise >= 3) detail += "，连续上升";

  return { name: "静息心率", score: Math.round(finalScore), weight: 0.15, detail };
}

// Sleep: duration + multi-day deficit (Mah 2011, Roberts 2019)
// Weight: 0.25
function computeSleepScore(today: DailyWellness, recent7: DailyWellness[]): ReadinessFactor {
  const sleepHours = today.sleepSecs != null ? today.sleepSecs / 3600 : null;

  if (sleepHours == null) {
    if (today.sleepScore != null) {
      return { name: "睡眠", score: today.sleepScore, weight: 0.25, detail: `评分 ${today.sleepScore}` };
    }
    return { name: "睡眠", score: 50, weight: 0.25, detail: "数据不足" };
  }

  let score: number;
  if (sleepHours >= 8) score = 100;
  else if (sleepHours >= 7.5) score = 90;
  else if (sleepHours >= 7) score = 75;
  else if (sleepHours >= 6.5) score = 60;
  else if (sleepHours >= 6) score = 40;
  else score = Math.max(0, sleepHours * 6.67);

  const recentSleep = recent7
    .map((d) => d.sleepSecs)
    .filter((v): v is number => v != null)
    .map((s) => s / 3600);

  const avgSleep = mean(recentSleep);
  if (recentSleep.length >= 3 && avgSleep < 6) {
    score = Math.max(0, score - 15);
  }

  const avgStr = recentSleep.length >= 3 ? `（7日均值 ${avgSleep.toFixed(1)}h）` : "";
  const detail = `${sleepHours.toFixed(1)}h${avgStr}`;
  return { name: "睡眠", score: Math.round(score), weight: 0.25, detail };
}

// Training Load: ACWR + TSB (Gabbett 2016, Banister 1991)
// Weight: 0.30
function computeLoadScore(ctl?: number, atl?: number, tsb?: number): ReadinessFactor {
  if (ctl == null || atl == null || tsb == null) {
    return { name: "训练负荷", score: 50, weight: 0.3, detail: "无 PMC 数据" };
  }

  // ACWR = ATL / CTL
  const acwr = ctl > 0 ? atl / ctl : 0;

  let score: number;
  if (ctl === 0 && atl === 0) {
    score = 50;
  } else if (acwr >= 0.8 && acwr <= 1.3) {
    // Sweet spot
    score = 85 + (1 - Math.abs(acwr - 1.05) / 0.25) * 15;
  } else if (acwr < 0.8) {
    // Under-training
    score = 60 + acwr * 25;
  } else if (acwr <= 1.5) {
    // Elevated risk
    score = 85 - (acwr - 1.3) * 150;
  } else {
    // High risk
    score = Math.max(0, 55 - (acwr - 1.5) * 100);
  }

  // TSB extreme penalty
  if (tsb < -30) {
    score = Math.max(0, score - 15);
  }

  score = clamp(score, 0, 100);

  const acwrStr = ctl > 0 ? acwr.toFixed(2) : "N/A";
  const zone = acwr >= 0.8 && acwr <= 1.3 ? "甜区" : acwr > 1.5 ? "高风险" : acwr > 1.3 ? "偏高" : "偏低";
  const detail = `ACWR ${acwrStr}（${zone}），TSB ${tsb > 0 ? "+" : ""}${Math.round(tsb)}`;
  return { name: "训练负荷", score: Math.round(score), weight: 0.3, detail };
}

function generateSuggestions(
  factors: ReadinessFactor[],
  today: DailyWellness,
  recent7: DailyWellness[],
  score: number,
): string[] {
  const suggestions: string[] = [];

  const recentSleep = recent7
    .map((d) => d.sleepSecs)
    .filter((v): v is number => v != null)
    .map((s) => s / 3600);
  const consecutivePoorSleep = recentSleep.filter((h) => h < 6).length;
  if (consecutivePoorSleep >= 3) {
    suggestions.push("连续多天睡眠不足 6 小时，建议补充褪黑素 0.5-3mg 辅助入睡，或调整作息时间");
  } else if (today.sleepSecs != null && today.sleepSecs / 3600 < 6) {
    suggestions.push("昨晚睡眠不足，建议今天安排轻松活动或完全休息");
  }

  const hrvFactor = factors.find((f) => f.name === "HRV");
  if (hrvFactor && hrvFactor.score < 35) {
    suggestions.push("HRV 明显低于基线，自主神经恢复不佳，建议今天完全休息或仅做恢复骑");
  }
  if (hrvFactor && hrvFactor.detail.includes("CV") && hrvFactor.detail.match(/CV (\d+\.\d+)%/)) {
    const cvMatch = hrvFactor.detail.match(/CV (\d+\.\d+)%/);
    if (cvMatch && parseFloat(cvMatch[1]) > 10) {
      suggestions.push("HRV 日间波动过大（CV > 10%），可能处于功能性过度训练边缘，建议降低训练强度");
    }
  }

  const rhrFactor = factors.find((f) => f.name === "静息心率");
  if (rhrFactor && rhrFactor.detail.includes("连续上升")) {
    suggestions.push("静息心率连续上升，可能是疲劳累积或生病前兆，建议减量训练");
  }

  const loadFactor = factors.find((f) => f.name === "训练负荷");
  if (loadFactor && loadFactor.detail.includes("高风险")) {
    suggestions.push("急慢性负荷比（ACWR）过高，受伤风险显著升高，建议立即降低训练量");
  } else if (loadFactor && loadFactor.detail.includes("偏高")) {
    suggestions.push("训练负荷增长偏快，注意控制单周增量不超过 10%");
  }

  if (loadFactor && loadFactor.score < 30 && consecutivePoorSleep >= 2) {
    suggestions.push("高训练负荷叠加睡眠不足，过度训练风险较高，建议至少休息一天");
  }

  if (score >= 85) {
    suggestions.push("状态极佳，适合安排高强度训练或突破性骑行");
  } else if (score >= 65 && suggestions.length === 0) {
    suggestions.push("整体状态良好，可以正常训练");
  }

  return suggestions;
}

export function computeReadiness(
  today: DailyWellness,
  recent7: DailyWellness[],
  baseline30: DailyWellness[],
  tsb?: number,
  ctl?: number,
  atl?: number,
): ReadinessResult {
  const factors: ReadinessFactor[] = [
    computeHrvScore(today, recent7, baseline30),
    computeRestingHrScore(recent7, baseline30),
    computeSleepScore(today, recent7),
    computeLoadScore(ctl, atl, tsb),
  ];

  let rawScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

  if (today.statusTag === "sick") {
    rawScore = 20;
  } else if (today.statusTag === "tired") {
    rawScore = rawScore * 0.7;
  } else if (today.statusTag === "stressed") {
    rawScore = rawScore * 0.8;
  }

  const score = Math.round(clamp(rawScore, 0, 100));
  const { label, color } = getLabel(score);
  const suggestions = generateSuggestions(factors, today, recent7, score);

  return { score, label, color, factors, suggestions };
}
