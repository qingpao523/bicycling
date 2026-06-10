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
  fetchStravaActivityDetail,
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
 * 赛段拉取 handler
 * - i 前缀 ID → Intervals.icu API（用 streams 计算指标）
 * - 纯数字 ID → Strava API（直接拿 segment_efforts）
 */
export async function handleSegmentFetchJob(user: User, job: SyncJob) {
  const activityId = typeof job.payload?.activityId === "string" ? job.payload.activityId : undefined;
  const externalActivityId =
    typeof job.payload?.externalActivityId === "string" ? job.payload.externalActivityId : undefined;
  if (!activityId || !externalActivityId) {
    throw new Error("segment_fetch 任务缺少 activityId/externalActivityId。");
  }

  // Skip if already has segment efforts
  const { listSegmentEffortsByActivity, upsertSegment, upsertSegmentEffort } = await import("@/lib/storage");
  const existing = await listSegmentEffortsByActivity(activityId);
  if (existing.length > 0) {
    return { skipped: "已存在 segment efforts", count: existing.length };
  }

  const isIntervalsId = externalActivityId.startsWith("i");

  if (!isIntervalsId) {
    return handleSegmentFetchViaStrava(user, activityId, externalActivityId, upsertSegment, upsertSegmentEffort);
  }

  return handleSegmentFetchViaIntervals(user, activityId, externalActivityId, upsertSegment, upsertSegmentEffort);
}

async function handleSegmentFetchViaStrava(
  user: User,
  activityId: string,
  externalActivityId: string,
  upsertSegment: any,
  upsertSegmentEffort: any,
) {
  if (!user.stravaAccessTokenEncrypted) {
    return { skipped: "Strava 活动但未配置 Strava token" };
  }

  const { accessToken } = await resolveStravaAccessToken(user);
  const stravaEfforts = await fetchStravaActivityDetail(externalActivityId, accessToken);

  if (!stravaEfforts.length) {
    return { fetched: true, segments: 0, efforts: 0 };
  }

  const { autoTagSegment } = await import("@/lib/engine/segments/segments-classify");
  const { prisma } = await import("@/lib/prisma");
  const existingBestBySegment = new Map<number, number>();

  let segmentCount = 0;
  let effortCount = 0;

  for (const effort of stravaEfforts) {
    const seg = effort.segment;

    const tempSeg = {
      id: "", stravaSegmentId: seg.id, name: seg.name,
      distance: seg.distance, averageGrade: seg.average_grade,
      maximumGrade: seg.maximum_grade,
      elevationHigh: seg.elevation_high, elevationLow: seg.elevation_low,
      climbCategory: seg.climb_category,
      totalElevationGain: seg.total_elevation_gain, createdAt: "", updatedAt: "",
    };
    const tags = autoTagSegment(tempSeg);

    const segRecord = await upsertSegment({
      stravaSegmentId: seg.id,
      name: seg.name,
      distance: Math.round(seg.distance),
      averageGrade: seg.average_grade,
      maximumGrade: seg.maximum_grade,
      elevationHigh: seg.elevation_high,
      elevationLow: seg.elevation_low,
      climbCategory: seg.climb_category,
      startLat: seg.start_latlng?.[0],
      startLng: seg.start_latlng?.[1],
      endLat: seg.end_latlng?.[0],
      endLng: seg.end_latlng?.[1],
      totalElevationGain: seg.total_elevation_gain,
      tags,
    });
    segmentCount++;

    if (!existingBestBySegment.has(seg.id)) {
      const best = await prisma.segmentEffort.findFirst({
        where: { segmentId: segRecord.id, userId: user.id },
        orderBy: { elapsedTime: "asc" },
        select: { elapsedTime: true },
      });
      existingBestBySegment.set(seg.id, best?.elapsedTime ?? Infinity);
    }
    const bestSoFar = existingBestBySegment.get(seg.id)!;
    const isPr = effort.elapsed_time > 0 && effort.elapsed_time < bestSoFar;
    if (isPr) existingBestBySegment.set(seg.id, effort.elapsed_time);

    let prRank: number | undefined = effort.pr_rank ?? undefined;
    if (prRank === undefined) {
      if (isPr) {
        prRank = 1;
      } else if (effort.elapsed_time > 0) {
        const fasterCount = await prisma.segmentEffort.count({
          where: { segmentId: segRecord.id, userId: user.id, elapsedTime: { lt: effort.elapsed_time } },
        });
        if (fasterCount < 3) prRank = fasterCount + 1;
      }
    }

    await upsertSegmentEffort({
      segmentId: segRecord.id,
      activityId,
      userId: user.id,
      stravaEffortId: BigInt(effort.id),
      elapsedTime: effort.elapsed_time,
      movingTime: effort.moving_time,
      startDate: effort.start_date,
      averageWatts: effort.average_watts,
      averageHr: effort.average_heartrate,
      maxHr: effort.max_heartrate,
      prRank,
      deviceWatts: effort.device_watts ?? false,
    });
    effortCount++;
  }

  return { fetched: true, source: "strava", segments: segmentCount, efforts: effortCount };
}

