import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { calculatePmc, detectTrainingPhase } from "@/lib/engine/pmc";
import { PmcChart } from "@/components/analytics/pmc-chart";

export default async function PmcPage() {
  const user = await requireUser();
  const { activities } = await loadAnalyticsData(user);
  const pmcData = calculatePmc(activities);
  const phase = detectTrainingPhase(pmcData);
  const latest = pmcData[pmcData.length - 1];

  // Determine status interpretation based on TSB
  const tsb = latest?.tsb ?? 0;
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

  return (
    <div>
      <div className="analytics-page-header">
        <h1>PMC 体能管理图表</h1>
        <p>CTL（体能）/ ATL（疲劳）/ TSB（状态）长期趋势 · 当前阶段：{phase.label}</p>
      </div>

      {!pmcData.length ? (
        <div className="analytics-empty">
          <h3>暂无数据</h3>
          <p>请先同步活动数据，PMC 图表将自动生成。</p>
        </div>
      ) : (
        <>
          <div className="analytics-card">
            <div className="analytics-card-header">
              <h2>体能管理图表</h2>
              <div style={{ display: "flex", gap: 16, fontSize: "0.82rem" }}>
                <span style={{ color: "#1f57d6" }}>● CTL 体能</span>
                <span style={{ color: "#c44d3b" }}>● ATL 疲劳</span>
                <span style={{ color: "#0f8a62" }}>● TSB 状态</span>
              </div>
            </div>
            <PmcChart data={pmcData} />
          </div>

          <div className="analytics-grid">
            <div className="analytics-stat-card">
              <div className="eyebrow">训练阶段</div>
              <div className="stat-value" style={{ fontSize: "1.4rem" }}>{phase.label}</div>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "8px 0 0" }}>{phase.description}</p>
            </div>
            <div className="analytics-stat-card">
              <div className="eyebrow">当前 CTL</div>
              <div className="stat-value">{latest?.ctl ?? "--"}</div>
              <div className="stat-change stat-change--flat">42 天加权平均训练负荷</div>
            </div>
            <div className="analytics-stat-card">
              <div className="eyebrow">当前 TSB</div>
              <div className="stat-value" style={{ color: tsbStatus.color }}>
                {latest?.tsb ?? "--"}
              </div>
              <div className="stat-change" style={{ color: tsbStatus.color }}>{tsbStatus.label}</div>
            </div>
          </div>

          {/* Indicator Interpretation Guide */}
          <div className="analytics-card">
            <div className="analytics-card-header">
              <h2>指标解读</h2>
              <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>如何看懂 CTL / ATL / TSB</span>
            </div>

            {/* CTL */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#1f57d6" }} />
                <strong style={{ fontSize: "1rem" }}>CTL · 慢性训练负荷（体能）</strong>
                <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>过去 42 天 TSS 指数加权平均</span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: "0 0 8px" }}>
                代表你的有氧基础和承受训练负荷的能力。CTL 越高，体能越扎实。典型参考区间：
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, fontSize: "0.85rem" }}>
                <div style={{ padding: "8px 12px", background: "rgba(196,77,59,0.08)", borderRadius: 8 }}>
                  <strong style={{ color: "#c44d3b" }}>&lt; 40</strong> · 入门或长期休训
                </div>
                <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.08)", borderRadius: 8 }}>
                  <strong style={{ color: "#f59e0b" }}>40 - 60</strong> · 业余定期训练
                </div>
                <div style={{ padding: "8px 12px", background: "rgba(31,87,214,0.08)", borderRadius: 8 }}>
                  <strong style={{ color: "#1f57d6" }}>60 - 90</strong> · 业余进阶
                </div>
                <div style={{ padding: "8px 12px", background: "rgba(15,138,98,0.08)", borderRadius: 8 }}>
                  <strong style={{ color: "#0f8a62" }}>&gt; 90</strong> · 半职业 / 竞赛级
                </div>
              </div>
            </div>

            {/* ATL */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#c44d3b" }} />
                <strong style={{ fontSize: "1rem" }}>ATL · 急性训练负荷（疲劳）</strong>
                <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>过去 7 天 TSS 指数加权平均</span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: "0 0 8px" }}>
                代表当前疲劳程度。ATL 相对 CTL 越高，说明近期训练刺激越强。
              </p>
              <div style={{ fontSize: "0.85rem", padding: "10px 14px", background: "var(--surface-alt)", borderRadius: 8 }}>
                <strong>判断方法：</strong>对比 ATL 与 CTL。ATL &gt; CTL 表示处于建设期（疲劳累积）；ATL &lt; CTL 表示处于减量期（恢复中）。
              </div>
            </div>

            {/* TSB */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#0f8a62" }} />
                <strong style={{ fontSize: "1rem" }}>TSB · 训练压力平衡（状态）</strong>
                <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>CTL − ATL</span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: "0 0 8px" }}>
                代表你当前的"新鲜度"。数值越高，状态越好但也意味着训练刺激减少。区间含义：
              </p>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, padding: "8px 12px", background: "rgba(15,138,98,0.08)", borderRadius: 8, fontSize: "0.85rem" }}>
                  <strong style={{ color: "#0f8a62" }}>TSB &gt; +25</strong>
                  <span>状态过顶 · 长期减量可能影响训练适应，建议恢复训练刺激</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, padding: "8px 12px", background: "rgba(15,138,98,0.05)", borderRadius: 8, fontSize: "0.85rem" }}>
                  <strong style={{ color: "#0f8a62" }}>+5 ~ +25</strong>
                  <span>状态良好 · 最适合比赛或关键高强度训练</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, padding: "8px 12px", background: "rgba(31,87,214,0.05)", borderRadius: 8, fontSize: "0.85rem" }}>
                  <strong style={{ color: "#1f57d6" }}>−10 ~ +5</strong>
                  <span>中性区间 · 训练负荷可控，正常训练节奏</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, padding: "8px 12px", background: "rgba(245,158,11,0.08)", borderRadius: 8, fontSize: "0.85rem" }}>
                  <strong style={{ color: "#f59e0b" }}>−30 ~ −10</strong>
                  <span>建设期 · 疲劳累积但可控，是最有效的训练刺激区间</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, padding: "8px 12px", background: "rgba(196,77,59,0.08)", borderRadius: 8, fontSize: "0.85rem" }}>
                  <strong style={{ color: "#c44d3b" }}>TSB &lt; −30</strong>
                  <span>过度疲劳 · 需要减量恢复，否则易出现过训综合征</span>
                </div>
              </div>
            </div>
          </div>

          {/* Current Analysis */}
          <div className="analytics-card" style={{ borderLeft: `4px solid ${tsbStatus.color}` }}>
            <div className="analytics-card-header">
              <h2>当前状态分析</h2>
              <span style={{ fontSize: "0.82rem", color: tsbStatus.color, fontWeight: 600 }}>{tsbStatus.label}</span>
            </div>
            <p style={{ margin: "0 0 8px", color: "var(--muted)" }}>{tsbStatus.description}</p>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text)" }}>
              你的 CTL 为 <strong>{latest?.ctl}</strong>，ATL 为 <strong>{latest?.atl}</strong>，TSB 为 <strong>{latest?.tsb}</strong>。
              {" "}训练阶段处于<strong style={{ color: "var(--accent)" }}>{phase.label}</strong>。{phase.description}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
