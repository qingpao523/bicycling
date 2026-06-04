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

type Props = {
  evaluation: LevelEvaluation;             // 主层: 近 90 天
  historical?: LevelEvaluation | null;     // 淡层: 全历史 (可选)
};

export function LevelRadar({ evaluation, historical }: Props) {
  const radarData = DIMENSIONS.map((dim) => ({
    dimension: DIMENSION_META[dim].label,
    recent: evaluation.byDimension[dim].level ?? 0,
    historical: historical?.byDimension[dim].level ?? 0,
    fullMark: 11,
  }));

  const overallColor = LEVEL_BG[LEVEL_COLOR_BUCKET(evaluation.overall.level)];
  const histColor = historical
    ? LEVEL_BG[LEVEL_COLOR_BUCKET(historical.overall.level)]
    : "#94a3b8";

  return (
    <div className="analytics-card" style={{ padding: 20 }}>
      <div className="analytics-card-header">
        <h2>能力水位雷达</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          最强项法 · {historical ? "近 90 天 vs 全历史最佳" : "近 90 天最佳"}
        </span>
      </div>

      <div className="analytics-chart-container" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="72%">
            <PolarGrid stroke="rgba(0,0,0,0.1)" />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "#555" }} />
            <PolarRadiusAxis domain={[0, 11]} tick={{ fontSize: 9, fill: "#999" }} />

            {/* 淡层: 全历史 (虚线, 低透明度) */}
            {historical && (
              <Radar
                name="全历史"
                dataKey="historical"
                stroke={histColor}
                fill={histColor}
                fillOpacity={0.08}
                strokeOpacity={0.5}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}

            {/* 主层: 近 90 天 (实线, 主色) */}
            <Radar
              name="近 90 天"
              dataKey="recent"
              stroke={overallColor}
              fill={overallColor}
              fillOpacity={0.3}
              strokeWidth={2.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 段位徽章 — 放在雷达下方, 不再遮挡 */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        <BadgeChip color={overallColor} label="近 90 天" level={evaluation.overall.level} text={evaluation.overall.label} />
        {historical && (
          <BadgeChip
            color={histColor}
            label={
              historical.overall.level === evaluation.overall.level
                ? "历史最佳 (=近期)"
                : "历史最佳"
            }
            level={historical.overall.level}
            text={historical.overall.label}
            faded
          />
        )}
      </div>

      {historical && (
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 8, fontSize: "0.72rem", color: "var(--muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 2, background: overallColor, display: "inline-block" }} /> 近 90 天
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 2, background: histColor, display: "inline-block", borderBottom: `2px dashed ${histColor}` }} /> 全历史
          </span>
        </div>
      )}
    </div>
  );
}

function BadgeChip({
  color,
  label,
  level,
  text,
  faded,
}: {
  color: string;
  label: string;
  level: number;
  text: string;
  faded?: boolean;
}) {
  return (
    <div
      style={{
        background: color,
        color: "white",
        padding: "8px 16px",
        borderRadius: 12,
        textAlign: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        opacity: faded ? 0.72 : 1,
        border: faded ? "1px dashed rgba(255,255,255,0.5)" : "none",
      }}
    >
      <div style={{ fontSize: "0.68rem", opacity: 0.9 }}>{label}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{text}</div>
      <div style={{ fontSize: "0.68rem", opacity: 0.9 }}>L{level}/11</div>
    </div>
  );
}
