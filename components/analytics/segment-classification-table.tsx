"use client";
import { useState } from "react";
import type { Segment } from "@/lib/types";
import { classifySegment, segmentTypeLabel, autoTagSegment, type SegmentCategory, type SegmentAbilityGrade } from "@/lib/engine/segments";
import { LEVEL_BG, LEVEL_COLOR_BUCKET } from "@/lib/engine/cycling-levels";

type Props = { segments: Segment[]; grades: Record<string, SegmentAbilityGrade> };

const CATEGORIES: SegmentCategory[] = ["sprint", "attack", "threshold", "endurance", "downhill", "mixed"];

function fmtDist(m: number) { return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`; }

export function SegmentClassificationTable({ segments, grades }: Props) {
  const [active, setActive] = useState<SegmentCategory>("threshold");
  const grouped = new Map<SegmentCategory, Segment[]>();
  for (const cat of CATEGORIES) grouped.set(cat, []);
  for (const seg of segments) {
    const cat = classifySegment(seg);
    grouped.get(cat)?.push(seg);
  }

  const current = grouped.get(active) ?? [];

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>赛段分类 + 能力分级</h2>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setActive(cat)} style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid var(--line, #e5e7eb)",
            background: active === cat ? "var(--accent, #1f57d6)" : "transparent",
            color: active === cat ? "white" : "var(--muted)", fontSize: "0.82rem", cursor: "pointer",
          }}>
            {segmentTypeLabel(cat)} ({grouped.get(cat)?.length ?? 0})
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {current.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>该类别暂无赛段</p>
        ) : current.map((seg) => {
          const grade = grades[seg.id];
          const tags = autoTagSegment(seg);
          const color = grade ? LEVEL_BG[LEVEL_COLOR_BUCKET(grade.level)] : "#94a3b8";
          return (
            <div key={seg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", border: "1px solid var(--line, #e5e7eb)", borderRadius: 8, gap: 8, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: "0.88rem" }}>{seg.name}</strong>
                <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{fmtDist(seg.distance)} · {seg.averageGrade.toFixed(1)}%</span>
                  {tags.slice(0, 3).map((t) => (
                    <span key={t} style={{ fontSize: "0.65rem", padding: "0 4px", background: "var(--surface-alt, #f1f5f9)", borderRadius: 3, color: "var(--muted)" }}>{t}</span>
                  ))}
                </div>
              </div>
              {grade && (
                <span style={{ padding: "2px 10px", borderRadius: 6, background: color, color: "white", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                  L{grade.level} {grade.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
