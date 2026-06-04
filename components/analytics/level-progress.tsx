// components/analytics/level-progress.tsx
"use client";

import type { LevelEvaluation } from "@/lib/engine/cycling-levels";
import { DIMENSIONS, DIMENSION_META, LEVEL_TABLE, LEVEL_NAMES, LEVEL_COLOR_BUCKET, LEVEL_BG } from "@/lib/engine/cycling-levels";

type Props = { evaluation: LevelEvaluation };

export function LevelProgress({ evaluation }: Props) {
  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>6 维能力进度</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>悬停阈值线查看段位</span>
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        {DIMENSIONS.map((dim) => {
          const ev = evaluation.byDimension[dim];
          const meta = DIMENSION_META[dim];
          const thresholds = LEVEL_TABLE[dim];
          const maxValue = thresholds[11] * 1.05;
          const currentPct = ev.value !== null ? Math.min((ev.value / maxValue) * 100, 100) : 0;
          const color = LEVEL_BG[LEVEL_COLOR_BUCKET(ev.level ?? 0)];

          return (
            <div key={dim}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <strong style={{ fontSize: "0.92rem" }}>{meta.label}</strong>
                {ev.value !== null ? (
                  <span style={{ fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>{ev.value.toFixed(2)} {meta.unit}</span>
                    <span
                      style={{
                        marginLeft: 8,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: color,
                        color: "white",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      {ev.label} L{ev.level}
                    </span>
                  </span>
                ) : (
                  <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>— 数据不足</span>
                )}
              </div>

              {/* 进度条 + 阈值线 */}
              <div
                style={{
                  position: "relative",
                  height: 16,
                  background: "var(--line, #e5e7eb)",
                  borderRadius: 8,
                  overflow: "visible",
                }}
              >
                {/* 当前值填充 */}
                {ev.value !== null && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: "100%",
                      width: `${currentPct}%`,
                      background: color,
                      borderRadius: 8,
                      transition: "width 0.6s",
                    }}
                  />
                )}

                {/* 12 段位阈值刻度 */}
                {thresholds.map((t, i) => {
                  if (i === 0) return null;
                  const leftPct = (t / maxValue) * 100;
                  return (
                    <div
                      key={i}
                      title={`L${i} ${LEVEL_NAMES[i]} 阈值: ${t} ${meta.unit}`}
                      style={{
                        position: "absolute",
                        left: `${leftPct}%`,
                        top: -2,
                        height: 20,
                        width: 1,
                        background: "rgba(0,0,0,0.3)",
                        cursor: "help",
                      }}
                    />
                  );
                })}
              </div>

              {/* 距下一级提示 */}
              {ev.nextLabel && ev.gapValue !== undefined && ev.gapValue > 0 && (
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4 }}>
                  ▶ 距 {ev.nextLabel} 还差 {ev.gapValue.toFixed(2)} {meta.unit}
                  {ev.gapWatts !== undefined && ` (~${ev.gapWatts} W)`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
