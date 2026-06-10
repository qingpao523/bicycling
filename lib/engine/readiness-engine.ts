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

function computeHrvScore(today: DailyWellness, baseline30: DailyWellness[]): ReadinessFactor {
  const hrvValues = baseline30.map((d) => d.hrv).filter((v): v is number => v != null);
  const baselineHrv = hrvValues.length > 0 ? mean(hrvValues) : 0;

  if (!today.hrv) {
    if (baselineHrv > 0) {
      return { name: "HRV", score: 50, weight: 0.3, detail: `无今日数据（基线 ${Math.round(baselineHrv)} ms）` };
    }
    return { name: "HRV", score: 50, weight: 0.3, detail: "数据不足" };
  }

  if (baselineHrv === 0) {
    return { name: "HRV", score: 50, weight: 0.3, detail: `${today.hrv} ms（基线数据不足）` };
  }

  const deviation = (today.hrv - baselineHrv) / baselineHrv;
  const score = clamp(50 + deviation * 250, 0, 100);
  const pct = Math.round(deviation * 100);
  const baselineStr = `基线 ${Math.round(baselineHrv)}`;
  const detail = pct >= 0
    ? `${today.hrv} ms（${baselineStr}，高 ${pct}%）`
    : `${today.hrv} ms（${baselineStr}，低 ${Math.abs(pct)}%）`;

  return { name: "HRV", score: Math.round(score), weight: 0.3, detail };
}

function computeRestingHrScore(recent7: DailyWellness[], baseline30: DailyWellness[]): ReadinessFactor {
  const baselineValues = baseline30.map((d) => d.restingHr).filter((v): v is number => v != null);
  const baselineRhr = baselineValues.length > 0 ? mean(baselineValues) : 0;

  const recentValues = recent7.map((d) => d.restingHr).filter((v): v is number => v != null);

  if (recentValues.length < 2) {
    if (baselineRhr > 0) {
      return { name: "静息心率", score: 50, weight: 0.25, detail: `近期数据不足（基线 ${Math.round(baselineRhr)} bpm）` };
    }
    return { name: "静息心率", score: 50, weight: 0.25, detail: "数据不足" };
  }

  if (baselineRhr === 0) {
    return { name: "静息心率", score: 50, weight: 0.25, detail: `${recentValues[0]} bpm（基线数据不足）` };
  }

  const todayRhr = recentValues[0];
  const diff = todayRhr - baselineRhr;

  // Below baseline → good (100), +5bpm above → bad (0)
  const score = clamp(100 - diff * 20, 0, 100);

  // Trend: consecutive rise
  let consecutiveRise = 0;
  for (let i = 0; i < recentValues.length - 1; i++) {
    if (recentValues[i] > recentValues[i + 1]) consecutiveRise++;
    else break;
  }

  const trendPenalty = consecutiveRise >= 3 ? 15 : consecutiveRise >= 2 ? 8 : 0;
  const finalScore = clamp(score - trendPenalty, 0, 100);

  let detail = `${todayRhr} bpm`;
  if (diff > 0) detail += `（高于基线 ${Math.round(diff)}）`;
  if (consecutiveRise >= 3) detail += "，连续上升";

  return { name: "静息心率", score: Math.round(finalScore), weight: 0.25, detail };
}

function computeSleepScore(today: DailyWellness, recent7: DailyWellness[]): ReadinessFactor {
  const sleepHours = today.sleepSecs != null ? today.sleepSecs / 3600 : null;

  if (sleepHours == null) {
    if (today.sleepScore != null) {
      return { name: "睡眠", score: today.sleepScore, weight: 0.25, detail: `评分 ${today.sleepScore}` };
    }
    return { name: "睡眠", score: 50, weight: 0.25, detail: "数据不足" };
  }

  // Target: 7.5h. <6h → heavy penalty, >8h → full score
  let score: number;
  if (sleepHours >= 8) score = 100;
  else if (sleepHours >= 7.5) score = 90;
  else if (sleepHours >= 7) score = 75;
  else if (sleepHours >= 6.5) score = 60;
  else if (sleepHours >= 6) score = 40;
  else score = Math.max(0, sleepHours * 6.67);

  // Multi-day deficit penalty
  const recentSleep = recent7
    .map((d) => d.sleepSecs)
    .filter((v): v is number => v != null)
    .map((s) => s / 3600);

  const avgSleep = mean(recentSleep);
  if (recentSleep.length >= 3 && avgSleep < 6) {
    score = Math.max(0, score - 15);
  }

  const detail = `${sleepHours.toFixed(1)} 小时`;
  return { name: "睡眠", score: Math.round(score), weight: 0.25, detail };
}

function computeLoadScore(today: DailyWellness, tsb?: number): ReadinessFactor {
  if (tsb == null) {
    return { name: "训练负荷", score: 50, weight: 0.2, detail: "无 PMC 数据" };
  }

  // TSB > 5 → 100, TSB < -25 → 0, linear between
  const score = clamp(((tsb + 25) / 30) * 100, 0, 100);
  const detail = `TSB ${tsb > 0 ? "+" : ""}${tsb}`;
  return { name: "训练负荷", score: Math.round(score), weight: 0.2, detail };
}

function generateSuggestions(
  factors: ReadinessFactor[],
  today: DailyWellness,
  recent7: DailyWellness[],
  score: number,
): string[] {
  const suggestions: string[] = [];

  // Sleep deficit
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

  // HRV decline
  const hrvFactor = factors.find((f) => f.name === "HRV");
  if (hrvFactor && hrvFactor.score < 35) {
    suggestions.push("HRV 明显低于基线，自主神经恢复不佳，建议今天完全休息或仅做恢复骑");
  }

  // Resting HR elevated
  const rhrFactor = factors.find((f) => f.name === "静息心率");
  if (rhrFactor && rhrFactor.detail.includes("连续上升")) {
    suggestions.push("静息心率连续上升，可能是疲劳累积或生病前兆，建议减量训练");
  }

  // Load overreach
  const loadFactor = factors.find((f) => f.name === "训练负荷");
  if (loadFactor && loadFactor.score < 30 && consecutivePoorSleep >= 2) {
    suggestions.push("高训练负荷叠加睡眠不足，过度训练风险较高，建议至少休息一天");
  }

  // Positive
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
): ReadinessResult {
  const factors: ReadinessFactor[] = [
    computeHrvScore(today, baseline30),
    computeRestingHrScore(recent7, baseline30),
    computeSleepScore(today, recent7),
    computeLoadScore(today, tsb),
  ];

  let rawScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

  // Status tag overrides
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
