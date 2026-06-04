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
  historical?: LevelEvaluation | null;     // 历史层: 全历史 (可选)
};

// 历史层固定用对比色 (深紫), 跟主层的段位色阶形成强对比
// 避免历史 vs 近期都用同一个段位色 → 用户看不出差异
const HISTORICAL_STROKE = "#7c3aed";  // 紫
const HISTORICAL_FILL = "#a78bfa";    // 浅紫

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

  // 关键: 动态计算雷达图的 max domain
  // 旧版固定 [0, 11] 显得用户都很差 (大部分用户最高 L6 中PRO 毕业)
  // 新版: max = max(recent, historical) + 2 余裕, 至少 6 (留 L0-L5 空间), 上限 11
  const maxObservedLevel = Math.max(
    evaluation.overall.level,
    historical?.overall.level ?? 0,
    ...DIMENSIONS.map((d) => evaluation.byDimension[d].level ?? 0),
    ...(historical ? DIMENSIONS.map((d) => historical.byDimension[d].level ?? 0) : []),
  );
  const radarMax = Math.min(11, Math.max(6, maxObservedLevel + 2));

  return (
    <div className="analytics-card" style={{ padding: 20 }}>
      <div className="analytics-card-header">
        <h2>能力水位雷达</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          最强项法 · {historical ? "近 90 天 vs 全历史最佳" : "近 90 天最佳"} · 域 0-{radarMax}
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

            {/* 历史层: 紫色对比色, 实线但适度透明, 显著可见 */}
            {historical && (
              <Radar
                name="全历史最佳"
                dataKey="historical"
                stroke={HISTORICAL_STROKE}
                fill={HISTORICAL_FILL}
                fillOpacity={0.22}
                strokeOpacity={0.85}
                strokeWidth={2}
                strokeDasharray="6 3"
              />
            )}

            {/* 主层: 段位色, 实线粗 */}
            <Radar
              name="近 90 天"
              dataKey="recent"
              stroke={overallColor}
              fill={overallColor}
              fillOpacity={0.45}
              strokeWidth={3}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 段位徽章 — 放在雷达下方 */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        <BadgeChip color={overallColor} label="近 90 天" level={evaluation.overall.level} text={evaluation.overall.label} />
        {historical && (
          <BadgeChip
            color={HISTORICAL_STROKE}
            label={
              historical.overall.level === evaluation.overall.level
                ? "历史最佳 (=近期)"
                : "历史最佳"
            }
            level={historical.overall.level}
            text={historical.overall.label}
            outline
          />
        )}
      </div>

      {historical && (
        <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 10, fontSize: "0.78rem", color: "var(--muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 3, background: overallColor, display: "inline-block", borderRadius: 2 }} />
            近 90 天
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 16,
                height: 3,
                background: HISTORICAL_STROKE,
                display: "inline-block",
                borderRadius: 2,
                backgroundImage: `repeating-linear-gradient(90deg, ${HISTORICAL_STROKE} 0 4px, transparent 4px 7px)`,
                backgroundColor: "transparent",
              }}
            />
            全历史最佳 (紫)
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
