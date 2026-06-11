import { dedupeIncomingActivities } from "@/lib/activity-dedupe";
import { decryptSecret } from "@/lib/crypto";
import { fetchIntervalsActivities, fetchIntervalsActivityStreams, fetchIntervalsProfile } from "@/lib/intervals";
import { prisma } from "@/lib/prisma";
import {
  enqueueSyncJob,
  getActivity,
  getAppConfig,
  getLatestActivityAliasStartTime,
  listActivitiesByUser,
  listActivityAliasesByUser,
  saveActivityAlias,
  saveUser,
  updateActivityStreams,
  upsertActivities,
} from "@/lib/storage";
import type { SyncJob, User } from "@/lib/types";

const incrementalOverlapDays = 14;
const wellnessSyncDays = 30;

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && !isNaN(v)) return v;
  return undefined;
}

export async function syncWellnessData(userId: string, rawWellness: unknown) {
  if (!Array.isArray(rawWellness) || rawWellness.length === 0) return 0;

  const cutoff = new Date(Date.now() - wellnessSyncDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const entries = rawWellness.filter(
    (e): e is Record<string, unknown> =>
      !!e && typeof e === "object" && typeof (e as Record<string, unknown>).id === "string",
  );

  const recent = entries.filter((e) => (e.id as string) >= cutoff);
  let synced = 0;

  // 临时日志: 打印第一条 wellness 的全部 key，确认 ICU 实际返回了哪些睡眠字段
  if (recent.length > 0) {
    const sample = recent[recent.length - 1];
    const sleepKeys = Object.keys(sample).filter((k) => /sleep|awake|rem|deep|light|breath|nap|bed/i.test(k));
    console.log(`[wellness-sync] 原始字段 keys(${Object.keys(sample).length}): ${Object.keys(sample).join(", ")}`);
    console.log(`[wellness-sync] 睡眠相关: ${sleepKeys.map((k) => `${k}=${JSON.stringify(sample[k])}`).join(", ") || "无"}`);
  }

  for (const entry of recent) {
    const date = entry.id as string;
    const wellnessData = {
      restingHr: asNumber(entry.restingHR) ?? asNumber(entry.resting_hr) ?? undefined,
      hrv: asNumber(entry.hrv) ?? asNumber(entry.rmssd) ?? undefined,
      sleepSecs: asNumber(entry.sleepSecs) ?? asNumber(entry.sleep_secs) ?? undefined,
      sleepScore: asNumber(entry.sleepScore) ?? asNumber(entry.sleep_score) ?? undefined,
      sleepQuality: asNumber(entry.sleepQuality) ?? asNumber(entry.sleep_quality) ?? undefined,
      awakeTime: asNumber(entry.awakeTime) ?? asNumber(entry.awake_time) ?? undefined,
      lightSleepTime: asNumber(entry.lightSleepTime) ?? asNumber(entry.light_sleep_time) ?? undefined,
      remSleepTime: asNumber(entry.remSleepTime) ?? asNumber(entry.rem_sleep_time) ?? undefined,
      deepSleepTime: asNumber(entry.deepSleepTime) ?? asNumber(entry.deep_sleep_time) ?? undefined,
      avgSleepBreathRate: asNumber(entry.avgSleepBreathRate) ?? asNumber(entry.avg_sleep_breath_rate) ?? undefined,
      weight: asNumber(entry.weight) ?? asNumber(entry.icu_weight) ?? undefined,
      spO2: asNumber(entry.spO2) ?? asNumber(entry.spo2) ?? undefined,
      steps: asNumber(entry.steps) ?? undefined,
    };
    await prisma.dailyWellness.upsert({
      where: { userId_date: { userId, date } },
      update: { ...wellnessData, updatedAt: new Date() },
      create: { userId, date, ...wellnessData },
    });
    synced++;
  }

  return synced;
}

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

  const wellnessSynced = await syncWellnessData(input.user.id, profile.rawWellness);

  // v2: merged 覆盖空壳
  if (deduped.merged.length > 0) {
    const { prisma } = await import("@/lib/prisma");
    for (const m of deduped.merged) {
      await prisma.activity.update({
        where: { id: m.matchedActivityId },
        data: {
          name: m.activity.name,
          distanceKm: m.activity.distanceKm,
          movingTimeMin: m.activity.movingTimeMin,
          elevationM: m.activity.elevationM,
          avgSpeedKmh: m.activity.avgSpeedKmh,
          avgHr: m.activity.avgHr,
          avgPower: m.activity.avgPower,
          np: m.activity.np,
          ifValue: m.activity.ifValue,
          tss: m.activity.tss,
          temperatureC: m.activity.temperatureC,
          recentCtl: m.activity.recentCtl,
          recentAtl: m.activity.recentAtl,
          recentForm: m.activity.recentForm,
          rawSummaryJson: JSON.stringify(m.activity.rawSummaryJson ?? null),
          rawStreamsJson: JSON.stringify(m.activity.rawStreamsJson ?? null),
          updatedAt: new Date(),
        },
      });
      await saveActivityAlias({
        userId: m.activity.userId,
        activityId: m.matchedActivityId,
        source: m.activity.source,
        externalActivityId: m.activity.externalActivityId ?? "",
        startTime: m.activity.startTime,
        rawSummaryJson: m.activity.rawSummaryJson,
      });
    }
  }

  // 自动入队 streams backfill (仅 cycling 类活动,跳过 trainer/虚拟 + <10min 短活动)
  // 注意: intervals 同步已对最近 20 条预取 streams,handler 会跳过已有 streams 的活动
  const SHOULD_BACKFILL = (act: (typeof deduped.accepted)[number]) => {
    const raw = act.rawSummaryJson as Record<string, unknown> | undefined;
    const type = String(raw?.type ?? raw?.sport_type ?? "").toLowerCase();
    const isCycling = type.includes("ride") || type.includes("bike") || type.includes("cycl");
    const tooShort = act.movingTimeMin < 10;
    return isCycling && !tooShort;
  };

  const backfillBatch = deduped.accepted.filter(SHOULD_BACKFILL);
  for (let i = 0; i < backfillBatch.length; i++) {
    const act = backfillBatch[i];
    // 每条间隔 6 秒,避免 intervals.icu 限流
    const availableAt = new Date(Date.now() + i * 6000).toISOString();
    await enqueueSyncJob({
      userId: input.user.id,
      source: "intervals.icu",
      jobType: "stream_backfill",
      reason: "auto_after_sync",
      externalRef: `${act.externalActivityId}:streams`,
      payload: { activityId: act.id, externalActivityId: act.externalActivityId },
      availableAt,
    });
  }

  // Auto-enqueue segment_fetch jobs (走 ICU API, 不需要 Strava token)
  const segmentBatch = deduped.accepted.filter(SHOULD_BACKFILL);
  for (let i = 0; i < segmentBatch.length; i++) {
    const act = segmentBatch[i];
    const availableAt = new Date(Date.now() + (backfillBatch.length + i) * 6000).toISOString();
    await enqueueSyncJob({
      userId: input.user.id,
      source: "intervals.icu",
      jobType: "segment_fetch",
      reason: "auto_after_sync",
      externalRef: `${act.externalActivityId}:segments`,
      payload: { activityId: act.id, externalActivityId: act.externalActivityId },
      availableAt,
    });
  }

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

  // 自动修复 Strava 空壳: 用户配了 intervals.icu 邮箱+密码 → 下载 .fit 重传
  let stravaReloaded = 0;
  if (input.user.intervalsEmailEncrypted && input.user.intervalsPasswordEncrypted) {
    try {
      const { reloadStravaActivitiesViaWeb } = await import("@/lib/intervals-web");
      const windowDays = mode === "full" ? 180 : 14;
      const result = await reloadStravaActivitiesViaWeb(input.user, windowDays);
      stravaReloaded = result.uploaded;
    } catch {
      // Web Session 失败不阻塞正常 sync
    }
  }

  return {
    mode,
    oldest,
    total: activities.length,
    inserted: deduped.accepted.length,
    skipped: deduped.skipped.length,
    merged: deduped.merged.length,
    streamBackfillEnqueued: backfillBatch.length,
    segmentFetchEnqueued: segmentBatch.length,
    stravaReloaded,
    wellnessSynced,
  };
}

