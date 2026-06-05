import { dedupeIncomingActivities } from "@/lib/activity-dedupe";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  deleteStravaActivityByExternalRef,
  enqueueSyncJob,
  getActivity,
  getLatestActivityAliasStartTime,
  listActivitiesByUser,
  listActivityAliasesByUser,
  saveActivityAlias,
  saveUser,
  updateActivityStreams,
  upsertActivities,
} from "@/lib/storage";
import type { SyncJob, User } from "@/lib/types";
import {
  fetchStravaActivities,
  fetchStravaActivityStreams,
  fetchStravaAthlete,
  refreshStravaToken,
  resolveStravaClientCredentials,
} from "@/lib/strava";

const incrementalOverlapDays = 14;

function isoDateTimeDaysBefore(value: string, days: number) {
  return new Date(new Date(value).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function resolveStravaAccessToken(user: User) {
  if (!user.stravaAccessTokenEncrypted) {
    throw new Error("请先连接 Strava。");
  }

  const accessToken = decryptSecret(user.stravaAccessTokenEncrypted);
  const refreshToken = user.stravaRefreshTokenEncrypted ? decryptSecret(user.stravaRefreshTokenEncrypted) : "";
  const expiresAt = user.stravaTokenExpiresAt ? new Date(user.stravaTokenExpiresAt).getTime() : 0;

  if (expiresAt && expiresAt > Date.now() + 60_000) {
    return { accessToken, nextUser: user };
  }

  if (!refreshToken) {
    throw new Error("Strava refresh token 不存在，请重新连接。");
  }

  const credentials = resolveStravaClientCredentials(user);
  const clientId = credentials.clientId;
  const clientSecret = credentials.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error(credentials.app === "personal" ? "个人 Strava 应用 ID / Key 未配置完整。" : "Strava OAuth 环境变量未配置完整。");
  }

  const refreshed = await refreshStravaToken({
    clientId,
    clientSecret,
    refreshToken,
  });

  const nextUser = await saveUser({
    ...user,
    stravaAthleteId: refreshed.athlete?.id ? String(refreshed.athlete.id) : user.stravaAthleteId,
    stravaAccessTokenEncrypted: encryptSecret(refreshed.access_token),
    stravaRefreshTokenEncrypted: encryptSecret(refreshed.refresh_token),
    stravaTokenExpiresAt: new Date(refreshed.expires_at * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return {
    accessToken: refreshed.access_token,
    nextUser,
  };
}

export async function runStravaSync(input: {
  user: User;
  mode?: "incremental" | "full";
  after?: string;
  reason?: string;
}) {
  const mode = input.mode ?? "incremental";
  const { accessToken, nextUser } = await resolveStravaAccessToken(input.user);
  const latestStravaAlias = await getLatestActivityAliasStartTime(input.user.id, "strava");
  const after =
    input.after ??
    (mode === "full" ? undefined : latestStravaAlias ? isoDateTimeDaysBefore(latestStravaAlias, incrementalOverlapDays) : undefined);

  const [athlete, activities] = await Promise.all([
    fetchStravaAthlete(accessToken),
    fetchStravaActivities({
      accessToken,
      userId: input.user.id,
      after,
    }),
  ]);
  const [existingActivities, aliases] = await Promise.all([
    listActivitiesByUser(input.user.id),
    listActivityAliasesByUser(input.user.id),
  ]);
  const deduped = dedupeIncomingActivities(existingActivities, activities, aliases);

  await saveUser({
    ...nextUser,
    stravaAthleteId: typeof athlete.id === "number" ? String(athlete.id) : nextUser.stravaAthleteId,
    stravaRawAthleteJson: athlete,
    updatedAt: new Date().toISOString(),
  });

  await upsertActivities(deduped.accepted);

  // v2: merged 覆盖空壳 — incoming 更丰富时用合并后的数据 update 到已有 activity
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
      // merged 也算 alias
      await saveActivityAlias({
        userId: m.activity.userId,
        activityId: m.matchedActivityId,
        source: input.user.id === m.activity.userId ? "strava" : m.activity.source,
        externalActivityId: m.activity.externalActivityId ?? "",
        startTime: m.activity.startTime,
        rawSummaryJson: m.activity.rawSummaryJson,
      });
    }
  }

  // 自动入队 streams backfill (仅 cycling 类活动,跳过 trainer/虚拟 + <10min 短活动)
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
    // 每条间隔 6 秒,避免 Strava 限流 (100/15min ≈ 1 per 9s, 6s 留余裕)
    const availableAt = new Date(Date.now() + i * 6000).toISOString();
    await enqueueSyncJob({
      userId: input.user.id,
      source: "strava",
      jobType: "stream_backfill",
      reason: "auto_after_sync",
      externalRef: `${act.externalActivityId}:streams`,
      payload: { activityId: act.id, externalActivityId: act.externalActivityId },
      availableAt,
    });
  }

  // Auto-enqueue segment_fetch jobs for cycling activities
  const segmentBatch = deduped.accepted.filter(SHOULD_BACKFILL);
  for (let i = 0; i < segmentBatch.length; i++) {
    const act = segmentBatch[i];
    const availableAt = new Date(Date.now() + (backfillBatch.length + i) * 6000).toISOString();
    await enqueueSyncJob({
      userId: input.user.id,
      source: "strava",
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

  return {
    mode,
    after,
    reason: input.reason,
    total: activities.length,
    inserted: deduped.accepted.length,
    skipped: deduped.skipped.length,
    merged: deduped.merged.length,
    streamBackfillEnqueued: backfillBatch.length,
    segmentFetchEnqueued: segmentBatch.length,
  };
}

export async function handleStravaDeleteJob(user: User, job: SyncJob) {
  const externalActivityId =
    typeof job.payload?.externalActivityId === "string" ? job.payload.externalActivityId : job.externalRef;
  if (!externalActivityId) {
    throw new Error("删除任务缺少 externalActivityId。");
  }

  return await deleteStravaActivityByExternalRef(user.id, externalActivityId);
}

export async function handleStravaStreamBackfillJob(user: User, job: SyncJob) {
  const activityId = typeof job.payload?.activityId === "string" ? job.payload.activityId : undefined;
  const externalActivityId =
    typeof job.payload?.externalActivityId === "string" ? job.payload.externalActivityId : undefined;
  if (!activityId || !externalActivityId) {
    throw new Error("stream_backfill 任务缺少 activityId/externalActivityId。");
  }

  // 跳过已有 streams 的
  const existing = await getActivity(activityId);
  if (!existing) return { skipped: "活动不存在" };
  const existingStreams = existing.rawStreamsJson as Record<string, unknown> | undefined;
  if (existingStreams && Object.keys(existingStreams).length > 0) {
    return { skipped: "已存在 streams" };
  }

  const { accessToken } = await resolveStravaAccessToken(user);
  const streams = await fetchStravaActivityStreams(externalActivityId, accessToken);
  await updateActivityStreams(activityId, streams);
  return { fetched: true, keys: Object.keys(streams) };
}

/**
 * 赛段拉取 handler — 走 intervals.icu API (不依赖 Strava token)
 * GET /api/v1/activity/{id}/segments → 赛段列表 (start_index/end_index)
 * 配合活动 streams 计算每段的时间/功率/心率
 */
export async function handleSegmentFetchJob(user: User, job: SyncJob) {
  const activityId = typeof job.payload?.activityId === "string" ? job.payload.activityId : undefined;
  const externalActivityId =
    typeof job.payload?.externalActivityId === "string" ? job.payload.externalActivityId : undefined;
  if (!activityId || !externalActivityId) {
    throw new Error("segment_fetch 任务缺少 activityId/externalActivityId。");
  }

  if (!user.intervalsApiKeyEncrypted) {
    return { skipped: "未配置 intervals.icu API Key" };
  }

  // Skip if already has segment efforts
  const { listSegmentEffortsByActivity, upsertSegment, upsertSegmentEffort } = await import("@/lib/storage");
  const existing = await listSegmentEffortsByActivity(activityId);
  if (existing.length > 0) {
    return { skipped: "已存在 segment efforts", count: existing.length };
  }

  const { decryptSecret } = await import("@/lib/crypto");
  const { fetchIntervalsActivitySegments, fetchIntervalsActivityStreams } = await import("@/lib/intervals");
  const apiKey = decryptSecret(user.intervalsApiKeyEncrypted);

  // 1. 从 ICU API 拉赛段列表
  const icuSegments = await fetchIntervalsActivitySegments(externalActivityId, apiKey);
  if (!icuSegments.length) {
    return { fetched: true, segments: 0, efforts: 0 };
  }

  // 2. 拉活动 streams (需要 time/watts/heartrate 来计算每段指标)
  const activity = await getActivity(activityId);
  let streams = activity?.rawStreamsJson as Record<string, unknown> | undefined;
  if (!streams || !Object.keys(streams).length) {
    // 如果还没 streams, 尝试现拉
    streams = await fetchIntervalsActivityStreams(externalActivityId, apiKey);
    if (streams && Object.keys(streams).length) {
      await updateActivityStreams(activityId, streams);
    }
  }

  const timeArr = Array.isArray(streams?.time) ? (streams.time as number[]) : [];
  const wattsArr = Array.isArray(streams?.watts) ? (streams.watts as number[]) : [];
  const hrArr = Array.isArray(streams?.heartrate) ? (streams.heartrate as number[]) : [];
  const altArr = Array.isArray(streams?.altitude) ? (streams.altitude as number[]) : [];

  let segmentCount = 0;
  let effortCount = 0;

  for (const icuSeg of icuSegments) {
    const si = icuSeg.start_index;
    const ei = icuSeg.end_index;

    // 从 streams 计算这段的指标
    const segTime = timeArr.length > ei ? (timeArr[ei] - timeArr[si]) : 0; // 秒
    const segWatts = wattsArr.length > ei
      ? Math.round(wattsArr.slice(si, ei + 1).reduce((s, w) => s + w, 0) / (ei - si + 1))
      : undefined;
    const segHr = hrArr.length > ei
      ? Number((hrArr.slice(si, ei + 1).reduce((s, h) => s + h, 0) / (ei - si + 1)).toFixed(1))
      : undefined;
    const segMaxHr = hrArr.length > ei
      ? Math.round(Math.max(...hrArr.slice(si, ei + 1)))
      : undefined;

    // 用 altitude 估算坡度和爬升
    const startAlt = altArr.length > si ? altArr[si] : undefined;
    const endAlt = altArr.length > ei ? altArr[ei] : undefined;
    const elevGain = startAlt !== undefined && endAlt !== undefined ? Math.max(0, endAlt - startAlt) : undefined;

    // 用 segment_id 做 Strava segment ID (ICU 沿用 Strava 的 segment 编号)
    const segRecord = await upsertSegment({
      stravaSegmentId: icuSeg.segment_id,
      name: icuSeg.name,
      distance: 0, // ICU segments API 不返回 distance, 后续可从 Strava 补
      averageGrade: 0,
      climbCategory: 0,
      totalElevationGain: elevGain,
    });
    segmentCount++;

    await upsertSegmentEffort({
      segmentId: segRecord.id,
      activityId,
      userId: user.id,
      stravaEffortId: BigInt(icuSeg.id),
      elapsedTime: segTime,
      movingTime: segTime,
      startDate: activity?.startTime ?? new Date().toISOString(),
      averageWatts: segWatts,
      averageHr: segHr,
      maxHr: segMaxHr,
    });
    effortCount++;
  }

  return { fetched: true, segments: segmentCount, efforts: effortCount };
}
