"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface CurvePoint {
  duration: number;
  power: number;
}

interface Props {
  curves: Record<string, CurvePoint[]>;
  weightKg?: number;
}

const COLORS: Record<string, string> = {
  "28天": "#f59e0b",
  "90天": "#1f57d6",
  "365天": "#0f8a62",
  "全部": "#6b7280",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "white", padding: "10px 14px", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", fontSize: "0.82rem" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{formatDuration(label)}</div>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value}W
        </div>
      ))}
    </div>
  );
}

export function PowerCurveChart({ curves, weightKg }: Props) {
  const [mode, setMode] = useState<"watts" | "wpkg">("watts");

  // Merge all curves into unified data points
  const allDurations = new Set<number>();
  for (const points of Object.values(curves)) {
    for (const p of points) allDurations.add(p.duration);
  }

  const sortedDurations = Array.from(allDurations).sort((a, b) => a - b);

  const chartData = sortedDurations.map((duration) => {
    const point: Record<string, number> = { duration };
    for (const [name, curvePoints] of Object.entries(curves)) {
      const match = curvePoints.find((p) => p.duration === duration);
      if (match) {
        point[name] = mode === "wpkg" && weightKg ? Number((match.power / weightKg).toFixed(2)) : match.power;
      }
    }
    return point;
  });

  const canShowWpkg = !!weightKg;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`time-range-btn ${mode === "watts" ? "time-range-btn--active" : ""}`}
          onClick={() => setMode("watts")}
        >
          瓦特 (W)
        </button>
        <button
          className={`time-range-btn ${mode === "wpkg" ? "time-range-btn--active" : ""}`}
          onClick={() => canShowWpkg && setMode("wpkg")}
          disabled={!canShowWpkg}
          title={!canShowWpkg ? "请先设置体重" : undefined}
        >
          W/kg
        </button>
      </div>

      <div className="analytics-chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="duration"
              scale="log"
              domain={["dataMin", "dataMax"]}
              type="number"
              tick={{ fontSize: 11, fill: "#888" }}
              tickFormatter={formatDuration}
              ticks={[5, 60, 300, 1200, 3600]}
            />
            <YAxis tick={{ fontSize: 11, fill: "#888" }} unit={mode === "wpkg" ? "" : "W"} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {Object.keys(curves).map((name) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[name] ?? "#999"}
                strokeWidth={name === "全部" ? 2.5 : 1.8}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
