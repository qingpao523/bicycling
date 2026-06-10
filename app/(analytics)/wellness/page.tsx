import { requireUser } from "@/lib/auth";
import { listDailyWellness, listActivitiesByUser } from "@/lib/storage";
import { computeReadiness } from "@/lib/engine/readiness-engine";
import { calculatePmc, getCurrentPmc } from "@/lib/engine/pmc";
import { ReadinessCard } from "@/components/wellness/readiness-card";
import { StatusTagInput } from "@/components/wellness/status-tag-input";
import { WellnessAiPanel } from "@/components/wellness/wellness-ai-panel";

export const metadata = { title: "个人状态" };

export default async function WellnessPage() {
  const user = await requireUser();

  const [recent7, baseline30, activities] = await Promise.all([
    listDailyWellness(user.id, 7),
    listDailyWellness(user.id, 30),
    listActivitiesByUser(user.id),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = recent7.find((d) => d.date === today) ?? {
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

  const readiness = computeReadiness(todayEntry, recent7, baseline30, tsb);

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

  return (
    <div className="wellness-page">
      <div className="wellness-page-header">
        <h1 className="wellness-page-title">个人状态</h1>
        <StatusTagInput currentTag={todayEntry.statusTag} date={today} />
      </div>

      <ReadinessCard
        score={readiness.score}
        label={readiness.label}
        color={readiness.color}
        factors={readiness.factors}
        chartData={chartData}
      />

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
    </div>
  );
}
