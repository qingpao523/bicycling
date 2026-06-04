import Link from "next/link";
import {
  Activity as ActivityIcon,
  CalendarClock,
  ChevronRight,
  Flame,
  Gauge,
  RefreshCw,
  Search,
  Mountain,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { formatDateTime, formatDuration } from "@/lib/format";
import { requireAppAvailable, requireSetupReady } from "@/lib/guards";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { listAiReportsByActivityIds, listFuelLogsByActivityIds } from "@/lib/storage";
import { calculatePmc } from "@/lib/engine/pmc";
import { TrainingHistoryCharts } from "@/components/analytics/training-history-charts";

type SearchParams = Promise<{
  q?: string;
  time?: string;
  type?: string;
  rideType?: string;
  ai?: string;
  fuel?: string;
  load?: string;
  sort?: string;
  page?: string;
}>;

function startDateDaysAgo(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function isAfterDays(value: string, days: number) {
  return new Date(value) >= startDateDaysAgo(days);
}

function round(value: number, digits = 0) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function sum(values: Array<number | undefined>) {
  return values.reduce<number>((t, v) => t + (typeof v === "number" ? v : 0), 0);
}

function getRideType(activity: any): string {
  const raw = activity.rawSummaryJson ?? {};
  const type = String(raw.type ?? "").toLowerCase();
  if (type.includes("virtual") || String(raw.trainer ?? "").toLowerCase() === "true") return "室内训练";
  if (activity.movingTimeMin >= 180 && activity.elevationM >= 1000) return "爬坡训练";
  if ((activity.ifValue ?? 0) >= 0.8 || (activity.tss ?? 0) >= 140) return "高强度骑";
  if (activity.movingTimeMin >= 120) return "耐力骑";
  if (activity.movingTimeMin <= 75 || activity.distanceKm <= 35) return "通勤 / 短骑";
  return "恢复骑";
}

function getSportType(activity: any): "cycling" | "running" | "hiking" | "fitness" | "other" {
  const raw = activity.rawSummaryJson ?? {};
  const type = String(raw.type ?? raw.sport_type ?? "").toLowerCase();
  if (type.includes("ride") || type.includes("bike") || type.includes("cycl") || type.includes("virtual")) return "cycling";
  if (type.includes("run")) return "running";
  if (type.includes("hike") || type.includes("walk")) return "hiking";
  if (type.includes("workout") || type.includes("weight")) return "fitness";
  return "other";
}

function getLoadLevel(activity: any): "high" | "medium" | "low" {
  if ((activity.tss ?? 0) >= 150 || (activity.ifValue ?? 0) >= 0.82 || activity.movingTimeMin >= 240) return "high";
  if ((activity.tss ?? 0) >= 80 || (activity.ifValue ?? 0) >= 0.7 || activity.movingTimeMin >= 120) return "medium";
  return "low";
}

function buildQueryString(current: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const merged = { ...current, ...overrides };
  const entries = Object.entries(merged).filter(([, v]) => v !== undefined && v !== "" && v !== "all");
  return new URLSearchParams(entries as [string, string][]).toString();
}

function comparePeriod(current: number, previous: number): { diff: number; pct: number; direction: "up" | "down" | "flat" } {
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : 0;
  if (Math.abs(pct) < 5 || Math.abs(diff) < 1) return { diff, pct, direction: "flat" };
  return { diff, pct, direction: diff > 0 ? "up" : "down" };
}

export default async function ActivitiesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSetupReady();
  const user = await requireUser();
  await requireAppAvailable();

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const timeFilter = params.time ?? "all";
  const typeFilter = params.type ?? "cycling";
  const rideTypeFilter = params.rideType ?? "all";
  const aiFilter = params.ai ?? "all";
  const fuelFilter = params.fuel ?? "all";
  const loadFilter = params.load ?? "all";
  const sortFilter = params.sort ?? "recent";
  const pageSize = 20;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const { activities, stats: tssStats } = await loadAnalyticsData(user);
  const [fuelLogs, aiReports] = await Promise.all([
    listFuelLogsByActivityIds(activities.map((a) => a.id)),
    listAiReportsByActivityIds(activities.map((a) => a.id)),
  ]);

  const fuelLogMap = new Map(fuelLogs.map((f) => [f.activityId, f]));
  const aiReportMap = new Map(aiReports.map((r) => [r.activityId, r]));

  const decorated = activities.map((a) => {
    const fuelLog = fuelLogMap.get(a.id);
    const aiReport = aiReportMap.get(a.id);
    return {
      ...a,
      sportType: getSportType(a),
      rideType: getRideType(a),
      loadLevel: getLoadLevel(a),
      fuelLogged: !!fuelLog,
      aiReady: !!aiReport,
      fatigueScore: fuelLog?.fatigueScore,
    };
  });

  // Apply filters
  let filtered = decorated;
  if (typeFilter !== "all") filtered = filtered.filter((a) => a.sportType === typeFilter);
  if (query) filtered = filtered.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));
  if (rideTypeFilter !== "all") filtered = filtered.filter((a) => a.rideType === rideTypeFilter);
  if (aiFilter === "ready") filtered = filtered.filter((a) => a.aiReady);
  if (aiFilter === "pending") filtered = filtered.filter((a) => !a.aiReady);
  if (fuelFilter === "recorded") filtered = filtered.filter((a) => a.fuelLogged);
  if (fuelFilter === "missing") filtered = filtered.filter((a) => !a.fuelLogged);
  if (loadFilter !== "all") filtered = filtered.filter((a) => a.loadLevel === loadFilter);
  if (timeFilter === "7d") filtered = filtered.filter((a) => isAfterDays(a.startTime, 7));
  if (timeFilter === "30d") filtered = filtered.filter((a) => isAfterDays(a.startTime, 30));
  if (timeFilter === "90d") filtered = filtered.filter((a) => isAfterDays(a.startTime, 90));

  // Sort
  switch (sortFilter) {
    case "load": filtered = [...filtered].sort((a, b) => (b.tss ?? 0) - (a.tss ?? 0)); break;
    case "duration": filtered = [...filtered].sort((a, b) => b.movingTimeMin - a.movingTimeMin); break;
    case "distance": filtered = [...filtered].sort((a, b) => b.distanceKm - a.distanceKm); break;
    case "pending": filtered = [...filtered].sort((a, b) => {
      const pa = (a.aiReady ? 0 : 1) + (a.fuelLogged ? 0 : 1);
      const pb = (b.aiReady ? 0 : 1) + (b.fuelLogged ? 0 : 1);
      return pb - pa;
    }); break;
    default: filtered = [...filtered].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  // ===== Compute analytics =====
  const cycling = decorated.filter((a) => a.sportType === "cycling");
  const recent7 = cycling.filter((a) => isAfterDays(a.startTime, 7));
  const recent14 = cycling.filter((a) => isAfterDays(a.startTime, 14));
  const recent30 = cycling.filter((a) => isAfterDays(a.startTime, 30));
  const previous7 = cycling.filter((a) => {
    const d = new Date(a.startTime);
    return d >= startDateDaysAgo(14) && d < startDateDaysAgo(7);
  });
  const previous30 = cycling.filter((a) => {
    const d = new Date(a.startTime);
    return d >= startDateDaysAgo(60) && d < startDateDaysAgo(30);
  });

  const periodStats = (acts: typeof cycling) => ({
    count: acts.length,
    tss: sum(acts.map((a) => a.tss)),
    durationMin: sum(acts.map((a) => a.movingTimeMin)),
    distanceKm: round(sum(acts.map((a) => a.distanceKm)), 1),
    elevationM: Math.round(sum(acts.map((a) => a.elevationM))),
  });

  const stats7 = periodStats(recent7);
  const stats14 = periodStats(recent14);
  const stats30 = periodStats(recent30);
  const statsPrev7 = periodStats(previous7);
  const statsPrev30 = periodStats(previous30);

  // Selected period
  const selectedTrend =
    timeFilter === "7d" ? { ...stats7, days: 7 } :
    timeFilter === "14d" ? { ...stats14, days: 14 } :
    { ...stats30, days: 30 };

  // Comparison
  const weekCompare = {
    count: comparePeriod(stats7.count, statsPrev7.count),
    tss: comparePeriod(stats7.tss, statsPrev7.tss),
    duration: comparePeriod(stats7.durationMin, statsPrev7.durationMin),
    distance: comparePeriod(stats7.distanceKm, statsPrev7.distanceKm),
  };
  const monthCompare = {
    count: comparePeriod(stats30.count, statsPrev30.count),
    tss: comparePeriod(stats30.tss, statsPrev30.tss),
    duration: comparePeriod(stats30.durationMin, statsPrev30.durationMin),
    distance: comparePeriod(stats30.distanceKm, statsPrev30.distanceKm),
  };

  // PMC
  const pmcData = calculatePmc(cycling);
  const latestPmc = pmcData[pmcData.length - 1] ?? null;
  const pmcMini = pmcData.slice(-42).map((p) => ({ date: p.date, ctl: p.ctl, atl: p.atl, tsb: p.tsb }));

  // Calendar heatmap: last 112 days (16 weeks)
  const calendarData = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: { date: string; tss: number; dayOfWeek: number }[] = [];
    for (let i = 111; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split("T")[0];
      const dayActivities = cycling.filter((a) => a.startTime.startsWith(dateKey));
      const dayTss = sum(dayActivities.map((a) => a.tss));
      result.push({ date: dateKey, tss: dayTss, dayOfWeek: d.getDay() });
    }
    return result;
  })();

  // Weekly TSS trend (last 26 weeks)
  const weeklyTrend = (() => {
    const weekMap = new Map<string, { tss: number; duration: number; distance: number; count: number }>();
    for (const a of cycling) {
      const d = new Date(a.startTime);
      const ws = new Date(d);
      ws.setDate(d.getDate() - d.getDay() + 1);
      const weekKey = ws.toISOString().split("T")[0];
      const existing = weekMap.get(weekKey) ?? { tss: 0, duration: 0, distance: 0, count: 0 };
      existing.tss += a.tss ?? 0;
      existing.duration += a.movingTimeMin;
      existing.distance += a.distanceKm;
      existing.count += 1;
      weekMap.set(weekKey, existing);
    }
    return Array.from(weekMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-26)
      .map(([week, s]) => ({
        week: week.slice(5),
        tss: Math.round(s.tss),
        duration: Math.round(s.duration / 60 * 10) / 10,
        distance: Math.round(s.distance),
        count: s.count,
      }));
  })();

  // Activity type distribution (last 30 days, cycling only)
  const typeDistribution = (() => {
    const counts = new Map<string, number>();
    for (const a of recent30) {
      counts.set(a.rideType, (counts.get(a.rideType) ?? 0) + 1);
    }
    const colors: Record<string, string> = {
      "耐力骑": "#1f57d6",
      "爬坡训练": "#0f8a62",
      "高强度骑": "#c44d3b",
      "通勤 / 短骑": "#f59e0b",
      "室内训练": "#7c3aed",
      "恢复骑": "#6b7280",
    };
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value, color: colors[name] ?? "#9ca3af" }));
  })();

  // Power zone distribution (last 30 days, using FTP)
  const powerZoneDistribution = (() => {
    const ftp = user.ftp ?? user.syncedFtp;
    if (!ftp) return null;
    const zones = [0, 0, 0, 0, 0, 0, 0];
    let hasData = false;
    for (const a of recent30) {
      if (!a.rawStreamsJson) continue;
      const watts = (a.rawStreamsJson as any).watts;
      if (!Array.isArray(watts) || !watts.length) continue;
      hasData = true;
      for (const w of watts) {
        if (typeof w !== "number") continue;
        const pct = w / ftp;
        if (pct <= 0.55) zones[0]++;
        else if (pct <= 0.75) zones[1]++;
        else if (pct <= 0.90) zones[2]++;
        else if (pct <= 1.05) zones[3]++;
        else if (pct <= 1.20) zones[4]++;
        else if (pct <= 1.50) zones[5]++;
        else zones[6]++;
      }
    }
    if (!hasData) return null;
    const total = zones.reduce((s, v) => s + v, 0) || 1;
    return [
      { zone: "Z1 恢复", seconds: zones[0], percentage: Number(((zones[0] / total) * 100).toFixed(1)), color: "#9ca3af" },
      { zone: "Z2 耐力", seconds: zones[1], percentage: Number(((zones[1] / total) * 100).toFixed(1)), color: "#60a5fa" },
      { zone: "Z3 节奏", seconds: zones[2], percentage: Number(((zones[2] / total) * 100).toFixed(1)), color: "#34d399" },
      { zone: "Z4 阈值", seconds: zones[3], percentage: Number(((zones[3] / total) * 100).toFixed(1)), color: "#fbbf24" },
      { zone: "Z5 VO2", seconds: zones[4], percentage: Number(((zones[4] / total) * 100).toFixed(1)), color: "#fb923c" },
      { zone: "Z6 无氧", seconds: zones[5], percentage: Number(((zones[5] / total) * 100).toFixed(1)), color: "#f87171" },
      { zone: "Z7 神经", seconds: zones[6], percentage: Number(((zones[6] / total) * 100).toFixed(1)), color: "#a78bfa" },
    ];
  })();

  // Highlight activities
  const highlightActivities = [
    ...decorated.filter((a) => a.loadLevel === "high" && !a.aiReady).slice(0, 2),
    ...decorated.filter((a) => a.loadLevel === "high" && a.aiReady).slice(0, 2),
    ...decorated.filter((a) => !a.fuelLogged && (a.tss ?? 0) >= 80).slice(0, 2),
  ].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i).slice(0, 4);

  const latestSyncTime = activities.length ? formatDateTime(activities[0].updatedAt) : "尚未同步";
  const latestRideTime = activities.length ? formatDateTime(activities[0].startTime) : "暂无活动";

  const currentQuery = { q: query, time: timeFilter, type: typeFilter, rideType: rideTypeFilter, ai: aiFilter, fuel: fuelFilter, load: loadFilter, sort: sortFilter, page: undefined as string | undefined };

  // Today state
  let todayState: { label: string; tone: "ok" | "warn" | "idle"; summary: string } = { label: "等待同步", tone: "idle", summary: "同步活动数据后会显示当前训练状态" };
  if (latestPmc) {
    const tsb = latestPmc.tsb;
    if (tsb > 15) todayState = { label: "状态良好", tone: "ok", summary: `当前 TSB ${round(tsb, 1)}，恢复充分，适合高强度训练` };
    else if (tsb > -10) todayState = { label: "正常训练", tone: "ok", summary: `当前 TSB ${round(tsb, 1)}，训练负荷可控` };
    else if (tsb > -30) todayState = { label: "建设期", tone: "warn", summary: `当前 TSB ${round(tsb, 1)}，疲劳累积中，建议中低强度` };
    else todayState = { label: "过度疲劳", tone: "warn", summary: `当前 TSB ${round(tsb, 1)}，建议减量恢复` };
  }

  return (
    <main className="activities-page">
      <section className="activities-hero">
        <div className="activities-hero-main panel">
          <span className="pill">训练历史总览</span>
          <div className="stack">
            <h1>训练历史总览</h1>
            <p className="hero-copy">查看你的训练趋势、周期对比、区间分布与活动详情。</p>
          </div>
        </div>

        <div className="activities-sync-card panel">
          <div className="section-title">
            <h2>同步状态</h2>
            <span className={`status-dot ${activities.length ? "ok" : "idle"}`}>{activities.length ? "正常" : "待同步"}</span>
          </div>
          <div className="activities-sync-metrics">
            <div>
              <span className="eyebrow">最近同步</span>
              <strong>{latestSyncTime}</strong>
            </div>
            <div>
              <span className="eyebrow">最近活动</span>
              <strong>{latestRideTime}</strong>
            </div>
          </div>
          <form action="/api/integrations/intervals/sync" method="post">
            <button type="submit" className="button primary">
              <RefreshCw size={16} /> 再次同步
            </button>
          </form>
        </div>
      </section>

      {/* TSS compat info banner */}
      {tssStats.computedFromPower + tssStats.computedFromHr > 0 && (
        <section className="panel" style={{ padding: "12px 18px", background: "rgba(31,87,214,0.04)", fontSize: "0.85rem", color: "var(--muted)" }}>
          💡 已为 <strong style={{ color: "var(--accent)" }}>{tssStats.computedFromPower + tssStats.computedFromHr}</strong> 条缺失 TSS 的活动自动补算
          （功率法 {tssStats.computedFromPower} 条 / 心率法 {tssStats.computedFromHr} 条）
        </section>
      )}

      {/* Current State */}
      <section className="activities-state-grid">
        <section className="panel activities-state-main">
          <div className="section-title">
            <h2>当前训练状态</h2>
            <span className={`status-dot ${todayState.tone}`}>{todayState.label}</span>
          </div>
          <p className="activities-state-summary">{todayState.summary}</p>
          {latestPmc && (
            <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
              <div>
                <span className="eyebrow">CTL 体能</span>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#1f57d6" }}>{round(latestPmc.ctl, 1)}</div>
              </div>
              <div>
                <span className="eyebrow">ATL 疲劳</span>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#c44d3b" }}>{round(latestPmc.atl, 1)}</div>
              </div>
              <div>
                <span className="eyebrow">TSB 状态</span>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: latestPmc.tsb >= 0 ? "#0f8a62" : "#c44d3b" }}>{round(latestPmc.tsb, 1)}</div>
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Link href="/analytics/pmc" className="button">
              查看完整 PMC 图表 <ChevronRight size={14} />
            </Link>
          </div>
        </section>

        {/* Period comparisons */}
        <Link href={`/activities?${buildQueryString(currentQuery, { time: "7d" })}`} className="summary-card activities-kpi-card">
          <div className="summary-icon"><ActivityIcon size={18} /></div>
          <div className="eyebrow">近 7 天活动</div>
          <div className="summary-value">{stats7.count}</div>
          <p className="muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TrendArrow direction={weekCompare.count.direction} />
            <span>vs 上周 {weekCompare.count.diff >= 0 ? "+" : ""}{weekCompare.count.diff} ({weekCompare.count.pct >= 0 ? "+" : ""}{round(weekCompare.count.pct, 0)}%)</span>
          </p>
        </Link>

        <Link href={`/activities?${buildQueryString(currentQuery, { time: "7d", sort: "duration" })}`} className="summary-card activities-kpi-card">
          <div className="summary-icon"><CalendarClock size={18} /></div>
          <div className="eyebrow">近 7 天训练时长</div>
          <div className="summary-value">{round(stats7.durationMin / 60, 1)} h</div>
          <p className="muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TrendArrow direction={weekCompare.duration.direction} />
            <span>vs 上周 {round((stats7.durationMin - statsPrev7.durationMin) / 60, 1)} h</span>
          </p>
        </Link>

        <Link href={`/activities?${buildQueryString(currentQuery, { time: "7d", load: "high" })}`} className="summary-card activities-kpi-card">
          <div className="summary-icon"><Gauge size={18} /></div>
          <div className="eyebrow">近 7 天总 TSS</div>
          <div className="summary-value">{stats7.tss}</div>
          <p className="muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TrendArrow direction={weekCompare.tss.direction} />
            <span>vs 上周 {weekCompare.tss.diff >= 0 ? "+" : ""}{weekCompare.tss.diff} ({weekCompare.tss.pct >= 0 ? "+" : ""}{round(weekCompare.tss.pct, 0)}%)</span>
          </p>
        </Link>

        <Link href={`/activities?${buildQueryString(currentQuery, { time: "7d", sort: "distance" })}`} className="summary-card activities-kpi-card">
          <div className="summary-icon"><Mountain size={18} /></div>
          <div className="eyebrow">近 7 天总距离</div>
          <div className="summary-value">{stats7.distanceKm} km</div>
          <p className="muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TrendArrow direction={weekCompare.distance.direction} />
            <span>{stats7.elevationM} m 爬升</span>
          </p>
        </Link>
      </section>

      {/* ===== CHARTS ===== */}
      <TrainingHistoryCharts
        calendarData={calendarData}
        weeklyTrend={weeklyTrend}
        typeDistribution={typeDistribution}
        powerZoneDistribution={powerZoneDistribution}
        pmcMini={pmcMini}
      />

      {/* Month comparison */}
      <section className="panel">
        <div className="section-title">
          <h2>周期对比</h2>
          <span className="muted">本月 vs 上月 / 本周 vs 上周</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[
            { label: "本月 vs 上月 TSS", current: stats30.tss, previous: statsPrev30.tss, cmp: monthCompare.tss, unit: "" },
            { label: "本月 vs 上月 时长", current: round(stats30.durationMin / 60, 1), previous: round(statsPrev30.durationMin / 60, 1), cmp: monthCompare.duration, unit: "h" },
            { label: "本月 vs 上月 距离", current: stats30.distanceKm, previous: statsPrev30.distanceKm, cmp: monthCompare.distance, unit: "km" },
            { label: "本月 vs 上月 活动数", current: stats30.count, previous: statsPrev30.count, cmp: monthCompare.count, unit: "" },
          ].map((c) => (
            <div key={c.label} style={{ padding: 16, background: "var(--surface-alt)", borderRadius: 12 }}>
              <div className="eyebrow">{c.label}</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, margin: "6px 0" }}>{c.current}{c.unit}</div>
              <div style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4, color: c.cmp.direction === "up" ? "var(--ok)" : c.cmp.direction === "down" ? "var(--danger)" : "var(--muted)" }}>
                <TrendArrow direction={c.cmp.direction} />
                <span>{c.cmp.pct >= 0 ? "+" : ""}{round(c.cmp.pct, 0)}% · 上月 {c.previous}{c.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Highlight activities */}
      {highlightActivities.length > 0 && (
        <section className="panel">
          <div className="section-title">
            <h2>重点活动</h2>
            <span className="muted">近期最值得复盘的几条</span>
          </div>
          <div className="activities-highlight-grid">
            {highlightActivities.map((item) => (
              <div key={item.id} className="activities-highlight-card">
                <Link href={`/activities/${item.id}`} className="activities-card-link" aria-label={`查看活动详情：${item.name}`} />
                <div className="activities-highlight-head">
                  <div>
                    <h3>{item.name}</h3>
                    <p className="muted">{formatDateTime(item.startTime)}</p>
                  </div>
                  <span className={`status-pill ${item.loadLevel === "high" ? "status-pill-warn" : item.aiReady ? "status-pill-ok" : ""}`}>
                    {item.loadLevel === "high" ? "高负荷" : item.aiReady ? "已生成 AI" : "待补录"}
                  </span>
                </div>
                <div className="activities-highlight-metrics">
                  <span>{formatDuration(item.movingTimeMin)}</span>
                  <span>{item.distanceKm} km</span>
                  <span>TSS {item.tss ?? "--"}</span>
                  <span>{item.ifValue ? `IF ${item.ifValue}` : "IF --"}</span>
                </div>
                <div className="activities-highlight-actions">
                  <Link href={`/activities/${item.id}`} className="button">查看详情</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="panel">
        <div className="section-title">
          <h2>筛选活动</h2>
          <span className="muted">搜索并快速定位</span>
        </div>
        <form method="get" className="activities-filters">
          <label className="activities-search">
            <Search size={16} />
            <input type="search" name="q" placeholder="搜索活动名称" defaultValue={query} />
          </label>
          <select name="time" defaultValue={timeFilter}>
            <option value="all">全部时间</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
            <option value="90d">最近 90 天</option>
          </select>
          <select name="type" defaultValue={typeFilter}>
            <option value="cycling">骑行</option>
            <option value="running">跑步</option>
            <option value="hiking">徒步</option>
            <option value="fitness">健身</option>
            <option value="other">其他</option>
            <option value="all">全部运动</option>
          </select>
          <select name="rideType" defaultValue={rideTypeFilter}>
            <option value="all">全部骑行类型</option>
            <option value="耐力骑">耐力骑</option>
            <option value="爬坡训练">爬坡训练</option>
            <option value="恢复骑">恢复骑</option>
            <option value="通勤 / 短骑">通勤 / 短骑</option>
            <option value="室内训练">室内训练</option>
            <option value="高强度骑">高强度骑</option>
          </select>
          <select name="load" defaultValue={loadFilter}>
            <option value="all">全部负荷</option>
            <option value="high">高负荷</option>
            <option value="medium">中负荷</option>
            <option value="low">低负荷</option>
          </select>
          <select name="ai" defaultValue={aiFilter}>
            <option value="all">全部 AI 状态</option>
            <option value="ready">已生成</option>
            <option value="pending">待生成</option>
          </select>
          <select name="fuel" defaultValue={fuelFilter}>
            <option value="all">全部补给状态</option>
            <option value="recorded">已记录</option>
            <option value="missing">未记录</option>
          </select>
          <select name="sort" defaultValue={sortFilter}>
            <option value="recent">时间倒序</option>
            <option value="load">按 TSS</option>
            <option value="duration">按时长</option>
            <option value="distance">按距离</option>
            <option value="pending">待处理优先</option>
          </select>
          <button type="submit" className="button primary">应用</button>
          <Link href="/activities" className="button">清空</Link>
        </form>
      </section>

      {/* Full activity list */}
      <section className="panel">
        <div className="section-title">
          <h2>全部活动</h2>
          <span className="muted">共 {filtered.length} 条结果</span>
        </div>
        {activities.length === 0 ? (
          <div className="empty-state">
            <strong>暂无活动数据，请先同步训练记录。</strong>
            <p className="muted">完成配置后，点击同步按钮自动拉取。</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <strong>没有符合条件的活动。</strong>
            <div className="empty-actions">
              <Link href="/activities" className="button primary">清空筛选</Link>
            </div>
          </div>
        ) : (() => {
          const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
          const currentPage = Math.min(page, totalPages);
          const startIdx = (currentPage - 1) * pageSize;
          const pageItems = filtered.slice(startIdx, startIdx + pageSize);
          const buildPageUrl = (p: number) => `/activities?${buildQueryString(currentQuery, { page: String(p) })}`;

          return (
            <>
              <div className="activities-list">
                {pageItems.map((item) => (
                  <article key={item.id} className="activities-list-card">
                    <Link href={`/activities/${item.id}`} className="activities-card-link" aria-label={`查看活动详情：${item.name}`} />
                    <div className="activities-list-main">
                      <div className="activities-list-head">
                        <div>
                          <Link href={`/activities/${item.id}`} className="activities-list-title">{item.name}</Link>
                          <div className="muted">{formatDateTime(item.startTime)}</div>
                        </div>
                        <div className="activities-tag-row">
                          <span className="activity-tag">{item.rideType}</span>
                          <span className={`status-pill ${item.loadLevel === "high" ? "status-pill-warn" : item.loadLevel === "medium" ? "status-pill-ok" : ""}`}>
                            {item.loadLevel === "high" ? "高负荷" : item.loadLevel === "medium" ? "中负荷" : "轻松骑"}
                          </span>
                          <span className={`status-pill ${item.aiReady ? "status-pill-ok" : ""}`}>{item.aiReady ? "已生成 AI 报告" : "待生成 AI 报告"}</span>
                          <span className={`status-pill ${item.fuelLogged ? "status-pill-ok" : "status-pill-warn"}`}>{item.fuelLogged ? "已记录补给" : "待补录补给"}</span>
                          {(item as any).tssSource && (item as any).tssSource !== "original" && (
                            <span className="activity-tag" style={{ fontSize: "0.7rem", opacity: 0.7 }}>TSS 估算</span>
                          )}
                        </div>
                      </div>
                      <div className="activities-list-metrics">
                        <span>{formatDuration(item.movingTimeMin)}</span>
                        <span>{item.distanceKm} km</span>
                        <span>{item.elevationM} m</span>
                        <span>TSS {item.tss ?? "--"}</span>
                        <span>{item.ifValue ? `IF ${item.ifValue}` : "IF --"}</span>
                        <span>{item.avgPower ? `${item.avgPower}W` : "功率 --"}</span>
                        <span>{item.avgHr ? `${item.avgHr}bpm` : "心率 --"}</span>
                        {item.fatigueScore ? <span>疲劳 {item.fatigueScore}/10</span> : null}
                      </div>
                      <div className="activities-list-foot">
                        <span className="muted">{item.aiReady ? "AI 已生成" : "待 AI 生成"} · {item.fuelLogged ? "已补录" : "待补录"}</span>
                        <div className="activities-highlight-actions">
                          <Link href={`/activities/${item.id}`} className="button">查看详情</Link>
                          {!item.aiReady && (
                            <form action={`/api/activities/${item.id}/ai-report`} method="post">
                              <button type="submit" className="button">生成 AI 报告</button>
                            </form>
                          )}
                          {!item.fuelLogged && (
                            <Link href={`/activities/${item.id}`} className="button">补录补给</Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "20px 16px", flexWrap: "wrap" }}>
                  {currentPage > 1 && (
                    <Link href={buildPageUrl(currentPage - 1)} className="button">上一页</Link>
                  )}
                  <span style={{ fontSize: "0.88rem", color: "var(--muted)", padding: "0 12px" }}>
                    第 {currentPage} / {totalPages} 页 · 共 {filtered.length} 条活动
                  </span>
                  {/* Compact page jump buttons */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(() => {
                      const pages: number[] = [];
                      pages.push(1);
                      const start = Math.max(2, currentPage - 2);
                      const end = Math.min(totalPages - 1, currentPage + 2);
                      for (let p = start; p <= end; p++) pages.push(p);
                      if (totalPages > 1) pages.push(totalPages);
                      return Array.from(new Set(pages)).sort((a, b) => a - b).map((p, idx, arr) => {
                        const prev = arr[idx - 1];
                        const gap = prev && p - prev > 1;
                        return (
                          <span key={p} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {gap && <span style={{ color: "var(--muted)" }}>...</span>}
                            {p === currentPage ? (
                              <span className="button primary" style={{ padding: "4px 10px", cursor: "default" }}>{p}</span>
                            ) : (
                              <Link href={buildPageUrl(p)} className="button" style={{ padding: "4px 10px" }}>{p}</Link>
                            )}
                          </span>
                        );
                      });
                    })()}
                  </div>
                  {currentPage < totalPages && (
                    <Link href={buildPageUrl(currentPage + 1)} className="button">下一页</Link>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </section>
    </main>
  );
}

function TrendArrow({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <TrendingUp size={12} style={{ color: "var(--ok)" }} />;
  if (direction === "down") return <TrendingDown size={12} style={{ color: "var(--danger)" }} />;
  return <Minus size={12} style={{ color: "var(--muted)" }} />;
}
