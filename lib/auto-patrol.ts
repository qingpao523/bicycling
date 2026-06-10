/**
 * 自动巡检 — 定时扫所有用户的 intervals.icu + Strava
 * 通过 Next.js instrumentation.ts 在服务启动时自启, 零额外依赖
 * 受管理端 AppConfig 控制: autoSyncEnabled / autoSyncIntervalHours / autoSyncIntervals / autoSyncStrava
 *
 * 两个独立循环:
 * 1. tick()     — 每 60s, 只消费已入队的 SyncJob (segment_fetch / stream_backfill)
 * 2. syncTick() — 每 N 小时 (config), 发起新的 intervals/strava 增量同步
 */

import { getAppConfig, listUsers, updateAppConfig } from "@/lib/storage";
import { runIntervalsSync } from "@/lib/intervals-sync";
import { runStravaSync } from "@/lib/strava-sync";
import { processPendingSyncJobs } from "@/lib/system-sync";

const TICK_MS = 60_000;
let started = false;

export function startAutoPatrol() {
  if (started) return;
  started = true;

  setTimeout(() => {
    setInterval(() => {
      tick().catch(() => {});
    }, TICK_MS);
  }, 30_000);

  console.log("[auto-patrol] 已启动, 每分钟消费队列 + 按间隔巡检");
}

async function tick() {
  try {
    const config = await getAppConfig();
    if (!config.autoSyncEnabled) return;

    // 1) 每次 tick 都消费待处理队列 — 不受同步间隔限制
    await drainQueue();

    // 2) 到同步间隔才发起新一轮增量同步
    const now = Date.now();
    const lastRunAt = config.autoSyncLastRunAt ? new Date(config.autoSyncLastRunAt).getTime() : 0;
    const intervalMs = (config.autoSyncIntervalHours || 1) * 60 * 60 * 1000;
    if (lastRunAt && now - lastRunAt < intervalMs) return;

    await runFullSync(config);
  } catch {
    try {
      await updateAppConfig({ autoSyncLastStatus: "巡检异常" });
    } catch {
      // 静默
    }
  }
}

async function drainQueue() {
  let total = 0;
  for (let round = 0; round < 10; round++) {
    const batch = await processPendingSyncJobs(12);
    total += batch.length;
    if (batch.length < 12) break;
  }
  if (total > 0) {
    console.log(`[auto-patrol] 本轮消费 ${total} 个队列任务`);
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

  for (const user of users) {
    if (config.autoSyncIntervals && user.intervalsApiKeyEncrypted) {
      try {
        await runIntervalsSync({ user, mode: "incremental" });
        synced++;
      } catch {
        errors++;
      }
    }

    if (config.autoSyncStrava && user.stravaAccessTokenEncrypted) {
      try {
        await runStravaSync({ user, mode: "incremental", reason: "auto_patrol" });
        synced++;
      } catch {
        errors++;
      }
    }
  }

  // 同步后立即消费新入队的任务
  await drainQueue();

  await updateAppConfig({
    autoSyncLastStatus: `完成: ${synced} 成功, ${errors} 失败 (${users.length} 用户)`,
  });
}
