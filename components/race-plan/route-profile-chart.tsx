"use client";

import type { RouteProfile, RouteSegment } from "@/lib/engine/gpx-parser";

const COLORS: Record<RouteSegment["category"], string> = {
  flat: "#94a3b8",
  false_flat: "#fbbf24",
  climb: "#f97316",
  hc: "#ef4444",
  descent: "#22c55e",
};

const LABELS: Record<RouteSegment["category"], string> = {
  flat: "平路",
  false_flat: "缓坡",
  climb: "爬坡",
  hc: "HC",
  descent: "下坡",
};

export function RouteProfileChart({ route }: { route: RouteProfile }) {
  if (route.segments.length === 0) return null;

  const totalKm = route.totalDistanceKm;
  const maxGrade = Math.max(...route.segments.map((s) => Math.abs(s.avgGradePct)), 10);
  const svgW = 600;
  const svgH = 140;
  const padX = 0;
  const padY = 20;
  const chartH = svgH - padY * 2;

  return (
    <div className="route-profile-chart">
      <div className="route-profile-header">
        <span>{route.totalDistanceKm} km</span>
        <span>{route.totalElevationM} m 爬升</span>
        <span>{route.segments.length} 段</span>
      </div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="route-profile-svg">
        {route.segments.map((seg, i) => {
          const x = (seg.startKm / totalKm) * (svgW - padX * 2) + padX;
          const w = (seg.distanceKm / totalKm) * (svgW - padX * 2);
          const h = (Math.abs(seg.avgGradePct) / maxGrade) * chartH;
          const y = padY + chartH - h;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={Math.max(w, 1)}
                height={h}
                fill={COLORS[seg.category]}
                opacity={0.8}
              />
              {w > 30 && (
                <text
                  x={x + w / 2}
                  y={y - 4}
                  fontSize="8"
                  textAnchor="middle"
                  fill="var(--text-secondary)"
                >
                  {seg.avgGradePct > 0 ? `${seg.avgGradePct}%` : ""}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={padX}
          y1={padY + chartH}
          x2={svgW - padX}
          y2={padY + chartH}
          stroke="var(--border)"
          strokeWidth="1"
        />
      </svg>
      <div className="route-profile-legend">
        {(["climb", "hc", "false_flat", "flat", "descent"] as const).map((cat) => (
          <span key={cat} className="legend-item">
            <span className="legend-dot" style={{ background: COLORS[cat] }} />
            {LABELS[cat]}
          </span>
        ))}
      </div>
      <div className="route-segments-list">
        {route.segments.map((seg, i) => (
          <div key={i} className="route-segment-item">
            <span className="segment-index" style={{ borderLeftColor: COLORS[seg.category] }}>
              段{i + 1}
            </span>
            <span className="segment-info">
              {seg.startKm.toFixed(1)}–{seg.endKm.toFixed(1)} km
            </span>
            <span className="segment-info">{seg.distanceKm.toFixed(1)} km</span>
            <span className="segment-info">{seg.avgGradePct > 0 ? `${seg.avgGradePct}%` : "平"}</span>
            <span className="segment-info">↑{seg.elevationGainM}m</span>
            <span className="segment-tag" style={{ background: COLORS[seg.category] + "22", color: COLORS[seg.category] }}>
              {LABELS[seg.category]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
