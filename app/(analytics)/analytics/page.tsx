import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowDown, Minus, Zap, Heart, Activity, TrendingUp } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { calculatePmc, getCurrentPmc, getPmcOneWeekAgo, detectTrainingPhase } from "@/lib/engine/pmc";
import { calculateRecoveryScores } from "@/lib/engine/recovery-engine";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export default async function AnalyticsHomePage() {
  const user = await requireUser();
  const { activities, stats: tssStats } = await loadAnalyticsData(user);

  const pmcData = calculatePmc(activities);
  const currentPmc = getCurrentPmc(pmcData);
  const weekAgoPmc = getPmcOneWeekAgo(pmcData);
  const phase = detectTrainingPhase(pmcData);
  const recoveryScores = calculateRecoveryScores(pmcData, activities, 14);
  const latestRecovery = recoveryScores.length ? recoveryScores[recoveryScores.length - 1] : null;

  // Weekly stats
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const weekActivities = activities.filter((a) => new Date(a.startTime) >= weekStart);
  const weekTss = weekActivities.reduce((sum, a) => sum + (a.tss ?? 0), 0);
  const weekDuration = weekActivities.reduce((sum, a) => sum + a.movingTimeMin, 0);
  const weekDistance = weekActivities.reduce((sum, a) => sum + a.distanceKm, 0);

  // Last 7 days TSS
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateKey = date.toISOString().split("T")[0];
    const dayTss = activities
      .filter((a) => a.startTime.startsWith(dateKey))
      .reduce((sum, a) => sum + (a.tss ?? 0), 0);
    return { date: dateKey, tss: dayTss, label: date.toLocaleDateString("zh-CN", { weekday: "short" }) };
  });

  const maxTss = Math.max(...last7Days.map((d) => d.tss), 1);

  function trendArrow(current?: number, previous?: number) {
    if (current === undefined || previous === undefined) return { icon: Minus, cls: "stat-change--flat", text: "--" };
    const diff = current - previous;
    if (diff >= 2) return { icon: ArrowUp, cls: "stat-change--up", text: `+${diff.toFixed(1)}` };
    if (diff <= -2) return { icon: ArrowDown, cls: "stat-change--down", text: `${diff.toFixed(1)}` };
    return { icon: Minus, cls: "stat-change--flat", text: "持平" };
  }

  const ctlTrend = trendArrow(currentPmc?.ctl, weekAgoPmc?.ctl);
  const atlTrend = trendArrow(currentPmc?.atl, weekAgoPmc?.atl);
  const tsbTrend = trendArrow(currentPmc?.tsb, weekAgoPmc?.tsb);

  // Training suggestion based on TSB
  let suggestion = "同步活动数据后将显示训练建议";
  if (currentPmc) {
    if (currentPmc.tsb > 15) suggestion = "状态充沛，可安排高强度训练 (TSS 120-180)";
    else if (currentPmc.tsb > 5) suggestion = "状态良好，适合耐力骑 (TSS 80-120)";
    else if (currentPmc.tsb > -10) suggestion = "正常训练，建议中等强度 (TSS 60-90)";
    else if (currentPmc.tsb > -25) suggestion = "疲劳累积中，建议轻松骑 (TSS 30-50)";
    else suggestion = "过度疲劳，建议休息或恢复骑 (TSS < 30)";
  }

  return (
    <div>
      <div className="analytics-page-header">
        <h1>Power Analytics</h1>
        <p>训练数据分析总览 · {phase.label}</p>
      </div>

      {!activities.length ? (
        <div className="analytics-empty">
          <h3>暂无训练数据</h3>
          <p>请先同步活动数据，仪表盘将自动激活。</p>
          <Link href="/settings" className="button primary" style={{ marginTop: 16, display: "inline-flex" }}>
            前往设置 <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          {/* PMC Summary Cards */}
          <div className="analytics-grid">
            <Link href="/analytics/pmc" className="analytics-stat-card">
              <div className="eyebrow">CTL · 体能</div>
              <div className="stat-value">{currentPmc?.ctl.toFixed(1) ?? "--"}</div>
              <div className={`stat-change ${ctlTrend.cls}`}>
                <ctlTrend.icon size={14} /> {ctlTrend.text} vs 上周
              </div>
            </Link>
            <Link href="/analytics/pmc" className="analytics-stat-card">
              <div className="eyebrow">ATL · 疲劳</div>
              <div className="stat-value">{currentPmc?.atl.toFixed(1) ?? "--"}</div>
              <div className={`stat-change ${atlTrend.cls}`}>
                <atlTrend.icon size={14} /> {atlTrend.text} vs 上周
              </div>
            </Link>
            <Link href="/analytics/pmc" className="analytics-stat-card">
              <div className="eyebrow">TSB · 状态</div>
              <div className="stat-value">{currentPmc?.tsb.toFixed(1) ?? "--"}</div>
              <div className={`stat-change ${tsbTrend.cls}`}>
                <tsbTrend.icon size={14} /> {tsbTrend.text} vs 上周
              </div>
            </Link>
            <Link href="/analytics/recovery" className="analytics-stat-card">
              <div className="eyebrow">恢复状态</div>
              <div className="stat-value" style={{ color: latestRecovery?.color ?? "inherit" }}>
                {latestRecovery?.score ?? "--"}
              </div>
              <div className="stat-change" style={{ color: latestRecovery?.color ?? "inherit" }}>
                {latestRecovery?.label ?? "数据不足"}
              </div>
            </Link>
          </div>

          {/* FTP & Weekly Summary */}
          <div className="analytics-grid">
            <Link href="/analytics/power-curve" className="analytics-stat-card">
              <div className="eyebrow">FTP 估算</div>
              <div className="stat-value">{user.ftp ?? "--"} <span style={{ fontSize: "0.5em", fontWeight: 400 }}>W</span></div>
              <div className="stat-change stat-change--flat">
                {user.ftp ? `${((user.ftp ?? 0) / (user.weightKg ?? 70)).toFixed(2)} W/kg` : "未设置"}
              </div>
            </Link>
            <div className="analytics-stat-card">
              <div className="eyebrow">本周训练</div>
              <div className="stat-value">{weekActivities.length} <span style={{ fontSize: "0.5em", fontWeight: 400 }}>次</span></div>
              <div className="stat-change stat-change--flat">
                TSS {weekTss} · {(weekDuration / 60).toFixed(1)}h · {weekDistance.toFixed(0)}km
              </div>
            </div>
          </div>

          {/* 7-day TSS bar chart */}
          <div className="analytics-card">
            <div className="analytics-card-header">
              <h2>近 7 天 TSS</h2>
              <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                {last7Days.every((d) => d.tss === 0) ? "最近 7 天无 TSS 数据" : "每日训练负荷"}
              </span>
            </div>
            {last7Days.every((d) => d.tss === 0) ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: "0.88rem" }}>
                <p style={{ margin: "0 0 4px" }}>近 7 天无有效 TSS 数据</p>
                <p style={{ margin: 0, fontSize: "0.82rem" }}>部分活动可能缺少功率或心率数据导致 TSS 未计算</p>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140 }}>
                {last7Days.map((day) => {
                  const height = day.tss > 0 ? Math.max((day.tss / maxTss) * 110, 8) : 4;
                  return (
                    <div key={day.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: day.tss > 0 ? "var(--text)" : "var(--muted)" }}>
                        {day.tss || "0"}
                      </span>
                      <div
                        style={{
                          width: "100%",
                          height: `${height}px`,
                          background: day.tss > 150 ? "var(--danger)" : day.tss > 80 ? "var(--accent)" : day.tss > 0 ? "var(--accent-2)" : "var(--line)",
                          borderRadius: 4,
                          transition: "height 0.3s",
                        }}
                      />
                      <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>{day.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Training Suggestion */}
          <div className="analytics-card">
            <div className="analytics-card-header">
              <h2>训练建议</h2>
              <span style={{ fontSize: "0.78rem", padding: "4px 10px", background: "var(--accent-soft)", borderRadius: 6, color: "var(--accent)" }}>
                {phase.label}
              </span>
            </div>
            <p style={{ color: "var(--muted)", margin: 0 }}>{suggestion}</p>
          </div>

          {/* Quick Links */}
          <div className="analytics-grid" style={{ marginTop: 8 }}>
            <Link href="/analytics/power-curve" className="analytics-stat-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Zap size={20} style={{ color: "var(--accent)" }} />
              <div>
                <strong>功率曲线</strong>
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>查看各时间段最大功率</div>
              </div>
            </Link>
            <Link href="/analytics/fatigue" className="analytics-stat-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Activity size={20} style={{ color: "var(--cta)" }} />
              <div>
                <strong>疲劳形态</strong>
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>分析疲劳累积模式</div>
              </div>
            </Link>
            <Link href="/analytics/prediction" className="analytics-stat-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <TrendingUp size={20} style={{ color: "var(--ok)" }} />
              <div>
                <strong>表现预测</strong>
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>FTP 与 VO2max 趋势</div>
              </div>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
