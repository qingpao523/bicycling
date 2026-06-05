import type { Segment, SegmentEffort } from "@/lib/types";

export interface SegmentHistoryPoint {
  date: string;
  elapsedTime: number;
  movingTime: number;
  avgWatts?: number;
  avgHr?: number;
  isPr: boolean;
  speed: number; // km/h
}

export interface SegmentTrend {
  points: SegmentHistoryPoint[];
  bestTime: number;
  worstTime: number;
  avgTime: number;
  totalAttempts: number;
  improvementPct: number;
  recentTrend: "improving" | "stable" | "declining";
}

export function buildSegmentHistory(efforts: SegmentEffort[], segment: Segment): SegmentTrend {
  if (!efforts.length) {
    return { points: [], bestTime: 0, worstTime: 0, avgTime: 0, totalAttempts: 0, improvementPct: 0, recentTrend: "stable" };
  }

  const sorted = [...efforts].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const distKm = segment.distance / 1000;

  let runningBest = Infinity;
  const points: SegmentHistoryPoint[] = sorted.map((e) => {
    const isPr = e.elapsedTime < runningBest;
    if (isPr) runningBest = e.elapsedTime;
    return {
      date: typeof e.startDate === "string" ? e.startDate : new Date(e.startDate).toISOString(),
      elapsedTime: e.elapsedTime,
      movingTime: e.movingTime,
      avgWatts: e.averageWatts ?? undefined,
      avgHr: e.averageHr ?? undefined,
      isPr,
      speed: distKm > 0 ? Number(((distKm / (e.elapsedTime / 3600)) ).toFixed(1)) : 0,
    };
  });

  const times = sorted.map((e) => e.elapsedTime);
  const bestTime = Math.min(...times);
  const worstTime = Math.max(...times);
  const avgTime = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
  const firstTime = times[0];
  const improvementPct = firstTime > 0 ? Number((((firstTime - bestTime) / firstTime) * 100).toFixed(1)) : 0;

  // Recent trend: compare last 3 vs previous 3
  let recentTrend: "improving" | "stable" | "declining" = "stable";
  if (sorted.length >= 4) {
    const recent3 = sorted.slice(-3).map((e) => e.elapsedTime);
    const prev3 = sorted.slice(-6, -3).map((e) => e.elapsedTime);
    if (prev3.length >= 2) {
      const recentAvg = recent3.reduce((s, t) => s + t, 0) / recent3.length;
      const prevAvg = prev3.reduce((s, t) => s + t, 0) / prev3.length;
      const delta = (recentAvg - prevAvg) / prevAvg;
      if (delta < -0.02) recentTrend = "improving";
      else if (delta > 0.02) recentTrend = "declining";
    }
  }

  return { points, bestTime, worstTime, avgTime, totalAttempts: sorted.length, improvementPct, recentTrend };
}
