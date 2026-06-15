import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { estimateFtpFromActivities, buildFtpProgression, predictFtp } from "@/lib/engine/ftp-estimator";
import { PredictionDetailView } from "@/components/analytics/prediction-detail";

function estimateVO2max(avgPower: number, avgHr: number, maxHr: number, weightKg: number): number {
  const vo2atWork = (avgPower * 10.8) / weightKg + 7;
  const hrRatio = maxHr / avgHr;
  return Number((vo2atWork * hrRatio * 0.8).toFixed(1));
}

export default async function PredictionPage() {
  const user = await requireUser();
  const { activities } = await loadAnalyticsData(user);
  const weightKg = user.weightKg ?? user.syncedWeightKg;
  const maxHr = user.maxHr ?? user.syncedMaxHr;
  const currentFtp = user.ftp ?? user.syncedFtp;

  // Filter to cycling activities only
  const cycling = activities.filter((a) => {
    const raw = a.rawSummaryJson ?? {};
    const type = String((raw as any).type ?? (raw as any).sport_type ?? "").toLowerCase();
    return type.includes("ride") || type.includes("bike") || type.includes("cycl") || type.includes("virtual") || a.avgPower !== undefined;
  });

  // ===== FTP Estimation (all-time + last 90 days) =====
  const now = new Date();
  const d90 = new Date(now); d90.setDate(d90.getDate() - 90);
  const recent90 = cycling.filter((a) => new Date(a.startTime) >= d90);
  const ftpEstimateAll = estimateFtpFromActivities(cycling, weightKg ?? undefined);
  const ftpEstimate = estimateFtpFromActivities(recent90, weightKg ?? undefined);

  // FTP progression timeline
  const progression = buildFtpProgression(cycling, weightKg ?? undefined, 42, 7);
  const predictionResult = predictFtp(progression, 30);

  // VO2max estimation
  let vo2max: number | null = null;
  if (weightKg && maxHr) {
    const recentWithHr = cycling
      .filter((a) => a.avgPower && a.avgHr && a.movingTimeMin >= 20)
      .slice(0, 10);
    if (recentWithHr.length > 0) {
      const estimates = recentWithHr.map((a) => estimateVO2max(a.avgPower!, a.avgHr!, maxHr, weightKg));
      vo2max = Number(Math.max(...estimates).toFixed(1));
    }
  }

  return (
    <div>
      <div className="analytics-page-header">
        <h1>表现预测</h1>
        <p>多时长 FTP 估算 · Critical Power 模型 · AI 瓶颈分析</p>
      </div>

      <PredictionDetailView
        currentFtp={currentFtp ?? null}
        weightKg={weightKg ?? null}
        maxHr={maxHr ?? null}
        vo2max={vo2max}
        ftpEstimateAll={ftpEstimateAll}
        ftpEstimate={ftpEstimate}
        progression={progression}
        prediction={predictionResult}
      />
    </div>
  );
}
