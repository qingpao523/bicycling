"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface WeeklyData {
  week: string;
  tss: number;
  duration: number;
  distance: number;
  count: number;
  elevation: number;
}

interface EfData {
  date: string;
  ef: number;
  name: string;
}

export function DataAnalyticsCharts({ weeklyData, efData }: { weeklyData: WeeklyData[]; efData: EfData[] }) {
  const [metric, setMetric] = useState<"tss" | "duration" | "distance">("tss");

  const metricLabels = { tss: "TSS", duration: "时长 (min)", distance: "距离 (km)" };

  return (
    <div>
      {/* Weekly Training Volume */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>周训练量趋势</h2>
          <div className="time-range-selector">
            {(["tss", "duration", "distance"] as const).map((m) => (
              <button
                key={m}
                className={`time-range-btn ${metric === m ? "time-range-btn--active" : ""}`}
                onClick={() => setMetric(m)}
              >
                {metricLabels[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="analytics-chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} />
              <Tooltip
                contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }}
                formatter={(value) => [
                  metric === "duration" ? `${(Number(value) / 60).toFixed(1)}h` : Number(value).toFixed(0),
                  metricLabels[metric],
                ]}
              />
              <Bar dataKey={metric} fill="#1f57d6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Efficiency Factor Trend */}
      {efData.length > 0 && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2>效率因子 (EF) 趋势</h2>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>NP / 平均心率 · 有氧能力指标</span>
          </div>
          <div className="analytics-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={efData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }}
                  labelFormatter={(v) => v}
                  formatter={(value) => [Number(value ?? 0).toFixed(2), "EF"]}
                />
                <Line type="monotone" dataKey="ef" stroke="#0f8a62" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
