import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { listAiReportsByActivityIds, listFuelLogsByActivityIds } from "@/lib/storage";
import { calculatePmc } from "@/lib/engine/pmc";
import { evaluateActivityIntensity } from "@/lib/engine/cycling-levels";

import { ActivitiesStateCard, type TodayState } from "@/components/analytics/activities-state-card";
import { ActivitiesHighlightAlert, type HighlightItem } from "@/components/analytics/activities-highlight-alert";
import { ActivitiesKpiRow, type KpiStats, type KpiCompare } from "@/components/analytics/activities-kpi-row";
import { ActivitiesCalendarHeatmap, type CalendarDay } from "@/components/analytics/activities-calendar-heatmap";
import { ActivitiesWeeklyTrend, type WeeklyPoint } from "@/components/analytics/activities-weekly-trend";
import { ActivitiesPeriodCompare, type CompareRow } from "@/components/analytics/activities-period-compare";
import { ActivitiesTypeDistribution, type TypeDistItem } from "@/components/analytics/activities-type-distribution";
import { ActivitiesPowerZones, type PowerZoneItem } from "@/components/analytics/activities-power-zones";
import { ActivitiesToolbar, type ToolbarQuery } from "@/components/analytics/activities-toolbar";
import { ActivitiesList, type ListItem } from "@/components/analytics/activities-list";

export const dynamic = "force-dynamic";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSportType(activity: any): "cycling" | "running" | "hiking" | "fitness" | "other" {
  const raw = activity.rawSummaryJson ?? {};
  const type = String(raw.type ?? raw.sport_type ?? "").toLowerCase();
  if (type.includes("ride") || type.includes("bike") || type.includes("cycl") || type.includes("virtual")) return "cycling";
  if (type.includes("run")) return "running";
  if (type.includes("hike") || type.includes("walk")) return "hiking";
  if (type.includes("workout") || type.includes("weight")) return "fitness";
  return "other";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLoadLevel(activity: any): "high" | "medium" | "low" {
  if ((activity.tss ?? 0) >= 150 || (activity.ifValue ?? 0) >= 0.82 || activity.movingTimeMin >= 240) return "high";
  if ((activity.tss ?? 0) >= 80 || (activity.ifValue ?? 0) >= 0.7 || activity.movingTimeMin >= 120) return "medium";
  return "low";
}

function comparePeriod(current: number, previous: number) {
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : 0;
  if (Math.abs(pct) < 5 || Math.abs(diff) < 1) return { diff, pct, direction: "flat" as const };
  return { diff, pct, direction: (diff > 0 ? "up" : "down") as "up" | "down" };
}

function buildQueryString(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== "all");
  return new URLSearchParams(entries as [string, string][]).toString();
}

