import type { Activity, FuelLog, RecoveryAdvice } from "@/lib/types";
import type { buildActivityFeatures } from "@/lib/engine/activity-features";

type Features = ReturnType<typeof buildActivityFeatures>;

function compactItems(items: string[], limit = 3) {
  return items.filter(Boolean).slice(0, limit);
}

function metricText(value: number | undefined, suffix: string, digits = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) return "暂无足够数据";
  return `${digits > 0 ? value.toFixed(digits) : value}${suffix}`;
}

function rangeText(from: number | undefined, to: number | undefined, suffix: string, digits = 0) {
  if (typeof from !== "number" || Number.isNaN(from) || typeof to !== "number" || Number.isNaN(to)) {
    return "暂无流数据";
  }
  return `从 ${from.toFixed(digits)}${suffix} 到 ${to.toFixed(digits)}${suffix}`;
}

function compareAgainstAverageText(
  current: number | undefined,
  average: number | undefined,
  suffix: string,
  digits = 0,
) {
  if (typeof current !== "number" || Number.isNaN(current) || typeof average !== "number" || Number.isNaN(average)) {
    return {
      value: "暂无近期基线" as string,
      highlight: undefined as string | undefined,
      highlightTone: undefined as "positive" | "negative" | undefined,
    };
  }
  const currentText = current.toFixed(digits);
  const averageText = average.toFixed(digits);
  const deltaValue = Number((current - average).toFixed(digits));
  return {
    value: `当前 ${currentText}${suffix}，均值 ${averageText}${suffix}`,
    highlight: `差值 ${deltaValue > 0 ? "+" : ""}${deltaValue.toFixed(digits)}${suffix}`,
    highlightTone: deltaValue < 0 ? ("negative" as const) : ("positive" as const),
  };
}

export function buildActivityGlanceTabs(input: {
  activity: Activity;
  fuelLog?: FuelLog | null;
  recovery: RecoveryAdvice;
  features: Features;
}) {
  const { activity, fuelLog, recovery, features } = input;

  const pacingGlanceItems = compactItems(
    [
      `爬升密度：${metricText(features.pacing_profile.climbing_density_m_per_km, " m/km", 1)}`,
      `爬升速率：${metricText(features.pacing_profile.ascent_rate_m_per_h, " m/h", 0)}`,
      `停顿比例：${typeof features.pacing_profile.stoppage_ratio === "number" ? `${Math.round(features.pacing_profile.stoppage_ratio * 100)}%` : "暂无足够数据"}`,
      `平均踏频：${metricText(features.pacing_profile.average_cadence, " rpm", 0)}`,
    ],
    4,
  );
  const fatigueGlanceItems = compactItems(
    [
      rangeText(features.stream_analysis?.first_half.avg_power, features.stream_analysis?.second_half.avg_power, " W", 0),
      rangeText(features.stream_analysis?.first_half.avg_speed_kmh, features.stream_analysis?.second_half.avg_speed_kmh, " km/h", 1),
      rangeText(features.stream_analysis?.first_half.avg_hr, features.stream_analysis?.second_half.avg_hr, " bpm", 0),
      `主观疲劳：${fuelLog ? `${fuelLog.fatigueScore}/10，腿部 ${fuelLog.legFatigueScore}/10` : "还没填写骑后主观反馈"}`,
    ],
    4,
  );
  const compareGlanceItems = [
    compareAgainstAverageText(activity.movingTimeMin, features.load_context.recent_avg_duration_min, " min", 0),
    compareAgainstAverageText(activity.elevationM, features.load_context.recent_avg_elevation_m, " m", 0),
    compareAgainstAverageText(activity.tss, features.load_context.recent_avg_tss, "", 0),
    compareAgainstAverageText(activity.ifValue, features.load_context.recent_avg_if, "", 2),
  ];

  return [
    {
      key: "recovery" as const,
      label: "恢复",
      items: [
        { label: "恢复等级", value: `${recovery.level}负荷，优先恢复` },
        { label: "恢复窗口", value: `建议预留 ${recovery.recoveryWindow}` },
        {
          label: "补给状态",
          value: fuelLog
            ? recovery.fuelReview.length
              ? recovery.fuelReview[0]
              : "已记录补给，可继续修正建议"
            : "待补充骑后补给记录",
        },
        { label: "次日建议", value: recovery.nextDay },
      ],
    },
    {
      key: "pacing" as const,
      label: "配速",
      items: [
        { label: "路线特征", value: pacingGlanceItems[0] ?? "暂无足够数据" },
        { label: "爬升效率", value: pacingGlanceItems[1] ?? "暂无足够数据" },
        { label: "停顿情况", value: pacingGlanceItems[2] ?? "暂无足够数据" },
        { label: "踩踏节奏", value: pacingGlanceItems[3] ?? "暂无足够数据" },
      ],
    },
    {
      key: "fatigue" as const,
      label: "疲劳",
      items: [
        {
          label: "功率走势",
          value: fatigueGlanceItems[0] ?? "暂无流数据",
          action: fatigueGlanceItems[0] ? undefined : { kind: "backfill" as const, activityId: activity.id },
        },
        {
          label: "速度走势",
          value: fatigueGlanceItems[1] ?? "暂无流数据",
          action: fatigueGlanceItems[1] ? undefined : { kind: "backfill" as const, activityId: activity.id },
        },
        {
          label: "心率漂移",
          value: fatigueGlanceItems[2] ?? "暂无流数据",
          action: fatigueGlanceItems[2] ? undefined : { kind: "backfill" as const, activityId: activity.id },
        },
        {
          label: "主观反馈",
          value: fatigueGlanceItems[3] ?? "还没填写骑后主观反馈",
          action: fuelLog ? undefined : { kind: "fill_fuel" as const },
        },
      ],
    },
    {
      key: "compare" as const,
      label: "对比",
      items: [
        {
          label: "时长对比",
          badge: "近7次",
          value: compareGlanceItems[0]?.value ?? "暂无近期基线",
          highlight: compareGlanceItems[0]?.highlight,
          highlightTone: compareGlanceItems[0]?.highlightTone,
        },
        {
          label: "爬升对比",
          badge: "近7次",
          value: compareGlanceItems[1]?.value ?? "暂无近期基线",
          highlight: compareGlanceItems[1]?.highlight,
          highlightTone: compareGlanceItems[1]?.highlightTone,
        },
        {
          label: "负荷对比",
          badge: "近7次",
          value: compareGlanceItems[2]?.value ?? "暂无近期基线",
          highlight: compareGlanceItems[2]?.highlight,
          highlightTone: compareGlanceItems[2]?.highlightTone,
        },
        {
          label: "强度对比",
          badge: "近7次",
          value: compareGlanceItems[3]?.value ?? "暂无近期基线",
          highlight: compareGlanceItems[3]?.highlight,
          highlightTone: compareGlanceItems[3]?.highlightTone,
        },
      ],
    },
  ];
}
