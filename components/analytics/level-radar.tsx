// components/analytics/level-radar.tsx
"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { LevelEvaluation } from "@/lib/engine/cycling-levels";
import { DIMENSIONS, DIMENSION_META, LEVEL_COLOR_BUCKET, LEVEL_BG } from "@/lib/engine/cycling-levels";

type Props = { evaluation: LevelEvaluation };

export function LevelRadar({ evaluation }: Props) {
  const radarData = DIMENSIONS.map((dim) => ({
    dimension: DIMENSION_META[dim].label,
    level: evaluation.byDimension[dim].level ?? 0,
    fullMark: 11,
  }));

  const overallColor = LEVEL_BG[LEVEL_COLOR_BUCKET(evaluation.overall.level)];

  return (
    <div className="analytics-card" style={{ padding: 20 }}>
      <div className="analytics-card-header">
        <h2>能力水位雷达</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>木桶短板法 · 近 90 天最佳</span>
      </div>

      <div style={{ position: "relative" }}>
        <div className="analytics-chart-container" style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="rgba(0,0,0,0.1)" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "#555" }} />
              <PolarRadiusAxis domain={[0, 11]} tick={{ fontSize: 9, fill: "#999" }} />
              <Radar
                dataKey="level"
                stroke={overallColor}
                fill={overallColor}
                fillOpacity={0.3}
                strokeWidth={2.5}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 中心段位徽章 */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: overallColor,
            color: "white",
            padding: "10px 16px",
            borderRadius: 12,
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: "0.7rem", opacity: 0.9 }}>综合段位</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{evaluation.overall.label}</div>
          <div style={{ fontSize: "0.7rem", opacity: 0.9 }}>L{evaluation.overall.level}/11</div>
        </div>
      </div>
    </div>
  );
}
