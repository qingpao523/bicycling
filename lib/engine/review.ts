import type { Activity, FuelLog, RideReview } from "@/lib/types";

export function buildRideReview(input: { activity: Activity; fuelLog?: FuelLog }): RideReview {
  const { activity, fuelLog } = input;
  const findings: string[] = [];
  const highlights: string[] = [];
  const problems: string[] = [];
  const causes: string[] = [];
  const nextAdvice: string[] = [];

  const rideType =
    (activity.ifValue ?? 0) >= 0.9
      ? "比赛/近比赛"
      : activity.movingTimeMin >= 180 && activity.elevationM >= 1000
        ? "爬坡拉练"
        : activity.movingTimeMin >= 120
          ? "Endurance"
          : "短轻松骑";

  if ((activity.ifValue ?? 0) >= 0.8 || (activity.tss ?? 0) >= 150) {
    findings.push("high_load");
    highlights.push("整体训练刺激充足，这次不是随便刷里程。");
  }

  if (activity.elevationM >= 1000) {
    findings.push("climbing_focus");
    highlights.push("爬升占比较高，专项耐力价值不错。");
  }

  if ((activity.avgHr ?? 0) >= 150 && activity.movingTimeMin >= 150) {
    findings.push("high_hr_drift");
    problems.push("长时间维持较高心率，恢复成本偏高。");
    causes.push("可能前半程节奏略激进，或天气偏热。");
  }

  if (fuelLog?.symptoms.includes("饿崩") || fuelLog?.symptoms.includes("明显口渴")) {
    findings.push("possible_underfueling");
    problems.push("补给链条出现明显风险信号。");
    causes.push("骑中碳水/液体启动偏晚，或者单次补给间隔过长。");
  }

  if ((fuelLog?.fatigueScore ?? 0) >= 8 || (fuelLog?.legFatigueScore ?? 0) >= 8) {
    findings.push("late_ride_fatigue");
    problems.push("后程疲劳感较重，说明这次负荷已经踩到上限附近。");
  }

  if (!highlights.length) {
    highlights.push("整体完成度尚可，基础节奏没有明显失控。");
  }

  if (!problems.length) {
    problems.push("没有看到明显失败点，完成度比较高。");
  }

  if (!causes.length) {
    causes.push("这次更多像是计划内完成，问题主要在恢复管理而不是执行失误。");
  }

  nextAdvice.push("类似时长的骑行，下次把第一口补给提前到 25-30 分钟。");
  nextAdvice.push("如果第二天还想练，今晚优先完成补碳水、补液和早睡。");

  const oneLine =
    rideType === "比赛/近比赛"
      ? "这是一次强度明显偏高的骑行，训练刺激很足，但恢复压力也很大。"
      : rideType === "爬坡拉练"
        ? "这是一次中高负荷的耐力爬坡骑行，爬坡专项价值不错。"
        : rideType === "Endurance"
          ? "这是一次以耐力为主的训练，整体节奏相对稳定。"
          : "这是一次负担较低的短骑，更偏向维持状态。";

  return {
    oneLine,
    rideType,
    highlights,
    problems,
    causes,
    nextAdvice,
    engineFindings: findings,
  };
}
