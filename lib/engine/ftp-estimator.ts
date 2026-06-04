/**
 * FTP Estimator Engine
 *
 * Estimates FTP using multiple time-point best powers and duration-specific multipliers.
 * Similar to intervals.icu methodology: takes the MAX of estimates from various durations.
 *
 * Multipliers are based on Monod/Scherrer critical power model and empirical data.
 */

import type { Activity } from "@/lib/types";
import { extractActivityBestPowers } from "./best-power-source";

export interface DurationEstimate {
  duration: number; // seconds
  durationLabel: string;
  maxPower: number; // best average power for this duration within window
  multiplier: number; // conversion factor
  estimatedFtp: number; // maxPower × multiplier
  sourceActivityId?: string;
  sourceActivityName?: string;
  sourceDate?: string;
}

export interface FtpEstimate {
  ftp: number; // best estimate
  method: string; // which duration gave the best estimate
  confidence: "high" | "medium" | "low";
  wpkg?: number; // W/kg
  allEstimates: DurationEstimate[]; // all candidates
  criticalPower?: {
    cp: number; // Critical Power in W
    wPrime: number; // W' (anaerobic reserve) in J
    rSquared?: number; // goodness of fit
  };
  dataQuality: {
    durationsAvailable: number;
    totalActivitiesChecked: number;
    activitiesWithValidPower: number;
  };
}

export interface FtpProgressPoint {
  date: string; // YYYY-MM-DD
  ftp: number;
  method: string;
  wpkg?: number;
}

/**
 * Duration-specific multipliers to convert max power to estimated FTP.
 * Based on Monod-Scherrer CP model + empirical corrections for recreational cyclists.
 */
const DURATION_MULTIPLIERS: { duration: number; label: string; mult: number }[] = [
  { duration: 60, label: "1 分钟", mult: 0.68 },
  { duration: 180, label: "3 分钟", mult: 0.80 },
  { duration: 300, label: "5 分钟", mult: 0.86 },
  { duration: 420, label: "7 分钟", mult: 0.89 },
  { duration: 480, label: "8 分钟", mult: 0.90 },
  { duration: 600, label: "10 分钟", mult: 0.92 },
  { duration: 1200, label: "20 分钟", mult: 0.95 },
  { duration: 1800, label: "30 分钟", mult: 0.97 },
  { duration: 2400, label: "40 分钟", mult: 0.98 },
  { duration: 3600, label: "60 分钟", mult: 1.00 },
  { duration: 5400, label: "90 分钟", mult: 1.02 },
];

/**
 * Rolling window best-average power (sliding window)
 */
function bestAveragePower(watts: number[], durationSeconds: number): number {
  if (watts.length < durationSeconds) return 0;
  let sum = 0;
  for (let i = 0; i < durationSeconds; i++) sum += watts[i] || 0;
  let best = sum;
  for (let i = durationSeconds; i < watts.length; i++) {
    sum += (watts[i] || 0) - (watts[i - durationSeconds] || 0);
    if (sum > best) best = sum;
  }
  return Math.round(best / durationSeconds);
}

/**
 * Compute all duration-based best powers for a single activity.
 * Uses the best-power extractor which pulls from watts stream, intervals.icu summary fields,
 * interval_summary, achievements, etc.
 */
export function computeActivityBestPowers(activity: Activity): Map<number, number> {
  const extracted = extractActivityBestPowers(activity);
  const result = new Map<number, number>();
  // Only keep durations that match our FTP estimator's standard list
  for (const { duration } of DURATION_MULTIPLIERS) {
    const point = extracted.get(duration);
    if (point && point.power > 0) result.set(duration, point.power);
  }
  return result;
}

/**
 * Estimate FTP for a single activity (useful for per-activity labeling).
 * Returns the best estimate from all valid durations within this one activity.
 */
export function estimateActivityFtp(activity: Activity): FtpEstimate | null {
  const bests = computeActivityBestPowers(activity);
  if (bests.size === 0) return null;

  const estimates: DurationEstimate[] = [];
  for (const { duration, label, mult } of DURATION_MULTIPLIERS) {
    const maxPower = bests.get(duration);
    if (!maxPower) continue;
    estimates.push({
      duration,
      durationLabel: label,
      maxPower,
      multiplier: mult,
      estimatedFtp: Math.round(maxPower * mult),
      sourceActivityId: activity.id,
      sourceActivityName: activity.name,
      sourceDate: activity.startTime,
    });
  }

  if (estimates.length === 0) return null;

  // Best estimate: use smart selection (prefer long-duration, reject short-duration outliers)
  const longEstimates = estimates.filter((e) => e.duration >= 300 && e.duration <= 3600);
  const shortEstimates = estimates.filter((e) => e.duration < 300);
  let best: DurationEstimate;
  if (longEstimates.length >= 2) {
    const longFtps = longEstimates.map((e) => e.estimatedFtp).sort((a, b) => a - b);
    const median = longFtps[Math.floor(longFtps.length / 2)];
    const cleanedShort = shortEstimates.filter((e) => e.estimatedFtp <= median * 1.15);
    const candidates = [...longEstimates, ...cleanedShort];
    best = candidates.reduce((a, b) => (b.estimatedFtp > a.estimatedFtp ? b : a));
  } else if (longEstimates.length === 1) {
    best = longEstimates[0];
  } else {
    best = estimates.reduce((a, b) => (b.estimatedFtp > a.estimatedFtp ? b : a));
  }

  const confidence: FtpEstimate["confidence"] =
    estimates.length >= 4 ? "high" : estimates.length >= 2 ? "medium" : "low";

  return {
    ftp: best.estimatedFtp,
    method: `${best.durationLabel} × ${best.multiplier}`,
    confidence,
    allEstimates: estimates.sort((a, b) => a.duration - b.duration),
    dataQuality: {
      durationsAvailable: estimates.length,
      totalActivitiesChecked: 1,
      activitiesWithValidPower: 1,
    },
  };
}

