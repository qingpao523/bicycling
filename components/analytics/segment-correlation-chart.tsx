"use client";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import type { CorrelationResult } from "@/lib/engine/segments";

type Props = { correlation: CorrelationResult };

export function SegmentCorrelationChart({ correlation }: Props) {
  if (correlation.points.length < 3) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header"><h2>训练状态关联</h2></div>
        <p style={{ color: "var(--muted)", padding: 16 }}>{correlation.insight}</p>
      </div>
    );
  }

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>训练状态关联</h2>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>TSB vs 速度 r={correlation.tsbToSpeedCorrelation}</span>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="tsb" name="TSB" tick={{ fontSize: 10, fill: "#888" }} label={{ value: "TSB", position: "bottom", fontSize: 11 }} />
            <YAxis dataKey="speed" name="速度" tick={{ fontSize: 10, fill: "#888" }} unit=" km/h" />
            {correlation.optimalTsbRange[0] !== correlation.optimalTsbRange[1] && (
              <ReferenceArea x1={correlation.optimalTsbRange[0]} x2={correlation.optimalTsbRange[1]} fill="#10b981" fillOpacity={0.1} />
            )}
            <Tooltip contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }} formatter={(v, name) => [name === "speed" ? `${v} km/h` : v, name === "speed" ? "速度" : "TSB"]} />
            <Scatter data={correlation.points} fill="#1f57d6" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 8, padding: "0 4px" }}>{correlation.insight}</p>
    </div>
  );
}
