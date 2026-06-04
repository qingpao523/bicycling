"use client";

import { useState, useEffect } from "react";
import { Sparkles, AlertCircle, RefreshCw, Clock, Target, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart, ReferenceLine } from "recharts";

function toArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  if (typeof value === "string" && value.trim()) {
    return value.split(/[;|；\n]|(?:。\s*)/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

interface DurationEstimate {
  duration: number;
  durationLabel: string;
  maxPower: number;
  multiplier: number;
  estimatedFtp: number;
  sourceActivityId?: string;
  sourceActivityName?: string;
  sourceDate?: string;
}

interface FtpEstimate {
  ftp: number;
  method: string;
  confidence: "high" | "medium" | "low";
  wpkg?: number;
  allEstimates: DurationEstimate[];
  criticalPower?: { cp: number; wPrime: number; rSquared?: number };
  dataQuality: {
    durationsAvailable: number;
    totalActivitiesChecked: number;
    activitiesWithValidPower: number;
  };
}

interface FtpProgressPoint {
  date: string;
  ftp: number;
  method: string;
  wpkg?: number;
}

interface PredictionResult {
  predicted: number;
  low: number;
  high: number;
  trend: "up" | "down" | "flat";
  weeklyRate: number;
}

interface Props {
  currentFtp: number | null;
  weightKg: number | null;
  maxHr: number | null;
  vo2max: number | null;
  ftpEstimate: FtpEstimate;
  progression: FtpProgressPoint[];
  prediction: PredictionResult | null;
}

interface AiReport {
  bottleneck_analysis: {
    primary: string;
    description: string;
    affected_scenarios: string[] | string;
  };
  vo2max_estimate?: { value: number; unit: string; interpretation: string };
  improvement_paths: { title: string; method: string; timeframe: string; priority: "high" | "medium" | "low" }[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN");
}

export function PredictionDetailView({ currentFtp, weightKg, maxHr, vo2max, ftpEstimate, progression, prediction }: Props) {
  const [report, setReport] = useState<AiReport | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analytics/ai-report", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          if (data.report) {
            setReport(data.report);
            setGeneratedAt(data.generatedAt);
          }
        }
      } finally {
        setInitialLoading(false);
      }
    })();
  }, []);

  async function generateReport() {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/ai-report", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
        setGeneratedAt(data.generatedAt);
      }
    } finally {
      setLoading(false);
    }
  }

  // Build chart data: progression + prediction
  const chartData = progression.map((p) => ({
    date: p.date.slice(5),
    eFTP: p.ftp,
    predicted: null as number | null,
    predictedHigh: null as number | null,
    predictedLow: null as number | null,
  }));

  if (prediction && progression.length > 0) {
    const lastDate = new Date(progression[progression.length - 1].date);
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + 30);
    chartData.push({
      date: `${futureDate.toISOString().slice(5, 10)}·预`,
      eFTP: null as any,
      predicted: prediction.predicted,
      predictedHigh: prediction.high,
      predictedLow: prediction.low,
    });
  }

  const confidenceColor =
    ftpEstimate.confidence === "high" ? "var(--ok)" :
    ftpEstimate.confidence === "medium" ? "var(--accent)" : "var(--cta)";
  const confidenceLabel =
    ftpEstimate.confidence === "high" ? "高置信度" :
    ftpEstimate.confidence === "medium" ? "中等置信度" : "低置信度";

  const mismatchPct = currentFtp && ftpEstimate.ftp > 0 ?
    Math.abs((ftpEstimate.ftp - currentFtp) / currentFtp) * 100 : 0;

  return (
    <>
      {/* FTP Summary */}
      <div className="analytics-grid">
        <div className="analytics-stat-card">
          <div className="eyebrow">当前设置 FTP</div>
          <div className="stat-value">{currentFtp ?? "--"} <span style={{ fontSize: "0.5em" }}>W</span></div>
          {currentFtp && weightKg && <div className="stat-change stat-change--flat">{(currentFtp / weightKg).toFixed(2)} W/kg</div>}
        </div>
        <div className="analytics-stat-card" style={{ borderLeft: `4px solid ${confidenceColor}` }}>
          <div className="eyebrow">估算 FTP（近 90 天）</div>
          <div className="stat-value" style={{ color: "var(--accent)" }}>
            {ftpEstimate.ftp || "--"} <span style={{ fontSize: "0.5em" }}>W</span>
          </div>
          <div className="stat-change stat-change--flat" style={{ color: confidenceColor }}>
            {confidenceLabel} · {ftpEstimate.method}
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="eyebrow">VO2max 估算</div>
          <div className="stat-value">{vo2max ?? "--"} <span style={{ fontSize: "0.5em" }}>ml/kg/min</span></div>
          {!vo2max && <div className="stat-change stat-change--flat">{!weightKg ? "需设置体重" : !maxHr ? "需设置最大心率" : "数据不足"}</div>}
        </div>
        {prediction && (
          <div className="analytics-stat-card">
            <div className="eyebrow">FTP 30 天预测</div>
            <div className="stat-value" style={{ color: prediction.trend === "up" ? "var(--ok)" : prediction.trend === "down" ? "var(--danger)" : "var(--muted)" }}>
              {prediction.predicted} <span style={{ fontSize: "0.5em" }}>W</span>
            </div>
            <div className="stat-change" style={{ color: prediction.trend === "up" ? "var(--ok)" : prediction.trend === "down" ? "var(--danger)" : "var(--muted)" }}>
              {prediction.trend === "up" ? <TrendingUp size={12} style={{ display: "inline" }} /> : prediction.trend === "down" ? <TrendingDown size={12} style={{ display: "inline" }} /> : <Minus size={12} style={{ display: "inline" }} />}
              {" "}{prediction.weeklyRate >= 0 ? "+" : ""}{prediction.weeklyRate} W/周
            </div>
          </div>
        )}
      </div>

      {/* FTP mismatch warning */}
      {currentFtp && ftpEstimate.ftp > 0 && mismatchPct > 5 && (
        <div className="analytics-card" style={{ borderLeft: `4px solid var(--cta)`, background: "rgba(245,158,11,0.04)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <AlertCircle size={20} style={{ color: "var(--cta)", flexShrink: 0 }} />
            <div>
              <strong>FTP 设置值与估算值不一致</strong>
              <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "var(--muted)" }}>
                你当前设置的 FTP 为 <strong>{currentFtp}W</strong>，但基于近 90 天最佳功率估算应为 <strong style={{ color: "var(--accent)" }}>{ftpEstimate.ftp}W</strong>
                （差距 {mismatchPct.toFixed(1)}%）。建议更新你的 FTP 设置以获得更准确的训练负荷计算。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Multi-duration eFTP Breakdown Table */}
      {ftpEstimate.allEstimates.length > 0 && (
        <div className="analytics-card">
          <div className="analytics-card-header" style={{ flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              多时长 eFTP 估算
              <span
                title="基于不同时长最佳功率，应用 Critical Power 模型的时长系数，取最高值作为 FTP 估算。类似 intervals.icu 方法。"
                style={{ cursor: "help", color: "var(--muted)" }}
              >
                <Info size={14} />
              </span>
            </h2>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              共 {ftpEstimate.dataQuality.durationsAvailable} 个时长点 · {ftpEstimate.dataQuality.activitiesWithValidPower} 条有效活动
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--line)" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>时长</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>最佳功率</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>系数</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>eFTP</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>W/kg</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>来源活动</th>
                </tr>
              </thead>
              <tbody>
                {ftpEstimate.allEstimates.map((e) => {
                  const isBest = e.estimatedFtp === ftpEstimate.ftp;
                  return (
                    <tr
                      key={e.duration}
                      style={{
                        borderBottom: "1px solid var(--line)",
                        background: isBest ? "rgba(31,87,214,0.05)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: isBest ? 600 : 400 }}>
                        {isBest && <span style={{ display: "inline-block", width: 3, height: 14, background: "var(--accent)", marginRight: 8, verticalAlign: "middle" }} />}
                        {e.durationLabel}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>{e.maxPower} W</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--muted)" }}>× {e.multiplier}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: isBest ? "var(--accent)" : "var(--text)", fontSize: "1rem" }}>
                        {e.estimatedFtp}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--muted)" }}>
                        {weightKg ? (e.estimatedFtp / weightKg).toFixed(2) : "--"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                        {e.sourceActivityName ?? "--"}
                        {e.sourceDate && <span style={{ marginLeft: 6, fontSize: "0.75rem" }}>· {new Date(e.sourceDate).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--surface-alt)", borderRadius: 10, fontSize: "0.82rem", color: "var(--muted)" }}>
            💡 <strong style={{ color: "var(--text)" }}>eFTP = 最佳功率 × 时长系数</strong>。系数基于 Monod-Scherrer Critical Power 模型。最终 FTP 取所有时长估算的最大值（蓝色背景行），通常来自你最有代表性的训练时长。
          </div>
        </div>
      )}

      {/* Critical Power Model */}
      {ftpEstimate.criticalPower && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2>Critical Power 模型</h2>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>基于 P(t) = CP + W'/t</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <div style={{ padding: 14, background: "var(--surface-alt)", borderRadius: 10 }}>
              <div className="eyebrow">CP 临界功率</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--accent)" }}>{ftpEstimate.criticalPower.cp} W</div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>
                {weightKg ? `${(ftpEstimate.criticalPower.cp / weightKg).toFixed(2)} W/kg · ` : ""}
                理论上可持续无限时长的最大功率
              </div>
            </div>
            <div style={{ padding: 14, background: "var(--surface-alt)", borderRadius: 10 }}>
              <div className="eyebrow">W' 无氧储备</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--ok)" }}>{(ftpEstimate.criticalPower.wPrime / 1000).toFixed(1)} kJ</div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>
                高于 CP 时可消耗的总能量
              </div>
            </div>
            {ftpEstimate.criticalPower.rSquared !== undefined && (
              <div style={{ padding: 14, background: "var(--surface-alt)", borderRadius: 10 }}>
                <div className="eyebrow">模型拟合度</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: ftpEstimate.criticalPower.rSquared >= 0.9 ? "var(--ok)" : ftpEstimate.criticalPower.rSquared >= 0.7 ? "var(--cta)" : "var(--danger)" }}>
                  R² = {ftpEstimate.criticalPower.rSquared}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>
                  {ftpEstimate.criticalPower.rSquared >= 0.9 ? "拟合极好" : ftpEstimate.criticalPower.rSquared >= 0.7 ? "拟合良好" : "拟合一般，需要更多数据"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FTP Progression Chart */}
      {progression.length > 0 && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2>FTP 历史轨迹 & 预测</h2>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              42 天滚动窗口 · 每周一次估算
            </span>
          </div>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} unit="W" domain={["dataMin - 20", "dataMax + 20"]} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }} />
                {currentFtp && <ReferenceLine y={currentFtp} stroke="#6b7280" strokeDasharray="4 2" label={{ value: `当前设置 ${currentFtp}W`, position: "right", fontSize: 10, fill: "#6b7280" }} />}
                <Area type="monotone" dataKey="predictedHigh" stroke="none" fill="#7c3aed" fillOpacity={0.12} />
                <Area type="monotone" dataKey="predictedLow" stroke="none" fill="#ffffff" fillOpacity={1} />
                <Line type="monotone" dataKey="eFTP" stroke="#1f57d6" strokeWidth={2.5} dot={{ r: 3, fill: "#1f57d6" }} connectNulls name="历史 eFTP" />
                <Line type="monotone" dataKey="predicted" stroke="#7c3aed" strokeWidth={2.5} strokeDasharray="4 2" dot={{ r: 5, fill: "#7c3aed" }} connectNulls name="预测值" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: "0.82rem", marginTop: 12 }}>
            <span style={{ color: "#1f57d6" }}>● 历史 eFTP</span>
            {prediction && <span style={{ color: "#7c3aed" }}>● 30 天预测（虚线 + 95% 置信区间）</span>}
            {currentFtp && <span style={{ color: "#6b7280" }}>--- 当前设置值</span>}
          </div>
        </div>
      )}

      {/* AI Bottleneck Analysis */}
      {initialLoading ? (
        <div className="analytics-card" style={{ textAlign: "center", padding: 32 }}>
          <RefreshCw size={20} style={{ color: "var(--muted)", animation: "spin 1.2s linear infinite" }} />
          <p style={{ color: "var(--muted)", margin: "8px 0 0", fontSize: "0.88rem" }}>加载 AI 分析...</p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : !report ? (
        <div className="analytics-card" style={{ background: "linear-gradient(135deg, rgba(31,87,214,0.04), rgba(124,58,237,0.04))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--accent)", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={24} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2 style={{ margin: "0 0 4px" }}>AI 瓶颈分析</h2>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem" }}>
                生成生理制约因素分析与核心改善路径建议
              </p>
            </div>
            <button
              onClick={generateReport}
              disabled={loading}
              style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: "var(--accent)", color: "white", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              {loading ? <><RefreshCw size={16} style={{ animation: "spin 1.2s linear infinite" }} /> 生成中</> : <><Sparkles size={16} /> 生成 AI 分析</>}
            </button>
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 12 }}>
            提示：此分析与&ldquo;数据分析&rdquo;页的 AI 报告共享
          </div>
        </div>
      ) : (
        <>
          <div className="analytics-card" style={{ borderLeft: "4px solid var(--cta)" }}>
            <div className="analytics-card-header" style={{ flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0 }}>⚠️ 瓶颈与生理制约因素</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {generatedAt && (
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={12} /> {formatRelative(generatedAt)}生成
                  </span>
                )}
                <span style={{ fontSize: "0.82rem", padding: "3px 10px", borderRadius: 6, background: "rgba(245,158,11,0.1)", color: "var(--cta)", fontWeight: 600 }}>
                  {report.bottleneck_analysis.primary}
                </span>
              </div>
            </div>
            <p style={{ margin: "0 0 12px", color: "var(--text)", fontSize: "0.95rem", lineHeight: 1.7 }}>
              {report.bottleneck_analysis.description}
            </p>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              <strong>受影响场景：</strong>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {toArray(report.bottleneck_analysis.affected_scenarios).map((s, i) => (
                  <span key={i} style={{ padding: "4px 10px", borderRadius: 6, background: "var(--surface-alt)", fontSize: "0.82rem" }}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          {report.vo2max_estimate && (
            <div className="analytics-card">
              <div className="analytics-card-header">
                <h2>VO2max 深度解读</h2>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: "2.4rem", fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", color: "var(--accent)" }}>
                  {report.vo2max_estimate.value}
                </span>
                <span style={{ fontSize: "1rem", color: "var(--muted)" }}>{report.vo2max_estimate.unit}</span>
              </div>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>{report.vo2max_estimate.interpretation}</p>
            </div>
          )}

          <div className="analytics-card">
            <div className="analytics-card-header">
              <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Target size={18} style={{ color: "var(--ok)" }} /> 核心改善路径
              </h2>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {(Array.isArray(report.improvement_paths) ? report.improvement_paths : []).map((path, i) => {
                const priorityColors: any = {
                  high: { bg: "rgba(196,77,59,0.08)", color: "#c44d3b", label: "高优先级" },
                  medium: { bg: "rgba(245,158,11,0.08)", color: "#f59e0b", label: "中优先级" },
                  low: { bg: "rgba(31,87,214,0.08)", color: "#1f57d6", label: "低优先级" },
                };
                const p = priorityColors[path.priority];
                return (
                  <div key={i} style={{ padding: "14px 18px", borderRadius: 12, background: p.bg, borderLeft: `3px solid ${p.color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <strong style={{ fontSize: "0.95rem" }}>{path.title}</strong>
                      <span style={{ fontSize: "0.75rem", padding: "2px 10px", borderRadius: 6, background: p.color, color: "white", fontWeight: 600 }}>{p.label}</span>
                    </div>
                    <p style={{ margin: "0 0 6px", color: "var(--text)", fontSize: "0.88rem", lineHeight: 1.6 }}>{path.method}</p>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>预期适应时间：{path.timeframe}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