/**
 * Fit a 2-parameter Critical Power model (CP, W') from multiple duration-power points.
 * P(t) = CP + W'/t
 *
 * Use linear regression on y = P, x = 1/t
 */
export function fitCriticalPower(points: { duration: number; power: number }[]): { cp: number; wPrime: number; rSquared: number } | null {
  // Only use durations in the 2-20 min range for CP fitting (sweet spot for aerobic CP)
  const valid = points.filter((p) => p.duration >= 120 && p.duration <= 1200);
  if (valid.length < 2) return null;

  const xs = valid.map((p) => 1 / p.duration);
  const ys = valid.map((p) => p.power);
  const n = valid.length;
  const sumX = xs.reduce((s, v) => s + v, 0);
  const sumY = ys.reduce((s, v) => s + v, 0);
  const sumXY = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const sumX2 = xs.reduce((s, v) => s + v * v, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  // slope = W', intercept = CP
  const wPrime = (n * sumXY - sumX * sumY) / denom;
  const cp = (sumY - wPrime * sumX) / n;

  // R²
  const yMean = sumY / n;
  const ssRes = ys.reduce((s, y, i) => {
    const pred = cp + wPrime * xs[i];
    return s + (y - pred) ** 2;
  }, 0);
  const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  if (cp <= 0 || wPrime <= 0) return null;

  return { cp: Math.round(cp), wPrime: Math.round(wPrime), rSquared: Number(rSquared.toFixed(3)) };
}

/**
 * Estimate FTP from a set of activities within a time window.
 * Takes max best-power for each duration across all activities, then applies multipliers.
 */
export function estimateFtpFromActivities(
  activities: Activity[],
  weightKg?: number
): FtpEstimate {
  // Aggregate best powers across all activities
  const aggregateBest = new Map<number, { power: number; activityId: string; activityName: string; date: string }>();
  let validCount = 0;

  for (const activity of activities) {
    const bests = computeActivityBestPowers(activity);
    if (bests.size === 0) continue;
    validCount++;
    for (const [duration, power] of bests) {
      const existing = aggregateBest.get(duration);
      if (!existing || power > existing.power) {
        aggregateBest.set(duration, {
          power,
          activityId: activity.id,
          activityName: activity.name,
          date: activity.startTime,
        });
      }
    }
  }

  if (aggregateBest.size === 0) {
    return {
      ftp: 0,
      method: "无可用数据",
      confidence: "low",
      allEstimates: [],
      dataQuality: {
        durationsAvailable: 0,
        totalActivitiesChecked: activities.length,
        activitiesWithValidPower: 0,
      },
    };
  }

  // Build estimates
  const estimates: DurationEstimate[] = [];
  for (const { duration, label, mult } of DURATION_MULTIPLIERS) {
    const entry = aggregateBest.get(duration);
    if (!entry) continue;
    estimates.push({
      duration,
      durationLabel: label,
      maxPower: entry.power,
      multiplier: mult,
      estimatedFtp: Math.round(entry.power * mult),
      sourceActivityId: entry.activityId,
      sourceActivityName: entry.activityName,
      sourceDate: entry.date,
    });
  }

  estimates.sort((a, b) => a.duration - b.duration);

  // Smart selection:
  // 1. Prefer estimates from "reliable" range (5min - 60min) where CP model holds best
  // 2. If an estimate from short duration (< 5min) is an outlier (>15% higher than median of long ones), reject it
  // 3. Take max among remaining reliable estimates
  const longEstimates = estimates.filter((e) => e.duration >= 300 && e.duration <= 3600);
  const shortEstimates = estimates.filter((e) => e.duration < 300);

  let best: DurationEstimate;
  if (longEstimates.length >= 2) {
    // Compute median of long estimates for outlier check
    const longFtps = longEstimates.map((e) => e.estimatedFtp).sort((a, b) => a - b);
    const median = longFtps[Math.floor(longFtps.length / 2)];
    // Reject short estimates that exceed 115% of median (likely power spike, not sustainable FTP)
    const cleanedShort = shortEstimates.filter((e) => e.estimatedFtp <= median * 1.15);
    const candidates = [...longEstimates, ...cleanedShort];
    best = candidates.reduce((a, b) => (b.estimatedFtp > a.estimatedFtp ? b : a));
  } else if (longEstimates.length === 1) {
    // Only one long estimate: prefer it over short ones
    best = longEstimates[0];
  } else {
    // No long estimates, fall back to best short estimate
    best = estimates.reduce((a, b) => (b.estimatedFtp > a.estimatedFtp ? b : a));
  }

  // Critical Power fit
  const cpInput = estimates.map((e) => ({ duration: e.duration, power: e.maxPower }));
  const cp = fitCriticalPower(cpInput) ?? undefined;

  // Confidence based on data density
  const confidence: FtpEstimate["confidence"] =
    estimates.length >= 6 && validCount >= 5 ? "high" :
    estimates.length >= 3 && validCount >= 2 ? "medium" : "low";

  return {
    ftp: best.estimatedFtp,
    method: `${best.durationLabel} × ${best.multiplier}`,
    confidence,
    wpkg: weightKg ? Number((best.estimatedFtp / weightKg).toFixed(2)) : undefined,
    allEstimates: estimates,
    criticalPower: cp,
    dataQuality: {
      durationsAvailable: estimates.length,
      totalActivitiesChecked: activities.length,
      activitiesWithValidPower: validCount,
    },
  };
}

/**
 * Build FTP progression timeline using rolling 42-day windows.
 * Returns one eFTP value per week over the given time range.
 */
export function buildFtpProgression(
  activities: Activity[],
  weightKg?: number,
  windowDays: number = 42,
  stepDays: number = 7
): FtpProgressPoint[] {
  if (activities.length === 0) return [];

  const sorted = [...activities].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const firstDate = new Date(sorted[0].startTime);
  firstDate.setHours(0, 0, 0, 0);
  const lastDate = new Date();
  lastDate.setHours(0, 0, 0, 0);

  const points: FtpProgressPoint[] = [];

  // Start window from `windowDays` after the first activity
  const startPoint = new Date(firstDate);
  startPoint.setDate(startPoint.getDate() + windowDays);

  let current = new Date(startPoint);
  while (current <= lastDate) {
    const windowEnd = new Date(current);
    const windowStart = new Date(current);
    windowStart.setDate(windowStart.getDate() - windowDays);

    const windowActs = sorted.filter((a) => {
      const d = new Date(a.startTime);
      return d >= windowStart && d <= windowEnd;
    });

    if (windowActs.length > 0) {
      const est = estimateFtpFromActivities(windowActs, weightKg);
      if (est.ftp > 0) {
        points.push({
          date: current.toISOString().split("T")[0],
          ftp: est.ftp,
          method: est.method,
          wpkg: est.wpkg,
        });
      }
    }

    current.setDate(current.getDate() + stepDays);
  }

  return points;
}

/**
 * Predict future FTP based on recent trend (linear regression on last N points)
 */
export function predictFtp(
  progression: FtpProgressPoint[],
  daysAhead: number = 30
): { predicted: number; low: number; high: number; trend: "up" | "down" | "flat"; weeklyRate: number } | null {
  if (progression.length < 3) return null;

  const recent = progression.slice(-Math.min(12, progression.length));
  const n = recent.length;

  // x = days since first recent point, y = FTP
  const firstDate = new Date(recent[0].date);
  const xs = recent.map((p) => (new Date(p.date).getTime() - firstDate.getTime()) / 86400000);
  const ys = recent.map((p) => p.ftp);

  const sumX = xs.reduce((s, v) => s + v, 0);
  const sumY = ys.reduce((s, v) => s + v, 0);
  const sumXY = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const sumX2 = xs.reduce((s, v) => s + v * v, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom; // W per day
  const intercept = (sumY - slope * sumX) / n;

  const lastX = xs[xs.length - 1];
  const predictX = lastX + daysAhead;
  const predicted = Math.round(intercept + slope * predictX);

  // Standard error for CI
  const predicted_current = intercept + slope * lastX;
  const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]));
  const sse = residuals.reduce((s, r) => s + r * r, 0);
  const stdErr = n > 2 ? Math.sqrt(sse / (n - 2)) : 5;
  const ciMargin = Math.max(stdErr * 1.96, predicted * 0.03); // at least 3%

  const weeklyRate = Number((slope * 7).toFixed(2));
  const trend: "up" | "down" | "flat" =
    Math.abs(weeklyRate) < 0.5 ? "flat" : weeklyRate > 0 ? "up" : "down";

  return {
    predicted,
    low: Math.round(predicted - ciMargin),
    high: Math.round(predicted + ciMargin),
    trend,
    weeklyRate,
  };
}
