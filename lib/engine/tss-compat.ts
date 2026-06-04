/**
 * TSS Compatibility Layer
 * Calculates TSS for activities that don't have it (e.g. Strava imports),
 * using the standard formula: TSS = (duration_s × NP × IF) / (FTP × 3600) × 100
 * where IF = NP / FTP (or avgPower/FTP as fallback)
 *
 * Also estimates TSS from hrTSS when no power data is available:
 * hrTSS ≈ (duration × avg_HR_reserve²) × 100
 */

import type { Activity, User } from "@/lib/types";

export interface NormalizedActivity extends Omit<Activity, "tss" | "ifValue" | "np"> {
  tss?: number;
  ifValue?: number;
  np?: number;
  tssSource?: "original" | "computed_power" | "computed_hr" | "computed_rpe";
}

function compactNumber(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

/**
 * Compute rolling 30-second average to estimate Normalized Power from watts stream
 */
function computeNpFromStream(watts: number[]): number | undefined {
  if (!watts.length) return undefined;
  const window = 30; // 30-second rolling average
  if (watts.length < window) {
    const avg = watts.reduce((s, v) => s + v, 0) / watts.length;
    return Math.round(avg);
  }
  // rolling 30s average
  const rolling: number[] = [];
  let sum = 0;
  for (let i = 0; i < window; i++) sum += watts[i];
  rolling.push(sum / window);
  for (let i = window; i < watts.length; i++) {
    sum += watts[i] - watts[i - window];
    rolling.push(sum / window);
  }
  // NP = fourth-root of mean of fourth-power
  const fourthPowerMean = rolling.reduce((s, v) => s + v * v * v * v, 0) / rolling.length;
  return Math.round(Math.pow(fourthPowerMean, 0.25));
}

/**
 * Compute TSS for a single activity if missing, using available data
 */
export function computeTssIfMissing(activity: Activity, user: User): NormalizedActivity {
  // If activity already has TSS, return as-is
  if (typeof activity.tss === "number" && activity.tss > 0) {
    return { ...activity, tssSource: "original" };
  }

  const ftp = user.ftp ?? user.syncedFtp;
  const durationSec = activity.movingTimeMin * 60;
  if (durationSec <= 60) {
    return { ...activity };
  }

  // Path 1: Power-based TSS
  if (ftp && ftp > 0) {
    let np = activity.np;

    // Try to compute NP from watts stream if available
    if (!np && activity.rawStreamsJson) {
      const watts = (activity.rawStreamsJson as any).watts;
      if (Array.isArray(watts) && watts.length > 0) {
        np = computeNpFromStream(watts as number[]);
      }
    }

    // Fall back to avg power (will slightly underestimate TSS for variable rides)
    if (!np && activity.avgPower) {
      np = activity.avgPower;
    }

    if (np && np > 0) {
      const ifValue = np / ftp;
      const tss = (durationSec * np * ifValue) / (ftp * 3600) * 100;
      return {
        ...activity,
        np: activity.np ?? np,
        ifValue: activity.ifValue ?? compactNumber(ifValue),
        tss: Math.round(tss),
        tssSource: "computed_power",
      };
    }
  }

  // Path 2: HR-based TSS (hrTSS) using LTHR (threshold HR)
  const lthr = user.thresholdHr ?? user.syncedThresholdHr;
  const maxHr = user.maxHr ?? user.syncedMaxHr;
  const restingHr = user.restingHr ?? user.syncedRestingHr;

  if (activity.avgHr && lthr && maxHr && restingHr && activity.avgHr > 0) {
    const avgHr = activity.avgHr;
    const hrReserve = maxHr - restingHr;
    const hrReserveRatio = (avgHr - restingHr) / hrReserve;
    const lthrRatio = (lthr - restingHr) / hrReserve;
    // Ratio of avg HR reserve to LTHR reserve = IF equivalent
    const hrIf = Math.max(0, Math.min(1.3, hrReserveRatio / lthrRatio));
    const hrTss = (durationSec / 3600) * hrIf * hrIf * 100;

    return {
      ...activity,
      ifValue: activity.ifValue ?? compactNumber(hrIf),
      tss: Math.round(hrTss),
      tssSource: "computed_hr",
    };
  }

  // Path 3: Duration-based fallback (very rough RPE 5 assumption)
  // Only use for activities that we know were rides (has distance)
  if (activity.distanceKm > 5 && activity.avgSpeedKmh > 15 && activity.movingTimeMin > 30) {
    const estimatedIf = 0.7; // RPE 5 / moderate endurance
    const estimatedTss = (durationSec / 3600) * estimatedIf * estimatedIf * 100;
    return {
      ...activity,
      ifValue: activity.ifValue ?? estimatedIf,
      tss: Math.round(estimatedTss),
      tssSource: "computed_rpe",
    };
  }

  return { ...activity };
}

/**
 * Normalize a list of activities with TSS compatibility
 */
export function normalizeActivities(activities: Activity[], user: User): NormalizedActivity[] {
  return activities.map((a) => computeTssIfMissing(a, user));
}
