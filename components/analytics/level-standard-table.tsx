// components/analytics/level-standard-table.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import type { LevelEvaluation } from "@/lib/engine/cycling-levels";
import {
  DIMENSIONS,
  DIMENSION_META,
  LEVEL_TABLE,
  LEVEL_NAMES,
  LEVEL_COLOR_BUCKET,
  LEVEL_BG,
} from "@/lib/engine/cycling-levels";

type Props = {
  evaluation: LevelEvaluation;
  recent?: LevelEvaluation | null;
};

export function LevelStandardTable({ evaluation, recent }: Props) {
  const [open, setOpen] = useState(true); // 默认展开

  return (
    <div className="analytics-card">
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          padding: "12px 4px",
          cursor: "pointer",
          fontSize: "1rem",
          fontWeight: 600,
        }}
      >
        <span>
          <BookOpen size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          完整分级标准
        </span>
        {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: 16 }}>
            本系统基于 <strong>Coggan 功率训练分级</strong> + 中文骑友圈段位命名,
            采用 <strong>最强项法</strong> 评定综合段位 — 你的最强维度代表当前水位 (业余车手往往专精某项, 不可能全面 max)。
            {recent && " 表中实色高亮 = 全历史最佳所在格, 虚线边框 = 近 90 天所在格。"}
          </p>

          {/* 12×6 阈值表 */}
          <div className="level-table-wrap" style={{ overflowX: "auto", marginBottom: 16 }}>
            <table className="level-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: "var(--surface-alt, #f8fafc)" }}>
                  <th className="level-table-dim" style={{ padding: 8, textAlign: "left", borderBottom: "1px solid var(--line, #e5e7eb)" }}>维度</th>
                  {LEVEL_NAMES.map((name, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "8px 6px",
                        textAlign: "center",
                        borderBottom: "1px solid var(--line, #e5e7eb)",
                        background: LEVEL_BG[LEVEL_COLOR_BUCKET(i)],
                        color: "white",
                        fontSize: "0.7rem",
                      }}
                    >
                      L{i}<br />{name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIMENSIONS.map((dim) => {
                  const currentLevel = evaluation.byDimension[dim].level;
                  const histLevel = recent?.byDimension[dim].level ?? null;
                  return (
                    <tr key={dim}>
                      <td className="level-table-dim" style={{ padding: 8, fontWeight: 600, borderBottom: "1px solid var(--line, #e5e7eb)" }}>
                        {DIMENSION_META[dim].label} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({DIMENSION_META[dim].unit})</span>
                      </td>
                      {LEVEL_TABLE[dim].map((t, i) => {
                        const isCurrent = currentLevel === i;
                        // 历史最佳: 显示在与 current 不同的位置 (避免重复装饰)
                        const isHistOnly = histLevel === i && !isCurrent;
                        return (
                          <td
                            key={i}
                            style={{
                              padding: "6px 4px",
                              textAlign: "center",
                              borderBottom: "1px solid var(--line, #e5e7eb)",
                              background: isCurrent
                                ? LEVEL_BG[LEVEL_COLOR_BUCKET(i)]
                                : isHistOnly
                                  ? "var(--surface-alt, #f8fafc)"
                                  : undefined,
                              color: isCurrent ? "white" : undefined,
                              fontWeight: isCurrent || isHistOnly ? 700 : 400,
                              outline: isCurrent
                                ? "2px solid #1f2937"
                                : isHistOnly
                                  ? `2px dashed ${LEVEL_BG[LEVEL_COLOR_BUCKET(i)]}`
                                  : undefined,
                              position: "relative",
                            }}
                          >
                            {i === 0 ? "—" : t}
                            {isHistOnly && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: -2,
                                  right: -2,
                                  fontSize: "0.55rem",
                                  background: LEVEL_BG[LEVEL_COLOR_BUCKET(i)],
                                  color: "white",
                                  padding: "1px 4px",
                                  borderRadius: 3,
                                  fontWeight: 700,
                                }}
                                title={`近 90 天: ${recent!.byDimension[dim].value?.toFixed(2) ?? "?"} ${DIMENSION_META[dim].unit}`}
                              >
                                近
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 8 }}>
              ⬛ 实色高亮 = 全历史最佳所在格
              {recent && " · ⬜ 虚线边框 + 「近」标 = 近 90 天所在格 (与全历史相同则不重复标记)"}
            </p>
          </div>

          {/* 名词解释 */}
          <details style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer", fontSize: "0.88rem", fontWeight: 600 }}>📖 名词解释</summary>
            <div style={{ fontSize: "0.84rem", color: "var(--muted)", padding: "10px 0", lineHeight: 1.7 }}>
              <p><strong>W/kg</strong>: 功率除以体重, 反映绝对耐力水平。同等功率下越轻 W/kg 越高。</p>
              <p><strong>FTP (Functional Threshold Power)</strong>: 60 分钟最大持续输出功率, 衡量阈值能力的核心指标。</p>
              <p><strong>VO2max</strong>: 最大摄氧量 (ml/kg/min), 决定高强度天花板, 由心肺基因 + 训练共同决定。</p>
              <p><strong>木桶短板法</strong>: 综合段位 = 6 维度中最低的那个。理由: 真实比赛 / 长距离骑行中, 最弱维度决定你的赛事完成度, 教练学上提示训练应优先补短板。</p>
            </div>
          </details>

          {/* 来源 */}
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", borderTop: "1px solid var(--line, #e5e7eb)", paddingTop: 10, marginTop: 8 }}>
            数据来源: Coggan & Allen 《Training and Racing with a Power Meter》第 3 版 · 段位命名参考小红书骑友圈共识 · 如对阈值有疑问请联系 admin。
          </div>
        </div>
      )}
    </div>
  );
}
