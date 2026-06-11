import { getAppConfig, getUserById, listUsers, listUsersWithRecentActivity, markSyncJobDone, markSyncJobFailed, claimAvailableSyncJobs, updateAppConfig, enqueueSyncJob } from "@/lib/storage";
import { handleIntervalsStreamBackfillJob, runIntervalsSync } from "@/lib/intervals-sync";
import { handleStravaDeleteJob, handleStravaStreamBackfillJob, runStravaSync } from "@/lib/strava-sync";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getInternalSyncSecret() {
  return envValue("INTERNAL_SYNC_SECRET");
}

export function isAuthorizedInternalSyncRequest(request: Request) {
  const expected = getInternalSyncSecret();
  if (!expected) return false;
  const provided = request.headers.get("x-internal-sync-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === expected;
}

export async function processPendingSyncJobs(limit = 10) {
  const jobs = await claimAvailableSyncJobs(limit);
  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs) {
    try {
      if (!job.userId) {
        throw new Error("同步任务缺少 userId。");
      }

      const user = await getUserById(job.userId);
      if (!user) {
        throw new Error(`用户不存在：${job.userId}`);
      }

      let detail: Record<string, unknown>;
      if (job.source === "strava" && job.jobType === "stream_backfill") {
        detail = await handleStravaStreamBackfillJob(user, job);
      } else if (job.source === "intervals.icu" && job.jobType === "stream_backfill") {
        detail = await handleIntervalsStreamBackfillJob(user, job);
      } else if (job.jobType === "segment_fetch") {
        const { handleSegmentFetchJob } = await import("@/lib/strava-sync");
        detail = await handleSegmentFetchJob(user, job);
      } else if (job.source === "strava" && job.jobType === "delete") {
        detail = await handleStravaDeleteJob(user, job);
      } else if (job.source === "strava") {
        const after =
          typeof job.payload?.after === "string"
            ? job.payload.after
            : typeof job.payload?.windowDays === "number"
              ? new Date(Date.now() - Number(job.payload.windowDays) * 24 * 60 * 60 * 1000).toISOString()
              : undefined;
        detail = await runStravaSync({
          user,
          mode: typeof job.payload?.mode === "string" && job.payload.mode === "full" ? "full" : "incremental",
          after,
          reason: job.reason,
        });
      } else if (job.source === "intervals.icu") {
        detail = await runIntervalsSync({
          user,
          mode: typeof job.payload?.mode === "string" && job.payload.mode === "full" ? "full" : "incremental",
          oldest: typeof job.payload?.oldest === "string" ? job.payload.oldest : undefined,
        });
      } else {
        throw new Error(`不支持的同步源：${job.source}`);
      }

      await markSyncJobDone(job.id);
      results.push({ jobId: job.id, source: job.source, status: "done", detail });
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步任务执行失败";
      await markSyncJobFailed(job.id, message);
      results.push({ jobId: job.id, source: job.source, status: "failed", error: message });

      const { RateLimitError } = await import("@/lib/intervals");
      if (error instanceof RateLimitError) throw error;
    }
  }

  return results;
}

