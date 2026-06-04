import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { DataAnalyticsCharts } from "@/components/analytics/data-analytics-charts";
import { AiAnalysisPanel } from "@/components/analytics/ai-analysis-panel";

export default async function DataAnalyticsPage() {
  const user = await requireUser();
  const { activities } = await loadAnalyticsData(user);

  // Weekly aggregation
  const weeklyData: Record<string, { tss: number; duration: number; distance: number; count: number; elevation: number }> = {};
  for (const a of activities) {
    const date = new Date(a.startTime);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + 1);
    const weekKey = weekStart.toISOString().split("T")[0];
    if (!weeklyData[weekKey]) weeklyData[weekKey] = { tss: 0, duration: 0, distance: 0, count: 0, elevation: 0 };
    weeklyData[weekKey].tss += a.tss ?? 0;
    weeklyData[weekKey].duration += a.movingTimeMin;
    weeklyData[weekKey].distance += a.distanceKm;
    weeklyData[weekKey].count += 1;
    weeklyData[weekKey].elevation += a.elevationM;
  }

  const weeklyArray = Object.entries(weeklyData)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-26)
    .map(([week, data]) => ({ week: week.slice(5), ...data }));

  const efData = activities
    .filter((a) => a.np && a.avgHr && a.avgHr > 0)
    .map((a) => ({
      date: a.startTime.split("T")[0],
      ef: Number(((a.np ?? 0) / (a.avgHr ?? 1)).toFixed(2)),
      name: a.name,
    }))
    .slice(-50);

  const totalActivities = activities.length;
  const totalDuration = activities.reduce((s, a) => s + a.movingTimeMin, 0);
  const totalDistance = activities.reduce((s, a) => s + a.distanceKm, 0);
  const totalElevation = activities.reduce((s, a) => s + a.elevationM, 0);
  const totalTss = activities.reduce((s, a) => s + (a.tss ?? 0), 0);

  return (
    <div>
      <div className="analytics-page-header">
        <h1>数据分析</h1>
        <p>综合训练数据统计 · AI 多维度深度分析</p>
      </div>

      {!activities.length ? (
        <div className="analytics-empty">
          <h3>暂无数据</h3>
          <p>请先同步活动数据。</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="analytics-grid">
            <div className="analytics-stat-card">
              <div className="eyebrow">总骑行次数</div>
              <div className="stat-value">{totalActivities}</div>
            </div>
            <div className="analytics-stat-card">
              <div className="eyebrow">总时长</div>
              <div className="stat-value">{(totalDuration / 60).toFixed(0)} <span style={{ fontSize: "0.5em" }}>小时</span></div>
            </div>
            <div className="analytics-stat-card">
              <div className="eyebrow">总距离</div>
              <div className="stat-value">{totalDistance.toFixed(0)} <span style={{ fontSize: "0.5em" }}>km</span></div>
            </div>
            <div className="analytics-stat-card">
              <div className="eyebrow">总爬升</div>
              <div className="stat-value">{totalElevation.toFixed(0)} <span style={{ fontSize: "0.5em" }}>m</span></div>
            </div>
            <div className="analytics-stat-card">
              <div className="eyebrow">总 TSS</div>
              <div className="stat-value">{totalTss}</div>
            </div>
          </div>

          {/* AI Analysis Panel */}
          <AiAnalysisPanel />

          {/* Charts */}
          <DataAnalyticsCharts weeklyData={weeklyArray} efData={efData} />
        </>
      )}
    </div>
  );
}
