import { requireUser } from "@/lib/auth";
import { loadAnalyticsData, asActivities } from "@/lib/analytics-data";
import { evaluateLevel } from "@/lib/engine/cycling-levels";
import { generateUpgradePlan } from "@/lib/engine/level-progression";
import { predictEta } from "@/lib/engine/level-eta";
import { calculatePmc } from "@/lib/engine/pmc";
import { LevelRadar } from "@/components/analytics/level-radar";
import { LevelProgress } from "@/components/analytics/level-progress";
import { UpgradePathCard } from "@/components/analytics/upgrade-path-card";
import { EtaPredictionCard } from "@/components/analytics/eta-prediction-card";
import { LevelStandardTable } from "@/components/analytics/level-standard-table";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LevelPage() {
  const user = await requireUser();
  const { activities: normalizedActivities } = await loadAnalyticsData(user);
  const activities = asActivities(normalizedActivities);

  // 数据不足引导
  if (activities.length < 5) {
    return (
      <main className="analytics-page">
        <div className="analytics-card" style={{ textAlign: "center", padding: 40 }}>
          <h1>能力水位</h1>
          <p style={{ color: "var(--muted)" }}>
            活动数据不足 — 当前 {activities.length} 条, 至少需要 5 条才能评级。
          </p>
          <Link href="/settings" style={{ color: "var(--accent, #1f57d6)" }}>
            ▶ 去同步 Strava / Intervals.icu
          </Link>
        </div>
      </main>
    );
  }

  // 全历史为主视角 (与功率曲线页保持同一数据口径)
  // recent 90 天仅用于对比层 "近期趋势"
  const evaluation = evaluateLevel({ activities, user, scope: "historical" });
  const recent = evaluateLevel({ activities, user, scope: "recent", windowDays: 90 });

  const upgradePlan = generateUpgradePlan(evaluation);
  const pmcSeries = calculatePmc(activities);
  const eta = predictEta(evaluation, pmcSeries);

  const weightMissing = evaluation.warnings.includes("缺少体重数据");
  const ftpNextLabel = evaluation.byDimension.ftp_20min.nextLabel;

  return (
    <main className="analytics-page" style={{ display: "grid", gap: 20 }}>
      <header>
        <h1 style={{ margin: 0 }}>🚴 能力水位</h1>
        <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>
          全历史 ({evaluation.dataWindow.activityCount} 条) · 近 90 天 ({recent.dataWindow.activityCount} 条对比) · 最强项法
        </p>
      </header>

      {weightMissing && (
        <div className="analytics-card" style={{ background: "#fef3c7", borderLeft: "4px solid #f59e0b", padding: 14 }}>
          ⚠ 你还没填写体重, W/kg 维度无法评级。请去 <Link href="/settings" style={{ color: "#92400e", textDecoration: "underline" }}>设置</Link> 完善个人信息。
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <LevelRadar evaluation={evaluation} recent={recent} />
        <LevelProgress evaluation={evaluation} recent={recent} />
      </div>

      <UpgradePathCard plan={upgradePlan} />

      <EtaPredictionCard eta={eta} nextLabel={ftpNextLabel} />

      <LevelStandardTable evaluation={evaluation} recent={recent} />

      <div style={{ textAlign: "center", padding: 12 }}>
        <Link href="/analytics#pmc-chart" style={{ color: "var(--accent, #1f57d6)", fontSize: "0.88rem" }}>
          → 查看 PMC 趋势详情
        </Link>
      </div>
    </main>
  );
}
