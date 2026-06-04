/**
 * Recovery Engine
 * Calculates daily recovery score (0-100) based on TSB, rest intervals, training load
 */

import type { Activity } from "@/lib/types";
import type { PmcDataPoint } from "./pmc";

export interface RecoveryScore {
  date: string;
  score: number;
  level: "full" | "good" | "partial" | "fatigued";
  label: string;
  color: string;
  factors: {
    tsbContribution: number;
    restContribution: number;
    consecutiveDaysContribution: number;
    intensityContribution: number;
  };
}

export interface RecoveryPrediction {
  daysToFull: number | null; // null if > 30 days
  currentRate: number; // points per day
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getLevel(score: number): RecoveryScore["level"] {
  if (score >= 80) return "full";
  if (score >= 60) return "good";
  if (score >= 40) return "partial";
  return "fatigued";
}

function getLevelLabel(level: RecoveryScore["level"]): string {
  switch (level) {
    case "full": return "完全恢复";
    case "good": return "良好";
    case "partial": return "部分恢复";
    case "fatigued": return "疲劳";
  }
}

function getLevelColor(level: RecoveryScore["level"]): string {
  switch (level) {
    case "full": return "#0f8a62";
    case "good": return "#1f57d6";
    case "partial": return "#f59e0b";
    case "fatigued": return "#c44d3b";
  }
}

/**
 * Calculate recovery scores for the past N days
 */
export function calculateRecoveryScores(
  pmcData: PmcDataPoint[],
  activities: Activity[],
  days: number = 14
): RecoveryScore[] {
  if (!pmcData.length) return [];

  const recentPmc = pmcData.slice(-days);
  const results: RecoveryScore[] = [];

  // Build activity date map
  const activityDates = new Map<string, Activity[]>();
  for (const a of activities) {
    const dateKey = new Date(a.startTime).toISOString().split("T")[0];
    const existing = activityDates.get(dateKey) ?? [];
    existing.push(a);
    activityDates.set(dateKey, existing);
  }

  for (let i = 0; i < recentPmc.length; i++) {
    const point = recentPmc[i];

    // Factor 1: TSB contribution (40%)
    // TSB range typically -30 to +25, map to 0-100
    const tsbNormalized = clamp((point.tsb + 30) / 55 * 100, 0, 100);
    const tsbContribution = tsbNormalized * 0.4;

    // Factor 2: Rest interval (20%)
    // Hours since last activity
    let hoursSinceLastActivity = 48; // default if no recent activity
    for (let j = i; j >= 0; j--) {
      const dayActivities = activityDates.get(recentPmc[j].date);
      if (dayActivities && dayActivities.length > 0) {
        hoursSinceLastActivity = (i - j) * 24;
        break;
      }
    }
    const restNormalized = clamp(hoursSinceLastActivity / 48 * 100, 0, 100);
    const restContribution = restNormalized * 0.2;

    // Factor 3: Consecutive training days (20%)
    let consecutiveDays = 0;
    for (let j = i; j >= Math.max(0, i - 7); j--) {
      if (activityDates.has(recentPmc[j].date)) {
        consecutiveDays++;
      } else {
        break;
      }
    }
    const consecutiveNormalized = clamp((7 - consecutiveDays) / 7 * 100, 0, 100);
    const consecutiveDaysContribution = consecutiveNormalized * 0.2;

    // Factor 4: Recent intensity (20%)
    // Average IF of last 3 days activities
    const recentActivities: Activity[] = [];
    for (let j = Math.max(0, i - 2); j <= i; j++) {
      const dayActs = activityDates.get(recentPmc[j]?.date ?? "");
      if (dayActs) recentActivities.push(...dayActs);
    }
    const avgIf = recentActivities.length
      ? recentActivities.reduce((sum, a) => sum + (a.ifValue ?? 0), 0) / recentActivities.length
      : 0;
    const intensityNormalized = clamp((1.0 - avgIf) / 0.5 * 100, 0, 100);
    const intensityContribution = intensityNormalized * 0.2;

    const score = Math.round(tsbContribution + restContribution + consecutiveDaysContribution + intensityContribution);

    const level = getLevel(score);
    results.push({
      date: point.date,
      score: clamp(score, 0, 100),
      level,
      label: getLevelLabel(level),
      color: getLevelColor(level),
      factors: {
        tsbContribution: Math.round(tsbContribution / 0.4),
        restContribution: Math.round(restContribution / 0.2),
        consecutiveDaysContribution: Math.round(consecutiveDaysContribution / 0.2),
        intensityContribution: Math.round(intensityContribution / 0.2),
      },
    });
  }

  return results;
}

/**
 * Predict days to full recovery
 */
export function predictRecovery(scores: RecoveryScore[]): RecoveryPrediction {
  if (scores.length < 3) return { daysToFull: null, currentRate: 0 };

  const recent = scores.slice(-7);
  const latestScore = recent[recent.length - 1].score;

  if (latestScore >= 80) return { daysToFull: 0, currentRate: 0 };

  // Calculate average daily change
  let totalChange = 0;
  for (let i = 1; i < recent.length; i++) {
    totalChange += recent[i].score - recent[i - 1].score;
  }
  const avgRate = totalChange / (recent.length - 1);

  if (avgRate <= 0) return { daysToFull: null, currentRate: avgRate };

  const daysNeeded = Math.ceil((80 - latestScore) / avgRate);
  return {
    daysToFull: daysNeeded <= 30 ? daysNeeded : null,
    currentRate: Number(avgRate.toFixed(1)),
  };
}
