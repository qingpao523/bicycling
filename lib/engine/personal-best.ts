/**
 * Personal Best Engine
 * Tracks and calculates personal best power records across all durations
 */

import type { Activity } from "@/lib/types";
import { extractActivityBestPowers } from "./best-power-source";

export interface PersonalBestRecord {
  duration: number; // seconds
  durationLabel: string;
  power: number; // watts
  wpkg: number | null;
  activityId: string;
  activityName: string;
  achievedAt: string;
  isNew: boolean; // achieved within last 30 days
  improvement: number | null; // percentage improvement over previous best
}

const PB_DURATIONS = [
  { seconds: 5, label: "5 秒" },
  { seconds: 30, label: "30 秒" },
  { seconds: 60, label: "1 分钟" },
  { seconds: 300, label: "5 分钟" },
  { seconds: 600, label: "10 分钟" },
  { seconds: 1200, label: "20 分钟" },
  { seconds: 1800, label: "30 分钟" },
  { seconds: 3600, label: "60 分钟" },
  { seconds: 5400, label: "90 分钟" },
];

function bestAveragePower(watts: number[], durationSeconds: number): number {
  if (watts.length < durationSeconds) return 0;
  let sum = 0;
  for (let i = 0; i < durationSeconds; i++) sum += watts[i];
  let best = sum;
  for (let i = durationSeconds; i < watts.length; i++) {
    sum += watts[i] - watts[i - durationSeconds];
    if (sum > best) best = sum;
  }
  return Math.round(best / durationSeconds);
}

/**
 * Calculate personal bests from all activities
 */
export function calculatePersonalBests(
  activities: Activity[],
  weightKg?: number,
  startDate?: Date,
  endDate?: Date
): { records: PersonalBestRecord[]; skippedCount: number } {
  const bestMap = new Map<number, { power: number; activityId: string; activityName: string; achievedAt: string }>();
  const previousBestMap = new Map<number, number>(); // for tracking improvements
  let skippedCount = 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Sort activities by date
  const sorted = [...activities]
    .filter((a) => {
      if (startDate && new Date(a.startTime) < startDate) return false;
      if (endDate && new Date(a.startTime) > endDate) return false;
      return true;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  for (const activity of sorted) {
    const extracted = extractActivityBestPowers(activity);
    if (extracted.size === 0) {
      skippedCount++;
      continue;
    }

    for (const { seconds } of PB_DURATIONS) {
      const point = extracted.get(seconds);
      if (!point || point.power <= 0) continue;

      const existing = bestMap.get(seconds);
      if (!existing || point.power > existing.power) {
        if (existing) {
          previousBestMap.set(seconds, existing.power);
        }
        bestMap.set(seconds, {
          power: point.power,
          activityId: activity.id,
          activityName: activity.name,
          achievedAt: activity.startTime,
        });
      }
    }
  }

  const records: PersonalBestRecord[] = PB_DURATIONS.map(({ seconds, label }) => {
    const best = bestMap.get(seconds);
    if (!best) {
      return {
        duration: seconds,
        durationLabel: label,
        power: 0,
        wpkg: null,
        activityId: "",
        activityName: "",
        achievedAt: "",
        isNew: false,
        improvement: null,
      };
    }

    const previousBest = previousBestMap.get(seconds);
    const improvement = previousBest ? Number((((best.power - previousBest) / previousBest) * 100).toFixed(1)) : null;
    const isNew = new Date(best.achievedAt) >= thirtyDaysAgo;

    return {
      duration: seconds,
      durationLabel: label,
      power: best.power,
      wpkg: weightKg ? Number((best.power / weightKg).toFixed(2)) : null,
      activityId: best.activityId,
      activityName: best.activityName,
      achievedAt: best.achievedAt,
      isNew,
      improvement,
    };
  }).filter((r) => r.power > 0);

  return { records, skippedCount };
}
