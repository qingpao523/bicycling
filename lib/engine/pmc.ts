/**
 * PMC (Performance Management Chart) Engine
 * Calculates CTL (Chronic Training Load), ATL (Acute Training Load), TSB (Training Stress Balance)
 */

import type { Activity } from "@/lib/types";

export interface PmcDataPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  dailyTss: number;
  activities: { id: string; name: string; tss: number }[];
}

export interface TrainingPhase {
  phase: "base" | "build" | "race" | "recovery";
  label: string;
  description: string;
}

const CTL_DAYS = 42;
const ATL_DAYS = 7;

function ewma(previousValue: number, newValue: number, days: number): number {
  const decay = 2 / (days + 1);
  return previousValue + decay * (newValue - previousValue);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function calculatePmc(
  activities: Activity[],
  startDate?: Date,
  endDate?: Date
): PmcDataPoint[] {
  if (!activities.length) return [];

  const sorted = [...activities].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const firstDate = startDate ?? new Date(sorted[0].startTime);
  const lastDate = endDate ?? new Date();

  // Group activities by date
  const dailyTss = new Map<string, { tss: number; activities: { id: string; name: string; tss: number }[] }>();
  for (const activity of sorted) {
    const dateKey = formatDate(new Date(activity.startTime));
    const existing = dailyTss.get(dateKey) ?? { tss: 0, activities: [] };
    const actTss = activity.tss ?? 0;
    existing.tss += actTss;
    existing.activities.push({ id: activity.id, name: activity.name, tss: actTss });
    dailyTss.set(dateKey, existing);
  }

  // Calculate PMC from start - 42 days to build up CTL
  const calcStart = addDays(firstDate, -CTL_DAYS);
  const results: PmcDataPoint[] = [];
  let ctl = 0;
  let atl = 0;

  let current = new Date(calcStart);
  while (current <= lastDate) {
    const dateKey = formatDate(current);
    const dayData = dailyTss.get(dateKey) ?? { tss: 0, activities: [] };

    ctl = ewma(ctl, dayData.tss, CTL_DAYS);
    atl = ewma(atl, dayData.tss, ATL_DAYS);
    const tsb = ctl - atl;

    // Only include dates from the requested start
    if (current >= firstDate) {
      results.push({
        date: dateKey,
        ctl: Number(ctl.toFixed(1)),
        atl: Number(atl.toFixed(1)),
        tsb: Number(tsb.toFixed(1)),
        dailyTss: dayData.tss,
        activities: dayData.activities,
      });
    }

    current = addDays(current, 1);
  }

  return results;
}

export function getCurrentPmc(pmcData: PmcDataPoint[]): { ctl: number; atl: number; tsb: number } | null {
  if (!pmcData.length) return null;
  const latest = pmcData[pmcData.length - 1];
  return { ctl: latest.ctl, atl: latest.atl, tsb: latest.tsb };
}

export function getPmcOneWeekAgo(pmcData: PmcDataPoint[]): { ctl: number; atl: number; tsb: number } | null {
  if (pmcData.length < 8) return null;
  const point = pmcData[pmcData.length - 8];
  return { ctl: point.ctl, atl: point.atl, tsb: point.tsb };
}

export function detectTrainingPhase(pmcData: PmcDataPoint[]): TrainingPhase {
  if (pmcData.length < 14) {
    return { phase: "base", label: "基期", description: "数据不足，默认为基期" };
  }

  const recent = pmcData.slice(-14);
  const latest = recent[recent.length - 1];
  const twoWeeksAgo = recent[0];

  const ctlChange = latest.ctl - twoWeeksAgo.ctl;
  const ctlChangeRate = twoWeeksAgo.ctl > 0 ? ctlChange / twoWeeksAgo.ctl : 0;

  // Check for recovery: CTL declining or TSB > 20 for 5+ days
  const highTsbDays = recent.filter((p) => p.tsb > 20).length;
  if (ctlChange < -2 || highTsbDays >= 5) {
    return { phase: "recovery", label: "恢复期", description: "CTL 下降或长期高 TSB，当前处于恢复阶段" };
  }

  // Race phase: CTL stable, TSB > 10
  if (Math.abs(ctlChangeRate) < 0.05 && latest.tsb > 10) {
    return { phase: "race", label: "竞赛期", description: "CTL 稳定且 TSB 较高，适合参加比赛" };
  }

  // Build phase: CTL rising fast, TSB between -25 and -10
  if (ctlChangeRate > 0.08 && latest.tsb >= -25 && latest.tsb <= -10) {
    return { phase: "build", label: "强化期", description: "CTL 快速上升，训练负荷较大" };
  }

  // Base phase: CTL steady rise, TSB between -10 and 10
  return { phase: "base", label: "基期", description: "CTL 稳步上升，训练节奏平稳" };
}