async function handleSegmentFetchViaIntervals(
  user: User,
  activityId: string,
  externalActivityId: string,
  upsertSegment: any,
  upsertSegmentEffort: any,
) {
  if (!user.intervalsApiKeyEncrypted) {
    return { skipped: "未配置 intervals.icu API Key" };
  }

  const { decryptSecret } = await import("@/lib/crypto");
  const { fetchIntervalsActivitySegments, fetchIntervalsActivityStreams } = await import("@/lib/intervals");
  const apiKey = decryptSecret(user.intervalsApiKeyEncrypted);

  const icuSegments = await fetchIntervalsActivitySegments(externalActivityId, apiKey);
  if (!icuSegments.length) {
    return { fetched: true, segments: 0, efforts: 0 };
  }

  const activity = await getActivity(activityId);
  let streams = activity?.rawStreamsJson as Record<string, unknown> | undefined;
  if (!streams || !Object.keys(streams).length) {
    streams = await fetchIntervalsActivityStreams(externalActivityId, apiKey);
    if (streams && Object.keys(streams).length) {
      await updateActivityStreams(activityId, streams);
    }
  }

  const timeArr = Array.isArray(streams?.time) ? (streams.time as number[]) : [];
  const wattsArr = Array.isArray(streams?.watts) ? (streams.watts as number[]) : [];
  const hrArr = Array.isArray(streams?.heartrate) ? (streams.heartrate as number[]) : [];
  const altArr = Array.isArray(streams?.altitude) ? (streams.altitude as number[]) : [];
  const velArr = Array.isArray(streams?.velocity_smooth) ? (streams.velocity_smooth as number[]) : [];
  const latlngArr = Array.isArray(streams?.latlng) ? (streams.latlng as [number, number][]) : [];

  const { prisma } = await import("@/lib/prisma");
  const existingBestBySegment = new Map<number, number>();

  let segmentCount = 0;
  let effortCount = 0;

  for (const icuSeg of icuSegments) {
    const si = Math.max(0, icuSeg.start_index);
    const ei = Math.min(icuSeg.end_index, Math.max(timeArr.length, wattsArr.length, altArr.length) - 1);
    if (ei <= si) continue;

    const segTime = timeArr.length > ei ? (timeArr[ei] - timeArr[si]) : 0;
    const segSliceLen = ei - si + 1;

    const segWatts = wattsArr.length > ei
      ? Math.round(wattsArr.slice(si, ei + 1).reduce((s, w) => s + w, 0) / segSliceLen)
      : undefined;
    const segHr = hrArr.length > ei
      ? Number((hrArr.slice(si, ei + 1).reduce((s, h) => s + h, 0) / segSliceLen).toFixed(1))
      : undefined;
    const segMaxHr = hrArr.length > ei
      ? Math.round(Math.max(...hrArr.slice(si, ei + 1)))
      : undefined;

    const startAlt = altArr.length > si ? altArr[si] : undefined;
    const endAlt = altArr.length > ei ? altArr[ei] : undefined;
    const elevHigh = altArr.length > ei ? Math.max(...altArr.slice(si, ei + 1)) : undefined;
    const elevLow = altArr.length > ei ? Math.min(...altArr.slice(si, ei + 1)) : undefined;
    const elevGain = startAlt !== undefined && endAlt !== undefined ? Math.max(0, endAlt - startAlt) : undefined;

    let distance = 0;
    if (velArr.length > ei && timeArr.length > ei) {
      for (let k = si; k < ei; k++) {
        const dt = timeArr[k + 1] - timeArr[k];
        distance += (velArr[k] + velArr[k + 1]) / 2 * dt;
      }
    }
    if (distance <= 0 && velArr.length > ei) {
      const avgVel = velArr.slice(si, ei + 1).reduce((s, v) => s + v, 0) / segSliceLen;
      distance = avgVel * segTime;
    }
    distance = Math.round(distance);

    const avgGrade = distance > 0 && elevGain !== undefined
      ? Number(((elevGain / distance) * 100).toFixed(1))
      : 0;
    const maxGrade = altArr.length > ei && distance > 0
      ? (() => {
          let maxG = 0;
          const step = Math.max(1, Math.floor(segSliceLen / 20));
          for (let k = si; k < ei - step; k += step) {
            const dAlt = altArr[k + step] - altArr[k];
            const dTime = timeArr[k + step] - timeArr[k];
            const segDist = dTime > 0 && velArr.length > k ? velArr[k] * dTime : 0;
            if (segDist > 10) {
              const g = Math.abs((dAlt / segDist) * 100);
              if (g > maxG) maxG = g;
            }
          }
          return Number(maxG.toFixed(1));
        })()
      : undefined;

    const climbScore = (distance / 1000) * Math.max(avgGrade, 0);
    let climbCategory = 0;
    if (climbScore >= 64) climbCategory = 5;
    else if (climbScore >= 32) climbCategory = 4;
    else if (climbScore >= 16) climbCategory = 3;
    else if (climbScore >= 8) climbCategory = 2;
    else if (climbScore >= 3) climbCategory = 1;

    const startLat = latlngArr.length > si ? latlngArr[si]?.[0] : undefined;
    const startLng = latlngArr.length > si ? latlngArr[si]?.[1] : undefined;
    const endLat = latlngArr.length > ei ? latlngArr[ei]?.[0] : undefined;
    const endLng = latlngArr.length > ei ? latlngArr[ei]?.[1] : undefined;

    const { autoTagSegment } = await import("@/lib/engine/segments/segments-classify");
    const tempSeg = {
      id: "", stravaSegmentId: icuSeg.segment_id, name: icuSeg.name,
      distance, averageGrade: avgGrade, maximumGrade: maxGrade,
      elevationHigh: elevHigh, elevationLow: elevLow, climbCategory,
      totalElevationGain: elevGain, createdAt: "", updatedAt: "",
    };
    const tags = autoTagSegment(tempSeg);

    const segRecord = await upsertSegment({
      stravaSegmentId: icuSeg.segment_id,
      name: icuSeg.name,
      distance,
      averageGrade: avgGrade,
      maximumGrade: maxGrade,
      elevationHigh: elevHigh,
      elevationLow: elevLow,
      climbCategory,
      startLat,
      startLng,
      endLat,
      endLng,
      totalElevationGain: elevGain,
      tags,
    });
    segmentCount++;

    if (!existingBestBySegment.has(icuSeg.segment_id)) {
      const best = await prisma.segmentEffort.findFirst({
        where: { segmentId: segRecord.id, userId: user.id },
        orderBy: { elapsedTime: "asc" },
        select: { elapsedTime: true },
      });
      existingBestBySegment.set(icuSeg.segment_id, best?.elapsedTime ?? Infinity);
    }
    const bestSoFar = existingBestBySegment.get(icuSeg.segment_id)!;
    const isPr = segTime > 0 && segTime < bestSoFar;
    if (isPr) existingBestBySegment.set(icuSeg.segment_id, segTime);

    let prRank: number | undefined;
    if (isPr) {
      prRank = 1;
    } else if (segTime > 0) {
      const fasterCount = await prisma.segmentEffort.count({
        where: { segmentId: segRecord.id, userId: user.id, elapsedTime: { lt: segTime } },
      });
      if (fasterCount < 3) prRank = fasterCount + 1;
    }

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
      prRank,
      deviceWatts: wattsArr.length > 0,
    });
    effortCount++;
  }

  return { fetched: true, source: "intervals", segments: segmentCount, efforts: effortCount };
}
