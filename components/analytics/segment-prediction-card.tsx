"use client";
import { Clock, CheckCircle } from "lucide-react";
import type { SegmentPrediction } from "@/lib/engine/segments";
import type { Segment } from "@/lib/types";

type Props = { prediction: SegmentPrediction; segment: Segment };

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m${s % 60}s` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function SegmentPredictionCard({ prediction, segment }: Props) {
  if (prediction.predictedWeeks === 0) {
    return (
      <div className="analytics-card" style={{ textAlign: "center", padding: 24 }}>
        <CheckCircle size={28} style={{ color: "#10b981" }} />
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>已达成目标 {fmtTime(prediction.targetTime)}</p>
      </div>
    );
  }

  const isInfinity = !Number.isFinite(prediction.predictedWeeks);

  return (
    <div className="analytics-card" style={{ padding: 20 }}>
      <div className="analytics-card-header">
        <h2><Clock size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />进步预测 — {segment.name}</h2>
        <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: 6, background: prediction.confidence === "high" ? "#10b981" : prediction.confidence === "medium" ? "#f59e0b" : "#94a3b8", color: "white", fontWeight: 600 }}>
          {prediction.confidence === "high" ? "高置信" : prediction.confidence === "medium" ? "中等" : "低"}
        </span>
      </div>
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ fontSize: "2rem", fontWeight: 700, color: isInfinity ? "#ef4444" : "var(--accent, #1f57d6)" }}>
          {isInfinity ? "—" : prediction.predictedWeeks}
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{isInfinity ? prediction.note : "周后达成"}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)", borderTop: "1px solid var(--line, #e5e7eb)", paddingTop: 10, marginTop: 8 }}>
        <span>当前最快: {fmtTime(prediction.currentBest)}</span>
        <span>目标: {fmtTime(prediction.targetTime)}</span>
        {!isInfinity && <span>每周 -{prediction.weeklyGainSeconds.toFixed(1)}s</span>}
      </div>
    </div>
  );
}
