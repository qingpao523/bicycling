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

export function dedupeIncomingActivities(existing: Activity[], incoming: Activity[], aliases: ActivityAlias[] = []): DedupeResult {
  const accepted: Activity[] = [];
  const skipped: DedupeResult["skipped"] = [];
  const pool = [...existing];
  const aliasIndex = new Map(aliases.map((item) => [`${item.source}:${item.externalActivityId}`, item.activityId]));

  for (const activity of incoming) {
    const aliasActivityId = aliasIndex.get(`${activity.source}:${activity.externalActivityId}`);
    const matched =
      (aliasActivityId ? pool.find((candidate) => candidate.id === aliasActivityId) : undefined) ??
      pool.find((candidate) => isLikelyDuplicateActivity(candidate, activity));
    if (matched) {
      skipped.push({
        activity,
        matchedActivityId: matched.id,
      });
      continue;
    }

    accepted.push(activity);
    pool.push(activity);
  }

  return { accepted, skipped };
}
