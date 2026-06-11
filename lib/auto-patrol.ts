/**
 * 自动巡检 — 定时扫所有用户的 intervals.icu + Strava
 * 通过 Next.js instrumentation.ts 在服务启动时自启, 零额外依赖
 * 受管理端 AppConfig 控制: autoSyncEnabled / autoSyncIntervalHours / autoSyncIntervals / autoSyncStrava
 *
 * 三条轮询线:
 * 1. drainQueue   — 每 60s tick, 消费已入队的 SyncJob (segment_fetch / stream_backfill)
 * 2. pollActivities — 每 5 分钟, 轻量查询 ICU 新活动并入队
 * 3. pollWellness — 每 30 分钟, 独立拉所有用户的 wellness 数据 (1 API call/user)
 * 4. runFullSync  — 每 N 小时, 全量增量同步 (活动 + wellness + profile)
 *
 * Rate-limit 保护:
 * - 任何位置遇到 429 → 设 rateLimitCooldownUntil, 后续 tick 跳过 API 调用
 * - runFullSync 即将触发时, 跳过当轮 drainQueue 以保留 API 配额
 * - runFullSync 内部逐用户 catch 并记录错误, 遇 429 提前终止
 */

import { getAppConfig, listUsers, updateAppConfig } from "@/lib/storage";
import { runIntervalsSync, syncWellnessData } from "@/lib/intervals-sync";
import { runStravaSync } from "@/lib/strava-sync";
import { processPendingSyncJobs, pollAllUsersForNewActivities } from "@/lib/system-sync";
import { RateLimitError, fetchIntervalsWellness } from "@/lib/intervals";
import { decryptSecret } from "@/lib/crypto";

const TICK_MS = 60_000;
const POLL_INTERVAL_MS = 5 * 60_000;
const WELLNESS_POLL_MS = 30 * 60_000;
let started = false;
let lastPollAt = 0;
let lastWellnessPollAt = 0;
let rateLimitCooldownUntil = 0;

export function startAutoPatrol() {
  if (started) return;
  started = true;

  setTimeout(() => {
    setInterval(() => {
      tick().catch((err) => {
        console.error("[auto-patrol] tick 异常:", err);
      });
    }, TICK_MS);
  }, 30_000);

  console.log("[auto-patrol] 已启动, 每分钟消费队列 + 按间隔巡检");
}

function isRateLimited() {
  return Date.now() < rateLimitCooldownUntil;
}

function setRateLimitCooldown(ms: number) {
  rateLimitCooldownUntil = Date.now() + ms;
  console.log(`[auto-patrol] API 限流，冷却 ${Math.ceil(ms / 1000)}s (至 ${new Date(rateLimitCooldownUntil).toISOString()})`);
}

async function tick() {
  try {
    const config = await getAppConfig();
    if (!config.autoSyncEnabled) return;

    const now = Date.now();
    const lastRunAt = config.autoSyncLastRunAt ? new Date(config.autoSyncLastRunAt).getTime() : 0;
    const intervalMs = (config.autoSyncIntervalHours || 1) * 60 * 60 * 1000;
    const fullSyncDue = !lastRunAt || now - lastRunAt >= intervalMs;

    if (isRateLimited()) return;

    // fullSync 即将触发时跳过 drainQueue，保留 API 配额
    if (!fullSyncDue) {
      await drainQueue();
    }

    // 每 5 分钟轮询新活动
    if (!fullSyncDue && config.autoSyncIntervals && (!lastPollAt || now - lastPollAt >= POLL_INTERVAL_MS)) {
      lastPollAt = now;
      try {
        const pollResult = await pollAllUsersForNewActivities();
        if (pollResult.totalNew > 0) {
          console.log(`[auto-patrol] 轮询发现 ${pollResult.totalNew} 条新活动，已入队`);
          await drainQueue();
        }
      } catch (err) {
        if (err instanceof RateLimitError) {
          setRateLimitCooldown(err.retryAfterMs);
          return;
        }
        console.log("[auto-patrol] 轮询异常，跳过本轮");
      }
    }

    // 每 30 分钟独立轮询 wellness 数据（不受 fullSync 影响）
    if (!fullSyncDue && config.autoSyncIntervals && (!lastWellnessPollAt || now - lastWellnessPollAt >= WELLNESS_POLL_MS)) {
      lastWellnessPollAt = now;
      await pollAllWellness();
    }

    if (fullSyncDue) {
      await runFullSync(config);
      lastWellnessPollAt = now;
    }
  } catch (err) {
    console.error("[auto-patrol] tick 顶层异常:", err);
    try {
      await updateAppConfig({ autoSyncLastStatus: "巡检异常" });
    } catch {
      // DB 写入失败时静默
    }
  }
}

