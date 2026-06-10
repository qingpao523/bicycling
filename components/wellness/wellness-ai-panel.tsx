"use client";

import { useState, useEffect } from "react";
import { Sparkles, AlertCircle, RefreshCw, Clock, Pill, Dumbbell, Shield, Heart } from "lucide-react";

interface WellnessAiResult {
  overall_assessment: string;
  status_factors: { factor: string; status: string; insight: string }[];
  enhancement_suggestions: { category: string; suggestion: string; priority: "high" | "medium" | "low" }[];
  supplement_recommendations: { name: string; dosage: string; timing: string; reason: string }[];
  training_adjustment: string;
  recovery_protocol: string;
}

function formatGeneratedAt(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const priorityColors = {
  high: { bg: "rgba(196,77,59,0.08)", color: "#c44d3b", label: "高" },
  medium: { bg: "rgba(245,158,11,0.08)", color: "#f59e0b", label: "中" },
  low: { bg: "rgba(31,87,214,0.08)", color: "#1f57d6", label: "低" },
};

const statusColors: Record<string, string> = {
  "好": "#22c55e",
  "中": "#f59e0b",
  "差": "#ef4444",
};

export function WellnessAiPanel() {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<WellnessAiResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/wellness/ai-report", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          if (data.report) {
            setReport(data.report);
            setGeneratedAt(data.generatedAt);
          }
        }
      } catch {
        // ignore
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
      const res = await fetch("/api/wellness/ai-report", { method: "POST" });
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

  if (initialLoading) {
    return (
      <div className="analytics-card" style={{ textAlign: "center", padding: 40 }}>
        <RefreshCw size={24} style={{ color: "var(--muted)", animation: "spin 1.2s linear infinite", marginBottom: 8 }} />
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.88rem" }}>加载分析报告...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!report && !loading && !error) {
    return (
      <div className="analytics-card" style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.04), rgba(59,130,246,0.04))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg, #22c55e, #3b82f6)", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 style={{ margin: "0 0 4px" }}>AI 状态分析</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem" }}>
              基于你的生理指标，生成状态评估、增强建议和补剂推荐
            </p>
          </div>
          <button
            onClick={() => generate(false)}
            style={{
              padding: "12px 24px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #22c55e, #3b82f6)",
              color: "white", fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
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
        <RefreshCw size={32} style={{ color: "var(--ok)", animation: "spin 1.2s linear infinite", marginBottom: 12 }} />
        <p style={{ color: "var(--muted)", margin: 0 }}>AI 正在分析你的身体状态，通常需要 15-30 秒...</p>
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
      {/* Overall Assessment */}
      <div className="analytics-card" style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.04), rgba(59,130,246,0.04))" }}>
        <div className="analytics-card-header" style={{ flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={18} style={{ color: "var(--ok)" }} />
            <h2 style={{ margin: 0 }}>AI 状态分析</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {generatedAt && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.78rem", color: "var(--muted)" }}>
                <Clock size={12} /> {formatGeneratedAt(generatedAt)}生成
              </span>
            )}
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
        <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.7 }}>{report.overall_assessment}</p>
        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(196,77,59,0.08)", borderRadius: 8, fontSize: "0.82rem", color: "var(--danger)" }}>
            <AlertCircle size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
            重新生成失败：{error}
          </div>
        )}
      </div>

      {/* Status Factors */}
      {report.status_factors?.length > 0 && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <Heart size={18} style={{ color: "var(--danger)" }} />
              指标分析
            </h2>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {report.status_factors.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", borderRadius: 10, background: "var(--surface-alt)" }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 6, fontSize: "0.78rem", fontWeight: 600,
                  color: statusColors[f.status] ?? "var(--muted)",
                  background: `${statusColors[f.status] ?? "var(--muted)"}15`,
                }}>{f.status}</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "0.9rem" }}>{f.factor}</strong>
                  <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.6 }}>{f.insight}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enhancement Suggestions */}
      {report.enhancement_suggestions?.length > 0 && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <Shield size={18} style={{ color: "var(--accent)" }} />
              状态增强建议
            </h2>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {report.enhancement_suggestions.map((s, i) => {
              const p = priorityColors[s.priority] ?? priorityColors.medium;
              return (
                <div key={i} style={{ padding: "12px 16px", borderRadius: 10, background: p.bg, borderLeft: `3px solid ${p.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <strong style={{ fontSize: "0.9rem" }}>{s.category}</strong>
                    <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: 6, background: p.color, color: "white", fontWeight: 600 }}>
                      {p.label}优先
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.6 }}>{s.suggestion}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Supplement Recommendations */}
      {report.supplement_recommendations?.length > 0 && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <Pill size={18} style={{ color: "#8b5cf6" }} />
              补剂推荐
            </h2>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {report.supplement_recommendations.map((s, i) => (
              <div key={i} style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.12)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <strong style={{ fontSize: "0.95rem", color: "#8b5cf6" }}>{s.name}</strong>
                  <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{s.dosage}</span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: "0.85rem", color: "var(--muted)", flexWrap: "wrap" }}>
                  <span>服用时机：{s.timing}</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.5 }}>{s.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Training Adjustment + Recovery */}
      <div className="analytics-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {report.training_adjustment && (
          <div className="analytics-card" style={{ borderTop: "3px solid var(--ok)", marginBottom: 0 }}>
            <h3 style={{ margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <Dumbbell size={16} style={{ color: "var(--ok)" }} /> 训练调整
            </h3>
            <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.7, color: "var(--text)" }}>{report.training_adjustment}</p>
          </div>
        )}
        {report.recovery_protocol && (
          <div className="analytics-card" style={{ borderTop: "3px solid #3b82f6", marginBottom: 0 }}>
            <h3 style={{ margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <Heart size={16} style={{ color: "#3b82f6" }} /> 恢复方案
            </h3>
            <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.7, color: "var(--text)" }}>{report.recovery_protocol}</p>
          </div>
        )}
      </div>
    </>
  );
}
