"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

import type { RecoveryScore } from "@/lib/engine/recovery-engine";

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as RecoveryScore;
  return (
    <div style={{ background: "white", padding: "10px 14px", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", fontSize: "0.82rem" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{data.date}</div>
      <div style={{ color: data.color }}>评分: {data.score} · {data.label}</div>
    </div>
  );
}

export function RecoveryChart({ scores }: { scores: RecoveryScore[] }) {
  return (
    <div className="analytics-chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={scores} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickFormatter={(v) => v.slice(5)} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#888" }} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={80} stroke="#0f8a62" strokeDasharray="3 3" label={{ value: "完全恢复", position: "right", fontSize: 10, fill: "#0f8a62" }} />
          <ReferenceLine y={40} stroke="#c44d3b" strokeDasharray="3 3" label={{ value: "疲劳", position: "right", fontSize: 10, fill: "#c44d3b" }} />
          <defs>
            <linearGradient id="recoveryGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1f57d6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#1f57d6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="score" stroke="#1f57d6" strokeWidth={2.5} fill="url(#recoveryGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
