"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

interface StreamData {
  watts: number[];
  heartrate: number[];
  cadence: number[];
  altitude: number[];
  time: number[];
  velocity: number[];
}

interface Props {
  streams: StreamData;
  ftp: number | null;
  maxHr: number | null;
}

// Downsample streams to reduce data points for smoother rendering
function downsample(data: number[], targetPoints: number = 500): number[] {
  if (data.length <= targetPoints) return data;
  const step = data.length / targetPoints;
  const result: number[] = [];
  for (let i = 0; i < targetPoints; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      if (typeof data[j] === "number" && Number.isFinite(data[j])) {
        sum += data[j];
        count++;
      }
    }
    result.push(count > 0 ? sum / count : 0);
  }
  return result;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function calculatePowerZones(watts: number[], ftp: number) {
  const zones = [0, 0, 0, 0, 0, 0, 0]; // Z1..Z7
  for (const w of watts) {
    if (typeof w !== "number" || !Number.isFinite(w)) continue;
    const pct = w / ftp;
    if (pct <= 0.55) zones[0]++;
    else if (pct <= 0.75) zones[1]++;
    else if (pct <= 0.90) zones[2]++;
    else if (pct <= 1.05) zones[3]++;
    else if (pct <= 1.20) zones[4]++;
    else if (pct <= 1.50) zones[5]++;
    else zones[6]++;
  }
  const total = zones.reduce((s, v) => s + v, 0) || 1;
  return zones.map((v, i) => ({
    zone: `Z${i + 1}`,
    seconds: v,
    percentage: Number(((v / total) * 100).toFixed(1)),
  }));
}

function calculateHrZones(heartrate: number[], maxHr: number) {
  const zones = [0, 0, 0, 0, 0]; // Z1..Z5
  for (const hr of heartrate) {
    if (typeof hr !== "number" || !Number.isFinite(hr)) continue;
    const pct = hr / maxHr;
    if (pct <= 0.60) zones[0]++;
    else if (pct <= 0.70) zones[1]++;
    else if (pct <= 0.80) zones[2]++;
    else if (pct <= 0.90) zones[3]++;
    else zones[4]++;
  }
  const total = zones.reduce((s, v) => s + v, 0) || 1;
  return zones.map((v, i) => ({
    zone: `Z${i + 1}`,
    seconds: v,
    percentage: Number(((v / total) * 100).toFixed(1)),
  }));
}

const POWER_ZONE_COLORS = ["#9ca3af", "#60a5fa", "#34d399", "#fbbf24", "#fb923c", "#f87171", "#a78bfa"];
const HR_ZONE_COLORS = ["#9ca3af", "#60a5fa", "#34d399", "#fbbf24", "#f87171"];

