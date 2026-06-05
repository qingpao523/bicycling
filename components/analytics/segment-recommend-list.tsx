"use client";
import { Target } from "lucide-react";
import type { SegmentRecommendation } from "@/lib/engine/segments";

type Props = { recommendations: SegmentRecommendation[] };

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function SegmentRecommendList({ recommendations }: Props) {
  if (!recommendations.length) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header"><h2>赛段推荐</h2></div>
        <p style={{ color: "var(--muted)", padding: 16 }}>暂无推荐 (需至少 2 次尝试 + FTP/体重配置)</p>
      </div>
    );
  }

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2><Target size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />赛段推荐</h2>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>有提升潜力的赛段</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {recommendations.map((r) => (
          <div key={r.segment.id} style={{ padding: 12, border: "1px solid var(--line, #e5e7eb)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <strong style={{ fontSize: "0.92rem" }}>{r.segment.name}</strong>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{r.reason}</div>
            </div>
            <span style={{ padding: "4px 10px", borderRadius: 6, background: r.confidence === "high" ? "#10b981" : "#f59e0b", color: "white", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" }}>
              -{r.gapSeconds}s 潜力
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
