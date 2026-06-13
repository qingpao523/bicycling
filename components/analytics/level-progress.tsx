// components/analytics/level-progress.tsx
"use client";

import type { LevelEvaluation, Dimension } from "@/lib/engine/cycling-levels";
import { DIMENSIONS, DIMENSION_META, LEVEL_TABLE, LEVEL_NAMES, LEVEL_COLOR_BUCKET, LEVEL_BG } from "@/lib/engine/cycling-levels";

type Props = {
  evaluation: LevelEvaluation;             // 全历史最佳
  recent?: LevelEvaluation | null;         // 近 90 天
};

const REF_COLOR = "#7c3aed";

const SHORT_LABELS: Record<string, string> = {
  sprint5s: "5s",
  burst1min: "1min",
  vo2_5min: "5min",
  ftp_20min: "20min",
  endurance_60min: "60min",
  vo2max_mlkgmin: "VO2max",
};

export function LevelProgress({ evaluation, recent }: Props) {
  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>6 维能力进度</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {recent ? "进度条 = 近 90 天 · 紫色标 = 全历史最佳" : "悬停阈值线查看段位"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 22 }}>
        {DIMENSIONS.map((dim) => {
          const allTimeEv = evaluation.byDimension[dim];
          const recentEv = recent?.byDimension[dim];
          const ev = recentEv ?? allTimeEv;
          const refEv = recent ? allTimeEv : null;
          const meta = DIMENSION_META[dim];
          const thresholds = LEVEL_TABLE[dim];
          const maxValue = thresholds[11] * 1.05;
          const primaryPct = ev.value !== null ? Math.min((ev.value / maxValue) * 100, 100) : 0;
          const refPct = refEv?.value != null ? Math.min((refEv.value / maxValue) * 100, 100) : null;
          const color = LEVEL_BG[LEVEL_COLOR_BUCKET(ev.level ?? 0)];
          const refAhead = refPct !== null && refPct > primaryPct + 1;

          return (
            <div key={dim}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: "0.92rem" }}>{SHORT_LABELS[dim] ?? meta.label}</strong>
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

              {/* 进度条 + 阈值线 + 全历史参考 */}
              <div
                style={{
                  position: "relative",
                  height: 18,
                  background: "var(--line, #e5e7eb)",
                  borderRadius: 9,
                  overflow: "visible",
                }}
              >
                {/* 全历史半透明紫叠层 — 当全历史 > 近期时显示 */}
                {refAhead && refPct !== null && (
                  <div
                    title={`全历史: ${refEv!.value!.toFixed(2)} ${meta.unit} (L${refEv!.level})`}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: "100%",
                      width: `${refPct}%`,
                      background: REF_COLOR,
                      opacity: 0.18,
                      borderRadius: 9,
                      cursor: "help",
                    }}
                  />
                )}

                {/* 近 90 天实色填充 (主层) */}
                {ev.value !== null && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: "100%",
                      width: `${primaryPct}%`,
                      background: color,
                      borderRadius: 9,
                      transition: "width 0.6s",
                    }}
                  />
                )}

                {/* 全历史竖线标记 — 紫色 */}
                {refPct !== null && (
                  <div
                    title={`全历史: ${refEv!.value!.toFixed(2)} ${meta.unit} (L${refEv!.level})`}
                    style={{
                      position: "absolute",
                      left: `${refPct}%`,
                      top: -4,
                      transform: "translateX(-50%)",
                      width: 3,
                      height: 26,
                      background: REF_COLOR,
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

              {/* 进度条下方: 左 = 距下一级 / 右 = 全历史徽章 */}
              {(ev.nextLabel && ev.gapValue !== undefined && ev.gapValue > 0) ||
              (refEv?.value != null && refEv.level != null) ? (
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
                  {refEv?.value != null && refEv.level != null && (
                    <span
                      title={`全历史: ${refEv.value.toFixed(2)} ${meta.unit}`}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "white",
                        color: REF_COLOR,
                        border: `2px solid ${REF_COLOR}`,
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      全历史 L{refEv.level} · {refEv.value.toFixed(2)}
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
