"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { ArrowUp, ArrowDown, Minus, Sparkles, Clock, ArrowRight } from "lucide-react";

interface PowerData {
  power: number;
  wpkg: number | null;
}

interface Props {
  classification: { type: string; confidence: number };
  scores: { neuromuscular: number; anaerobic: number; vo2max: number; threshold: number };
  previousScores: { neuromuscular: number; anaerobic: number; vo2max: number; threshold: number };
  powers: {
    neuromuscular: PowerData | null;
    anaerobic: PowerData | null;
    vo2max: PowerData | null;
    threshold: PowerData | null;
  };
  suggestion: string | null;
}

interface AiClassificationState {
  type: string;
  target: string | null;
  gap: string | null;
  generatedAt: string;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString("zh-CN");
}

export function PowerProfileDetailView({ classification, scores, previousScores, powers, suggestion }: Props) {
  const [aiClass, setAiClass] = useState<AiClassificationState | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analytics/ai-report", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          if (data.report?.rider_type_analysis?.current_type) {
            setAiClass({
              type: data.report.rider_type_analysis.current_type,
              target: data.report.rider_type_analysis.target_suggestion ?? null,
              gap: data.report.rider_type_analysis.gap_analysis ?? null,
              generatedAt: data.generatedAt,
            });
          }
        }
      } finally {
        setAiLoading(false);
      }
    })();
  }, []);

  const displayClassification = aiClass
    ? { type: aiClass.type, confidence: null as number | null, source: "ai" as const }
    : { type: classification.type, confidence: classification.confidence, source: "rules" as const };

  const radarData = [
    { dimension: "神经肌肉 (5s)", 当前: scores.neuromuscular, 上个周期: previousScores.neuromuscular, fullMark: 100 },
    { dimension: "无氧 (1min)", 当前: scores.anaerobic, 上个周期: previousScores.anaerobic, fullMark: 100 },
    { dimension: "VO2max (5min)", 当前: scores.vo2max, 上个周期: previousScores.vo2max, fullMark: 100 },
    { dimension: "阈值 (20min)", 当前: scores.threshold, 上个周期: previousScores.threshold, fullMark: 100 },
  ];

  const dimensions = [
    { label: "神经肌肉 (5s)", key: "neuromuscular" as const, power: powers.neuromuscular },
    { label: "无氧 (1min)", key: "anaerobic" as const, power: powers.anaerobic },
    { label: "VO2max (5min)", key: "vo2max" as const, power: powers.vo2max },
    { label: "阈值 (20min)", key: "threshold" as const, power: powers.threshold },
  ];

  function trendFor(key: keyof typeof scores) {
    const diff = scores[key] - previousScores[key];
    if (diff > 3) return { icon: ArrowUp, color: "var(--ok)", text: `+${diff.toFixed(0)}` };
    if (diff < -3) return { icon: ArrowDown, color: "var(--danger)", text: `${diff.toFixed(0)}` };
    return { icon: Minus, color: "var(--muted)", text: "持平" };
  }

  return (
    <>
      {/* Classification Card */}
      <div className="analytics-card" style={{ padding: 28, background: "linear-gradient(135deg, rgba(31,87,214,0.04), rgba(124,58,237,0.04))" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>骑手类型</span>
          {displayClassification.source === "ai" ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.7rem", padding: "2px 8px", borderRadius: 6, background: "linear-gradient(135deg, #1f57d6, #7c3aed)", color: "white", fontWeight: 600 }}>
              <Sparkles size={10} /> AI 深度分析
            </span>
          ) : (
            <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 6, background: "var(--surface-alt)", color: "var(--muted)", fontWeight: 600 }}>
              规则引擎
            </span>
          )}
        </div>
        <div style={{ textAlign: "center", fontSize: "2.2rem", fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", color: "var(--accent)" }}>
          {displayClassification.type}
        </div>
        <div style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
          {displayClassification.source === "ai" && aiClass
            ? `基于 AI 报告 · ${formatRelativeTime(aiClass.generatedAt)}生成`
            : displayClassification.confidence !== null
              ? `置信度 ${displayClassification.confidence}%`
              : ""}
        </div>

        {aiClass && (aiClass.target || aiClass.gap) && (
          <div style={{ marginTop: 16, padding: "12px 14px", background: "white", borderRadius: 10, fontSize: "0.85rem" }}>
            {aiClass.target && (
              <div style={{ marginBottom: aiClass.gap ? 6 : 0 }}>
                <strong style={{ color: "var(--accent)" }}>建议方向：</strong>
                <span style={{ color: "var(--text)" }}>{aiClass.target}</span>
              </div>
            )}
            {aiClass.gap && (
              <div style={{ color: "var(--muted)", fontSize: "0.82rem", lineHeight: 1.6 }}>{aiClass.gap}</div>
            )}
          </div>
        )}

        {!aiClass && !aiLoading && (
          <div style={{ marginTop: 16, textAlign: "center", fontSize: "0.82rem", color: "var(--muted)" }}>
            <Link href="/analytics/data" style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              前往数据分析页生成 AI 深度分析以获取更精准的类型判断 <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </div>

      {/* Radar Chart */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>四维能力雷达图</h2>
          <div style={{ display: "flex", gap: 16, fontSize: "0.82rem" }}>
            <span style={{ color: "#1f57d6" }}>● 当前（近90天）</span>
            <span style={{ color: "#9ca3af" }}>● 上个周期（90-180天）</span>
          </div>
        </div>
        <div className="analytics-chart-container" style={{ height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="rgba(0,0,0,0.1)" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12, fill: "#555" }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#999" }} />
              <Radar
                name="上个周期"
                dataKey="上个周期"
                stroke="#9ca3af"
                fill="#9ca3af"
                fillOpacity={0.15}
                strokeDasharray="4 2"
              />
              <Radar
                name="当前"
                dataKey="当前"
                stroke="#1f57d6"
                fill="#1f57d6"
                fillOpacity={0.35}
                strokeWidth={2.5}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Scores */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>四维能力详情</h2>
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>0-100 百分位 · Coggan 参考</span>
        </div>
        <div style={{ display: "grid", gap: 18 }}>
          {dimensions.map((dim) => {
            const score = scores[dim.key];
            const trend = trendFor(dim.key);
            return (
              <div key={dim.key}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: "0.92rem" }}>{dim.label}</strong>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.78rem", color: trend.color }}>
                      <trend.icon size={12} /> {trend.text}
                    </span>
                  </div>
                  <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    {dim.power ? `${dim.power.power}W · ${dim.power.wpkg?.toFixed(2)} W/kg` : "数据不足"}
                  </span>
                </div>
                <div style={{ height: 10, background: "var(--line)", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${score}%`,
                    background: score >= 70 ? "var(--ok)" : score >= 50 ? "var(--accent)" : score >= 30 ? "var(--cta)" : "var(--danger)",
                    borderRadius: 5,
                    transition: "width 0.6s",
                  }} />
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4 }}>
                  百分位: {score} · {score >= 90 ? "Pro 级" : score >= 80 ? "Cat 1" : score >= 70 ? "Cat 2" : score >= 60 ? "Cat 3" : score >= 50 ? "Cat 4" : score >= 30 ? "Cat 5" : "入门"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Training Suggestion */}
      {suggestion && (
        <div className="analytics-card" style={{ borderLeft: "4px solid var(--cta)" }}>
          <div className="analytics-card-header">
            <h2>针对性训练建议</h2>
            <span style={{ fontSize: "0.82rem", color: "var(--cta)" }}>基于最薄弱维度</span>
          </div>
          <p style={{ color: "var(--muted)", margin: 0 }}>{suggestion}</p>
        </div>
      )}
    </>
  );
}
