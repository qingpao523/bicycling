/**
 * Stream Backfill Engine
 *
 * Pulls missing stream data (watts/heartrate/cadence/altitude) for activities that
 * only have summary data. Works for both intervals.icu and Strava sources.
 *
 * Uses rate limiting to avoid hitting API limits.
 */

import { fetchIntervalsActivityStreams } from "@/lib/intervals";
import { fetchStravaActivityStreams, refreshStravaToken, resolveStravaClientCredentials } from "@/lib/strava";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getUserById, listActivitiesByUser, updateActivityStreams, saveUser } from "@/lib/storage";
import type { User } from "@/lib/types";

export interface BackfillProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  currentActivity?: string;
  errors: { activityId: string; name: string; error: string }[];
}

export interface BackfillOptions {
  userId: string;
  limit?: number; // max activities to process (default: 50)
  source?: "intervals.icu" | "strava" | "all";
  onlyWithPower?: boolean; // skip activities without avgPower (likely no watts stream anyway)
  rateLimit?: {
    requestsPerWindow: number;
    windowMs: number;
  };
  onProgress?: (progress: BackfillProgress) => void;
}

function hasUsefulStream(streams: unknown): boolean {
  if (!streams || typeof streams !== "object") return false;
  const s = streams as Record<string, unknown>;
  const fields = ["watts", "heartrate", "cadence", "altitude"];
  for (const f of fields) {
    if (Array.isArray(s[f]) && (s[f] as unknown[]).length > 0) return true;
  }
  return false;
}

/**
 * Basic sleep for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Refresh Strava access token if needed
 */
async function ensureStravaToken(user: User): Promise<{ accessToken: string; updated: boolean } | null> {
  if (!user.stravaAccessTokenEncrypted || !user.stravaRefreshTokenEncrypted) return null;

  const now = new Date();
  const expiresAt = user.stravaTokenExpiresAt ? new Date(user.stravaTokenExpiresAt) : new Date(0);

  // Refresh if expires within 5 minutes
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return { accessToken: decryptSecret(user.stravaAccessTokenEncrypted), updated: false };
  }

  const credentials = resolveStravaClientCredentials(user);
  if (!credentials || !credentials.clientId || !credentials.clientSecret) return null;

  const refreshToken = decryptSecret(user.stravaRefreshTokenEncrypted);
  try {
    const refreshed = await refreshStravaToken({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken,
    });

    const newExpiresAt = new Date(refreshed.expires_at * 1000).toISOString();
    const updatedUser: User = {
      ...user,
      stravaAccessTokenEncrypted: encryptSecret(refreshed.access_token),
      stravaRefreshTokenEncrypted: encryptSecret(refreshed.refresh_token),
      stravaTokenExpiresAt: newExpiresAt,
      updatedAt: new Date().toISOString(),
    };
    await saveUser(updatedUser);
    return { accessToken: refreshed.access_token, updated: true };
  } catch {
    return null;
  }
}

/**
 * Main backfill function. Processes activities sequentially with rate limiting.
 */
