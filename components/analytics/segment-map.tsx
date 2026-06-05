"use client";
import { MapPin } from "lucide-react";
import type { Segment } from "@/lib/types";

type Props = { segment: Segment };

export function SegmentMap({ segment }: Props) {
  const hasCoords = segment.startLat != null && segment.startLng != null;
  const elevGain = segment.totalElevationGain ?? ((segment.elevationHigh ?? 0) - (segment.elevationLow ?? 0));

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2><MapPin size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />赛段信息</h2>
      </div>
      <div className="analytics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div style={{ padding: 10, background: "var(--surface-alt, #f8fafc)", borderRadius: 8, textAlign: "center" }}>
          <div className="eyebrow">距离</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{(segment.distance / 1000).toFixed(1)} km</div>
        </div>
        <div style={{ padding: 10, background: "var(--surface-alt, #f8fafc)", borderRadius: 8, textAlign: "center" }}>
          <div className="eyebrow">平均坡度</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{segment.averageGrade.toFixed(1)}%</div>
        </div>
        <div style={{ padding: 10, background: "var(--surface-alt, #f8fafc)", borderRadius: 8, textAlign: "center" }}>
          <div className="eyebrow">爬升</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{Math.round(elevGain)} m</div>
        </div>
        <div style={{ padding: 10, background: "var(--surface-alt, #f8fafc)", borderRadius: 8, textAlign: "center" }}>
          <div className="eyebrow">最大坡度</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{segment.maximumGrade?.toFixed(1) ?? "—"}%</div>
        </div>
      </div>
      {/* Elevation profile bar */}
      {segment.elevationLow != null && segment.elevationHigh != null && (
        <div style={{ padding: 12, background: "var(--surface-alt, #f8fafc)", borderRadius: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)", marginBottom: 4 }}>
            <span>起点 {Math.round(segment.elevationLow)}m</span>
            <span>终点 {Math.round(segment.elevationHigh)}m</span>
          </div>
          <div style={{ height: 24, background: "var(--line, #e5e7eb)", borderRadius: 6, position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", left: 0, bottom: 0, width: "100%",
              height: `${Math.min(100, Math.max(10, Math.abs(segment.averageGrade) * 8))}%`,
              background: "linear-gradient(90deg, #10b981, #f59e0b, #ef4444)",
              borderRadius: 6, opacity: 0.7,
            }} />
          </div>
        </div>
      )}
      {hasCoords && (
        <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          {segment.city ?? ""} {segment.state ?? ""} {segment.country ?? ""} · [{segment.startLat?.toFixed(4)}, {segment.startLng?.toFixed(4)}] → [{segment.endLat?.toFixed(4)}, {segment.endLng?.toFixed(4)}]
        </div>
      )}
    </div>
  );
}
