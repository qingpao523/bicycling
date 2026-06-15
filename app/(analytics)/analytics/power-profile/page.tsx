import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { buildPowerCurve } from "@/lib/engine/power-curve";
import { PowerProfileDetailView } from "@/components/analytics/power-profile-detail";

// Reference W/kg values for dimension scoring (Coggan男性参考)
const REFERENCE_DATA = {
  5: { cat5: 11.5, cat4: 14.3, cat3: 17.1, cat2: 19.9, cat1: 22.7, pro: 23 },
  60: { cat5: 5.6, cat4: 6.8, cat3: 8.0, cat2: 9.1, cat1: 10.3, pro: 11.5 },
  300: { cat5: 3.7, cat4: 4.5, cat3: 5.2, cat2: 5.9, cat1: 6.7, pro: 7.6 },
  1200: { cat5: 2.9, cat4: 3.6, cat3: 4.2, cat2: 4.9, cat1: 5.6, pro: 6.4 },
};

function classifyRider(scores: { neuromuscular: number; anaerobic: number; vo2max: number; threshold: number }) {
  const { neuromuscular, anaerobic, vo2max, threshold } = scores;

  if (neuromuscular > 75 && neuromuscular > threshold + 20) return { type: "冲刺型", confidence: Math.min(95, neuromuscular) };
  if (anaerobic > 70 && anaerobic > threshold + 15) return { type: "追击型", confidence: Math.min(90, anaerobic) };
  if (threshold > 70 && threshold > neuromuscular + 10) return { type: "计时赛型", confidence: Math.min(90, threshold) };
  if (vo2max > 70 && threshold > 65) return { type: "爬坡型", confidence: Math.min(90, (vo2max + threshold) / 2) };

  const range = Math.max(neuromuscular, anaerobic, vo2max, threshold) - Math.min(neuromuscular, anaerobic, vo2max, threshold);
  if (range < 15) return { type: "全能型", confidence: Math.min(85, 100 - range) };

  return { type: "全能型", confidence: 60 };
}

function calcScore(wpkg: number | null | undefined, duration: number): number {
  if (!wpkg) return 0;
  const ref = REFERENCE_DATA[duration as keyof typeof REFERENCE_DATA];
  if (!ref) return 50;
  // Linear scale: cat5=50, cat4=60, cat3=70, cat2=80, cat1=90, pro=99
  if (wpkg >= ref.pro) return 99;
  if (wpkg >= ref.cat1) return Math.round(90 + ((wpkg - ref.cat1) / (ref.pro - ref.cat1)) * 9);
  if (wpkg >= ref.cat2) return Math.round(80 + ((wpkg - ref.cat2) / (ref.cat1 - ref.cat2)) * 10);
  if (wpkg >= ref.cat3) return Math.round(70 + ((wpkg - ref.cat3) / (ref.cat2 - ref.cat3)) * 10);
  if (wpkg >= ref.cat4) return Math.round(60 + ((wpkg - ref.cat4) / (ref.cat3 - ref.cat4)) * 10);
  if (wpkg >= ref.cat5) return Math.round(50 + ((wpkg - ref.cat5) / (ref.cat4 - ref.cat5)) * 10);
  return Math.round((wpkg / ref.cat5) * 50);
}

export default async function PowerProfilePage() {
  const user = await requireUser();
  const { activities } = await loadAnalyticsData(user);
  const weightKg = user.weightKg ?? user.syncedWeightKg;

  if (!weightKg) {
    return (
      <div>
        <div className="analytics-page-header">
          <h1>功率形态</h1>
          <p>骑手类型分析与能力评估</p>
        </div>
        <div className="analytics-empty">
          <h3>请先设置体重</h3>
          <p>功率形态分析需要体重数据来计算 W/kg 比值和骑手类型分类。请在设置页面录入体重。</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const d90 = new Date(now); d90.setDate(d90.getDate() - 90);

  const curveAll = buildPowerCurve(activities, weightKg);
  const curveRecent = buildPowerCurve(activities, weightKg, d90);

  const p5s = curveAll.curve.find((p) => p.duration === 5);
  const p1m = curveAll.curve.find((p) => p.duration === 60);
  const p5m = curveAll.curve.find((p) => p.duration === 300);
  const p20m = curveAll.curve.find((p) => p.duration === 1200);

  const p5sRecent = curveRecent.curve.find((p) => p.duration === 5);
  const p1mRecent = curveRecent.curve.find((p) => p.duration === 60);
  const p5mRecent = curveRecent.curve.find((p) => p.duration === 300);
  const p20mRecent = curveRecent.curve.find((p) => p.duration === 1200);

  const hasData = p5s || p1m || p5m || p20m;

  const scores = {
    neuromuscular: calcScore(p5s?.wpkg, 5),
    anaerobic: calcScore(p1m?.wpkg, 60),
    vo2max: calcScore(p5m?.wpkg, 300),
    threshold: calcScore(p20m?.wpkg, 1200),
  };

  const recentScores = {
    neuromuscular: calcScore(p5sRecent?.wpkg, 5),
    anaerobic: calcScore(p1mRecent?.wpkg, 60),
    vo2max: calcScore(p5mRecent?.wpkg, 300),
    threshold: calcScore(p20mRecent?.wpkg, 1200),
  };

  const classification = classifyRider(scores);

  const suggestions: Record<string, string> = {
    neuromuscular: "建议增加短冲刺训练（10-15秒全力冲刺 × 6-8组），提升神经肌肉募集能力",
    anaerobic: "建议增加 30秒-2分钟 高强度间歇训练，提升无氧容量",
    vo2max: "建议增加 3-5分钟 VO2max 间歇训练（如 5×5min @ 105-120% FTP），提升最大摄氧量",
    threshold: "建议增加 2×20min 或 3×15min 阈值训练，提升持续输出能力",
  };

  const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
  const suggestion = weakest && weakest[1] < 50 ? suggestions[weakest[0]] : null;

  return (
    <div>
      <div className="analytics-page-header">
        <h1>功率形态</h1>
        <p>骑手类型分析与能力评估{curveAll.skippedCount > 0 ? ` · ${curveAll.skippedCount} 条活动无功率数据` : ""}</p>
      </div>

      {!hasData ? (
        <div className="analytics-empty">
          <h3>功率数据不足</h3>
          <p>需要在各时间段（5秒、1分钟、5分钟、20分钟）都有功率记录才能完成形态分析。</p>
        </div>
      ) : (
        <PowerProfileDetailView
          classification={classification}
          scores={scores}
          recentScores={recentScores}
          powers={{
            neuromuscular: p5s ? { power: p5s.power, wpkg: p5s.wpkg ?? null } : null,
            anaerobic: p1m ? { power: p1m.power, wpkg: p1m.wpkg ?? null } : null,
            vo2max: p5m ? { power: p5m.power, wpkg: p5m.wpkg ?? null } : null,
            threshold: p20m ? { power: p20m.power, wpkg: p20m.wpkg ?? null } : null,
          }}
          suggestion={suggestion}
        />
      )}
    </div>
  );
}
