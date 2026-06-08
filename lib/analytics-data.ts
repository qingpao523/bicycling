/**
 * Analytics data loader - loads activities and applies TSS compatibility normalization
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
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

const fetchAnalyticsData = unstable_cache(
  async (userId: string, userJson: string): Promise<AnalyticsData> => {
    const user: User = JSON.parse(userJson);
    const raw = await listActivitiesByUser(userId);
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
  },
  ["analytics-data"],
  { revalidate: 120, tags: ["activities"] }
);

export const loadAnalyticsData = cache(async (user: User): Promise<AnalyticsData> => {
  return fetchAnalyticsData(user.id, JSON.stringify(user));
});

/**
 * For backward-compatible usage where existing code expects Activity[]
 * (NormalizedActivity is compatible because it extends Activity minus a few fields)
 */
export function asActivities(normalized: NormalizedActivity[]): Activity[] {
  return normalized as Activity[];
}
