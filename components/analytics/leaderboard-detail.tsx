"use client";

import { useState } from "react";
import { Award } from "lucide-react";
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
} from "recharts";

interface PersonalBestRecord {
  duration: number;
  durationLabel: string;
  power: number;
  wpkg: number | null;
  activityId: string;
  activityName: string;
  achievedAt: string;
  isNew: boolean;
  improvement: number | null;
}

interface Props {
  records: {
    all: PersonalBestRecord[];
    year: PersonalBestRecord[];
    d90: PersonalBestRecord[];
    d30: PersonalBestRecord[];
  };
  monthlyTrends: Record<number, { month: string; power: number }[]>;
  hasWeight: boolean;
}

const RANGES = [
  { key: "d30", label: "最近 30 天" },
  { key: "d90", label: "最近 90 天" },
  { key: "year", label: "本年度" },
  { key: "all", label: "全部历史" },
] as const;

export function LeaderboardDetailView({ records, monthlyTrends, hasWeight }: Props) {
  const [range, setRange] = useState<"all" | "year" | "d90" | "d30">("d30");
  const [trendDuration, setTrendDuration] = useState(1200);

  const currentRecords = records[range];

  // Compute "new record" count
  const newRecordsCount = currentRecords.filter((r) => r.isNew).length;

  // Monthly distribution of PBs
  const monthCounts: Record<string, number> = {};
  for (const r of records.all) {
    if (!r.achievedAt) continue;
    const month = r.achievedAt.slice(0, 7);
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  }
  const monthDistribution = Object.entries(monthCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, count]) => ({ month: month.slice(5), count }));

  const trendData = monthlyTrends[trendDuration] ?? [];
  const trendDurationLabel = {
    5: "5 秒",
    60: "1 分钟",
    300: "5 分钟",
    1200: "20 分钟",
    3600: "60 分钟",
  }[trendDuration] ?? "";

  return (
    <>
      {/* Summary */}
      <div className="analytics-grid">
        <div className="analytics-stat-card">
          <div className="eyebrow">全部最佳记录</div>
          <div className="stat-value">{records.all.length}</div>
          <div className="stat-change stat-change--flat">个时间段</div>
        </div>
        <div className="analytics-stat-card">
          <div className="eyebrow">近 30 天新纪录</div>
          <div className="stat-value" style={{ color: newRecordsCount > 0 ? "var(--cta)" : "inherit" }}>
            {records.all.filter((r) => r.isNew).length}
          </div>
          <div className="stat-change stat-change--flat">最近突破</div>
        </div>
        <div className="analytics-stat-card">
          <div className="eyebrow">平均 W/kg</div>
          <div className="stat-value">
            {hasWeight && currentRecords.length
              ? (currentRecords.reduce((s, r) => s + (r.wpkg ?? 0), 0) / currentRecords.length).toFixed(2)
              : "--"}
          </div>
          <div className="stat-change stat-change--flat">全部时间段平均</div>
        </div>
      </div>

      {/* Filters */}
      <div className="analytics-card">
        <div className="analytics-card-header" style={{ flexWrap: "wrap", gap: 12 }}>
          <h2>个人最佳功率</h2>
          <div className="time-range-selector">
            {RANGES.map((r) => (
              <button
                key={r.key}
                className={`time-range-btn ${range === r.key ? "time-range-btn--active" : ""}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="data-table leaderboard-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>时间段</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>功率 (W)</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>W/kg</th>
                <th className="lb-col-source" style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>来源活动</th>
                <th className="lb-col-date" style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontWeight: 500 }}>日期</th>
                <th style={{ textAlign: "center", padding: "10px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {currentRecords.map((record) => (
                <tr key={record.duration} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "12px", fontWeight: 600 }}>{record.durationLabel}</td>
                  <td style={{ padding: "12px", textAlign: "right", fontWeight: 700, fontSize: "1.05rem" }}>{record.power}</td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--muted)" }}>
                    {record.wpkg !== null ? record.wpkg.toFixed(2) : "--"}
                  </td>
                  <td className="lb-col-source" style={{ padding: "12px", color: "var(--muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {record.activityName}
                  </td>
                  <td className="lb-col-date" style={{ padding: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {new Date(record.achievedAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {record.isNew && (
                      <span className="lb-new-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--cta)", color: "white", padding: "2px 8px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 600 }}>
                        <Award size={12} /> 新纪录
                        {record.improvement !== null && ` +${record.improvement}%`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Trend for Key Duration */}
      <div className="analytics-card">
        <div className="analytics-card-header" style={{ flexWrap: "wrap", gap: 12 }}>
          <h2>月度最佳趋势 · {trendDurationLabel}</h2>
          <div className="time-range-selector">
            {[5, 60, 300, 1200, 3600].map((d) => (
              <button
                key={d}
                className={`time-range-btn ${trendDuration === d ? "time-range-btn--active" : ""}`}
                onClick={() => setTrendDuration(d)}
              >
                {d < 60 ? `${d}s` : d < 3600 ? `${d / 60}min` : `${d / 3600}h`}
              </button>
            ))}
          </div>
        </div>
        <div className="analytics-chart-container" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }} formatter={(v) => [`${v} W`, "最佳"]} />
              <Line type="monotone" dataKey="power" stroke="#1f57d6" strokeWidth={2.5} dot={{ r: 4, fill: "#1f57d6" }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly PB Distribution */}
      {monthDistribution.length > 0 && (
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h2>最佳记录月度分布</h2>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>哪些月份产生了更多个人最佳</span>
          </div>
          <div className="analytics-chart-container" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthDistribution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }} formatter={(v) => [`${v} 项`, "最佳记录"]} />
                <Bar dataKey="count" fill="#0f8a62" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}
