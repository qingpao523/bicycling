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
  Area,
  ComposedChart,
  ReferenceLine,
} from "recharts";

import type { PmcDataPoint } from "@/lib/engine/pmc";

const TIME_RANGES = [
  { label: "30天", days: 30 },
  { label: "90天", days: 90 },
  { label: "180天", days: 180 },
  { label: "365天", days: 365 },
  { label: "全部", days: 0 },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as PmcDataPoint;
  return (
    <div style={{ background: "white", padding: "12px 16px", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", fontSize: "0.82rem" }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{data.date}</div>
      <div style={{ color: "#1f57d6" }}>CTL: {data.ctl}</div>
      <div style={{ color: "#c44d3b" }}>ATL: {data.atl}</div>
      <div style={{ color: "#0f8a62" }}>TSB: {data.tsb}</div>
      {data.dailyTss > 0 && <div style={{ color: "#666", marginTop: 4 }}>当日 TSS: {data.dailyTss}</div>}
      {data.activities.length > 0 && (
        <div style={{ marginTop: 4, borderTop: "1px solid #eee", paddingTop: 4 }}>
          {data.activities.map((a, i) => (
            <div key={i} style={{ color: "#888" }}>{a.name} ({a.tss} TSS)</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PmcChart({ data }: { data: PmcDataPoint[] }) {
  const [range, setRange] = useState(90);

  const filtered = range === 0 ? data : data.slice(-range);

  return (
    <div>
      <div className="time-range-selector" style={{ marginBottom: 16 }}>
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

      <div className="analytics-chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filtered} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#888" }}
              tickFormatter={(v) => v.slice(5)}
              interval={Math.max(Math.floor(filtered.length / 8), 1)}
            />
            <YAxis tick={{ fontSize: 11, fill: "#888" }} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#999" strokeDasharray="2 2" />
            <Area
              type="monotone"
              dataKey="tsb"
              fill="#0f8a6220"
              stroke="none"
            />
            <Line type="monotone" dataKey="ctl" stroke="#1f57d6" strokeWidth={2.5} dot={false} name="CTL" />
            <Line type="monotone" dataKey="atl" stroke="#c44d3b" strokeWidth={2} dot={false} name="ATL" />
            <Line type="monotone" dataKey="tsb" stroke="#0f8a62" strokeWidth={1.5} dot={false} name="TSB" strokeDasharray="4 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
