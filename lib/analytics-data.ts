/**
 * Analytics data loader - loads activities and applies TSS compatibility normalization
 */

import { listActivitiesByUser } from "@/lib/storage";
import { normalizeActivities, type NormalizedActivity } from "@/lib/engine/tss-compat";
import type { User, Activity } from "@/lib/types";

export interface AnalyticsData {
  activities: NormalizedActivity[];
  originalCount: number;
  computedTssCount: number;
  stats: {
    total: number;
    withOriginalTss: number;
    computedFromPower: number;
    computedFromHr: number;
    computedFromRpe: number;
    withoutTss: number;
  };
}

export async function loadAnalyticsData(user: User): Promise<AnalyticsData> {
  const raw = await listActivitiesByUser(user.id);
  const normalized = normalizeActivities(raw, user);

  const stats = {
    total: normalized.length,
    withOriginalTss: normalized.filter((a) => a.tssSource === "original").length,
    computedFromPower: normalized.filter((a) => a.tssSource === "computed_power").length,
    computedFromHr: normalized.filter((a) => a.tssSource === "computed_hr").length,
    computedFromRpe: normalized.filter((a) => a.tssSource === "computed_rpe").length,
    withoutTss: normalized.filter((a) => !a.tss).length,
  };

  return {
    activities: normalized,
    originalCount: stats.withOriginalTss,
    computedTssCount: stats.computedFromPower + stats.computedFromHr + stats.computedFromRpe,
    stats,
  };
}

/**
 * For backward-compatible usage where existing code expects Activity[]
 * (NormalizedActivity is compatible because it extends Activity minus a few fields)
 */
export function asActivities(normalized: NormalizedActivity[]): Activity[] {
  return normalized as Activity[];
}
