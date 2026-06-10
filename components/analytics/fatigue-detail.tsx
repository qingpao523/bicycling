"use client";

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface PmcPoint {
  date: string;
  atl: number;
  ctl: number;
  tsb: number;
  dailyTss: number;
}

interface Props {
  pmcData: PmcPoint[];
  latestAtl: number;
  historicalP90: number;
  decayTimeConstant: number;
  optimalLow: number;
  optimalHigh: number;
  atlWarningCount: number;
  typeCounts: Record<string, number>;
  powerFadeActivities: { name: string; date: string; fade: number }[];
}

function FatigueTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div style={{ background: "white", padding: "10px 14px", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", fontSize: "0.82rem" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{data.date}</div>
      <div style={{ color: "#c44d3b" }}>ATL 疲劳: {data.atl.toFixed(1)}</div>
      <div style={{ color: "#1f57d6" }}>CTL 体能: {data.ctl.toFixed(1)}</div>
      <div style={{ color: "#0f8a62" }}>TSB 状态: {data.tsb.toFixed(1)}</div>
      {data.dailyTss > 0 && <div style={{ color: "#666", marginTop: 4 }}>当日 TSS: {data.dailyTss}</div>}
    </div>
  );
}

export function FatigueDetailView({
  pmcData,
  latestAtl,
  historicalP90,
  decayTimeConstant,
  optimalLow,
  optimalHigh,
  atlWarningCount,
  typeCounts,
  powerFadeActivities,
}: Props) {
  const isOverloaded = latestAtl > historicalP90;
  const totalTss = Object.values(typeCounts).reduce((s, v) => s + v, 0);

  return (
    <>
      {isOverloaded && (
        <div className="analytics-card" style={{ borderLeft: "4px solid var(--danger)", background: "rgba(196, 77, 59, 0.05)" }}>
          <h3 style={{ color: "var(--danger)", margin: "0 0 8px" }}>⚠️ 疲劳警告</h3>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            当前 ATL ({latestAtl.toFixed(1)}) 超过历史 90 百分位 ({historicalP90.toFixed(1)})，建议减量恢复 2-3 天。
          </p>
        </div>
      )}

      <div className="analytics-grid">
        <div className="analytics-stat-card">
          <div className="eyebrow">当前疲劳指数 (ATL)</div>
          <div className="stat-value" style={{ color: isOverloaded ? "var(--danger)" : "inherit" }}>
            {latestAtl.toFixed(1)}
          </div>
          <div className="stat-change stat-change--flat">历史 90th: {historicalP90.toFixed(1)}</div>
        </div>
        <div className="analytics-stat-card">
          <div className="eyebrow">疲劳衰减时间常数</div>
          <div className="stat-value" style={{ fontSize: "1.6rem" }}>
            {decayTimeConstant > 0 ? `${decayTimeConstant} 天` : "--"}
          </div>
          <div className="stat-change stat-change--flat">ATL 衰减至 50% 的平均天数</div>
        </div>
        <div className="analytics-stat-card">
          <div className="eyebrow">最佳日均 TSS 区间</div>
          <div className="stat-value" style={{ fontSize: "1.4rem" }}>
            {optimalLow}-{optimalHigh}
          </div>
          <div className="stat-change stat-change--flat">TSS/天 · 基于近 90 天模型</div>
        </div>
        <div className="analytics-stat-card">
          <div className="eyebrow">ATL 过快增长天数</div>
          <div className="stat-value">{atlWarningCount}</div>
          <div className="stat-change stat-change--flat">连续 3 天增长 &gt;15%</div>
        </div>
      </div>

      {/* Main Fatigue Curve Chart */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>疲劳累积曲线（近 28 天）</h2>
          <div style={{ display: "flex", gap: 16, fontSize: "0.82rem" }}>
            <span style={{ color: "#c44d3b" }}>● ATL 疲劳</span>
            <span style={{ color: "#1f57d6" }}>● CTL 体能</span>
          </div>
        </div>
        <div className="analytics-chart-container" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pmcData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} />
              <Tooltip content={<FatigueTooltip />} />
              <ReferenceLine y={historicalP90} stroke="#c44d3b" strokeDasharray="4 2" label={{ value: "历史 90th", position: "right", fontSize: 10, fill: "#c44d3b" }} />
              <defs>
                <linearGradient id="atlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c44d3b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#c44d3b" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="ctlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1f57d6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1f57d6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="ctl" stroke="#1f57d6" strokeWidth={2} fill="url(#ctlGradient)" />
              <Area type="monotone" dataKey="atl" stroke="#c44d3b" strokeWidth={2.5} fill="url(#atlGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily TSS Distribution Chart */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>每日训练负荷分布</h2>
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>近 28 天 TSS</span>
        </div>
        <div className="analytics-chart-container" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pmcData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }} formatter={(v) => [`${v} TSS`, "当日负荷"]} />
              <ReferenceLine y={optimalLow} stroke="#0f8a62" strokeDasharray="3 3" />
              <ReferenceLine y={optimalHigh} stroke="#0f8a62" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="dailyTss" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Training Type Contribution */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>训练类型疲劳贡献</h2>
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>近 28 天 · 按 TSS 占比</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          {Object.entries(typeCounts).map(([type, tss]) => {
            const pct = totalTss > 0 ? Math.round((tss / totalTss) * 100) : 0;
            const colors: Record<string, string> = { "耐力": "#1f57d6", "节奏": "#0f8a62", "间歇": "#f59e0b", "冲刺": "#c44d3b" };
            return (
              <div key={type} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 8 }}>{type}</div>
                <div style={{ width: 60, height: 60, borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: `conic-gradient(${colors[type]} ${pct}%, var(--line) ${pct}%)` }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", fontWeight: 600 }}>
                    {pct}%
                  </div>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4 }}>{tss} TSS</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Power Fade Analysis */}
      {powerFadeActivities.length > 0 && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2>功率衰减分析</h2>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>前半段 vs 后半段平均功率变化</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th style={{ textAlign: "left", padding: 8, color: "var(--muted)" }}>活动</th>
                  <th style={{ textAlign: "left", padding: 8, color: "var(--muted)" }}>日期</th>
                  <th style={{ textAlign: "right", padding: 8, color: "var(--muted)" }}>功率变化</th>
                </tr>
              </thead>
              <tbody>
                {powerFadeActivities.map((a, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: 8, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</td>
                    <td style={{ padding: 8, color: "var(--muted)" }}>{new Date(a.date).toLocaleDateString("zh-CN")}</td>
                    <td style={{ padding: 8, textAlign: "right", fontWeight: 600, color: a.fade < -5 ? "var(--danger)" : a.fade > 0 ? "var(--ok)" : "var(--muted)" }}>
                      {a.fade > 0 ? "+" : ""}{a.fade}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
