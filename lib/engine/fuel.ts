import type { FuelPlan, RidePlan } from "@/lib/types";

const DOUBLE_GEL_CARBS = 45;
const CAFFEINE_GEL_CARBS = 30;
const BAR_CARBS = 30;
const SALT_CAPSULE_SODIUM_MG = 250;
const BOTTLE_VOLUME_ML = 750;

function roundToFive(value: number) {
  return Math.round(value / 5) * 5;
}

function estimateDurationMin(plan: RidePlan) {
  if (plan.expectedDurationMin) {
    return plan.expectedDurationMin;
  }

  const fallbackSpeedByRideType: Record<RidePlan["rideType"], number> = {
    轻松骑: 24,
    耐力骑: 28,
    拉练: 30,
    爬坡: 22,
    间歇: 27,
    "比赛/高强度": 32,
  };
  const speed = plan.expectedSpeedKmh ?? fallbackSpeedByRideType[plan.rideType] ?? 26;
  const baseHours = Math.max(plan.distanceKm, 0) / Math.max(speed, 1);
  let multiplier = 1;

  if (plan.elevationM >= 500 && plan.elevationM <= 1500) {
    multiplier = 1.08;
  } else if (plan.elevationM > 1500) {
    multiplier = 1.15;
  }

  return Math.max(Math.round(baseHours * multiplier * 60), 45);
}

function carbRangeByHours(hours: number) {
  if (hours < 1.25) return [0, 30] as const;
  if (hours < 2) return [30, 45] as const;
  if (hours < 3) return [45, 60] as const;
  return [60, 90] as const;
}

function getCaffeineGelCount(plan: RidePlan, hours: number) {
  if (!plan.caffeineAccepted || hours < 2) return 0;
  if (hours >= 4 || ["间歇", "比赛/高强度"].includes(plan.rideType)) return 2;
  return 1;
}

function getBarCount(plan: RidePlan, hours: number) {
  if (plan.fuelPreference !== "胶+能量棒") return 0;
  if (hours >= 4) return 2;
  if (hours >= 2) return 1;
  return 0;
}

