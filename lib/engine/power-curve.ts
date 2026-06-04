/**
 * Power Duration Curve Engine
 * Calculates best average power for various durations using sliding window
 */

import type { Activity } from "@/lib/types";
import { extractActivityBestPowers } from "./best-power-source";

export interface PowerCurvePoint {
  duration: number; // seconds
  power: number; // watts
  wpkg?: number;
  activityId: string;
  activityName: string;
  activityDate: string;
}

export interface PowerCurveResult {
  curve: PowerCurvePoint[];
  skippedCount: number;
}

// Key durations to always include (in seconds)
const KEY_DURATIONS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480, 540, 600, 720, 900, 1200, 1500, 1800, 2400, 3000, 3600, 4500, 5400, 7200, 9000, 10800];

/**
 * Calculate best average power for a given duration using sliding window
 */
function bestAveragePower(watts: number[], durationSeconds: number): number {
  if (watts.length < durationSeconds) return 0;

  let sum = 0;
  for (let i = 0; i < durationSeconds; i++) {
    sum += watts[i];
  }

  let best = sum;
  for (let i = durationSeconds; i < watts.length; i++) {
    sum += watts[i] - watts[i - durationSeconds];
    if (sum > best) best = sum;
  }

  return Math.round(best / durationSeconds);
}

/**
 * Calculate power duration curve for a single activity
 */
function calculateActivityPowerCurve(watts: number[]): Map<number, number> {
  const results = new Map<number, number>();
  const maxDuration = Math.min(watts.length, KEY_DURATIONS[KEY_DURATIONS.length - 1]);

  for (const duration of KEY_DURATIONS) {
    if (duration > watts.length) break;
    const power = bestAveragePower(watts, duration);
    if (power > 0) {
      results.set(duration, power);
    }
  }

  return results;
}

/**
 * Build the best power duration curve across all activities in a time range
 */
export function buildPowerCurve(
  activities: Activity[],
  weightKg?: number,
  startDate?: Date,
  endDate?: Date
): PowerCurveResult {
  const bestPowers = new Map<number, PowerCurvePoint>();
  let skippedCount = 0;

  const filtered = activities.filter((a) => {
    if (startDate && new Date(a.startTime) < startDate) return false;
    if (endDate && new Date(a.startTime) > endDate) return false;
    return true;
  });

  for (const activity of filtered) {
    const extracted = extractActivityBestPowers(activity);
    if (extracted.size === 0) {
      skippedCount++;
      continue;
    }
    for (const [duration, point] of extracted) {
      const existing = bestPowers.get(duration);
      if (!existing || point.power > existing.power) {
        bestPowers.set(duration, {
          duration,
          power: point.power,
          wpkg: weightKg ? Number((point.power / weightKg).toFixed(2)) : undefined,
          activityId: activity.id,
          activityName: activity.name,
          activityDate: activity.startTime,
        });
      }
    }
  }

  const curve = Array.from(bestPowers.values()).sort((a, b) => a.duration - b.duration);

  return { curve, skippedCount };
}

/**
 * Get power at specific key durations for display
 */
export function getKeyPowers(curve: PowerCurvePoint[]): Record<string, PowerCurvePoint | null> {
  const keyMap: Record<string, number> = {
    "5s": 5,
    "1min": 60,
    "5min": 300,
    "20min": 1200,
    "60min": 3600,
  };

  const result: Record<string, PowerCurvePoint | null> = {};
  for (const [label, duration] of Object.entries(keyMap)) {
    result[label] = curve.find((p) => p.duration === duration) ?? null;
  }
  return result;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
}
