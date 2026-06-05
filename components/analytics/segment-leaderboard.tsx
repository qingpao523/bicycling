"use client";
import { Medal } from "lucide-react";
import type { Segment, SegmentEffort } from "@/lib/types";

type Props = { efforts: SegmentEffort[]; segments: Segment[] };

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function SegmentLeaderboard({ efforts, segments }: Props) {
  const segMap = new Map(segments.map((s) => [s.id, s]));
  // Group by segment, take best per segment
  const bestBySegment = new Map<string, SegmentEffort>();
  for (const e of efforts) {
    const prev = bestBySegment.get(e.segmentId);
    if (!prev || e.elapsedTime < prev.elapsedTime) {
      bestBySegment.set(e.segmentId, e);
    }
  }
  const ranked = [...bestBySegment.values()].sort((a, b) => {
    const segA = segMap.get(a.segmentId);
    const segB = segMap.get(b.segmentId);
    return (segA?.name ?? "").localeCompare(segB?.name ?? "");
  });

  if (!ranked.length) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header"><h2>个人排行榜</h2></div>
        <p style={{ color: "var(--muted)", padding: 16 }}>暂无赛段数据</p>
      </div>
    );
  }

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2><Medal size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />个人排行榜</h2>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>每赛段最佳成绩</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {ranked.map((e) => {
          const seg = segMap.get(e.segmentId);
          return (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontSize: "0.85rem", borderBottom: "1px solid var(--line, #e5e7eb)" }}>
              <span style={{ fontWeight: 500 }}>{seg?.name ?? "?"}</span>
              <span style={{ fontWeight: 600, color: "var(--accent, #1f57d6)" }}>{fmtTime(e.elapsedTime)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