export async function handleIntervalsStreamBackfillJob(user: User, job: SyncJob) {
  const activityId = typeof job.payload?.activityId === "string" ? job.payload.activityId : undefined;
  const externalActivityId =
    typeof job.payload?.externalActivityId === "string" ? job.payload.externalActivityId : undefined;
  if (!activityId || !externalActivityId) {
    throw new Error("stream_backfill 任务缺少 activityId/externalActivityId。");
  }

  if (!user.intervalsApiKeyEncrypted) {
    throw new Error("请先填写 intervals.icu API key。");
  }

  // 跳过已有 streams 的
  const existing = await getActivity(activityId);
  if (!existing) return { skipped: "活动不存在" };
  const existingStreams = existing.rawStreamsJson as Record<string, unknown> | undefined;
  if (existingStreams && Object.keys(existingStreams).length > 0) {
    return { skipped: "已存在 streams" };
  }

  const apiKey = decryptSecret(user.intervalsApiKeyEncrypted);
  const streams = await fetchIntervalsActivityStreams(externalActivityId, apiKey);
  if (!streams || Object.keys(streams).length === 0) {
    return { skipped: "intervals 未返回 streams" };
  }
  await updateActivityStreams(activityId, streams);
  return { fetched: true, keys: Object.keys(streams) };
}
