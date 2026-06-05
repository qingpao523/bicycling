"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from "recharts";
import type { SegmentTrend } from "@/lib/engine/segments";
import type { Segment } from "@/lib/types";

type Props = { history: SegmentTrend; segment: Segment };

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function SegmentHistoryChart({ history, segment }: Props) {
  if (!history.points.length) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header"><h2>历史曲线</h2></div>
        <p style={{ color: "var(--muted)", padding: 16 }}>暂无历史数据</p>
      </div>
    );
  }

  const data = history.points.map((p) => ({
    date: p.date.slice(5, 10),
    time: p.elapsedTime,
    watts: p.avgWatts,
    speed: p.speed,
    isPr: p.isPr,
  }));

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>历史曲线 — {segment.name}</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {history.totalAttempts} 次 · 进步 {history.improvementPct}% · {history.recentTrend === "improving" ? "📈 上升" : history.recentTrend === "declining" ? "📉 下降" : "➡ 平稳"}
        </span>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} />
            <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => fmtTime(v)} />
            <Tooltip formatter={(v) => [fmtTime(v as number), "用时"]} contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }} />
            <Line type="monotone" dataKey="time" stroke="#1f57d6" strokeWidth={2} dot={{ r: 4 }} />
            {data.filter((d) => d.isPr).map((d, i) => (
              <ReferenceDot key={i} x={d.date} y={d.time} r={6} fill="#f59e0b" stroke="white" strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: "0.78rem", color: "var(--muted)", marginTop: 8 }}>
        <span>最佳: {fmtTime(history.bestTime)}</span>
        <span>最差: {fmtTime(history.worstTime)}</span>
        <span>均值: {fmtTime(history.avgTime)}</span>
      </div>
    </div>
  );
}
