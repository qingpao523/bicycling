// components/analytics/activities-weekly-trend.tsx
"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export type WeeklyPoint = {
  week: string;          // "MM-DD"
  tss: number;
  duration: number;      // hours
  distance: number;      // km
  count: number;
};

type Props = { data: WeeklyPoint[] };

const METRIC_LABELS = { tss: "TSS", duration: "时长 (h)", distance: "距离 (km)" } as const;
type MetricKey = keyof typeof METRIC_LABELS;

export function ActivitiesWeeklyTrend({ data }: Props) {
  const [metric, setMetric] = useState<MetricKey>("tss");

  if (!data.length) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>周训练量趋势</h2>
        </div>
        <p style={{ color: "var(--muted)" }}>暂无数据</p>
      </div>
    );
  }

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>周训练量趋势</h2>
        <div style={{ display: "flex", gap: 4 }}>
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              style={{
                border: "1px solid var(--line, #e5e7eb)",
                background: metric === key ? "var(--accent, #1f57d6)" : "transparent",
                color: metric === key ? "white" : "var(--muted)",
                fontSize: "0.78rem",
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {METRIC_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#888" }} />
            <YAxis tick={{ fontSize: 11, fill: "#888" }} />
            <Tooltip
              contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }}
              formatter={(v) => [
                metric === "duration" ? `${v} h` : metric === "distance" ? `${v} km` : v,
                METRIC_LABELS[metric],
              ]}
            />
            <Bar dataKey={metric} fill="#1f57d6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
