import type { Activity } from "@/lib/types";

type ActivityAlias = {
  activityId: string;
  source: string;
  externalActivityId: string;
};

type DedupeResult = {
  accepted: Activity[];
  skipped: Array<{
    activity: Activity;
    matchedActivityId: string;
  }>;
  // v2: 用更完整的 incoming 数据覆盖已入库的空壳
  merged: Array<{
    activity: Activity;         // 合并后的 activity (用 incoming 丰富 existing)
    matchedActivityId: string;  // 已入库的 activity id (用这个 id 做 update)
    reason: string;
  }>;
};

function getSportType(activity: Activity) {
  const raw = activity.rawSummaryJson ?? {};
  const type = String(raw.type ?? raw.sport_type ?? raw.activity_type ?? "").toLowerCase();

  if (type.includes("ride") || type.includes("bike") || type.includes("cycle")) return "cycling";
  if (type.includes("run")) return "running";
  if (type.includes("hike") || type.includes("walk")) return "walking";
  if (type.includes("workout") || type.includes("fitness") || type.includes("strength")) return "fitness";
  return "other";
}

function withinTolerance(a: number, b: number, absoluteTolerance: number, ratioTolerance: number) {
  const delta = Math.abs(a - b);
  const baseline = Math.max(Math.abs(a), Math.abs(b), 1);
  return delta <= absoluteTolerance || delta / baseline <= ratioTolerance;
}

export function isLikelyDuplicateActivity(left: Activity, right: Activity) {
  if (left.userId !== right.userId) return false;
  if (left.externalActivityId === right.externalActivityId) return true;
  if (getSportType(left) !== getSportType(right)) return false;

  const startDeltaMinutes = Math.abs(new Date(left.startTime).getTime() - new Date(right.startTime).getTime()) / 60_000;
  if (startDeltaMinutes > 15) return false;

  const distanceClose = withinTolerance(left.distanceKm, right.distanceKm, 2, 0.08);
  const durationClose = withinTolerance(left.movingTimeMin, right.movingTimeMin, 15, 0.12);
  const elevationClose = withinTolerance(left.elevationM, right.elevationM, 120, 0.18);

  const matchingSignals = [distanceClose, durationClose, elevationClose].filter(Boolean).length;
  return matchingSignals >= 2;
}

/**
 * 数据丰富度评分
 * 场景: intervals.icu API 返回的 Strava 来源活动是空壳 (0 功率/心率/TSS),
 * 但 Strava 直连的同一条活动有完整数据。旧 dedupe skip 空壳永留。
 * 新 merge: incoming 更丰富时用 incoming 字段覆盖 existing。
 */
function richnessScore(activity: Activity): number {
  let score = 0;
  if (activity.avgPower && activity.avgPower > 0) score += 3;
  if (activity.np && activity.np > 0) score += 3;
  if (activity.avgHr && activity.avgHr > 0) score += 2;
  if (activity.tss && activity.tss > 0) score += 2;
  if (activity.ifValue && activity.ifValue > 0) score += 2;
  if (activity.distanceKm > 0) score += 1;
  if (activity.elevationM > 0) score += 1;
  if (activity.recentCtl !== undefined) score += 1;
  const rawKeys = activity.rawSummaryJson ? Object.keys(activity.rawSummaryJson).length : 0;
  score += Math.min(rawKeys, 10);
  const streamKeys = activity.rawStreamsJson ? Object.keys(activity.rawStreamsJson).length : 0;
  score += streamKeys * 2;
  return score;
}

function mergeActivities(existing: Activity, incoming: Activity): Activity {
  return {
    ...existing,
    name: (incoming.name && incoming.name !== "Ride" && incoming.name !== "Strava Activity")
      ? incoming.name
      : existing.name,
    distanceKm: incoming.distanceKm > 0 ? incoming.distanceKm : existing.distanceKm,
    movingTimeMin: incoming.movingTimeMin > 0 ? incoming.movingTimeMin : existing.movingTimeMin,
    elevationM: incoming.elevationM > 0 ? incoming.elevationM : existing.elevationM,
    avgSpeedKmh: incoming.avgSpeedKmh > 0 ? incoming.avgSpeedKmh : existing.avgSpeedKmh,
    avgHr: incoming.avgHr ?? existing.avgHr,
    avgPower: incoming.avgPower ?? existing.avgPower,
    np: incoming.np ?? existing.np,
    ifValue: incoming.ifValue ?? existing.ifValue,
    tss: incoming.tss ?? existing.tss,
    temperatureC: incoming.temperatureC ?? existing.temperatureC,
    recentCtl: incoming.recentCtl ?? existing.recentCtl,
    recentAtl: incoming.recentAtl ?? existing.recentAtl,
    recentForm: incoming.recentForm ?? existing.recentForm,
    rawSummaryJson: Object.keys(incoming.rawSummaryJson ?? {}).length >= Object.keys(existing.rawSummaryJson ?? {}).length
      ? incoming.rawSummaryJson
      : existing.rawSummaryJson,
    rawStreamsJson: Object.keys(incoming.rawStreamsJson ?? {}).length >= Object.keys(existing.rawStreamsJson ?? {}).length
      ? incoming.rawStreamsJson
      : existing.rawStreamsJson,
    updatedAt: new Date().toISOString(),
  };
}

const RICHNESS_MERGE_THRESHOLD = 3;

export { richnessScore, mergeActivities };

export function dedupeIncomingActivities(existing: Activity[], incoming: Activity[], aliases: ActivityAlias[] = []): DedupeResult {
  const accepted: Activity[] = [];
  const skipped: DedupeResult["skipped"] = [];
  const merged: DedupeResult["merged"] = [];
  const pool = [...existing];
  const aliasIndex = new Map(aliases.map((item) => [`${item.source}:${item.externalActivityId}`, item.activityId]));

  for (const activity of incoming) {
    const aliasActivityId = aliasIndex.get(`${activity.source}:${activity.externalActivityId}`);
    const matched =
      (aliasActivityId ? pool.find((candidate) => candidate.id === aliasActivityId) : undefined) ??
      pool.find((candidate) => isLikelyDuplicateActivity(candidate, activity));

    if (matched) {
      const existingRichness = richnessScore(matched);
      const incomingRichness = richnessScore(activity);

      if (incomingRichness > existingRichness + RICHNESS_MERGE_THRESHOLD) {
        const mergedActivity = mergeActivities(matched, activity);
        merged.push({
          activity: mergedActivity,
          matchedActivityId: matched.id,
          reason: `incoming ${activity.source} 更丰富 (${incomingRichness} vs existing ${existingRichness})`,
        });
      } else {
        skipped.push({
          activity,
          matchedActivityId: matched.id,
        });
      }
      continue;
    }

    accepted.push(activity);
    pool.push(activity);
  }

  return { accepted, skipped, merged };
}