export default async function ActivitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;

  const currentQuery: ToolbarQuery = {
    q: (params.q ?? "").trim(),
    time: params.time ?? "all",
    type: params.type ?? "cycling",
    rideType: params.rideType ?? "all",
    ai: params.ai ?? "all",
    fuel: params.fuel ?? "all",
    load: params.load ?? "all",
    sort: params.sort ?? "recent",
  };

  const pageSize = 20;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const { activities } = await loadAnalyticsData(user);
  const [fuelLogs, aiReports] = await Promise.all([
    listFuelLogsByActivityIds(activities.map((a) => a.id)),
    listAiReportsByActivityIds(activities.map((a) => a.id)),
  ]);

  const fuelLogMap = new Map(fuelLogs.map((f) => [f.activityId, f]));
  const aiReportMap = new Map(aiReports.map((r) => [r.activityId, r]));
  const weightKg = user.weightKg ?? user.syncedWeightKg ?? undefined;

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
      badge: evaluateActivityIntensity(a, weightKg),
    };
  });

  // Filter
  let filtered = decorated;
  if (currentQuery.type !== "all") filtered = filtered.filter((a) => a.sportType === currentQuery.type);
  if (currentQuery.q) filtered = filtered.filter((a) => a.name.toLowerCase().includes(currentQuery.q.toLowerCase()));
  if (currentQuery.rideType !== "all") filtered = filtered.filter((a) => a.rideType === currentQuery.rideType);
  if (currentQuery.ai === "ready") filtered = filtered.filter((a) => a.aiReady);
  if (currentQuery.ai === "pending") filtered = filtered.filter((a) => !a.aiReady);
  if (currentQuery.fuel === "recorded") filtered = filtered.filter((a) => a.fuelLogged);
  if (currentQuery.fuel === "missing") filtered = filtered.filter((a) => !a.fuelLogged);
  if (currentQuery.load !== "all") filtered = filtered.filter((a) => a.loadLevel === currentQuery.load);
  if (currentQuery.time === "7d") filtered = filtered.filter((a) => isAfterDays(a.startTime, 7));
  if (currentQuery.time === "30d") filtered = filtered.filter((a) => isAfterDays(a.startTime, 30));
  if (currentQuery.time === "90d") filtered = filtered.filter((a) => isAfterDays(a.startTime, 90));

  // Sort
  switch (currentQuery.sort) {
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

  // Stats
  const cycling = decorated.filter((a) => a.sportType === "cycling");
  const recent7 = cycling.filter((a) => isAfterDays(a.startTime, 7));
  const recent30 = cycling.filter((a) => isAfterDays(a.startTime, 30));
  const previous7 = cycling.filter((a) => {
    const d = new Date(a.startTime);
    return d >= startDateDaysAgo(14) && d < startDateDaysAgo(7);
  });
  const previous30 = cycling.filter((a) => {
    const d = new Date(a.startTime);
    return d >= startDateDaysAgo(60) && d < startDateDaysAgo(30);
  });

  const periodStats = (acts: typeof cycling): KpiStats => ({
    count: acts.length,
    tss: sum(acts.map((a) => a.tss)),
    durationMin: sum(acts.map((a) => a.movingTimeMin)),
    distanceKm: round(sum(acts.map((a) => a.distanceKm)), 1),
    elevationM: Math.round(sum(acts.map((a) => a.elevationM))),
  });

  const stats7 = periodStats(recent7);
  const stats30 = periodStats(recent30);
  const statsPrev7 = periodStats(previous7);
  const statsPrev30 = periodStats(previous30);

  const weekCompare: KpiCompare = {
    count: comparePeriod(stats7.count, statsPrev7.count),
    tss: comparePeriod(stats7.tss, statsPrev7.tss),
    duration: comparePeriod(stats7.durationMin, statsPrev7.durationMin),
    distance: comparePeriod(stats7.distanceKm, statsPrev7.distanceKm),
  };

  const monthCompareRows: CompareRow[] = [
    {
      label: "本月 TSS",
      current: stats30.tss,
      previous: statsPrev30.tss,
      cmp: comparePeriod(stats30.tss, statsPrev30.tss),
      unit: "",
    },
    {
      label: "本月时长",
      current: round(stats30.durationMin / 60, 1),
      previous: round(statsPrev30.durationMin / 60, 1),
      cmp: comparePeriod(stats30.durationMin, statsPrev30.durationMin),
      unit: " h",
    },
    {
      label: "本月距离",
      current: stats30.distanceKm,
      previous: statsPrev30.distanceKm,
      cmp: comparePeriod(stats30.distanceKm, statsPrev30.distanceKm),
      unit: " km",
    },
    {
      label: "本月活动数",
      current: stats30.count,
      previous: statsPrev30.count,
      cmp: comparePeriod(stats30.count, statsPrev30.count),
      unit: "",
    },
  ];

  const pmcData = calculatePmc(cycling);
  const latestPmc = pmcData[pmcData.length - 1] ?? null;

  let todayState: TodayState = { label: "等待同步", tone: "idle", summary: "同步活动数据后会显示当前训练状态" };
  if (latestPmc) {
    const tsb = latestPmc.tsb;
    if (tsb > 15) todayState = { label: "状态良好", tone: "ok", summary: `当前 TSB ${round(tsb, 1)}, 恢复充分, 适合高强度训练` };
    else if (tsb > -10) todayState = { label: "正常训练", tone: "ok", summary: `当前 TSB ${round(tsb, 1)}, 训练负荷可控` };
    else if (tsb > -30) todayState = { label: "建设期", tone: "warn", summary: `当前 TSB ${round(tsb, 1)}, 疲劳累积中, 建议中低强度` };
    else todayState = { label: "过度疲劳", tone: "warn", summary: `当前 TSB ${round(tsb, 1)}, 建议减量恢复` };
  }

  const calendarData: CalendarDay[] = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: CalendarDay[] = [];
    for (let i = 111; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split("T")[0];
      const dayActs = cycling.filter((a) => a.startTime.startsWith(dateKey));
      result.push({ date: dateKey, tss: sum(dayActs.map((a) => a.tss)), dayOfWeek: d.getDay() });
    }
    return result;
  })();

  const weeklyTrend: WeeklyPoint[] = (() => {
    const map = new Map<string, { tss: number; duration: number; distance: number; count: number }>();
    for (const a of cycling) {
      const d = new Date(a.startTime);
      const ws = new Date(d);
      ws.setDate(d.getDate() - d.getDay() + 1);
      const weekKey = ws.toISOString().split("T")[0];
      const existing = map.get(weekKey) ?? { tss: 0, duration: 0, distance: 0, count: 0 };
      existing.tss += a.tss ?? 0;
      existing.duration += a.movingTimeMin;
      existing.distance += a.distanceKm;
      existing.count += 1;
      map.set(weekKey, existing);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-26)
      .map(([week, s]) => ({
        week: week.slice(5),
        tss: Math.round(s.tss),
        duration: Math.round((s.duration / 60) * 10) / 10,
        distance: Math.round(s.distance),
        count: s.count,
      }));
  })();

  const typeDistribution: TypeDistItem[] = (() => {
    const counts = new Map<string, number>();
    for (const a of recent30) counts.set(a.rideType, (counts.get(a.rideType) ?? 0) + 1);
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

  const powerZoneDistribution: PowerZoneItem[] | null = (() => {
    const ftp = user.ftp ?? user.syncedFtp;
    if (!ftp) return null;
    const zones = [0, 0, 0, 0, 0, 0, 0];
    let hasData = false;
    for (const a of recent30) {
      if (!a.rawStreamsJson) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const highlightItems: HighlightItem[] = [
    ...decorated.filter((a) => a.loadLevel === "high" && !a.aiReady).slice(0, 2),
    ...decorated.filter((a) => a.loadLevel === "high" && a.aiReady).slice(0, 2),
    ...decorated.filter((a) => !a.fuelLogged && (a.tss ?? 0) >= 80).slice(0, 2),
  ]
    .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      name: a.name,
      startTime: a.startTime,
      movingTimeMin: a.movingTimeMin,
      distanceKm: a.distanceKm,
      tss: a.tss,
      ifValue: a.ifValue,
      loadLevel: a.loadLevel,
      aiReady: a.aiReady,
      fuelLogged: a.fuelLogged,
    }));

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems: ListItem[] = filtered.slice(startIdx, startIdx + pageSize).map((item) => ({
    id: item.id,
    name: item.name,
    startTime: item.startTime,
    movingTimeMin: item.movingTimeMin,
    distanceKm: item.distanceKm,
    elevationM: item.elevationM,
    tss: item.tss,
    ifValue: item.ifValue,
    avgPower: item.avgPower,
    avgHr: item.avgHr,
    rideType: item.rideType,
    loadLevel: item.loadLevel,
    aiReady: item.aiReady,
    fuelLogged: item.fuelLogged,
    fatigueScore: item.fatigueScore,
    badge: item.badge,
  }));

  const buildPageUrl = (p: number) =>
    `/activities?${buildQueryString({ ...currentQuery, page: String(p) })}`;

  return (
    <main className="analytics-page" style={{ display: "grid", gap: 20 }}>
      <header className="analytics-page-header">
        <h1 style={{ margin: 0 }}>🚴 训练历史</h1>
        <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>
          共 {activities.length} 条 · 显示 {filtered.length} 条 · {currentQuery.time === "all" ? "全部时间" : `近 ${currentQuery.time}`}
        </p>
      </header>

      {/* §A 顶部 */}
      <ActivitiesStateCard pmc={latestPmc} state={todayState} />
      <ActivitiesHighlightAlert items={highlightItems} />
      <ActivitiesKpiRow stats={stats7} compare={weekCompare} prevStats={statsPrev7} />

      {/* §B 时序 */}
      <ActivitiesCalendarHeatmap data={calendarData} />
      <ActivitiesWeeklyTrend data={weeklyTrend} />
      <ActivitiesPeriodCompare rows={monthCompareRows} />

      {/* §C 结构 (2 列) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <ActivitiesTypeDistribution data={typeDistribution} />
        <ActivitiesPowerZones data={powerZoneDistribution} />
      </div>

      {/* §D 列表 */}
      <ActivitiesToolbar current={currentQuery} />
      <ActivitiesList
        items={pageItems}
        totalCount={filtered.length}
        currentPage={currentPage}
        totalPages={totalPages}
        buildPageUrl={buildPageUrl}
      />
    </main>
  );
}
