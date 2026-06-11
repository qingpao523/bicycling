import { requireUser } from "@/lib/auth";
import { listDailyWellness, listActivitiesLightByUser } from "@/lib/storage";
import { computeReadiness } from "@/lib/engine/readiness-engine";
import { calculatePmc, getCurrentPmc } from "@/lib/engine/pmc";
import { ReadinessCard } from "@/components/wellness/readiness-card";
import { StatusTagInput } from "@/components/wellness/status-tag-input";
import { WellnessAiPanel } from "@/components/wellness/wellness-ai-panel";
import { WellnessHistoryChart } from "@/components/wellness/wellness-history-chart";
import { SciencePanel } from "@/components/wellness/science-panel";

export const metadata = { title: "个人状态" };

export default async function WellnessPage() {
  const user = await requireUser();

  const [recent7, baseline30, history180, activities] = await Promise.all([
    listDailyWellness(user.id, 7),
    listDailyWellness(user.id, 30),
    listDailyWellness(user.id, 180),
    listActivitiesLightByUser(user.id),
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

      <SciencePanel />
    </div>
  );
}
