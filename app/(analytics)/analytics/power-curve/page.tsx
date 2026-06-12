import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { buildPowerCurve } from "@/lib/engine/power-curve";
import { PowerCurveDetailView } from "@/components/analytics/power-curve-detail";

export const dynamic = "force-dynamic";

export default async function PowerCurvePage() {
  const user = await requireUser();
  const { activities } = await loadAnalyticsData(user);
  const weightKg = user.weightKg ?? user.syncedWeightKg;

  const now = new Date();
  const d42 = new Date(now); d42.setDate(d42.getDate() - 42);

  const curveAll = buildPowerCurve(activities, weightKg ?? undefined);
  const curve42 = buildPowerCurve(activities, weightKg ?? undefined, d42);

  // Combine data into a table-friendly format
  const durations = [
    { seconds: 1, label: "1秒" },
    { seconds: 5, label: "5秒" },
    { seconds: 10, label: "10秒" },
    { seconds: 30, label: "30秒" },
    { seconds: 60, label: "1分钟" },
    { seconds: 180, label: "3分钟" },
    { seconds: 300, label: "5分钟" },
    { seconds: 600, label: "10分钟" },
    { seconds: 1200, label: "20分钟" },
    { seconds: 1800, label: "30分钟" },
    { seconds: 3600, label: "1小时" },
  ];

  const tableData = durations.map(({ seconds, label }) => {
    const bestAll = curveAll.curve.find((p) => p.duration === seconds);
    const best42 = curve42.curve.find((p) => p.duration === seconds);
    return {
      seconds,
      label,
      bestAll: bestAll?.power ?? null,
      best42: best42?.power ?? null,
      wpkgAll: bestAll?.wpkg ?? null,
      activityName: bestAll?.activityName ?? null,
      activityDate: bestAll?.activityDate ?? null,
    };
  });

  return (
    <div>
      <div className="analytics-page-header">
        <h1>功率持续时间曲线</h1>
        <p>
          展示不同时间段的最大功率输出能力
          {curveAll.skippedCount > 0 ? ` · ${curveAll.skippedCount} 条活动无功率数据` : ""}
        </p>
      </div>

      {!curveAll.curve.length ? (
        <div className="analytics-empty">
          <h3>暂无功率数据</h3>
          <p>需要包含功率计数据的活动才能生成功率曲线。请确保活动同步时包含流数据。</p>
        </div>
      ) : (
        <PowerCurveDetailView
          tableData={tableData}
          curveAll={curveAll.curve.map((p) => ({ duration: p.duration, power: p.power, wpkg: p.wpkg ?? null }))}
          curve42={curve42.curve.map((p) => ({ duration: p.duration, power: p.power, wpkg: p.wpkg ?? null }))}
          weightKg={weightKg ?? null}
        />
      )}
    </div>
  );
}
