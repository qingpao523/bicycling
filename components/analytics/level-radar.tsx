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
  evaluation: LevelEvaluation;             // 主层: 全历史 (与功率曲线同口径)
  recent?: LevelEvaluation | null;         // 对比层: 近 90 天 (可选)
};

const COMPARE_STROKE = "#7c3aed";  // 紫
const COMPARE_FILL = "#a78bfa";    // 浅紫

export function LevelRadar({ evaluation, recent }: Props) {
  const radarData = DIMENSIONS.map((dim) => ({
    dimension: DIMENSION_META[dim].label,
    allTime: evaluation.byDimension[dim].level ?? 0,
    recent: recent?.byDimension[dim].level ?? 0,
    fullMark: 11,
  }));

  const overallColor = LEVEL_BG[LEVEL_COLOR_BUCKET(evaluation.overall.level)];

  const maxObservedLevel = Math.max(
    evaluation.overall.level,
    recent?.overall.level ?? 0,
    ...DIMENSIONS.map((d) => evaluation.byDimension[d].level ?? 0),
    ...(recent ? DIMENSIONS.map((d) => recent.byDimension[d].level ?? 0) : []),
  );
  const radarMax = Math.min(11, Math.max(6, maxObservedLevel + 2));

  return (
    <div className="analytics-card" style={{ padding: 20 }}>
      <div className="analytics-card-header">
        <h2>能力水位雷达</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          最强项法 · {recent ? "全历史最佳 vs 近 90 天" : "全历史最佳"} · 域 0-{radarMax}
        </span>
      </div>

      <div className="analytics-chart-container" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="78%">
            <PolarGrid stroke="rgba(0,0,0,0.12)" />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "#555" }} />
            <PolarRadiusAxis
              domain={[0, radarMax]}
              tickCount={radarMax + 1}
              tick={{ fontSize: 9, fill: "#999" }}
            />

            {/* 近 90 天对比层: 紫色虚线 */}
            {recent && (
              <Radar
                name="近 90 天"
                dataKey="recent"
                stroke={COMPARE_STROKE}
                fill={COMPARE_FILL}
                fillOpacity={0.22}
                strokeOpacity={0.85}
                strokeWidth={2}
                strokeDasharray="6 3"
              />
            )}

            {/* 主层: 全历史, 段位色实线 */}
            <Radar
              name="全历史最佳"
              dataKey="allTime"
              stroke={overallColor}
              fill={overallColor}
              fillOpacity={0.45}
              strokeWidth={3}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 段位徽章 */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        <BadgeChip color={overallColor} label="全历史最佳" level={evaluation.overall.level} text={evaluation.overall.label} />
        {recent && (
          <BadgeChip
            color={COMPARE_STROKE}
            label={
              recent.overall.level === evaluation.overall.level
                ? "近 90 天 (=全历史)"
                : "近 90 天"
            }
            level={recent.overall.level}
            text={recent.overall.label}
            outline
          />
        )}
      </div>

      {recent && (
        <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 10, fontSize: "0.78rem", color: "var(--muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 3, background: overallColor, display: "inline-block", borderRadius: 2 }} />
            全历史最佳
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 16,
                height: 3,
                background: COMPARE_STROKE,
                display: "inline-block",
                borderRadius: 2,
                backgroundImage: `repeating-linear-gradient(90deg, ${COMPARE_STROKE} 0 4px, transparent 4px 7px)`,
                backgroundColor: "transparent",
              }}
            />
            近 90 天 (紫)
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
  outline,
}: {
  color: string;
  label: string;
  level: number;
  text: string;
  outline?: boolean;
}) {
  return (
    <div
      style={{
        background: outline ? "white" : color,
        color: outline ? color : "white",
        padding: "8px 16px",
        borderRadius: 12,
        textAlign: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        border: outline ? `2px solid ${color}` : "none",
      }}
    >
      <div style={{ fontSize: "0.68rem", opacity: 0.9 }}>{label}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{text}</div>
      <div style={{ fontSize: "0.68rem", opacity: 0.9 }}>L{level}/11</div>
    </div>
  );
}
