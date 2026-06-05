"use client";
import { Trophy } from "lucide-react";
import type { Segment, SegmentEffort } from "@/lib/types";

type Props = { efforts: (SegmentEffort & { segment?: Segment })[]; segments: Segment[] };

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function SegmentPrDashboard({ efforts, segments }: Props) {
  const prs = efforts.filter((e) => e.prRank === 1);
  const koms = efforts.filter((e) => e.komRank != null && e.komRank <= 10);
  const now = Date.now();
  const d90 = now - 90 * 86400000;
  const recentPrs = prs.filter((e) => new Date(e.startDate).getTime() >= d90);
  const segMap = new Map(segments.map((s) => [s.id, s]));

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2><Trophy size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />PR / KOM 面板</h2>
      </div>

      <div className="analytics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="analytics-stat-card" style={{ padding: 14, textAlign: "center" }}>
          <div className="eyebrow">总赛段</div>
          <div className="stat-value" style={{ fontSize: "1.6rem" }}>{segments.length}</div>
        </div>
        <div className="analytics-stat-card" style={{ padding: 14, textAlign: "center" }}>
          <div className="eyebrow">总 PR</div>
          <div className="stat-value" style={{ fontSize: "1.6rem", color: "#f59e0b" }}>{prs.length}</div>
        </div>
        <div className="analytics-stat-card" style={{ padding: 14, textAlign: "center" }}>
          <div className="eyebrow">近 90 天 PR</div>
          <div className="stat-value" style={{ fontSize: "1.6rem", color: "#10b981" }}>{recentPrs.length}</div>
        </div>
        <div className="analytics-stat-card" style={{ padding: 14, textAlign: "center" }}>
          <div className="eyebrow">KOM Top10</div>
          <div className="stat-value" style={{ fontSize: "1.6rem", color: "#ef4444" }}>{koms.length}</div>
        </div>
      </div>

      {recentPrs.length > 0 && (
        <>
          <h3 style={{ fontSize: "0.92rem", marginBottom: 8 }}>近 90 天 PR</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {recentPrs.slice(0, 10).map((e) => {
              const seg = segMap.get(e.segmentId) ?? (e as any).segment;
              return (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface-alt, #f8fafc)", borderRadius: 8, fontSize: "0.85rem" }}>
                  <span style={{ fontWeight: 600 }}>{seg?.name ?? "未知赛段"}</span>
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>{fmtTime(e.elapsedTime)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