export function ActivityDetailView({ streams, ftp, maxHr }: Props) {
  const [metric, setMetric] = useState<"watts" | "heartrate" | "cadence" | "altitude">("watts");

  const chartData = useMemo(() => {
    const targetPoints = 500;
    const wattsDown = downsample(streams.watts, targetPoints);
    const hrDown = streams.heartrate.length ? downsample(streams.heartrate, targetPoints) : [];
    const cadenceDown = streams.cadence.length ? downsample(streams.cadence, targetPoints) : [];
    const altitudeDown = streams.altitude.length ? downsample(streams.altitude, targetPoints) : [];
    const timeDown = streams.time.length ? downsample(streams.time, targetPoints) : wattsDown.map((_, i) => i * (streams.watts.length / targetPoints));

    return wattsDown.map((w, i) => ({
      time: Math.round(timeDown[i] ?? i),
      watts: Math.round(w),
      heartrate: hrDown.length ? Math.round(hrDown[i] ?? 0) : null,
      cadence: cadenceDown.length ? Math.round(cadenceDown[i] ?? 0) : null,
      altitude: altitudeDown.length ? Math.round(altitudeDown[i] ?? 0) : null,
    }));
  }, [streams]);

  const powerZones = useMemo(() => (ftp ? calculatePowerZones(streams.watts, ftp) : null), [streams.watts, ftp]);
  const hrZones = useMemo(() => (maxHr && streams.heartrate.length ? calculateHrZones(streams.heartrate, maxHr) : null), [streams.heartrate, maxHr]);

  const metricConfig = {
    watts: { label: "功率", color: "#1f57d6", unit: "W" },
    heartrate: { label: "心率", color: "#c44d3b", unit: "bpm" },
    cadence: { label: "踏频", color: "#0f8a62", unit: "rpm" },
    altitude: { label: "海拔", color: "#6b7280", unit: "m" },
  };

  const current = metricConfig[metric];
  const hasMetric = metric === "watts" ? true : metric === "heartrate" ? streams.heartrate.length > 0 : metric === "cadence" ? streams.cadence.length > 0 : streams.altitude.length > 0;

  return (
    <>
      {/* Time Series Chart */}
      <div className="analytics-card">
        <div className="analytics-card-header" style={{ flexWrap: "wrap", gap: 12 }}>
          <h2>时间序列</h2>
          <div className="time-range-selector">
            {(Object.keys(metricConfig) as Array<keyof typeof metricConfig>).map((key) => {
              const enabled = key === "watts" ? true : key === "heartrate" ? streams.heartrate.length > 0 : key === "cadence" ? streams.cadence.length > 0 : streams.altitude.length > 0;
              return (
                <button
                  key={key}
                  className={`time-range-btn ${metric === key ? "time-range-btn--active" : ""}`}
                  onClick={() => enabled && setMetric(key)}
                  disabled={!enabled}
                  title={!enabled ? "无此项数据" : undefined}
                >
                  {metricConfig[key].label}
                </button>
              );
            })}
          </div>
        </div>

        {hasMetric ? (
          <div className="analytics-chart-container" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: "#888" }}
                  tickFormatter={formatTime}
                />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} unit={current.unit} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }}
                  labelFormatter={(v) => formatTime(Number(v))}
                  formatter={(value) => [`${value} ${current.unit}`, current.label]}
                />
                <Line
                  type="monotone"
                  dataKey={metric}
                  stroke={current.color}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
            该活动无 {current.label} 数据
          </div>
        )}
      </div>

      {/* Power Zone Distribution */}
      {powerZones && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2>功率区间分布</h2>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>基于 FTP {ftp}W</span>
          </div>
          <div className="analytics-chart-container" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={powerZones} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="zone" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} unit="%" />
                <Tooltip
                  contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }}
                  formatter={(v: any, _n: any, item: any) => {
                    const data = item.payload;
                    return [`${v}% (${formatTime(data.seconds)})`, "占比"];
                  }}
                />
                <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                  {powerZones.map((_, i) => (
                    <Cell key={i} fill={POWER_ZONE_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 8 }}>
            Z1: ≤55%FTP · Z2: 56-75% · Z3: 76-90% · Z4: 91-105% · Z5: 106-120% · Z6: 121-150% · Z7: &gt;150%
          </div>
        </div>
      )}

      {/* HR Zone Distribution */}
      {hrZones && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2>心率区间分布</h2>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>基于最大心率 {maxHr}bpm</span>
          </div>
          <div className="analytics-chart-container" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hrZones} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="zone" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} unit="%" />
                <Tooltip
                  contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }}
                  formatter={(v: any, _n: any, item: any) => {
                    const data = item.payload;
                    return [`${v}% (${formatTime(data.seconds)})`, "占比"];
                  }}
                />
                <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                  {hrZones.map((_, i) => (
                    <Cell key={i} fill={HR_ZONE_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 8 }}>
            Z1: ≤60%MaxHR · Z2: 61-70% · Z3: 71-80% · Z4: 81-90% · Z5: &gt;90%
          </div>
        </div>
      )}
    </>
  );
}
