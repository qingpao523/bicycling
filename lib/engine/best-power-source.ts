/**
 * Best Power Extractor
 *
 * For activities without watts stream data, extract best-power data points from
 * intervals.icu summary fields (icu_pm_*, icu_achievements, interval_summary, etc.)
 * and from NP/avgPower fallbacks.
 *
 * This recovers significant data that would otherwise be lost.
 */

import type { Activity } from "@/lib/types";

export interface BestPowerPoint {
  duration: number; // seconds
  power: number; // watts
  source: "stream" | "icu_achievement" | "icu_pm" | "interval_summary" | "np" | "avg_power";
}

/**
 * Rolling window best average from watts stream
 */
function bestFromStream(watts: number[], durationSeconds: number): number {
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
 * Parse interval_summary like "5x 13s 427w" or "2x 3m2s 222w"
 * Returns [{ duration: seconds, power: watts }]
 */
function parseIntervalSummary(items: unknown): { duration: number; power: number }[] {
  if (!Array.isArray(items)) return [];
  const results: { duration: number; power: number }[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    // Match patterns like "5x 13s 427w" or "1x 62s 357w" or "2x 3m2s 222w"
    const m = item.match(/(\d+)x\s+(?:(\d+)m)?(\d+)s\s+(\d+)w/i);
    if (!m) continue;
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const sec = parseInt(m[3], 10);
    const power = parseInt(m[4], 10);
    const duration = min * 60 + sec;
    if (duration > 0 && power > 0) {
      results.push({ duration, power });
    }
  }
  return results;
}

/**
 * Map a duration in seconds to the nearest standard bucket
 */
const STANDARD_DURATIONS = [1, 5, 10, 15, 30, 60, 90, 120, 180, 300, 420, 480, 600, 900, 1200, 1800, 2400, 3600, 5400, 7200, 10800];

function nearestStandardDuration(duration: number): number | null {
  // Find the largest standard duration that is <= actual duration (so we don't over-extrapolate)
  let best: number | null = null;
  for (const d of STANDARD_DURATIONS) {
    if (d <= duration && (!best || d > best)) best = d;
    if (d > duration) break;
  }
  return best;
}

/**
 * Extract best power points for one activity from all available sources.
 * Returns a Map of duration (seconds) -> { power, source }.
 * For each duration, keeps the highest power value among all sources.
 */
export function extractActivityBestPowers(activity: Activity): Map<number, BestPowerPoint> {
  const result = new Map<number, BestPowerPoint>();

  const raw = (activity.rawSummaryJson ?? {}) as Record<string, any>;
  const streams = activity.rawStreamsJson as Record<string, any> | null;

  function offer(duration: number, power: number, source: BestPowerPoint["source"]) {
    if (power <= 0 || duration <= 0) return;
    const existing = result.get(duration);
    if (!existing || power > existing.power) {
      result.set(duration, { duration, power, source });
    }
  }

  // ========== Source 1: watts stream (highest priority) ==========
  const watts = streams && Array.isArray(streams.watts) ? (streams.watts as number[]) : null;
  if (watts && watts.length >= 60) {
    for (const d of STANDARD_DURATIONS) {
      if (d > watts.length) break;
      const p = bestFromStream(watts, d);
      if (p > 0) offer(d, p, "stream");
    }
  }

  // ========== Source 2: icu_pm_ftp_watts (single-point best power from intervals.icu) ==========
  // Example: icu_pm_ftp_watts=300, icu_pm_ftp_secs=300 means 5min best is 300W
  const pmFtpWatts = Number(raw.icu_pm_ftp_watts);
  const pmFtpSecs = Number(raw.icu_pm_ftp_secs);
  if (pmFtpWatts > 0 && pmFtpSecs > 0) {
    const bucket = nearestStandardDuration(pmFtpSecs) ?? pmFtpSecs;
    offer(bucket, pmFtpWatts, "icu_pm");
  }

  // ========== Source 3: icu_pm_p_max (peak instantaneous power ~ 1s best) ==========
  const pmPMax = Number(raw.icu_pm_p_max);
  if (pmPMax > 0) {
    offer(1, Math.round(pmPMax), "icu_pm");
  }

  // ========== Source 4: icu_achievements (multiple FTP_UP events) ==========
  // Each achievement: { type: "FTP_UP", watts: 300, secs: 300 }
  const achievements = raw.icu_achievements;
  if (Array.isArray(achievements)) {
    for (const ach of achievements) {
      if (!ach || typeof ach !== "object") continue;
      const type = String(ach.type ?? "").toLowerCase();
      if (!type.includes("ftp") && !type.includes("power") && type !== "watts_up") continue;
      const power = Number(ach.watts);
      const secs = Number(ach.secs);
      if (power > 0 && secs > 0) {
        const bucket = nearestStandardDuration(secs) ?? secs;
        offer(bucket, power, "icu_achievement");
      }
    }
  }

  // ========== Source 5: interval_summary ==========
  // Example: ["2x 3m2s 222w", "1x 62s 357w", "5x 13s 427w"]
  const intervalSummary = raw.interval_summary;
  if (Array.isArray(intervalSummary)) {
    const parsed = parseIntervalSummary(intervalSummary);
    for (const { duration, power } of parsed) {
      const bucket = nearestStandardDuration(duration) ?? duration;
      offer(bucket, power, "interval_summary");
    }
  }

  // ========== Source 6: max_watts (Strava) for peak power ==========
  const maxWatts = Number(raw.max_watts);
  if (maxWatts > 0) {
    offer(1, Math.round(maxWatts), "icu_pm");
  }

  // ========== Source 7: avgPower / NP as duration = full activity moving time ==========
  // This gives us a lower bound for long-duration efforts on activities with no detailed data
  const duration = activity.movingTimeMin * 60;
  if (duration > 600) {
    const np = activity.np;
    if (np && np > 0) {
      const bucket = nearestStandardDuration(duration);
      if (bucket) offer(bucket, np, "np");
    }
    const avg = activity.avgPower;
    if (avg && avg > 0) {
      const bucket = nearestStandardDuration(duration);
      if (bucket) offer(bucket, avg, "avg_power");
    }
  }

  return result;
}
