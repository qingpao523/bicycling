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

const LEVEL_GROUPS: { label: string; cols: number[]; subs?: string[] }[] = [
  { label: "入门", cols: [0] },
  { label: "小PRO", cols: [1, 2, 3], subs: ["入门", "成长", "毕业"] },
  { label: "中PRO", cols: [4, 5, 6], subs: ["入门", "成长", "毕业"] },
  { label: "大PRO", cols: [7, 8, 9], subs: ["入门", "成长", "毕业"] },
  { label: "准职业", cols: [10] },
  { label: "职业", cols: [11] },
];

const SHORT_DIM_LABELS: Record<string, string> = {
  sprint5s: "5s",
  burst1min: "1min",
  vo2_5min: "5min",
  ftp_20min: "20min",
  endurance_60min: "60min",
  vo2max_mlkgmin: "VO2max",
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
            本系统基于 <strong>Coggan 功率训练分级</strong> + 中文骑友圈段位命名，采用 <strong>最强项法</strong> 评定综合段位。
          </p>

          {/* 12×6 阈值表 */}
          <div className="level-table-wrap" style={{ marginBottom: 16 }}>
            <table className="level-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              {/* PC header: one row, each level individually */}
              <thead className="level-header-pc">
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
              {/* Mobile header: three rows — group name / sub-name / L number */}
              <thead className="level-header-mobile">
                <tr style={{ background: "var(--surface-alt, #f8fafc)" }}>
                  <th className="level-table-dim" rowSpan={3} style={{ padding: 8, textAlign: "left", borderBottom: "1px solid var(--line, #e5e7eb)" }}>维度</th>
                  {LEVEL_GROUPS.map((g) => (
                    <th
                      key={g.label}
                      colSpan={g.cols.length}
                      rowSpan={g.subs ? 1 : 2}
                      style={{
                        padding: "3px 2px",
                        textAlign: "center",
                        borderBottom: "none",
                        background: LEVEL_BG[LEVEL_COLOR_BUCKET(g.cols[0])],
                        color: "white",
                        fontSize: "0.56rem",
                        fontWeight: 700,
                      }}
                    >
                      {g.label}
                    </th>
                  ))}
                </tr>
                <tr style={{ background: "var(--surface-alt, #f8fafc)" }}>
                  {LEVEL_GROUPS.filter((g) => g.subs).flatMap((g) =>
                    g.subs!.map((sub, si) => (
                      <th
                        key={`${g.label}-${si}`}
                        style={{
                          padding: "2px 1px",
                          textAlign: "center",
                          borderBottom: "none",
                          background: LEVEL_BG[LEVEL_COLOR_BUCKET(g.cols[si])],
                          color: "rgba(255,255,255,0.85)",
                          fontSize: "0.5rem",
                          fontWeight: 500,
                        }}
                      >
                        {sub}
                      </th>
                    ))
                  )}
                </tr>
                <tr style={{ background: "var(--surface-alt, #f8fafc)" }}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <th
                      key={`L${i}`}
                      style={{
                        padding: "1px",
                        textAlign: "center",
                        borderBottom: "1px solid var(--line, #e5e7eb)",
                        background: LEVEL_BG[LEVEL_COLOR_BUCKET(i)],
                        color: "rgba(255,255,255,0.7)",
                        fontSize: "0.45rem",
                        fontWeight: 400,
                      }}
                    >
                      L{i}
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
                        {SHORT_DIM_LABELS[dim] ?? DIMENSION_META[dim].label}
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
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {false}
          </div>

          {/* 名词解释 */}
          <details style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer", fontSize: "0.88rem", fontWeight: 600 }}>📖 名词解释</summary>
            <div style={{ fontSize: "0.84rem", color: "var(--muted)", padding: "10px 0", lineHeight: 1.7 }}>
              <p><strong>表中标记</strong>: ⬛ 实色高亮 = 全历史最佳所在格{recent ? "；虚线边框 = 近 90 天所在格 (相同则不重复标记)" : ""}。</p>
              <p><strong>维度含义</strong>: 5s = 5秒峰值冲刺 · 1min = 1分钟无氧能力 · 5min = 5分钟VO2max区间 · 20min = 20分钟阈值功率(FTP) · 60min = 60分钟耐力 · VO2max = 最大摄氧量。</p>
              <p><strong>表中单位</strong>: 5s、1min、5min、20min、60min 的阈值单位均为 <strong>W/kg</strong>；VO2max 单位为 <strong>ml/kg/min</strong>。</p>
              <p><strong>最强项法</strong>: 综合段位 = 6 维度中最强的那个，业余车手往往专精某项，最强维度代表真实水位。</p>
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
