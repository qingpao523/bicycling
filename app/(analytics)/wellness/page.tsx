import { requireUser } from "@/lib/auth";
import { listDailyWellness, listActivitiesLightByUser } from "@/lib/storage";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { computeReadiness } from "@/lib/engine/readiness-engine";
import { calculatePmc, getCurrentPmc } from "@/lib/engine/pmc";
import { ReadinessCard } from "@/components/wellness/readiness-card";
import { StatusTagInput } from "@/components/wellness/status-tag-input";
import { WellnessAiPanel } from "@/components/wellness/wellness-ai-panel";
import { WellnessHistoryChart } from "@/components/wellness/wellness-history-chart";
import { SciencePanel } from "@/components/wellness/science-panel";
import { FatigueDetailView } from "@/components/analytics/fatigue-detail";

export const metadata = { title: "个人状态" };

export default async function WellnessPage() {
  const user = await requireUser();

  const [recent7, baseline30, history180, activities, analyticsData] = await Promise.all([
    listDailyWellness(user.id, 7),
    listDailyWellness(user.id, 30),
    listDailyWellness(user.id, 180),
    listActivitiesLightByUser(user.id),
    loadAnalyticsData(user),
  ]);

  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
  const todayEntry = recent7.find((d) => d.date === today) ?? recent7[0] ?? {
    id: "",
    userId: user.id,
    date: today,
    restingHr: null,
    hrv: null,
    sleepSecs: null,
    sleepScore: null,
    sleepQuality: null,
    awakeTime: null,
    lightSleepTime: null,
    remSleepTime: null,
    deepSleepTime: null,
    avgSleepBreathRate: null,
    weight: null,
    spO2: null,
    steps: null,
    statusTag: null,
    note: null,
    readinessScore: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const pmcData = calculatePmc(activities);
  const currentPmc = getCurrentPmc(pmcData);
  const tsb = currentPmc?.tsb;
  const ctl = currentPmc?.ctl;
  const atl = currentPmc?.atl;

  const readiness = computeReadiness(todayEntry, recent7, baseline30, tsb, ctl, atl);

  const chartData = baseline30
    .slice()
    .reverse()
    .map((d) => ({
      date: d.date,
      hrv: d.hrv,
      restingHr: d.restingHr,
      sleepHours: d.sleepSecs != null ? Math.round((d.sleepSecs / 3600) * 10) / 10 : null,
      sleepScore: d.sleepScore,
    }));

  const pmcByDate = new Map(pmcData.map((p) => [p.date, p]));
  const historyChronological = history180.slice().reverse();

  const historyData = historyChronological.map((d, i) => {
    const r7 = historyChronological.slice(Math.max(0, i - 6), i + 1);
    const b30 = historyChronological.slice(Math.max(0, i - 29), i + 1);
    const pmc = pmcByDate.get(d.date);
    const dayReadiness = computeReadiness(d, r7, b30, pmc?.tsb, pmc?.ctl, pmc?.atl);

    return {
      date: d.date,
      hrv: d.hrv,
      restingHr: d.restingHr,
      sleepHours: d.sleepSecs != null ? Math.round((d.sleepSecs / 3600) * 10) / 10 : null,
      readinessScore: dayReadiness.score,
      hrvScore: dayReadiness.factors[0]?.score ?? null,
      rhrScore: dayReadiness.factors[1]?.score ?? null,
      sleepScore: dayReadiness.factors[2]?.score ?? null,
      loadScore: dayReadiness.factors[3]?.score ?? null,
      statusTag: d.statusTag,
    };
  });

  const latestDataDate = history180.find((d) => d.hrv != null || d.restingHr != null || d.sleepSecs != null)?.date;

  // ── Fatigue section data ──
  const fullActivities = analyticsData.activities;
  const fatiguePmc = calculatePmc(fullActivities);
  const fatigueRecent28 = fatiguePmc.slice(-28);
  const fatigueCutoff = new Date();
  fatigueCutoff.setDate(fatigueCutoff.getDate() - 28);
  const recentFatigueActivities = fullActivities.filter(
    (a) => new Date(a.startTime) >= fatigueCutoff,
  );

  const fatigueTypeCounts = { "耐力": 0, "节奏": 0, "间歇": 0, "冲刺": 0 };
  for (const a of recentFatigueActivities) {
    const ifVal = a.ifValue ?? 0;
    const type = ifVal >= 1.05 ? "冲刺" : ifVal >= 0.90 ? "间歇" : ifVal >= 0.75 ? "节奏" : "耐力";
    const tssVal = a.tss ?? 0;
    if (type in fatigueTypeCounts) fatigueTypeCounts[type as keyof typeof fatigueTypeCounts] += tssVal;
  }

  const powerFadeActivities = recentFatigueActivities
    .filter((a) => a.rawStreamsJson && Array.isArray((a.rawStreamsJson as Record<string, unknown>).watts) && ((a.rawStreamsJson as Record<string, unknown>).watts as number[]).length > 0)
    .map((a) => {
      const watts = (a.rawStreamsJson as Record<string, unknown>).watts as number[];
      const half = Math.floor(watts.length / 2);
      if (half < 10) return null;
      const firstHalf = watts.slice(0, half).reduce((s, v) => s + v, 0) / half;
      const secondHalf = watts.slice(half).reduce((s, v) => s + v, 0) / (watts.length - half);
      if (!firstHalf) return null;
      const fade = ((secondHalf - firstHalf) / firstHalf) * 100;
      return { name: a.name, date: a.startTime, fade: Number(fade.toFixed(1)) };
    })
    .filter((x): x is { name: string; date: string; fade: number } => x !== null);

  const avgDailyTss = fatigueRecent28.length ? fatigueRecent28.reduce((s, p) => s + p.dailyTss, 0) / fatigueRecent28.length : 0;
  const fatigueOptimalLow = Math.round(avgDailyTss * 0.8);
  const fatigueOptimalHigh = Math.round(avgDailyTss * 1.2);

  const fatigueAtlWarnings: string[] = [];
  for (let i = 3; i < fatigueRecent28.length; i++) {
    const prev = fatigueRecent28[i - 3].atl;
    const curr = fatigueRecent28[i].atl;
    if (prev > 0 && ((curr - prev) / prev) > 0.15) fatigueAtlWarnings.push(fatigueRecent28[i].date);
  }

  const latestFatigue = fatigueRecent28.length ? fatigueRecent28[fatigueRecent28.length - 1].atl : 0;
  const historicalAtls = fatiguePmc.map((p) => p.atl).sort((a, b) => a - b);
  const fatigueP90 = historicalAtls[Math.floor(historicalAtls.length * 0.9)] ?? 999;

  let decayTimeConstant = 0;
  if (fatiguePmc.length >= 30) {
    const peaks = [];
    for (let i = 1; i < fatiguePmc.length - 1; i++) {
      if (fatiguePmc[i].atl > fatiguePmc[i - 1].atl && fatiguePmc[i].atl > fatiguePmc[i + 1].atl && fatiguePmc[i].atl > 20) peaks.push(i);
    }
    if (peaks.length > 0) {
      const decayTimes: number[] = [];
      for (const peak of peaks) {
        const peakAtl = fatiguePmc[peak].atl;
        for (let j = peak + 1; j < Math.min(peak + 14, fatiguePmc.length); j++) {
          if (fatiguePmc[j].atl <= peakAtl * 0.5) { decayTimes.push(j - peak); break; }
        }
      }
      decayTimeConstant = decayTimes.length ? decayTimes.reduce((s, v) => s + v, 0) / decayTimes.length : 0;
    }
  }

  const hasFatigueData = recentFatigueActivities.length >= 7;

  return (
    <div className="wellness-page">
      <div className="wellness-page-header">
        <h1 className="wellness-page-title">个人状态</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {latestDataDate && (
            <span className="wellness-latest-date">数据更新至 {latestDataDate}</span>
          )}
          <StatusTagInput currentTag={todayEntry.statusTag} date={today} />
        </div>
      </div>

      <ReadinessCard
        score={readiness.score}
        label={readiness.label}
        color={readiness.color}
        factors={readiness.factors}
        chartData={chartData}
      />

      <WellnessHistoryChart data={historyData} />

      {readiness.suggestions.length > 0 && (
        <div className="wellness-suggestions">
          <h3>建议</h3>
          <ul>
            {readiness.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <WellnessAiPanel />

      {/* ── 疲劳形态 ── */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 16 }}>疲劳形态</h2>
        {hasFatigueData ? (
          <FatigueDetailView
            pmcData={fatigueRecent28.map((p) => ({ date: p.date, atl: p.atl, ctl: p.ctl, tsb: p.tsb, dailyTss: p.dailyTss }))}
            latestAtl={latestFatigue}
            historicalP90={Number(fatigueP90.toFixed(1))}
            decayTimeConstant={Number(decayTimeConstant.toFixed(1))}
            optimalLow={fatigueOptimalLow}
            optimalHigh={fatigueOptimalHigh}
            atlWarningCount={fatigueAtlWarnings.length}
            typeCounts={fatigueTypeCounts}
            powerFadeActivities={powerFadeActivities.slice(0, 15)}
          />
        ) : (
          <div className="analytics-card" style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
            至少需要 7 条近 28 天内的活动记录才能生成疲劳形态分析。
          </div>
        )}
      </div>

      <SciencePanel />
    </div>
  );
}
