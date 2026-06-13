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
  ReferenceArea,
  Legend,
} from "recharts";

interface CurvePoint {
  duration: number;
  power: number;
  wpkg: number | null;
}

interface TableRow {
  seconds: number;
  label: string;
  bestAll: number | null;
  best42: number | null;
  wpkgAll: number | null;
  activityName: string | null;
  activityDate: string | null;
}

interface Props {
  tableData: TableRow[];
  curveAll: CurvePoint[];
  curve42: CurvePoint[];
  weightKg: number | null;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

// Reference W/kg classification zones (Coggan's categories for male cyclists)
// Each tuple: [duration_seconds, {cat5, cat4, cat3, cat2, cat1, pro}]
const CATEGORY_ZONES = {
  5: { cat5: 11.5, cat4: 14.3, cat3: 17.1, cat2: 19.9, cat1: 22.7, pro: 23 },
  60: { cat5: 5.6, cat4: 6.8, cat3: 8.0, cat2: 9.1, cat1: 10.3, pro: 11.5 },
  300: { cat5: 3.7, cat4: 4.5, cat3: 5.2, cat2: 5.9, cat1: 6.7, pro: 7.6 },
  1200: { cat5: 2.9, cat4: 3.6, cat3: 4.2, cat2: 4.9, cat1: 5.6, pro: 6.4 },
};

function getCategory(duration: number, wpkg: number | null): string {
  if (!wpkg) return "--";
  const zones = CATEGORY_ZONES[duration as keyof typeof CATEGORY_ZONES];
  if (!zones) return "--";
  if (wpkg >= zones.pro) return "Pro";
  if (wpkg >= zones.cat1) return "Cat 1";
  if (wpkg >= zones.cat2) return "Cat 2";
  if (wpkg >= zones.cat3) return "Cat 3";
  if (wpkg >= zones.cat4) return "Cat 4";
  if (wpkg >= zones.cat5) return "Cat 5";
  return "<Cat5";
}

const CATEGORY_COLORS: Record<string, string> = {
  "Pro": "#7c3aed",
  "Cat 1": "#db2777",
  "Cat 2": "#ea580c",
  "Cat 3": "#f59e0b",
  "Cat 4": "#0f8a62",
  "Cat 5": "#1f57d6",
  "<Cat5": "#6b7280",
};

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

export function PowerCurveDetailView({ tableData, curveAll, curve42, weightKg }: Props) {
  const [mode, setMode] = useState<"watts" | "wpkg">("watts");

  // Merge curves for chart
  const chartData = useMemo(() => {
    const allDurations = new Set<number>();
    curveAll.forEach((p) => allDurations.add(p.duration));
    curve42.forEach((p) => allDurations.add(p.duration));

    return Array.from(allDurations)
      .sort((a, b) => a - b)
      .map((duration) => {
        const all = curveAll.find((p) => p.duration === duration);
        const d42 = curve42.find((p) => p.duration === duration);
        const point: Record<string, number | null> = { duration };
        if (all) point["历史最佳"] = mode === "wpkg" && all.wpkg ? all.wpkg : all.power;
        if (d42) point["最近42天"] = mode === "wpkg" && d42.wpkg ? d42.wpkg : d42.power;
        return point;
      });
  }, [curveAll, curve42, mode]);

  const maxY = useMemo(() => {
    const vals = chartData.flatMap((d) => [d["历史最佳"], d["最近42天"]]).filter((v): v is number => typeof v === "number");
    return vals.length ? Math.max(...vals) : 1000;
  }, [chartData]);

  // Build reference zone rectangles for the chart (only meaningful when in wpkg mode with weight)
  const showZones = mode === "wpkg" && !!weightKg;

  return (
    <>
      {/* Table View */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>各时间段最大功率</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={`time-range-btn ${mode === "watts" ? "time-range-btn--active" : ""}`}
              onClick={() => setMode("watts")}
            >
              瓦特
            </button>
            <button
              className={`time-range-btn ${mode === "wpkg" ? "time-range-btn--active" : ""}`}
              onClick={() => weightKg && setMode("wpkg")}
              disabled={!weightKg}
              title={!weightKg ? "请先在设置中录入体重" : undefined}
            >
              W/kg
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>时间</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>历史最佳</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>最近 42 天</th>
                {weightKg ? (
                  <>
                    <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>W/kg</th>
                    <th style={{ textAlign: "center", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>评级</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row) => {
                const category = getCategory(row.seconds, row.wpkgAll);
                const categoryColor = CATEGORY_COLORS[category] ?? "#6b7280";
                const isPrime = row.seconds === 5 || row.seconds === 60 || row.seconds === 300 || row.seconds === 1200;
                return (
                  <tr key={row.seconds} style={{ borderBottom: "1px solid var(--line)", background: isPrime ? "rgba(31,87,214,0.03)" : "transparent" }}>
                    <td style={{ padding: "10px 12px", fontWeight: isPrime ? 600 : 400 }}>
                      {isPrime && <span style={{ display: "inline-block", width: 3, height: 14, background: categoryColor, marginRight: 8, verticalAlign: "middle" }} />}
                      {row.label}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>
                      {row.bestAll ? `${row.bestAll}${mode === "wpkg" && row.wpkgAll ? ` (${row.wpkgAll.toFixed(2)})` : ""}` : "--"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--muted)" }}>
                      {row.best42 ?? "--"}
                    </td>
                    {weightKg ? (
                      <>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          {row.wpkgAll ? row.wpkgAll.toFixed(2) : "--"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: 6,
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            background: `${categoryColor}15`,
                            color: categoryColor,
                          }}>
                            {category}
                          </span>
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart View */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>功率曲线</h2>
          <div style={{ display: "flex", gap: 16, fontSize: "0.82rem" }}>
            <span style={{ color: "#ea580c" }}>● 历史最佳</span>
            <span style={{ color: "#1f57d6" }}>● 最近 42 天</span>
          </div>
        </div>

        <div className="analytics-chart-container" style={{ height: 420 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="duration"
                scale="log"
                domain={[1, "dataMax"]}
                type="number"
                tick={{ fontSize: 11, fill: "#888" }}
                tickFormatter={formatDuration}
                ticks={[1, 5, 30, 60, 300, 1200, 3600]}
              />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} domain={[0, maxY * 1.1]} />

              {/* Category reference zones - only show when in wpkg mode */}
              {showZones && weightKg && (
                <>
                  <ReferenceArea y1={weightKg * 2.9} y2={weightKg * 3.6} fill="#1f57d6" fillOpacity={0.04} />
                  <ReferenceArea y1={weightKg * 3.6} y2={weightKg * 4.2} fill="#0f8a62" fillOpacity={0.04} />
                  <ReferenceArea y1={weightKg * 4.2} y2={weightKg * 4.9} fill="#f59e0b" fillOpacity={0.05} />
                  <ReferenceArea y1={weightKg * 4.9} y2={weightKg * 5.6} fill="#ea580c" fillOpacity={0.05} />
                  <ReferenceArea y1={weightKg * 5.6} y2={weightKg * 6.4} fill="#db2777" fillOpacity={0.05} />
                  <ReferenceArea y1={weightKg * 6.4} y2={maxY * 1.1} fill="#7c3aed" fillOpacity={0.06} />
                </>
              )}

              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="历史最佳" stroke="#ea580c" strokeWidth={2.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="最近42天" stroke="#1f57d6" strokeWidth={2} dot={false} connectNulls strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {weightKg && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, fontSize: "0.78rem" }}>
            {(["Cat 5", "Cat 4", "Cat 3", "Cat 2", "Cat 1", "Pro"] as const).map((cat) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, background: CATEGORY_COLORS[cat], borderRadius: 3 }} />
                <span style={{ color: "var(--muted)" }}>{cat}</span>
              </div>
            ))}
            <span style={{ color: "var(--muted)", marginLeft: "auto" }}>分级参考：Coggan Power Profiling（男性）</span>
          </div>
        )}
      </div>

      {/* Top PR sources */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>关键时间点最佳记录来源</h2>
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>该功率出自哪次骑行</span>
        </div>
        <div className="pr-source-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {tableData.filter((r) => [5, 60, 300, 1200, 3600].includes(r.seconds) && r.activityName).map((r) => (
            <div key={r.seconds} style={{ padding: "12px 14px", background: "var(--surface-alt)", borderRadius: 10 }}>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{r.label}最佳</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, margin: "4px 0" }}>
                {r.bestAll}W {r.wpkgAll && <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--muted)" }}>{r.wpkgAll.toFixed(2)} W/kg</span>}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.activityName}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>
                {r.activityDate ? new Date(r.activityDate).toLocaleDateString("zh-CN") : "--"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