async function drainQueue() {
  if (isRateLimited()) return;

  let total = 0;
  for (let round = 0; round < 10; round++) {
    try {
      const batch = await processPendingSyncJobs(12);
      total += batch.length;
      if (batch.length < 12) break;
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRateLimitCooldown(err.retryAfterMs);
        break;
      }
      throw err;
    }
  }
  if (total > 0) {
    console.log(`[auto-patrol] 本轮消费 ${total} 个队列任务`);
  }
}

async function pollAllWellness() {
  if (isRateLimited()) return;

  const users = await listUsers();
  let synced = 0;
  let errors = 0;

  for (const user of users) {
    if (!user.intervalsApiKeyEncrypted || !user.intervalsAthleteId) continue;

    try {
      const apiKey = decryptSecret(user.intervalsApiKeyEncrypted);
      const rawWellness = await fetchIntervalsWellness({
        athleteId: user.intervalsAthleteId,
        apiKey,
        days: 7,
      });
      const count = await syncWellnessData(user.id, rawWellness);
      if (count > 0) synced++;
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRateLimitCooldown(err.retryAfterMs);
        console.error(`[auto-patrol] wellness 轮询遇到 429，终止（已完成 ${synced}/${users.length}）`);
        return;
      }
      errors++;
      console.error(`[auto-patrol] wellness 同步失败 ${user.name ?? user.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (synced > 0 || errors > 0) {
    console.log(`[auto-patrol] wellness 轮询: ${synced} 用户更新, ${errors} 失败`);
  }
}

async function runFullSync(config: Awaited<ReturnType<typeof getAppConfig>>) {
  await updateAppConfig({
    autoSyncLastRunAt: new Date().toISOString(),
    autoSyncLastStatus: "巡检中...",
  });

  const users = await listUsers();
  let synced = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const user of users) {
    if (config.autoSyncIntervals && user.intervalsApiKeyEncrypted) {
      try {
        await runIntervalsSync({ user, mode: "incremental" });
        synced++;
      } catch (err) {
        errors++;
        const msg = `[intervals] ${user.name ?? user.email}: ${err instanceof Error ? err.message : String(err)}`;
        errorDetails.push(msg);
        console.error(`[auto-patrol] 同步失败 ${msg}`);

        if (err instanceof RateLimitError) {
          setRateLimitCooldown(err.retryAfterMs);
          console.error(`[auto-patrol] 遇到 429 限流，终止本轮全量同步（已完成 ${synced}/${users.length}）`);
          break;
        }
      }
    }

    if (config.autoSyncStrava && user.stravaAccessTokenEncrypted) {
      try {
        await runStravaSync({ user, mode: "incremental", reason: "auto_patrol" });
        synced++;
      } catch (err) {
        errors++;
        const msg = `[strava] ${user.name ?? user.email}: ${err instanceof Error ? err.message : String(err)}`;
        errorDetails.push(msg);
        console.error(`[auto-patrol] 同步失败 ${msg}`);
      }
    }
  }

  if (!isRateLimited()) {
    await drainQueue();
  }

  const status = errors > 0
    ? `完成: ${synced} 成功, ${errors} 失败 (${users.length} 用户) | ${errorDetails.slice(0, 3).join("; ")}`
    : `完成: ${synced} 成功, 0 失败 (${users.length} 用户)`;

  await updateAppConfig({ autoSyncLastStatus: status.slice(0, 500) });
}
