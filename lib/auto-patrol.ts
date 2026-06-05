/**
 * 自动巡检 — 定时扫所有用户的 intervals.icu + Strava
 * 通过 Next.js instrumentation.ts 在服务启动时自启, 零额外依赖
 * 受管理端 AppConfig 控制: autoSyncEnabled / autoSyncIntervalHours / autoSyncIntervals / autoSyncStrava
 */

import { getAppConfig, listUsers, updateAppConfig } from "@/lib/storage";
import { runIntervalsSync } from "@/lib/intervals-sync";
import { runStravaSync } from "@/lib/strava-sync";

const CHECK_INTERVAL_MS = 60_000; // 每 60s 检查一次是否到了该巡检的时间
let started = false;

export function startAutoPatrol() {
  if (started) return;
  started = true;

  // 延迟 30 秒等 Prisma 就绪
  setTimeout(() => {
    setInterval(() => {
      tick().catch(() => {});
    }, CHECK_INTERVAL_MS);
  }, 30_000);

  console.log("[auto-patrol] 已启动, 每分钟检查巡检时机");
}

async function tick() {
  try {
    const config = await getAppConfig();

    // 管理端开关: 关了就不跑
    if (!config.autoSyncEnabled) return;

    // 间隔检查: 上次跑距现在不够 N 小时 → 跳过
    const now = Date.now();
    const lastRunAt = config.autoSyncLastRunAt ? new Date(config.autoSyncLastRunAt).getTime() : 0;
    const intervalMs = (config.autoSyncIntervalHours || 1) * 60 * 60 * 1000;
    if (lastRunAt && now - lastRunAt < intervalMs) return;

    // 标记开始
    await updateAppConfig({
      autoSyncLastRunAt: new Date().toISOString(),
      autoSyncLastStatus: "巡检中...",
    });

    const users = await listUsers();
    let synced = 0;
    let errors = 0;

    for (const user of users) {
      // intervals.icu 增量同步
      if (config.autoSyncIntervals && user.intervalsApiKeyEncrypted) {
        try {
          await runIntervalsSync({ user, mode: "incremental" });
          synced++;
        } catch {
          errors++;
        }
      }

      // Strava 增量同步
      if (config.autoSyncStrava && user.stravaAccessTokenEncrypted) {
        try {
          await runStravaSync({ user, mode: "incremental", reason: "auto_patrol" });
          synced++;
        } catch {
          errors++;
        }
      }
    }

    await updateAppConfig({
      autoSyncLastStatus: `完成: ${synced} 成功, ${errors} 失败 (${users.length} 用户)`,
    });
  } catch {
    try {
      await updateAppConfig({ autoSyncLastStatus: "巡检异常" });
    } catch {
      // 静默
    }
  }
}
