"use client";

import Link from "next/link";
import { Mountain, Trophy, Award } from "lucide-react";
import { autoTagSegment, classifySegment, segmentTypeLabel } from "@/lib/engine/segments/segments-classify";
import type { Segment } from "@/lib/types";

type SegmentEffortData = {
  id: string;
  segment: Segment;
  elapsedTime: number;
  movingTime: number;
  averageWatts?: number | null;
  averageHr?: number | null;
  maxHr?: number | null;
  prRank?: number | null;
  komRank?: number | null;
};

type Props = {
  efforts: SegmentEffortData[];
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h${rm}m${s}s`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PrBadge({ rank }: { rank: number }) {
  const colors = { 1: "#f59e0b", 2: "#94a3b8", 3: "#cd7f32" };
  const labels = { 1: "PR", 2: "2nd", 3: "3rd" };
  const color = colors[rank as keyof typeof colors] ?? "#94a3b8";
  const label = labels[rank as keyof typeof labels] ?? `#${rank}`;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 8px",
        borderRadius: 6,
        background: color,
        color: "white",
        fontSize: "0.7rem",
        fontWeight: 700,
      }}
    >
      <Trophy size={10} /> {label}
    </span>
  );
}

function KomBadge({ rank }: { rank: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 8px",
        borderRadius: 6,
        background: "#ef4444",
        color: "white",
        fontSize: "0.7rem",
        fontWeight: 700,
      }}
    >
      <Award size={10} /> KOM #{rank}
    </span>
  );
}

function TagChip({ tag }: { tag: string }) {
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: 4,
        background: "var(--surface-alt, #f1f5f9)",
        color: "var(--muted)",
        fontSize: "0.68rem",
        fontWeight: 500,
      }}
    >
      {tag}
    </span>
  );
}

export function SegmentsSection({ efforts }: Props) {
  if (!efforts.length) return null;

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>
          <Mountain size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          本次赛段 ({efforts.length})
        </h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {efforts.filter((e) => e.prRank === 1).length} 个 PR
        </span>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {efforts.map((e) => {
          const seg = e.segment;
          const tags = autoTagSegment(seg);
          const category = classifySegment(seg);
          const distKm = (seg.distance / 1000).toFixed(1);
          const speed = seg.distance > 0
            ? ((seg.distance / 1000) / (e.elapsedTime / 3600)).toFixed(1)
            : "—";

          return (
            <Link
              key={e.id}
              href={`/analytics/segments/${seg.id}`}
              style={{
                display: "block",
                padding: 12,
                border: "1px solid var(--line, #e5e7eb)",
                borderRadius: 10,
                textDecoration: "none",
                color: "var(--text)",
                transition: "background 0.15s",
                borderLeft: e.prRank === 1 ? "4px solid #f59e0b" : undefined,
              }}
            >
              {/* Row 1: name + badges */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <strong style={{ fontSize: "0.92rem" }}>{seg.name}</strong>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {distKm}km · {seg.averageGrade.toFixed(1)}%
                  </span>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {e.prRank && e.prRank <= 3 && <PrBadge rank={e.prRank} />}
                  {e.komRank && <KomBadge rank={e.komRank} />}
                </div>
              </div>

              {/* Row 2: metrics */}
              <div style={{ display: "flex", gap: 14, fontSize: "0.82rem", color: "var(--muted)", flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{formatTime(e.elapsedTime)}</span>
                <span>{speed} km/h</span>
                {e.averageWatts ? <span>{e.averageWatts}W</span> : null}
                {e.averageHr ? <span>{Math.round(e.averageHr)}bpm</span> : null}
                <span>{segmentTypeLabel(category)}</span>
              </div>

              {/* Row 3: tags */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {tags.map((t) => <TagChip key={t} tag={t} />)}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
