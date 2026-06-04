"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface CalendarDay {
  date: string;
  tss: number;
  dayOfWeek: number;
}

interface WeeklyDataPoint {
  week: string;
  tss: number;
  duration: number;
  distance: number;
  count: number;
}

interface TypeDistItem {
  name: string;
  value: number;
  color: string;
}

interface PowerZoneItem {
  zone: string;
  seconds: number;
  percentage: number;
  color: string;
}

interface PmcPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

interface Props {
  calendarData: CalendarDay[];
  weeklyTrend: WeeklyDataPoint[];
  typeDistribution: TypeDistItem[];
  powerZoneDistribution: PowerZoneItem[] | null;
  pmcMini: PmcPoint[];
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

export function TrainingHistoryCharts({ calendarData, weeklyTrend, typeDistribution, powerZoneDistribution, pmcMini }: Props) {
  const [weeklyMetric, setWeeklyMetric] = useState<"tss" | "duration" | "distance">("tss");

  // Determine max TSS for calendar color scaling
  const maxTss = Math.max(...calendarData.map((d) => d.tss), 100);
  const getCellColor = (tss: number) => {
    if (tss === 0) return "rgba(0,0,0,0.05)";
    const ratio = Math.min(tss / maxTss, 1);
    if (ratio < 0.25) return "#bfdbfe";
    if (ratio < 0.5) return "#60a5fa";
    if (ratio < 0.75) return "#2563eb";
    return "#1e3a8a";
  };

  // Group calendar data into weeks
  const weeks: CalendarDay[][] = [];
  let currentWeek: CalendarDay[] = [];
  // First, pad the start to align with Sunday (day 0)
  if (calendarData.length > 0) {
    const firstDay = calendarData[0];
    for (let i = 0; i < firstDay.dayOfWeek; i++) {
      currentWeek.push({ date: "", tss: 0, dayOfWeek: i });
    }
  }
  for (const day of calendarData) {
    currentWeek.push(day);
    if (day.dayOfWeek === 6) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const metricLabels = { tss: "TSS", duration: "时长 (h)", distance: "距离 (km)" };

  return (
    <>
      {/* Training Calendar Heatmap */}
      <section className="panel">
        <div className="section-title">
          <h2>训练日历</h2>
          <span className="muted">近 16 周 · 方块颜色深浅表示训练负荷 (TSS)</span>
        </div>
        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          <div style={{ display: "flex", gap: 3, minWidth: weeks.length * 18 }}>
            {/* Day labels column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "0.65rem", color: "var(--muted)", paddingRight: 6 }}>
              {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
                <div key={i} style={{ width: 16, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>{d}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                  const day = week.find((d) => d.dayOfWeek === dow);
                  if (!day || !day.date) {
                    return <div key={dow} style={{ width: 15, height: 15 }} />;
                  }
                  const color = getCellColor(day.tss);
                  return (
                    <div
                      key={dow}
                      title={`${day.date} · TSS ${day.tss}`}
                      style={{
                        width: 15,
                        height: 15,
                        borderRadius: 3,
                        background: color,
                        border: "1px solid rgba(0,0,0,0.03)",
                        cursor: "pointer",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: "0.78rem", color: "var(--muted)" }}>
          <span>少</span>
          {["rgba(0,0,0,0.05)", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"].map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: "1px solid rgba(0,0,0,0.05)" }} />
          ))}
          <span>多</span>
        </div>
      </section>

      {/* Weekly Training Volume */}
      <section className="panel">
        <div className="section-title">
          <h2>周训练量趋势</h2>
          <div className="activities-segmented">
            {(Object.keys(metricLabels) as Array<keyof typeof metricLabels>).map((key) => (
              <button
                key={key}
                onClick={() => setWeeklyMetric(key)}
                className={`activities-segment ${weeklyMetric === key ? "active" : ""}`}
                style={{ border: "none", cursor: "pointer", background: "transparent" }}
              >
                {metricLabels[key]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} />
              <Tooltip
                contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }}
                formatter={(v) => [weeklyMetric === "duration" ? `${v} h` : weeklyMetric === "distance" ? `${v} km` : v, metricLabels[weeklyMetric]]}
              />
              <Bar dataKey={weeklyMetric} fill="#1f57d6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Mini PMC + Distributions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {/* Mini PMC */}
        {pmcMini.length > 0 && (
          <section className="panel">
            <div className="section-title">
              <h2>体能趋势</h2>
              <span className="muted">近 42 天 CTL/ATL/TSB</span>
            </div>
            <div style={{ width: "100%", height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pmcMini} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }} />
                  <Line type="monotone" dataKey="ctl" stroke="#1f57d6" strokeWidth={2} dot={false} name="CTL" />
                  <Line type="monotone" dataKey="atl" stroke="#c44d3b" strokeWidth={2} dot={false} name="ATL" />
                  <Line type="monotone" dataKey="tsb" stroke="#0f8a62" strokeWidth={1.5} dot={false} name="TSB" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: "0.78rem", marginTop: 8 }}>
              <span style={{ color: "#1f57d6" }}>● CTL</span>
              <span style={{ color: "#c44d3b" }}>● ATL</span>
              <span style={{ color: "#0f8a62" }}>● TSB</span>
            </div>
          </section>
        )}

        {/* Type Distribution Pie */}
        {typeDistribution.length > 0 && (
          <section className="panel">
            <div className="section-title">
              <h2>训练类型分布</h2>
              <span className="muted">近 30 天</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {typeDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }} formatter={(v) => [`${v} 次`, "次数"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, fontSize: "0.82rem" }}>
                {typeDistribution.map((t) => (
                  <div key={t.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: t.color }} />
                      <span>{t.name}</span>
                    </div>
                    <span style={{ color: "var(--muted)" }}>{t.value} 次</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Power Zone Distribution (stacked bar) */}
      {powerZoneDistribution && (
        <section className="panel">
          <div className="section-title">
            <h2>功率区间分布</h2>
            <span className="muted">近 30 天 · 总时长占比</span>
          </div>
          <div style={{ display: "flex", height: 36, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
            {powerZoneDistribution.map((z) => z.percentage > 0 && (
              <div
                key={z.zone}
                title={`${z.zone} · ${z.percentage}% · ${formatSeconds(z.seconds)}`}
                style={{
                  width: `${z.percentage}%`,
                  background: z.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  color: "white",
                  fontWeight: 600,
                }}
              >
                {z.percentage >= 8 ? `${z.percentage.toFixed(0)}%` : ""}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, fontSize: "0.78rem" }}>
            {powerZoneDistribution.map((z) => (
              <div key={z.zone} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: z.color }} />
                <span>{z.zone}</span>
                <span style={{ color: "var(--muted)", marginLeft: "auto" }}>{z.percentage}%</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
