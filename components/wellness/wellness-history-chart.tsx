"use client";

import { useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface WellnessHistoryPoint {
  date: string;
  hrv: number | null;
  restingHr: number | null;
  sleepHours: number | null;
  sleepHoursScaled: number | null;
  readinessScore: number | null;
  statusTag: string | null;
}

const TIME_RANGES = [
  { label: "30天", days: 30 },
  { label: "90天", days: 90 },
  { label: "180天", days: 180 },
  { label: "全部", days: 0 },
];

type TabKey = "data" | "score";

function CustomTooltip({ active, payload, tab }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as WellnessHistoryPoint;
  if (!d) return null;

  return (
    <div style={{ background: "white", padding: "12px 16px", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", fontSize: "0.82rem", minWidth: 140 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{d.date}</div>
      {tab === "data" ? (
        <>
          {d.hrv != null && <div style={{ color: "#8b5cf6" }}>HRV: {d.hrv} ms</div>}
          {d.restingHr != null && <div style={{ color: "#ef4444" }}>静息心率: {d.restingHr} bpm</div>}
          {d.sleepHours != null && <div style={{ color: "#3b82f6" }}>睡眠: {d.sleepHours}h</div>}
        </>
      ) : (
        <>
          {d.readinessScore != null && <div style={{ color: "#22c55e" }}>综合评分: {d.readinessScore}</div>}
          {d.sleepHoursScaled != null && <div style={{ color: "#3b82f6" }}>睡眠评分: {d.sleepHoursScaled}</div>}
        </>
      )}
      {d.statusTag && (
        <div style={{ marginTop: 4, color: "#f97316" }}>
          状态: {d.statusTag === "tired" ? "累了" : d.statusTag === "sick" ? "生病" : d.statusTag === "stressed" ? "压力大" : d.statusTag}
        </div>
      )}
    </div>
  );
}

export function WellnessHistoryChart({ data }: { data: WellnessHistoryPoint[] }) {
  const [range, setRange] = useState(90);
  const [tab, setTab] = useState<TabKey>("data");

  const latestDate = data.length > 0 ? data[data.length - 1].date : null;

  if (data.length < 2) {
    return (
      <div className="analytics-card wellness-trend-card">
        <h3>状态趋势</h3>
        <p style={{ color: "var(--muted)", padding: "2rem 0", textAlign: "center" }}>历史数据不足，至少需要 2 天</p>
      </div>
    );
  }

  const filtered = range === 0 ? data : data.slice(-range);

  return (
    <div className="analytics-card wellness-trend-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0 }}>状态趋势</h3>
          <div className="wellness-tab-switch">
            <button
              className={`wellness-tab-btn ${tab === "data" ? "wellness-tab-btn--active" : ""}`}
              onClick={() => setTab("data")}
            >
              原始数据
            </button>
            <button
              className={`wellness-tab-btn ${tab === "score" ? "wellness-tab-btn--active" : ""}`}
              onClick={() => setTab("score")}
            >
              评分趋势
            </button>
          </div>
        </div>
        <div className="time-range-selector">
          {TIME_RANGES.map((r) => (
            <button
              key={r.days}
              className={`time-range-btn ${range === r.days ? "time-range-btn--active" : ""}`}
              onClick={() => setRange(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="analytics-chart-container">
        <ResponsiveContainer width="100%" height="100%">
          {tab === "data" ? (
            <ComposedChart data={filtered} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#888" }}
                tickFormatter={(v: string) => v.slice(5)}
                interval={Math.max(Math.floor(filtered.length / 8), 1)}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: "#888" }}
                domain={["auto", "auto"]}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: "#888" }}
                domain={[0, 10]}
                label={{ value: "h", position: "insideTopRight", fontSize: 10, fill: "#aaa", offset: -5 }}
              />
              <Tooltip content={<CustomTooltip tab="data" />} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="hrv"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                name="HRV"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="restingHr"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                connectNulls
                name="静息心率"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="sleepHours"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                strokeDasharray="4 2"
                name="睡眠"
              />
            </ComposedChart>
          ) : (
            <ComposedChart data={filtered} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#888" }}
                tickFormatter={(v: string) => v.slice(5)}
                interval={Math.max(Math.floor(filtered.length / 8), 1)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#888" }}
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip tab="score" />} />
              <Area
                type="monotone"
                dataKey="readinessScore"
                fill="#22c55e18"
                stroke="none"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="readinessScore"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                name="综合评分"
              />
              <Line
                type="monotone"
                dataKey="sleepHoursScaled"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                strokeDasharray="4 2"
                name="睡眠评分"
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="wellness-chart-legend">
        {tab === "data" ? (
          <>
            <span><i style={{ background: "#8b5cf6" }} />HRV (ms)</span>
            <span><i style={{ background: "#ef4444" }} />静息心率 (bpm)</span>
            <span><i style={{ background: "#3b82f6" }} />睡眠 (h)</span>
          </>
        ) : (
          <>
            <span><i style={{ background: "#22c55e" }} />综合评分</span>
            <span><i style={{ background: "#3b82f6" }} />睡眠评分</span>
          </>
        )}
      </div>
    </div>
  );
}