export function buildFuelPlan(plan: RidePlan): Omit<FuelPlan, "id" | "createdAt"> {
  const durationMin = estimateDurationMin(plan);
  const hours = durationMin / 60;
  const [carbLow, carbHigh] = carbRangeByHours(hours);
  const useHighBound = ["间歇", "比赛/高强度", "爬坡"].includes(plan.rideType);
  const carbTargetGPerH = useHighBound ? carbHigh : Math.round((carbLow + carbHigh) / 2);

  const isHot = plan.isHotHumid || (plan.temperatureC ?? 0) >= 28;
  const fluidTargetMlPerH = isHot ? 800 : 600;
  const sodiumTargetMgPerH = isHot ? 700 : 450;

  const totalCarb = carbTargetGPerH * hours;
  const breakfastDiscount = plan.breakfastStatus === "已进食" ? 25 : 0;
  const effectiveCarb = Math.max(totalCarb - breakfastDiscount, 0);
  const caffeineGelCount = getCaffeineGelCount(plan, hours);
  const barCount = getBarCount(plan, hours);
  const remainingCarbForDoubleGels = Math.max(effectiveCarb - caffeineGelCount * CAFFEINE_GEL_CARBS - barCount * BAR_CARBS, 0);
  const doubleGelCount = Math.ceil(remainingCarbForDoubleGels / DOUBLE_GEL_CARBS);
  const totalGelCount = doubleGelCount + caffeineGelCount;

  const totalFluidMl = Math.ceil((fluidTargetMlPerH * hours) / 100) * 100;
  const electrolyteBottleCount = Math.max(1, Math.ceil(totalFluidMl / BOTTLE_VOLUME_ML));
  const totalSodiumMg = sodiumTargetMgPerH * hours;
  const saltCapsuleCount = isHot || hours >= 3 ? Math.max(1, Math.ceil(totalSodiumMg / 600)) : 0;
  const loadLevel = hours >= 3 || plan.rideType === "比赛/高强度" ? "高" : hours >= 1.5 ? "中" : "低";
  const strategyLevel = hours >= 3 || isHot ? "高补给" : hours >= 1.25 ? "标准" : "轻量";

  const carryingList = [];

  if (doubleGelCount > 0) {
    carryingList.push(`${doubleGelCount} 支双效胶（每支约 ${DOUBLE_GEL_CARBS} g 碳水）`);
  }

  if (caffeineGelCount > 0) {
    carryingList.push(`${caffeineGelCount} 支咖啡胶（每支约 ${CAFFEINE_GEL_CARBS} g 碳水，建议后半程使用）`);
  }

  if (barCount > 0) {
    carryingList.push(`${barCount} 根能量棒（每根约 ${BAR_CARBS} g 碳水，做口味切换）`);
  }

  carryingList.push(`${totalFluidMl} ml 总饮水目标`);
  carryingList.push(`${electrolyteBottleCount} 瓶电解质水或等量补液配置`);

  if (saltCapsuleCount > 0) {
    carryingList.push(`${saltCapsuleCount} 粒盐丸备用（高温、长时或汗盐明显时优先考虑）`);
  }

  if (plan.hasResupply) {
    carryingList.push("保留 1 次便利店/补给点补货余地");
  }

  const firstFuelMinute = hours < 1.25 ? 35 : 25;
  const timeline = [
    `出发前 20-30 分钟：喝 300-500 ml 水${plan.caffeineAccepted ? "，可配 1 份低剂量咖啡因" : ""}`,
    `${firstFuelMinute} 分钟开始第一口补给，避免拖到饿了再吃`,
    `之后每 25-30 分钟补 20-30g 碳水，目标 ${carbTargetGPerH} g/h`,
    `每小时饮水 ${fluidTargetMlPerH} ml，钠 ${sodiumTargetMgPerH} mg`,
  ];

  if (saltCapsuleCount > 0) {
    timeline.push(`若天气热、出汗多或衣服有明显盐渍，可每 60-90 分钟补 1 粒盐丸`);
  }

  const riskFlags: string[] = [];
  if (isHot) riskFlags.push("高温/高湿，脱水与电解质流失风险上升");
  if (plan.elevationM > 1200) riskFlags.push("长爬升较多，体感强度可能高于计划");
  if (!plan.hasResupply && hours >= 3) riskFlags.push("无补给点且时间较长，后程掉功率风险高");
  if (plan.distanceKm <= 50 && plan.elevationM >= 1200) riskFlags.push("距离短但海拔高，时长可能被低估");
  if (plan.breakfastStatus === "空腹/未正式进食" && hours >= 2) riskFlags.push("空腹出发且骑行较长，建议前 45 分钟控制强度并提前开始补给");

  return {
    ridePlanId: plan.id,
    estimatedDurationMin: durationMin,
    loadLevel,
    strategyLevel,
    carbTargetGPerH,
    fluidTargetMlPerH,
    sodiumTargetMgPerH,
    gelCount: totalGelCount,
    electrolyteBottleCount,
    summary: `这次预计 ${Math.round(hours * 10) / 10} 小时，属于${loadLevel}负荷，建议采用${strategyLevel}补给策略。`,
    carryingList,
    timeline,
    riskFlags,
  };
}

export function compareFuelToTarget(
  fuelPlan: Pick<FuelPlan, "estimatedDurationMin" | "carbTargetGPerH" | "fluidTargetMlPerH">,
  actual: { doubleGels: number; caffeineGels: number; carbOtherGrams: number; waterMl: number },
) {
  const hours = fuelPlan.estimatedDurationMin / 60;
  const targetCarb = fuelPlan.carbTargetGPerH * hours;
  const actualCarb = actual.doubleGels * DOUBLE_GEL_CARBS + actual.caffeineGels * CAFFEINE_GEL_CARBS + actual.carbOtherGrams;
  const targetWater = fuelPlan.fluidTargetMlPerH * hours;

  return {
    carbGap: roundToFive(actualCarb - targetCarb),
    waterGap: roundToFive(actual.waterMl - targetWater),
  };
}
