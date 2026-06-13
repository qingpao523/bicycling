"use client";

import { useState, useEffect } from "react";
import { Sparkles, AlertCircle, TrendingUp, Target, Activity, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { AiChatModal, AiChatButton } from "./ai-chat-modal";


function toArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  if (typeof value === "string" && value.trim()) {
    // Split by common delimiters: ;, |, newlines, or Chinese periods/semicolons
    return value.split(/[;|；\n]|(?:。\s*)/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

interface AnalyticsAiResult {
  overall_summary: string;
  strengths: string[];
  weaknesses: string[];
  bottleneck_analysis: {
    primary: string;
    description: string;
    affected_scenarios: string[] | string;
  };
  vo2max_estimate?: {
    value: number;
    unit: string;
    interpretation: string;
  };
  improvement_paths: {
    title: string;
    method: string;
    timeframe: string;
    priority: "high" | "medium" | "low";
  }[];
  rider_type_analysis: {
    current_type: string;
    target_suggestion?: string;
    gap_analysis?: string;
  };
  training_recommendations: string[];
}

function formatGeneratedAt(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AiAnalysisPanel() {
  const [chatOpen, setChatOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<AnalyticsAiResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  // Fetch existing report on mount
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
      } catch {
        // ignore - let user generate manually
      } finally {
        setInitialLoading(false);
      }
    })();
  }, []);

  async function generate(isRegenerate = false) {
    if (isRegenerate) setRegenerating(true);
    else setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analytics/ai-report", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "生成失败");
      } else {
        setReport(data.report);
        setGeneratedAt(data.generatedAt);
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }

  const priorityColors = {
    high: { bg: "rgba(196,77,59,0.08)", color: "#c44d3b", label: "高优先级" },
    medium: { bg: "rgba(245,158,11,0.08)", color: "#f59e0b", label: "中优先级" },
    low: { bg: "rgba(31,87,214,0.08)", color: "#1f57d6", label: "低优先级" },
  };

  // Initial loading state
  if (initialLoading) {
    return (
      <div className="analytics-card" style={{ textAlign: "center", padding: 40 }}>
        <RefreshCw size={24} style={{ color: "var(--muted)", animation: "spin 1.2s linear infinite", marginBottom: 8 }} />
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.88rem" }}>加载分析报告...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // No report yet - show generation prompt
  if (!report && !loading && !error) {
    return (
      <div className="analytics-card" style={{ background: "linear-gradient(135deg, rgba(31,87,214,0.04), rgba(124,58,237,0.04))" }}>
        <div className="ai-panel-pre-gen" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--accent)", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: "0 0 4px" }}>AI 多维度深度分析</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem" }}>
              基于你的 PMC、功率曲线、训练量和心率数据，生成瓶颈分析、改善路径和个性化训练建议
            </p>
          </div>
          <button
            className="ai-panel-pre-gen-btn"
            onClick={() => generate(false)}
            style={{
              padding: "12px 24px",
              borderRadius: 10,
              border: "none",
              background: "var(--accent)",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Sparkles size={16} /> 生成 AI 分析
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="analytics-card" style={{ textAlign: "center", padding: 48 }}>
        <RefreshCw size={32} style={{ color: "var(--accent)", animation: "spin 1.2s linear infinite", marginBottom: 12 }} />
        <p style={{ color: "var(--muted)", margin: 0 }}>AI 正在分析你的训练数据，通常需要 15-30 秒...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="analytics-card" style={{ borderLeft: "4px solid var(--danger)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AlertCircle size={20} style={{ color: "var(--danger)" }} />
          <div style={{ flex: 1 }}>
            <strong>AI 分析失败</strong>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.88rem" }}>{error}</p>
          </div>
          <button onClick={() => generate(false)} className="time-range-btn">重试</button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <>
      {/* Overall Summary */}
      <div className="analytics-card" style={{ background: "linear-gradient(135deg, rgba(31,87,214,0.04), rgba(124,58,237,0.04))" }}>
        <div className="analytics-card-header" style={{ flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={18} style={{ color: "var(--accent)" }} />
            <h2 style={{ margin: 0 }}>AI 综合评价</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {generatedAt && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.78rem", color: "var(--muted)" }}>
                <Clock size={12} /> {formatGeneratedAt(generatedAt)}生成
              </span>
            )}
            <AiChatButton onClick={() => setChatOpen(true)} />
            <button
              onClick={() => generate(true)}
              disabled={regenerating}
              className="time-range-btn"
              style={{ display: "flex", alignItems: "center", gap: 6, opacity: regenerating ? 0.6 : 1 }}
            >
              <RefreshCw size={14} style={regenerating ? { animation: "spin 1.2s linear infinite" } : undefined} />
              {regenerating ? "生成中..." : "重新生成"}
            </button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.7 }}>{report.overall_summary}</p>
        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(196,77,59,0.08)", borderRadius: 8, fontSize: "0.82rem", color: "var(--danger)" }}>
            <AlertCircle size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
            重新生成失败：{error}
          </div>
        )}
      </div>

      {/* Bottleneck Analysis */}
      <div className="analytics-card" style={{ borderLeft: "4px solid var(--cta)" }}>
        <div className="analytics-card-header">
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={18} style={{ color: "var(--cta)" }} />
            瓶颈与生理制约因素
          </h2>
          <span style={{ fontSize: "0.82rem", padding: "3px 10px", borderRadius: 6, background: "rgba(245,158,11,0.1)", color: "var(--cta)", fontWeight: 600 }}>
            {report.bottleneck_analysis.primary}
          </span>
        </div>
        <p style={{ margin: "0 0 12px", color: "var(--text)", fontSize: "0.95rem", lineHeight: 1.7 }}>
          {report.bottleneck_analysis.description}
        </p>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          <strong>受影响场景：</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {toArray(report.bottleneck_analysis.affected_scenarios).map((s, i) => (
              <span key={i} style={{ padding: "4px 10px", borderRadius: 6, background: "var(--surface-alt)", fontSize: "0.82rem" }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* VO2max Estimate */}
      {report.vo2max_estimate && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2>VO2max 估算</h2>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: "2.4rem", fontWeight: 700, fontFamily: "var(--font-space-grotesk), sans-serif", color: "var(--accent)" }}>
              {report.vo2max_estimate.value}
            </span>
            <span style={{ fontSize: "1rem", color: "var(--muted)" }}>{report.vo2max_estimate.unit}</span>
          </div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>{report.vo2max_estimate.interpretation}</p>
        </div>
      )}

      {/* Strengths & Weaknesses */}
      <div className="analytics-grid">
        <div className="analytics-card" style={{ borderTop: "3px solid var(--ok)", marginBottom: 0 }}>
          <h3 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8, color: "var(--ok)" }}>
            <CheckCircle2 size={18} /> 强项
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text)", fontSize: "0.9rem", lineHeight: 1.7 }}>
            {toArray(report.strengths).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="analytics-card" style={{ borderTop: "3px solid var(--cta)", marginBottom: 0 }}>
          <h3 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8, color: "var(--cta)" }}>
            <AlertCircle size={18} /> 弱项
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text)", fontSize: "0.9rem", lineHeight: 1.7 }}>
            {toArray(report.weaknesses).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Rider Type */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Target size={18} style={{ color: "var(--accent)" }} />
            骑手类型分析
          </h2>
        </div>
        <div className="rider-type-grid" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "center" }}>
          <div style={{ padding: "14px 20px", borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent)", fontSize: "1.2rem", fontWeight: 700, fontFamily: "var(--font-space-grotesk), sans-serif" }}>
            {report.rider_type_analysis.current_type}
          </div>
          <div>
            {report.rider_type_analysis.target_suggestion && (
              <p style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>
                <strong>建议方向：</strong>{report.rider_type_analysis.target_suggestion}
              </p>
            )}
            {report.rider_type_analysis.gap_analysis && (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                {report.rider_type_analysis.gap_analysis}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Improvement Paths */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <TrendingUp size={18} style={{ color: "var(--ok)" }} />
            核心改善路径
          </h2>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {(Array.isArray(report.improvement_paths) ? report.improvement_paths : []).map((path, i) => {
            const p = priorityColors[path.priority];
            return (
              <div key={i} style={{ padding: "14px 18px", borderRadius: 12, background: p.bg, borderLeft: `3px solid ${p.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: "0.95rem" }}>{path.title}</strong>
                  <span style={{ fontSize: "0.75rem", padding: "2px 10px", borderRadius: 6, background: p.color, color: "white", fontWeight: 600 }}>
                    {p.label}
                  </span>
                </div>
                <p style={{ margin: "0 0 6px", color: "var(--text)", fontSize: "0.88rem", lineHeight: 1.6 }}>{path.method}</p>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                  预期适应时间：{path.timeframe}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Training Recommendations */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>可执行训练建议</h2>
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: "0.9rem", lineHeight: 1.8 }}>
          {toArray(report.training_recommendations).map((r, i) => (
            <li key={i} style={{ color: "var(--text)" }}>{r}</li>
          ))}
        </ol>
      </div>

      {/* Continue Discussion CTA */}
      <div className="analytics-card" style={{ background: "linear-gradient(135deg, rgba(31,87,214,0.06), rgba(124,58,237,0.06))", textAlign: "center" }}>
        <h3 style={{ margin: "0 0 8px" }}>还有疑问？继续跟 AI 讨论</h3>
        <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: "0.88rem" }}>
          基于本份报告深入探讨训练安排、数据解读、赛事备战等
        </p>
        <AiChatButton onClick={() => setChatOpen(true)} />
      </div>

      <AiChatModal open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
