import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { calculatePersonalBests } from "@/lib/engine/personal-best";
import { LeaderboardDetailView } from "@/components/analytics/leaderboard-detail";

export default async function LeaderboardPage() {
  const user = await requireUser();
  const { activities } = await loadAnalyticsData(user);
  const weightKg = user.weightKg ?? user.syncedWeightKg;

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const d90 = new Date(now); d90.setDate(d90.getDate() - 90);
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

  const pbAll = calculatePersonalBests(activities, weightKg ?? undefined);
  const pbYear = calculatePersonalBests(activities, weightKg ?? undefined, yearStart);
  const pb90 = calculatePersonalBests(activities, weightKg ?? undefined, d90);
  const pb30 = calculatePersonalBests(activities, weightKg ?? undefined, d30);

  // Calculate monthly trends for each duration (last 12 months)
  const monthlyTrends: Record<number, { month: string; power: number }[]> = {};
  const keyDurations = [5, 60, 300, 1200, 3600];

  for (const duration of keyDurations) {
    const trend: { month: string; power: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthActs = activities.filter((a) => {
        const d = new Date(a.startTime);
        return d >= monthDate && d < monthEnd;
      });
      const monthPb = calculatePersonalBests(monthActs, weightKg ?? undefined);
      const record = monthPb.records.find((r) => r.duration === duration);
      const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      trend.push({ month: monthKey, power: record?.power ?? 0 });
    }
    monthlyTrends[duration] = trend;
  }

  return (
    <div>
      <div className="analytics-page-header">
        <h1>排行榜</h1>
        <p>个人最佳功率记录{pbAll.skippedCount > 0 ? ` · ${pbAll.skippedCount} 条活动无功率数据` : ""}</p>
      </div>

      {!pbAll.records.length ? (
        <div className="analytics-empty">
          <h3>暂无功率记录</h3>
          <p>需要包含功率计数据的活动才能生成个人最佳记录。</p>
        </div>
      ) : (
        <LeaderboardDetailView
          records={{
            all: pbAll.records,
            year: pbYear.records,
            d90: pb90.records,
            d30: pb30.records,
          }}
          monthlyTrends={monthlyTrends}
          hasWeight={!!weightKg}
        />
      )}
    </div>
  );
}
