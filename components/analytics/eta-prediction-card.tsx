// components/analytics/eta-prediction-card.tsx
"use client";

import type { EtaPrediction } from "@/lib/engine/level-eta";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";

type Props = { eta: EtaPrediction; nextLabel?: string };

const CONFIDENCE_LABEL: Record<EtaPrediction["confidence"], string> = {
  high: "高置信度",
  medium: "中等置信度",
  low: "低置信度 (数据有限)",
};

const CONFIDENCE_COLOR: Record<EtaPrediction["confidence"], string> = {
  high: "#10b981",
  medium: "#f59e0b",
  low: "#94a3b8",
};

export function EtaPredictionCard({ eta, nextLabel }: Props) {
  const isDecline = !Number.isFinite(eta.weeks);
  const isAchieved = eta.weeks === 0;

  if (isAchieved) {
    return (
      <div className="analytics-card" style={{ textAlign: "center", padding: 24 }}>
        <CheckCircle size={32} style={{ color: "#10b981" }} />
        <h3 style={{ margin: "12px 0 4px" }}>✓ 已达成下一段位</h3>
        <p style={{ color: "var(--muted)", margin: 0 }}>{eta.note}</p>
      </div>
    );
  }

  if (isDecline) {
    return (
      <div className="analytics-card" style={{ padding: 24, borderLeft: "4px solid #ef4444" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <AlertTriangle size={18} style={{ color: "#ef4444" }} />
          <strong>暂无法预测达成时间</strong>
        </div>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.88rem" }}>{eta.note}</p>
      </div>
    );
  }

  return (
    <div className="analytics-card" style={{ padding: 24 }}>
      <div className="analytics-card-header">
        <h2>
          <Clock size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          预计 ETA — {nextLabel ?? "下一段位"}
        </h2>
        <span
          style={{
            fontSize: "0.75rem",
            padding: "2px 8px",
            borderRadius: 6,
            background: CONFIDENCE_COLOR[eta.confidence],
            color: "white",
            fontWeight: 600,
          }}
        >
          {CONFIDENCE_LABEL[eta.confidence]}
        </span>
      </div>

      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--accent, #1f57d6)" }}>
          {eta.weeks}
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>周后达成</div>
        <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 8 }}>
          区间: {eta.rangeWeeks[0]}-{eta.rangeWeeks[1]} 周
        </div>
      </div>

      <div style={{ fontSize: "0.78rem", color: "var(--muted)", borderTop: "1px solid var(--line, #e5e7eb)", paddingTop: 10 }}>
        基于近 {eta.basis.dataPoints} 天 PMC 趋势 · 周均 +{(eta.basis.weeklyGainWkg * 1000).toFixed(1)} mW/kg
      </div>
    </div>
  );
}
