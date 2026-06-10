import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowDown, Minus, Zap, Heart, Activity, TrendingUp } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { calculatePmc, getCurrentPmc, getPmcOneWeekAgo, detectTrainingPhase } from "@/lib/engine/pmc";
import { calculateRecoveryScores } from "@/lib/engine/recovery-engine";
import { LazyPmcChart } from "@/components/analytics/lazy-charts";

export default async function AnalyticsHomePage() {
  const user = await requireUser();
  const { activities } = await loadAnalyticsData(user);

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

  // Last 7 days TSS — group by local date, not UTC
  const localDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateKey = localDateKey(date);
    const dayTss = activities
      .filter((a) => localDateKey(new Date(a.startTime)) === dateKey)
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

  // PMC TSB 解读
  const tsb = currentPmc?.tsb ?? 0;
  let tsbStatus: { label: string; color: string; description: string } = {
    label: "平衡",
    color: "var(--muted)",
    description: "训练负荷与恢复保持平衡",
  };
  if (tsb > 20) tsbStatus = { label: "状态过顶", color: "#0f8a62", description: "长期疲劳累积不足，可能错过竞赛窗口" };
  else if (tsb > 5) tsbStatus = { label: "状态良好", color: "#0f8a62", description: "恢复充分，适合比赛或高强度训练" };
  else if (tsb > -10) tsbStatus = { label: "中性区间", color: "#1f57d6", description: "训练负荷可控，可正常训练" };
  else if (tsb > -30) tsbStatus = { label: "疲劳累积", color: "#f59e0b", description: "处于建设期，疲劳累积但可控" };
  else tsbStatus = { label: "过度疲劳", color: "#c44d3b", description: "疲劳过深，建议减量恢复" };

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
          {/* §1 PMC 4 stat-card 总览 */}
          <div className="analytics-grid">
            <a href="#pmc-chart" className="analytics-stat-card">
              <div className="eyebrow">CTL · 体能</div>
              <div className="stat-value">{currentPmc?.ctl.toFixed(1) ?? "--"}</div>
              <div className={`stat-change ${ctlTrend.cls}`}>
                <ctlTrend.icon size={14} /> {ctlTrend.text} vs 上周
              </div>
            </a>
            <a href="#pmc-chart" className="analytics-stat-card">
              <div className="eyebrow">ATL · 疲劳</div>
              <div className="stat-value">{currentPmc?.atl.toFixed(1) ?? "--"}</div>
              <div className={`stat-change ${atlTrend.cls}`}>
                <atlTrend.icon size={14} /> {atlTrend.text} vs 上周
              </div>
            </a>
            <a href="#pmc-chart" className="analytics-stat-card">
              <div className="eyebrow">TSB · 状态</div>
              <div className="stat-value" style={{ color: tsbStatus.color }}>
                {currentPmc?.tsb.toFixed(1) ?? "--"}
              </div>
              <div className="stat-change" style={{ color: tsbStatus.color }}>
                {tsbStatus.label}
              </div>
            </a>
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

          {/* §2 FTP & 本周训练 */}
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

          {/* §3 PMC 完整图表 (从 /analytics/pmc 合并过来) */}
          <div id="pmc-chart" className="analytics-card">
            <div className="analytics-card-header">
              <h2>PMC 体能管理图表</h2>
              <div style={{ display: "flex", gap: 16, fontSize: "0.82rem" }}>
                <span style={{ color: "#1f57d6" }}>● CTL 体能</span>
                <span style={{ color: "#c44d3b" }}>● ATL 疲劳</span>
                <span style={{ color: "#0f8a62" }}>● TSB 状态</span>
              </div>
            </div>
            {pmcData.length ? (
              <LazyPmcChart data={pmcData} />
            ) : (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)" }}>
                <p>暂无 PMC 数据 — 同步活动后自动生成</p>
              </div>
            )}
          </div>

          {/* §4 当前状态分析 (合并自 pmc page) */}
          {currentPmc ? (
            <div className="analytics-card" style={{ borderLeft: `4px solid ${tsbStatus.color}` }}>
              <div className="analytics-card-header">
                <h2>当前状态分析</h2>
                <span style={{ fontSize: "0.82rem", color: tsbStatus.color, fontWeight: 600 }}>{tsbStatus.label}</span>
              </div>
              <p style={{ margin: "0 0 8px", color: "var(--muted)" }}>{tsbStatus.description}</p>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text)" }}>
                你的 CTL 为 <strong>{currentPmc.ctl.toFixed(1)}</strong>，ATL 为 <strong>{currentPmc.atl.toFixed(1)}</strong>，TSB 为 <strong>{currentPmc.tsb.toFixed(1)}</strong>。
                {" "}训练阶段处于<strong style={{ color: "var(--accent)" }}>{phase.label}</strong>。{phase.description}
              </p>
            </div>
          ) : null}

          {/* §5 近 7 天 TSS bar chart */}
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

          {/* §6 PMC 指标解读 (折叠, 不强占屏幕) */}
          <details className="analytics-card">
            <summary style={{ cursor: "pointer", fontSize: "1rem", fontWeight: 600, padding: "4px 0" }}>
              📖 PMC 指标解读 — 如何看懂 CTL / ATL / TSB
            </summary>
            <div style={{ marginTop: 12 }}>
              {/* CTL */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#1f57d6" }} />
                  <strong style={{ fontSize: "0.95rem" }}>CTL · 慢性训练负荷（体能）</strong>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>过去 42 天 TSS 指数加权平均</span>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 8px" }}>
                  代表你的有氧基础和承受训练负荷的能力。CTL 越高，体能越扎实。
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6, fontSize: "0.82rem" }}>
                  <div style={{ padding: "6px 10px", background: "rgba(196,77,59,0.08)", borderRadius: 6 }}>
                    <strong style={{ color: "#c44d3b" }}>&lt; 40</strong> · 入门或休训
                  </div>
                  <div style={{ padding: "6px 10px", background: "rgba(245,158,11,0.08)", borderRadius: 6 }}>
                    <strong style={{ color: "#f59e0b" }}>40-60</strong> · 业余定期
                  </div>
                  <div style={{ padding: "6px 10px", background: "rgba(31,87,214,0.08)", borderRadius: 6 }}>
                    <strong style={{ color: "#1f57d6" }}>60-90</strong> · 业余进阶
                  </div>
                  <div style={{ padding: "6px 10px", background: "rgba(15,138,98,0.08)", borderRadius: 6 }}>
                    <strong style={{ color: "#0f8a62" }}>&gt; 90</strong> · 竞赛级
                  </div>
                </div>
              </div>

              {/* ATL */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#c44d3b" }} />
                  <strong style={{ fontSize: "0.95rem" }}>ATL · 急性训练负荷（疲劳）</strong>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>过去 7 天 TSS 指数加权平均</span>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 6px" }}>
                  代表当前疲劳程度。ATL &gt; CTL = 建设期（疲劳累积）；ATL &lt; CTL = 减量期（恢复中）。
                </p>
              </div>

              {/* TSB */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#0f8a62" }} />
                  <strong style={{ fontSize: "0.95rem" }}>TSB · 训练压力平衡（状态）</strong>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>CTL − ATL</span>
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10, padding: "6px 10px", background: "rgba(15,138,98,0.08)", borderRadius: 6, fontSize: "0.82rem" }}>
                    <strong style={{ color: "#0f8a62" }}>&gt; +25</strong>
                    <span>状态过顶 · 长期减量影响适应，建议恢复训练刺激</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10, padding: "6px 10px", background: "rgba(15,138,98,0.05)", borderRadius: 6, fontSize: "0.82rem" }}>
                    <strong style={{ color: "#0f8a62" }}>+5 ~ +25</strong>
                    <span>状态良好 · 最适合比赛或关键高强度训练</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10, padding: "6px 10px", background: "rgba(31,87,214,0.05)", borderRadius: 6, fontSize: "0.82rem" }}>
                    <strong style={{ color: "#1f57d6" }}>−10 ~ +5</strong>
                    <span>中性区间 · 正常训练节奏</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10, padding: "6px 10px", background: "rgba(245,158,11,0.08)", borderRadius: 6, fontSize: "0.82rem" }}>
                    <strong style={{ color: "#f59e0b" }}>−30 ~ −10</strong>
                    <span>建设期 · 最有效的训练刺激区间</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10, padding: "6px 10px", background: "rgba(196,77,59,0.08)", borderRadius: 6, fontSize: "0.82rem" }}>
                    <strong style={{ color: "#c44d3b" }}>&lt; −30</strong>
                    <span>过度疲劳 · 必须减量恢复</span>
                  </div>
                </div>
              </div>
            </div>
          </details>

          {/* §7 训练建议 */}
          <div className="analytics-card">
            <div className="analytics-card-header">
              <h2>训练建议</h2>
              <span style={{ fontSize: "0.78rem", padding: "4px 10px", background: "var(--accent-soft)", borderRadius: 6, color: "var(--accent)" }}>
                {phase.label}
              </span>
            </div>
            <p style={{ color: "var(--muted)", margin: 0 }}>{suggestion}</p>
          </div>

          {/* §8 Quick Links */}
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
            <Link href="/analytics/recovery" className="analytics-stat-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Heart size={20} style={{ color: "var(--danger)" }} />
              <div>
                <strong>状态恢复</strong>
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>恢复评分与建议</div>
              </div>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