export async function backfillActivityStreams(options: BackfillOptions): Promise<BackfillProgress> {
  const {
    userId,
    limit = 50,
    source = "all",
    onlyWithPower = false,
    rateLimit = { requestsPerWindow: 30, windowMs: 60_000 },
    onProgress,
  } = options;

  const user = await getUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }

  const allActivities = await listActivitiesByUser(userId);

  // Filter activities that need backfilling
  const needBackfill = allActivities
    .filter((a) => {
      if (source !== "all" && a.source !== source) return false;
      if (onlyWithPower && !a.avgPower && !a.np) return false;
      // Skip if already has useful stream data
      if (hasUsefulStream(a.rawStreamsJson)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, limit);

  const progress: BackfillProgress = {
    total: needBackfill.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  if (onProgress) onProgress(progress);

  if (needBackfill.length === 0) return progress;

  // Prepare API keys
  const intervalsApiKey = user.intervalsApiKeyEncrypted ? decryptSecret(user.intervalsApiKeyEncrypted) : null;

  let stravaTokenInfo: { accessToken: string; updated: boolean } | null = null;
  if (needBackfill.some((a) => a.source === "strava")) {
    stravaTokenInfo = await ensureStravaToken(user);
  }

  // Rate limiter state
  let requestsInWindow = 0;
  let windowStart = Date.now();

  async function enforceRateLimit() {
    const now = Date.now();
    if (now - windowStart >= rateLimit.windowMs) {
      windowStart = now;
      requestsInWindow = 0;
    }
    if (requestsInWindow >= rateLimit.requestsPerWindow) {
      const waitMs = rateLimit.windowMs - (now - windowStart);
      if (waitMs > 0) {
        await sleep(waitMs);
        windowStart = Date.now();
        requestsInWindow = 0;
      }
    }
    requestsInWindow++;
  }

  for (const activity of needBackfill) {
    progress.currentActivity = activity.name;
    if (onProgress) onProgress(progress);

    await enforceRateLimit();

    try {
      let streams: Record<string, unknown> | null = null;

      if (activity.source === "intervals.icu") {
        if (!intervalsApiKey) {
          progress.skipped++;
          progress.processed++;
          continue;
        }
        streams = await fetchIntervalsActivityStreams(activity.externalActivityId, intervalsApiKey);
      } else if (activity.source === "strava") {
        if (!stravaTokenInfo) {
          progress.skipped++;
          progress.processed++;
          continue;
        }
        streams = await fetchStravaActivityStreams(activity.externalActivityId, stravaTokenInfo.accessToken);
      }

      if (streams && hasUsefulStream(streams)) {
        await updateActivityStreams(activity.id, streams);
        progress.succeeded++;
      } else {
        progress.skipped++;
      }
    } catch (error) {
      progress.failed++;
      progress.errors.push({
        activityId: activity.id,
        name: activity.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    progress.processed++;
    if (onProgress) onProgress(progress);

    // Small pacing delay between requests
    await sleep(200);
  }

  progress.currentActivity = undefined;
  if (onProgress) onProgress(progress);
  return progress;
}

/**
 * Backfill a single activity (for on-demand from detail page)
 */
export async function backfillSingleActivity(userId: string, activityId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getUserById(userId);
  if (!user) return { success: false, error: "用户不存在" };

  const activities = await listActivitiesByUser(userId);
  const activity = activities.find((a) => a.id === activityId);
  if (!activity) return { success: false, error: "活动不存在" };

  try {
    let streams: Record<string, unknown> | null = null;

    if (activity.source === "intervals.icu") {
      if (!user.intervalsApiKeyEncrypted) return { success: false, error: "未配置 intervals.icu API Key" };
      const apiKey = decryptSecret(user.intervalsApiKeyEncrypted);
      streams = await fetchIntervalsActivityStreams(activity.externalActivityId, apiKey);
    } else if (activity.source === "strava") {
      const tokenInfo = await ensureStravaToken(user);
      if (!tokenInfo) return { success: false, error: "Strava 认证失效，请重新连接" };
      streams = await fetchStravaActivityStreams(activity.externalActivityId, tokenInfo.accessToken);
    }

    if (!streams || !hasUsefulStream(streams)) {
      return { success: false, error: "来源 API 未返回有效的流数据" };
    }

    await updateActivityStreams(activity.id, streams);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "拉取失败" };
  }
}

/**
 * Get backfill stats (how many need backfilling)
 */
export async function getBackfillStats(userId: string): Promise<{
  total: number;
  withStreams: number;
  withoutStreams: number;
  withoutStreamsWithPower: number;
  bySource: Record<string, { total: number; withStreams: number; withoutStreams: number }>;
}> {
  const activities = await listActivitiesByUser(userId);

  const bySource: Record<string, { total: number; withStreams: number; withoutStreams: number }> = {};

  let withStreams = 0;
  let withoutStreamsWithPower = 0;
  for (const a of activities) {
    const has = hasUsefulStream(a.rawStreamsJson);
    if (has) withStreams++;
    else if (a.avgPower || a.np) withoutStreamsWithPower++;

    if (!bySource[a.source]) bySource[a.source] = { total: 0, withStreams: 0, withoutStreams: 0 };
    bySource[a.source].total++;
    if (has) bySource[a.source].withStreams++;
    else bySource[a.source].withoutStreams++;
  }

  return {
    total: activities.length,
    withStreams,
    withoutStreams: activities.length - withStreams,
    withoutStreamsWithPower,
    bySource,
  };
}
