import { dedupeIncomingActivities } from "@/lib/activity-dedupe";
import { decryptSecret } from "@/lib/crypto";
import { fetchIntervalsActivities, fetchIntervalsProfile } from "@/lib/intervals";
import {
  getAppConfig,
  getLatestActivityAliasStartTime,
  listActivitiesByUser,
  listActivityAliasesByUser,
  saveActivityAlias,
  saveUser,
  upsertActivities,
} from "@/lib/storage";
import type { User } from "@/lib/types";

const incrementalOverlapDays = 14;

function isoDateDaysBefore(value: string, days: number) {
  return new Date(new Date(value).getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function preferUserOverride(current?: number, previousSynced?: number, nextSynced?: number) {
  if (typeof nextSynced !== "number") return current;
  if (typeof current !== "number") return nextSynced;
  if (typeof previousSynced === "number" && current === previousSynced) return nextSynced;
  return current;
}

export async function runIntervalsSync(input: {
  user: User;
  mode?: "incremental" | "full";
  oldest?: string;
}) {
  const config = await getAppConfig();
  if (!config.featureIntervalsSync) {
    throw new Error("管理员已关闭同步功能。");
  }

  if (!input.user.intervalsApiKeyEncrypted) {
    throw new Error("请先填写 intervals.icu API key。");
  }

  const mode = input.mode ?? "incremental";
  const apiKey = decryptSecret(input.user.intervalsApiKeyEncrypted);
  const profile = await fetchIntervalsProfile({
    athleteId: input.user.intervalsAthleteId,
    apiKey,
  });
  const latestIntervalsAlias = await getLatestActivityAliasStartTime(input.user.id, "intervals.icu");
  const oldest =
    input.oldest ??
    (mode === "full" ? undefined : latestIntervalsAlias ? isoDateDaysBefore(latestIntervalsAlias, incrementalOverlapDays) : undefined);
  const activities = await fetchIntervalsActivities({
    athleteId: profile.athleteId,
    apiKey,
    userId: input.user.id,
    oldest,
  });
  const [existingActivities, aliases] = await Promise.all([
    listActivitiesByUser(input.user.id),
    listActivityAliasesByUser(input.user.id),
  ]);
  const deduped = dedupeIncomingActivities(existingActivities, activities, aliases);

  await saveUser({
    ...input.user,
    intervalsAthleteId: profile.athleteId || input.user.intervalsAthleteId,
    weightKg: preferUserOverride(input.user.weightKg, input.user.syncedWeightKg, profile.weightKg),
    ftp: preferUserOverride(input.user.ftp, input.user.syncedFtp, profile.ftp),
    thresholdHr: preferUserOverride(input.user.thresholdHr, input.user.syncedThresholdHr, profile.thresholdHr),
    maxHr: preferUserOverride(input.user.maxHr, input.user.syncedMaxHr, profile.maxHr),
    restingHr: preferUserOverride(input.user.restingHr, input.user.syncedRestingHr, profile.restingHr),
    syncedWeightKg: profile.weightKg,
    syncedFtp: profile.ftp,
    syncedThresholdHr: profile.thresholdHr,
    syncedMaxHr: profile.maxHr,
    syncedRestingHr: profile.restingHr,
    intervalsRawProfileJson: profile.rawAthlete,
    intervalsRawWellnessJson: profile.rawWellness,
    updatedAt: new Date().toISOString(),
  });
  await upsertActivities(deduped.accepted);
  await Promise.all(
    deduped.skipped.map((item) =>
      saveActivityAlias({
        userId: item.activity.userId,
        activityId: item.matchedActivityId,
        source: item.activity.source,
        externalActivityId: item.activity.externalActivityId,
        startTime: item.activity.startTime,
        rawSummaryJson: item.activity.rawSummaryJson,
      }),
    ),
  );

  return {
    mode,
    oldest,
    total: activities.length,
    inserted: deduped.accepted.length,
    skipped: deduped.skipped.length,
  };
}
