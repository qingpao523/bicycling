import type { SegmentEffort } from "@/lib/types";

export interface SegmentPrediction {
  targetTime: number;
  currentBest: number;
  predictedWeeks: number;
  confidence: "high" | "medium" | "low";
  weeklyGainSeconds: number;
  rangeWeeks: [number, number];
  method: "linear_regression" | "insufficient_data";
  note?: string;
}

export function predictSegmentEta(input: { efforts: SegmentEffort[]; targetTime: number }): SegmentPrediction {
  const { efforts, targetTime } = input;
  const sorted = [...efforts].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const currentBest = sorted.length ? Math.min(...sorted.map((e) => e.elapsedTime)) : Infinity;

  if (currentBest <= targetTime) {
    return { targetTime, currentBest, predictedWeeks: 0, confidence: "high", weeklyGainSeconds: 0, rangeWeeks: [0, 0], method: "linear_regression", note: "已达成目标" };
  }

  if (sorted.length < 2) {
    return { targetTime, currentBest, predictedWeeks: Infinity, confidence: "low", weeklyGainSeconds: 0, rangeWeeks: [Infinity, Infinity], method: "insufficient_data", note: "数据不足, 需至少 2 次尝试" };
  }

  // Linear regression: time (seconds) vs date (weeks from first)
  const firstDate = new Date(sorted[0].startDate).getTime();
  const xs = sorted.map((e) => (new Date(e.startDate).getTime() - firstDate) / (7 * 86400000)); // weeks
  const ys = sorted.map((e) => e.elapsedTime);

  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }

  const slope = den !== 0 ? num / den : 0; // seconds per week (negative = improving)

  if (slope >= 0) {
    return { targetTime, currentBest, predictedWeeks: Infinity, confidence: "medium", weeklyGainSeconds: 0, rangeWeeks: [Infinity, Infinity], method: "linear_regression", note: "当前趋势未见进步, 建议调整训练" };
  }

  const weeklyGain = Math.abs(slope);
  const gap = currentBest - targetTime;
  const weeks = Math.max(1, Math.round(gap / weeklyGain));
  const confidence: "high" | "medium" | "low" = n >= 5 ? "high" : n >= 3 ? "medium" : "low";

  return {
    targetTime,
    currentBest,
    predictedWeeks: weeks,
    confidence,
    weeklyGainSeconds: Number(weeklyGain.toFixed(1)),
    rangeWeeks: [Number((weeks * 0.6).toFixed(0)), Number((weeks * 1.5).toFixed(0))],
    method: "linear_regression",
  };
}
