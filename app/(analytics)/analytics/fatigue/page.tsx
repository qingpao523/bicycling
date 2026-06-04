import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { calculatePmc } from "@/lib/engine/pmc";
import { FatigueDetailView } from "@/components/analytics/fatigue-detail";

export default async function FatiguePage() {
  const user = await requireUser();
  const { activities } = await loadAnalyticsData(user);
  const pmcData = calculatePmc(activities);

  const recent28 = pmcData.slice(-28);
  const recentActivities = activities.filter((a) => {
    const d = new Date(a.startTime);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 28);
    return d >= cutoff;
  });

  // Classify activities by IF
  const classified = recentActivities.map((a) => {
    const ifVal = a.ifValue ?? 0;
    let type: string;
    if (ifVal >= 1.05) type = "冲刺";
    else if (ifVal >= 0.90) type = "间歇";
    else if (ifVal >= 0.75) type = "节奏";
    else type = "耐力";
    return { ...a, trainingType: type };
  });

  const typeCounts = { "耐力": 0, "节奏": 0, "间歇": 0, "冲刺": 0 };
  for (const a of classified) {
    const tss = a.tss ?? 0;
    if (a.trainingType in typeCounts) typeCounts[a.trainingType as keyof typeof typeCounts] += tss;
  }

  // Power fade analysis
  const powerFadeActivities = recentActivities
    .filter((a) => a.rawStreamsJson && Array.isArray((a.rawStreamsJson as any).watts) && ((a.rawStreamsJson as any).watts as number[]).length > 0)
    .map((a) => {
      const watts = (a.rawStreamsJson as any).watts as number[];
      const half = Math.floor(watts.length / 2);
      if (half < 10) return null;
      const firstHalf = watts.slice(0, half).reduce((s, v) => s + v, 0) / half;
      const secondHalf = watts.slice(half).reduce((s, v) => s + v, 0) / (watts.length - half);
      if (!firstHalf) return null;
      const fade = ((secondHalf - firstHalf) / firstHalf) * 100;
      return { name: a.name, date: a.startTime, fade: Number(fade.toFixed(1)) };
    })
    .filter((x): x is { name: string; date: string; fade: number } => x !== null);

  // Optimal TSS range (simplified)
  const avgDailyTss = recent28.length ? recent28.reduce((s, p) => s + p.dailyTss, 0) / recent28.length : 0;
  const optimalLow = Math.round(avgDailyTss * 0.8);
  const optimalHigh = Math.round(avgDailyTss * 1.2);

  // ATL growth warning
  const atlWarnings: string[] = [];
  for (let i = 3; i < recent28.length; i++) {
    const prev = recent28[i - 3].atl;
    const curr = recent28[i].atl;
    if (prev > 0 && ((curr - prev) / prev) > 0.15) {
      atlWarnings.push(recent28[i].date);
    }
  }

  const latestFatigue = recent28.length ? recent28[recent28.length - 1].atl : 0;
  const historicalAtls = pmcData.map((p) => p.atl).sort((a, b) => a - b);
  const p90 = historicalAtls[Math.floor(historicalAtls.length * 0.9)] ?? 999;

  // Calculate fatigue decay time constant (simplified: find avg days for ATL to drop 50%)
  let decayTimeConstant = 0;
  if (pmcData.length >= 30) {
    const peaks = [];
    for (let i = 1; i < pmcData.length - 1; i++) {
      if (pmcData[i].atl > pmcData[i - 1].atl && pmcData[i].atl > pmcData[i + 1].atl && pmcData[i].atl > 20) {
        peaks.push(i);
      }
    }
    if (peaks.length > 0) {
      const decayTimes: number[] = [];
      for (const peak of peaks) {
        const peakAtl = pmcData[peak].atl;
        for (let j = peak + 1; j < Math.min(peak + 14, pmcData.length); j++) {
          if (pmcData[j].atl <= peakAtl * 0.5) {
            decayTimes.push(j - peak);
            break;
          }
        }
      }
      decayTimeConstant = decayTimes.length ? decayTimes.reduce((s, v) => s + v, 0) / decayTimes.length : 0;
    }
  }

  return (
    <div>
      <div className="analytics-page-header">
        <h1>疲劳形态</h1>
        <p>分析疲劳累积与衰减模式，优化训练节奏</p>
      </div>

      {recentActivities.length < 7 ? (
        <div className="analytics-empty">
          <h3>数据不足</h3>
          <p>至少需要 7 条近 28 天内的活动记录才能生成疲劳形态分析。当前仅有 {recentActivities.length} 条。</p>
        </div>
      ) : (
        <FatigueDetailView
          pmcData={recent28.map((p) => ({ date: p.date, atl: p.atl, ctl: p.ctl, tsb: p.tsb, dailyTss: p.dailyTss }))}
          latestAtl={latestFatigue}
          historicalP90={Number(p90.toFixed(1))}
          decayTimeConstant={Number(decayTimeConstant.toFixed(1))}
          optimalLow={optimalLow}
          optimalHigh={optimalHigh}
          atlWarningCount={atlWarnings.length}
          typeCounts={typeCounts}
          powerFadeActivities={powerFadeActivities.slice(0, 15)}
        />
      )}
    </div>
  );
}
