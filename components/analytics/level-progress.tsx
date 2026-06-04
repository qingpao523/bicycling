// components/analytics/level-progress.tsx
"use client";

import type { LevelEvaluation } from "@/lib/engine/cycling-levels";
import { DIMENSIONS, DIMENSION_META, LEVEL_TABLE, LEVEL_NAMES, LEVEL_COLOR_BUCKET, LEVEL_BG } from "@/lib/engine/cycling-levels";

type Props = {
  evaluation: LevelEvaluation;             // 主层: 近 90 天
  historical?: LevelEvaluation | null;     // 历史峰值标记 (可选)
};

// 历史色固定紫,跟段位色阶强对比,统一与 LevelRadar
const HIST_COLOR = "#7c3aed";

export function LevelProgress({ evaluation, historical }: Props) {
  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>6 维能力进度</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {historical ? "实色填充 = 近 90 天 · 紫色叠层 + 标 = 历史最高" : "悬停阈值线查看段位"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 22 }}>
        {DIMENSIONS.map((dim) => {
          const ev = evaluation.byDimension[dim];
          const histEv = historical?.byDimension[dim];
          const meta = DIMENSION_META[dim];
          const thresholds = LEVEL_TABLE[dim];
          const maxValue = thresholds[11] * 1.05;
          const currentPct = ev.value !== null ? Math.min((ev.value / maxValue) * 100, 100) : 0;
          const histPct = histEv?.value != null ? Math.min((histEv.value / maxValue) * 100, 100) : null;
          const color = LEVEL_BG[LEVEL_COLOR_BUCKET(ev.level ?? 0)];
          const histHigher = histPct !== null && histPct > currentPct + 1;

          return (
            <div key={dim}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: "0.92rem" }}>{meta.label}</strong>
                {ev.value !== null ? (
                  <span style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>{ev.value.toFixed(2)} {meta.unit}</span>
                    <span
                      style={{
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

              {/* 进度条 + 阈值线 + 历史叠层 */}
              <div
                style={{
                  position: "relative",
                  height: 18,
                  background: "var(--line, #e5e7eb)",
                  borderRadius: 9,
                  overflow: "visible",
                }}
              >
                {/* 历史峰值半透明紫叠层 — 当历史 > 近期时显示, 像"曾经到这里" */}
                {histHigher && histPct !== null && (
                  <div
                    title={`历史最高: ${histEv!.value!.toFixed(2)} ${meta.unit} (L${histEv!.level})`}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: "100%",
                      width: `${histPct}%`,
                      background: HIST_COLOR,
                      opacity: 0.18,
                      borderRadius: 9,
                      cursor: "help",
                    }}
                  />
                )}

                {/* 当前值实色填充 (主层, 在上) */}
                {ev.value !== null && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: "100%",
                      width: `${currentPct}%`,
                      background: color,
                      borderRadius: 9,
                      transition: "width 0.6s",
                    }}
                  />
                )}

                {/* 历史峰值竖线标记 — 紫色 3px + 白色阴影, 显著可见, 顶上不挂标签防遮挡上方文字 */}
                {histPct !== null && (
                  <div
                    title={`历史最高: ${histEv!.value!.toFixed(2)} ${meta.unit} (L${histEv!.level})`}
                    style={{
                      position: "absolute",
                      left: `${histPct}%`,
                      top: -4,
                      transform: "translateX(-50%)",
                      width: 3,
                      height: 26,
                      background: HIST_COLOR,
                      borderRadius: 2,
                      boxShadow: `0 0 0 2px white, 0 1px 4px rgba(124,58,237,0.4)`,
                      cursor: "help",
                      zIndex: 2,
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
                        height: 22,
                        width: 1,
                        background: "rgba(0,0,0,0.25)",
                        cursor: "help",
                      }}
                    />
                  );
                })}
              </div>

              {/* 进度条下方信息行: 左 = 距下一级 / 右 = 历史最高徽章 (独立行避免遮挡) */}
              {(ev.nextLabel && ev.gapValue !== undefined && ev.gapValue > 0) ||
              (histEv?.value != null && histEv.level != null) ? (
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {ev.nextLabel && ev.gapValue !== undefined && ev.gapValue > 0
                      ? `▶ 距 ${ev.nextLabel} 还差 ${ev.gapValue.toFixed(2)} ${meta.unit}${
                          ev.gapWatts !== undefined ? ` (~${ev.gapWatts} W)` : ""
                        }`
                      : ""}
                  </span>
                  {histEv?.value != null && histEv.level != null && (
                    <span
                      title={`历史最高: ${histEv.value.toFixed(2)} ${meta.unit}`}
                      style={{
                        padding: "2px 10px",
                        borderRadius: 6,
                        background: "white",
                        color: HIST_COLOR,
                        border: `2px solid ${HIST_COLOR}`,
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        whiteSpace: "nowrap",
                      }}
                    >
                      🏆 史最高 L{histEv.level} · {histEv.value.toFixed(2)} {meta.unit}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
