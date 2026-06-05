"use client";
import { TrendingUp } from "lucide-react";
import type { CausationResult } from "@/lib/engine/segments";

type Props = { causation: CausationResult };

export function SegmentCausationCard({ causation }: Props) {
  if (!causation.insights.length && !causation.prImprovements.length) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header"><h2>训练因果分析</h2></div>
        <p style={{ color: "var(--muted)", padding: 16 }}>暂无足够 PR 数据做因果分析 (需至少 2 次 PR)</p>
      </div>
    );
  }

  return (
    <div className="analytics-card" style={{ borderLeft: "4px solid #8b5cf6" }}>
      <div className="analytics-card-header">
        <h2><TrendingUp size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />训练因果分析</h2>
        <span style={{ fontSize: "0.78rem", color: "#8b5cf6" }}>{causation.prImprovements.length} 次 PR 进步</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {causation.insights.map((insight, i) => (
          <div key={i} style={{ padding: "10px 14px", background: "var(--surface-alt, #f8fafc)", borderRadius: 8, fontSize: "0.88rem", borderLeft: "3px solid #8b5cf6" }}>
            {insight}
          </div>
        ))}
      </div>
      {causation.strongestCorrelation && (
        <div style={{ marginTop: 12, fontSize: "0.82rem", color: "var(--muted)" }}>
          最强关联: {causation.strongestCorrelation.trainingType} 训练 → 赛段平均快 {causation.strongestCorrelation.effectSize.toFixed(0)}s
        </div>
      )}
    </div>
  );
}