export async function runScheduledAutoSync() {
  const config = await getAppConfig();
  if (!config.autoSyncEnabled) {
    return { skipped: true, reason: "disabled" };
  }

  const now = Date.now();
  const lastRunAt = config.autoSyncLastRunAt ? new Date(config.autoSyncLastRunAt).getTime() : 0;
  const due = !lastRunAt || now - lastRunAt >= config.autoSyncIntervalHours * 60 * 60 * 1000;
  if (!due) {
    return { skipped: true, reason: "not_due" };
  }

  const recentUsers = await listUsersWithRecentActivity(7);
  const allUsers = recentUsers.length ? recentUsers : await listUsers();
  const results: Array<Record<string, unknown>> = [];

  for (const user of allUsers) {
    if (config.autoSyncStrava && user.stravaAccessTokenEncrypted) {
      const result = await runStravaSync({
        user,
        mode: "incremental",
        after: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        reason: "scheduled",
      });
      results.push({ userId: user.id, source: "strava", result });
    }

    if (config.autoSyncIntervals && user.intervalsApiKeyEncrypted) {
      const result = await runIntervalsSync({
        user,
        mode: "incremental",
      });
      results.push({ userId: user.id, source: "intervals.icu", result });
    }
  }

  // 顺便扫缺 streams 的活动
  const backfillResults: Array<Record<string, unknown>> = [];
  for (const user of allUsers) {
    try {
      const r = await enqueueMissingStreamBackfills(user, 20);
      backfillResults.push({ userId: user.id, ...r });
    } catch (e) {
      backfillResults.push({ userId: user.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  await updateAppConfig({
    autoSyncLastRunAt: new Date().toISOString(),
    autoSyncLastStatus: results.length ? `已完成 ${results.length} 个自动同步任务` : "无可同步用户",
  });

  return { skipped: false, results, streamBackfillEnqueue: backfillResults };
}

const ICU_BASE_URL = "https://intervals.icu/api/v1";

function icuBasicAuth(apiKey: string) {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
}

export async function pollUserForNewActivities(user: User): Promise<{ newActivities: number; totalChecked: number; enqueued: boolean }> {
  if (!user.intervalsApiKeyEncrypted || !user.intervalsAthleteId) {
    return { newActivities: 0, totalChecked: 0, enqueued: false };
  }

  const apiKey = decryptSecret(user.intervalsApiKeyEncrypted);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const response = await fetch(
    `${ICU_BASE_URL}/athlete/${user.intervalsAthleteId}/activities?oldest=${yesterday}&newest=${today}`,
    {
      headers: { Authorization: icuBasicAuth(apiKey), Accept: "application/json" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`ICU API ${response.status} for athlete ${user.intervalsAthleteId}`);
  }

  const icuActivities = (await response.json()) as Record<string, unknown>[];
  const icuIds = icuActivities.map((a) => String(a.id ?? "")).filter(Boolean);

  if (icuIds.length === 0) {
    return { newActivities: 0, totalChecked: 0, enqueued: false };
  }

  const existing = await prisma.activity.findMany({
    where: { userId: user.id, externalActivityId: { in: icuIds } },
    select: { externalActivityId: true },
  });
  const existingSet = new Set(existing.map((a) => a.externalActivityId));

  const aliases = await prisma.activityAlias.findMany({
    where: { userId: user.id, source: "intervals.icu", externalActivityId: { in: icuIds } },
    select: { externalActivityId: true },
  });
  for (const a of aliases) existingSet.add(a.externalActivityId);

  const newIds = icuIds.filter((id) => !existingSet.has(id));

  if (newIds.length > 0) {
    await enqueueSyncJob({
      userId: user.id,
      source: "intervals.icu",
      jobType: "sync",
      reason: "poll_detected",
      externalRef: `poll:${user.id}:${today}:${newIds.length}`,
      payload: { mode: "incremental", oldest: yesterday, detectedNewIds: newIds },
    });
  }

  return { newActivities: newIds.length, totalChecked: icuIds.length, enqueued: newIds.length > 0 };
}

export async function pollAllUsersForNewActivities() {
  const allUsers = await listUsers();
  const icuUsers = allUsers.filter((u) => u.intervalsApiKeyEncrypted && u.intervalsAthleteId);
  const results: Array<{ userId: string; newActivities: number; error?: string }> = [];

  for (const user of icuUsers) {
    try {
      const r = await pollUserForNewActivities(user);
      results.push({ userId: user.id, newActivities: r.newActivities });
    } catch (e) {
      results.push({ userId: user.id, newActivities: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const totalNew = results.reduce((s, r) => s + r.newActivities, 0);

  if (totalNew > 0) {
    await processPendingSyncJobs(totalNew + 5);
  }

  return { usersPolled: icuUsers.length, results, totalNew };
}

async function enqueueMissingStreamBackfills(user: User, limit: number): Promise<{ enqueued: number; scanned: number }> {
  const { listActivitiesByUser, enqueueSyncJob } = await import("@/lib/storage");
  const allActivities = await listActivitiesByUser(user.id);
  // 仅近 30 天 cycling, 无 streams, 未跳过的
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const candidates = allActivities.filter((a) => {
    const ts = new Date(a.startTime).getTime();
    if (ts < cutoff) return false;
    if (a.movingTimeMin < 10) return false;
    const raw = a.rawSummaryJson as Record<string, unknown> | undefined;
    const type = String(raw?.type ?? raw?.sport_type ?? "").toLowerCase();
    const isCycling = type.includes("ride") || type.includes("bike") || type.includes("cycl");
    if (!isCycling) return false;
    const streams = a.rawStreamsJson as Record<string, unknown> | undefined;
    return !streams || Object.keys(streams).length === 0;
  });
  // 高 TSS 优先 (分析价值高)
  candidates.sort((a, b) => (b.tss ?? 0) - (a.tss ?? 0));
  const toEnqueue = candidates.slice(0, limit);

  let enqueued = 0;
  for (let i = 0; i < toEnqueue.length; i++) {
    const act = toEnqueue[i];
    const availableAt = new Date(Date.now() + i * 8000).toISOString(); // 8s stagger
    await enqueueSyncJob({
      userId: user.id,
      source: act.source,
      jobType: "stream_backfill",
      reason: "cron_scan",
      externalRef: `${act.externalActivityId}:streams`,
      payload: { activityId: act.id, externalActivityId: act.externalActivityId },
      availableAt,
    });
    enqueued++;
  }
  return { enqueued, scanned: candidates.length };
}
