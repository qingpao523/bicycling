import { buildFuelPlan, compareFuelToTarget } from "@/lib/engine/fuel";
import type { Activity, FuelLog, RecoveryAdvice, RidePlan, User } from "@/lib/types";

export function buildRecoveryAdvice(input: {
  activity: Activity;
  fuelLog?: FuelLog;
  user: User;
  referenceRidePlan?: RidePlan;
}): RecoveryAdvice {
  const { activity, fuelLog, user, referenceRidePlan } = input;
  const hasFuelIntakeData = Boolean(
    fuelLog &&
      (fuelLog.gelCountActual > 0 ||
        (fuelLog.saltCapsuleCountActual ?? 0) > 0 ||
        (fuelLog.carbOtherGrams ?? 0) > 0 ||
        fuelLog.waterMlActual > 0 ||
        fuelLog.electrolyteUsed ||
        fuelLog.carbOtherDesc?.trim()),
  );
  const fatigueScore = fuelLog?.fatigueScore ?? 5;
  const heavyByDuration = activity.movingTimeMin >= 180;
  const heavyByIntensity = (activity.ifValue ?? 0) >= 0.8 || (activity.tss ?? 0) >= 160;
  const heavyBySubjective = fatigueScore >= 8 || (fuelLog?.legFatigueScore ?? 0) >= 8;
  const recentLoadHigh = (activity.recentAtl ?? 0) - (activity.recentCtl ?? 0) >= 10;

  let level: RecoveryAdvice["level"] = "低";
  let recoveryWindow: RecoveryAdvice["recoveryWindow"] = "12h";

  if (heavyByDuration || heavyByIntensity || heavyBySubjective || recentLoadHigh) {
    level = "高";
    recoveryWindow = "48h+";
  } else if (activity.movingTimeMin >= 90 || (activity.tss ?? 0) >= 80) {
    level = "中";
    recoveryWindow = "24h";
  }

  if (level === "高" && activity.movingTimeMin < 240 && fatigueScore < 9) {
    recoveryWindow = "36h";
  }

  const carbNeed = level === "高" ? 1.2 : level === "中" ? 1.0 : 0.8;
  const weightKg = input.user.weightKg ?? input.referenceRidePlan?.weightKg ?? 70;
  const nutrition = [
    `骑后 1-2 小时内优先补碳水 ${Math.round(weightKg * carbNeed)}-${Math.round(weightKg * (carbNeed + 0.2))} g`,
    "补充 20-30g 蛋白，优先易消化来源",
  ];

  const hydration = [
    `先补 500-1000 ml 液体，分 2-3 次喝完`,
  ];
  const warnings: string[] = [];
  const fuelReview: string[] = [];

  if ((activity.temperatureC ?? 0) >= 28 || fuelLog?.symptoms.includes("明显口渴")) {
    hydration.push("建议加电解质，尤其是有盐渍或天气闷热时");
    warnings.push("存在疑似脱水风险");
  }

  if ((fuelLog?.saltCapsuleCountActual ?? 0) > 0) {
    hydration.push(`本次已使用 ${fuelLog?.saltCapsuleCountActual} 粒盐丸，可结合出汗量继续微调`);
  }

  if (fuelLog?.symptoms.includes("抽筋")) {
    warnings.push("出现抽筋，补液和钠摄入需要回看");
  }

  if (fuelLog?.symptoms.includes("饿崩") || fuelLog?.symptoms.includes("头晕")) {
    warnings.push("本次补给失败信号明显，今晚恢复优先级提高");
  }

  if (referenceRidePlan && fuelLog && hasFuelIntakeData) {
    const expected = buildFuelPlan(referenceRidePlan);
    const gap = compareFuelToTarget(expected, {
      doubleGels: fuelLog.doubleGelCountActual ?? fuelLog.gelCountActual,
      caffeineGels: fuelLog.caffeineGelCountActual ?? 0,
      carbOtherGrams: fuelLog.carbOtherGrams ?? 0,
      waterMl: fuelLog.waterMlActual,
    });

    if (gap.carbGap < -30) {
      fuelReview.push(`实际碳水比建议少约 ${Math.abs(gap.carbGap)} g，后段掉速风险偏高`);
      warnings.push("疑似补给不足");
    } else {
      fuelReview.push("碳水摄入接近建议区间，骑中能量策略基本合理");
    }

    if (gap.waterGap < -300) {
      fuelReview.push(`实际饮水比建议少约 ${Math.abs(gap.waterGap)} ml，下次需要更早开始喝`);
    } else {
      fuelReview.push("饮水量基本在线");
    }
  } else if (fuelLog && hasFuelIntakeData) {
    if (activity.movingTimeMin > 120 && fuelLog.gelCountActual > 0 && fuelLog.gelCountActual <= 2 && (fuelLog.carbOtherGrams ?? 0) < 30) {
      warnings.push("骑行时间较长但碳水偏少，疑似补给不足");
      fuelReview.push("下次 2 小时以上骑行建议更早补胶，并维持每小时补给节奏");
    }
  }

  let nextDay = "可正常训练，但建议先看早晨主观疲劳再定。";
  if (level === "高") {
    nextDay = "明天优先休息或做 30-60 分钟恢复骑，避免继续堆强度。";
  } else if (level === "中") {
    nextDay = "明天做轻松 Z1/Z2 更合适，暂不建议高质量课。";
  }

  return {
    level,
    recoveryWindow,
    summary: `这是一次${level === "高" ? "恢复优先级很高" : level === "中" ? "中等恢复需求" : "低恢复压力"}的骑行，建议至少预留 ${recoveryWindow} 恢复窗口。`,
    nutrition,
    hydration,
    warnings,
    nextDay,
    fuelReview,
  };
}
