import { dedupeIncomingActivities } from "@/lib/activity-dedupe";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  deleteStravaActivityByExternalRef,
  getLatestActivityAliasStartTime,
  listActivitiesByUser,
  listActivityAliasesByUser,
  saveActivityAlias,
  saveUser,
  upsertActivities,
} from "@/lib/storage";
import type { SyncJob, User } from "@/lib/types";
import {
  fetchStravaActivities,
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
