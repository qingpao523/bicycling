import type { Activity, FuelLog, User } from "@/lib/types";

type NumericMap = Record<string, number | undefined>;

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pickNumeric(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(raw[key]);
    if (typeof value === "number") return value;
  }
  return undefined;
}

function average(values: Array<number | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!usable.length) return undefined;
  return Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(2));
}

function ratio(a?: number, b?: number, digits = 2) {
  if (typeof a !== "number" || typeof b !== "number" || b === 0) return undefined;
  return Number((a / b).toFixed(digits));
}

function delta(a?: number, b?: number, digits = 1) {
  if (typeof a !== "number" || typeof b !== "number") return undefined;
  return Number((a - b).toFixed(digits));
}

function isRideActivity(activity: Activity) {
  const type = String(activity.rawSummaryJson?.type ?? activity.rawSummaryJson?.activity_type ?? "").toLowerCase();
  const name = activity.name.toLowerCase();
  return type.includes("ride") || name.includes("骑行") || name.includes("ride");
}

function classifyLoad(activity: Activity) {
  if ((activity.tss ?? 0) >= 180 || (activity.ifValue ?? 0) >= 0.85 || activity.movingTimeMin >= 240) {
    return "very_high";
  }
  if ((activity.tss ?? 0) >= 130 || (activity.ifValue ?? 0) >= 0.78 || activity.movingTimeMin >= 180) {
    return "high";
  }
  if ((activity.tss ?? 0) >= 80 || activity.movingTimeMin >= 90) {
    return "moderate";
  }
  return "low";
}

function toNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asNumber(item))
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function sliceAverage(values: number[], startRatio: number, endRatio: number) {
  if (!values.length) return undefined;
  const start = Math.max(0, Math.floor(values.length * startRatio));
  const end = Math.max(start + 1, Math.floor(values.length * endRatio));
  return average(values.slice(start, end));
}

function buildStreamDerivedFeatures(activity: Activity) {
  const streams = activity.rawStreamsJson ?? {};
  const watts = toNumberArray(streams.watts);
  const heartRate = toNumberArray(streams.heartrate);
  const cadence = toNumberArray(streams.cadence);
  const speed = toNumberArray(streams.velocity_smooth).map((value) => Number((value * 3.6).toFixed(2)));
  const altitude = toNumberArray(streams.altitude);
  const time = toNumberArray(streams.time);

  if (!watts.length && !heartRate.length && !speed.length) {
    return null;
  }

  const firstHalfPower = sliceAverage(watts, 0, 0.5);
  const secondHalfPower = sliceAverage(watts, 0.5, 1);
  const firstHalfHr = sliceAverage(heartRate, 0, 0.5);
  const secondHalfHr = sliceAverage(heartRate, 0.5, 1);
  const firstHalfSpeed = sliceAverage(speed, 0, 0.5);
  const secondHalfSpeed = sliceAverage(speed, 0.5, 1);
  const firstThirdPower = sliceAverage(watts, 0, 0.33);
  const finalThirdPower = sliceAverage(watts, 0.66, 1);
  const firstThirdHr = sliceAverage(heartRate, 0, 0.33);
  const finalThirdHr = sliceAverage(heartRate, 0.66, 1);
  const lateRidePowerFade = ratio(finalThirdPower, firstThirdPower, 3);
  const hrDrift = firstThirdHr && finalThirdHr ? Number((((finalThirdHr - firstThirdHr) / firstThirdHr) * 100).toFixed(2)) : undefined;
  const powerFade = firstHalfPower && secondHalfPower ? Number((((secondHalfPower - firstHalfPower) / firstHalfPower) * 100).toFixed(2)) : undefined;
  const speedFade = firstHalfSpeed && secondHalfSpeed ? Number((((secondHalfSpeed - firstHalfSpeed) / firstHalfSpeed) * 100).toFixed(2)) : undefined;

  const streamSamples = watts.length || heartRate.length || speed.length;
  const segmentCount = Math.min(Math.max(Math.floor(streamSamples / 300), 3), 8);
  const segmentSummaries = Array.from({ length: segmentCount }, (_, index) => {
    const start = index / segmentCount;
    const end = (index + 1) / segmentCount;
    const startMinute = time.length ? Math.round((time[Math.floor(time.length * start)] ?? 0) / 60) : Math.round(activity.movingTimeMin * start);
    const endMinute = time.length ? Math.round((time[Math.min(time.length - 1, Math.floor(time.length * end) - 1)] ?? 0) / 60) : Math.round(activity.movingTimeMin * end);
    return {
      segment: index + 1,
      minute_range: `${startMinute}-${endMinute}`,
      avg_power: sliceAverage(watts, start, end),
      avg_hr: sliceAverage(heartRate, start, end),
      avg_speed_kmh: sliceAverage(speed, start, end),
      avg_cadence: sliceAverage(cadence, start, end),
      altitude_delta_m:
        altitude.length
          ? delta(
              altitude[Math.min(altitude.length - 1, Math.floor(altitude.length * end) - 1)],
              altitude[Math.floor(altitude.length * start)],
            )
          : undefined,
    };
  });

  return {
    has_streams: true,
    stream_sample_count: streamSamples,
    first_half: {
      avg_power: firstHalfPower,
      avg_hr: firstHalfHr,
      avg_speed_kmh: firstHalfSpeed,
    },
    second_half: {
      avg_power: secondHalfPower,
      avg_hr: secondHalfHr,
      avg_speed_kmh: secondHalfSpeed,
    },
    fatigue_signals: {
      power_fade_pct: powerFade,
      speed_fade_pct: speedFade,
      late_ride_power_ratio: lateRidePowerFade,
      heart_rate_drift_pct: hrDrift,
    },
    segment_summaries: segmentSummaries,
  };
}

function deriveZoneEstimate(activity: Activity, user: User, raw: Record<string, unknown>) {
  const ftp = user.ftp;
  const avgPower = activity.avgPower;
  const np = activity.np;
  const ifValue = activity.ifValue;

  if (!ftp || (!avgPower && !np && !ifValue)) {
    return null;
  }

  const normalizedPower = np ?? (ifValue ? ftp * ifValue : avgPower);
  const avgPowerPctFtp = ratio(avgPower, ftp, 3);
  const npPctFtp = ratio(normalizedPower, ftp, 3);
  const variabilityIndex = ratio(normalizedPower, avgPower, 2);

  const powerBuckets = {
    z1_recovery: pickNumeric(raw, ["z1_time", "power_zone1_time", "zone1_time"]),
    z2_endurance: pickNumeric(raw, ["z2_time", "power_zone2_time", "zone2_time"]),
    z3_tempo: pickNumeric(raw, ["z3_time", "power_zone3_time", "zone3_time"]),
    z4_threshold: pickNumeric(raw, ["z4_time", "power_zone4_time", "zone4_time"]),
    z5_vo2: pickNumeric(raw, ["z5_time", "power_zone5_time", "zone5_time"]),
    z6_anaerobic: pickNumeric(raw, ["z6_time", "power_zone6_time", "zone6_time"]),
    z7_neuromuscular: pickNumeric(raw, ["z7_time", "power_zone7_time", "zone7_time"]),
  };

  return {
    ftp,
    avg_power_pct_ftp: avgPowerPctFtp,
    normalized_power_pct_ftp: npPctFtp,
    variability_index: variabilityIndex,
    estimated_power_zones: powerBuckets,
  };
}

function deriveHeartRateFeatures(activity: Activity, user: User, raw: Record<string, unknown>) {
  const avgHr = activity.avgHr;
  const observedMaxHr = pickNumeric(raw, ["max_heartrate", "max_hr"]);
  const observedMinHr = pickNumeric(raw, ["min_heartrate", "min_hr"]);
  const maxHr = user.maxHr ?? observedMaxHr;
  const restingHr = user.restingHr ?? observedMinHr;
  const thresholdHr = user.thresholdHr;
  const hrReserveUsage = avgHr && maxHr && restingHr ? ratio(avgHr - restingHr, maxHr - restingHr, 3) : undefined;
  const hrToPower = activity.avgPower && avgHr ? ratio(avgHr, activity.avgPower, 3) : undefined;
  const avgHrPctThreshold = avgHr && thresholdHr ? ratio(avgHr, thresholdHr, 3) : undefined;
  const avgHrPctMax = avgHr && maxHr ? ratio(avgHr, maxHr, 3) : undefined;
  const observedMaxHrPctUserMax = observedMaxHr && maxHr ? ratio(observedMaxHr, maxHr, 3) : undefined;

  const hrBuckets = {
    z1: pickNumeric(raw, ["hr_zone1_time", "heartrate_zone1_time"]),
    z2: pickNumeric(raw, ["hr_zone2_time", "heartrate_zone2_time"]),
    z3: pickNumeric(raw, ["hr_zone3_time", "heartrate_zone3_time"]),
    z4: pickNumeric(raw, ["hr_zone4_time", "heartrate_zone4_time"]),
    z5: pickNumeric(raw, ["hr_zone5_time", "heartrate_zone5_time"]),
  };

  return {
    threshold_hr: thresholdHr,
    user_max_hr: maxHr,
    user_resting_hr: restingHr,
    observed_max_hr: observedMaxHr,
    observed_min_hr: observedMinHr,
    hr_reserve_usage: hrReserveUsage,
    avg_hr_pct_threshold: avgHrPctThreshold,
    avg_hr_pct_max: avgHrPctMax,
    observed_max_hr_pct_user_max: observedMaxHrPctUserMax,
    hr_to_power_ratio: hrToPower,
    estimated_hr_zones: hrBuckets,
  };
}

function derivePacingFeatures(activity: Activity, raw: Record<string, unknown>) {
  const movingTimeMin = activity.movingTimeMin;
  const elapsedTimeMin = Math.round((pickNumeric(raw, ["elapsed_time"]) ?? activity.movingTimeMin * 60) / 60);
  const stopRatio = ratio(elapsedTimeMin - movingTimeMin, elapsedTimeMin, 3);
  const ascentRate = activity.elevationM && movingTimeMin ? Number(((activity.elevationM / movingTimeMin) * 60).toFixed(1)) : undefined;
  const climbingDensity = activity.distanceKm ? Number((activity.elevationM / activity.distanceKm).toFixed(1)) : undefined;
  const speedVsPower = activity.avgPower && activity.avgSpeedKmh ? ratio(activity.avgSpeedKmh, activity.avgPower, 3) : undefined;
  const cadence = pickNumeric(raw, ["average_cadence", "avg_cadence"]);
  const cadenceMax = pickNumeric(raw, ["max_cadence"]);
  const torqueBias = cadence && activity.avgPower ? ratio(activity.avgPower, cadence, 3) : undefined;

  return {
    elapsed_time_min: elapsedTimeMin,
    stoppage_ratio: stopRatio,
    ascent_rate_m_per_h: ascentRate,
    climbing_density_m_per_km: climbingDensity,
    speed_to_power_ratio: speedVsPower,
    average_cadence: cadence,
    max_cadence: cadenceMax,
    torque_bias_proxy: torqueBias,
  };
}

function deriveEnergyFeatures(activity: Activity, raw: Record<string, unknown>, fuelLog?: FuelLog) {
  const kilojoules = pickNumeric(raw, ["kilojoules", "kj", "work"]);
  const calories = pickNumeric(raw, ["calories"]);
  const workRate = kilojoules && activity.movingTimeMin ? Number((kilojoules / activity.movingTimeMin).toFixed(2)) : undefined;
  const carbFromDoubleGels = (fuelLog?.doubleGelCountActual ?? 0) * 45;
  const carbFromCaffeineGels = (fuelLog?.caffeineGelCountActual ?? 0) * 30;
  const carbOtherGrams = fuelLog?.carbOtherGrams ?? 0;
  const carbFromGels =
    fuelLog && carbFromDoubleGels + carbFromCaffeineGels + carbOtherGrams > 0
      ? carbFromDoubleGels + carbFromCaffeineGels + carbOtherGrams
      : undefined;
  const fluidPerHour =
    fuelLog && fuelLog.waterMlActual > 0
      ? Number((fuelLog.waterMlActual / Math.max(activity.movingTimeMin / 60, 0.5)).toFixed(1))
      : undefined;

  return {
    kilojoules,
    calories,
    work_rate_kj_per_min: workRate,
    actual_carb_from_gels_g: carbFromGels,
    actual_fluid_ml_per_h: fluidPerHour,
  };
}

function deriveLoadContext(activity: Activity, recentActivities: Activity[]) {
  const previous = recentActivities
    .filter((item) => item.id !== activity.id && isRideActivity(item))
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, 7);

  const recentAvgTss = average(previous.map((item) => item.tss));
  const recentAvgDuration = average(previous.map((item) => item.movingTimeMin));
  const recentAvgElevation = average(previous.map((item) => item.elevationM));
  const recentAvgIf = average(previous.map((item) => item.ifValue));

  return {
    current_load_bucket: classifyLoad(activity),
    recent_sample_size: previous.length,
    recent_avg_tss: recentAvgTss,
    recent_avg_duration_min: recentAvgDuration,
    recent_avg_elevation_m: recentAvgElevation,
    recent_avg_if: recentAvgIf,
    baseline_label: previous.length ? `近 ${previous.length} 次骑行均值` : undefined,
    current_vs_recent: {
      tss_delta: delta(activity.tss, recentAvgTss),
      duration_delta_min: delta(activity.movingTimeMin, recentAvgDuration),
      elevation_delta_m: delta(activity.elevationM, recentAvgElevation),
      if_delta: delta(activity.ifValue, recentAvgIf, 2),
    },
  };
}

export function buildActivityFeatures(input: {
  activity: Activity;
  user: User;
  fuelLog?: FuelLog;
  recentActivities?: Activity[];
}) {
  const raw = input.activity.rawSummaryJson ?? {};

  const keyMetrics: NumericMap = {
    avg_speed_kmh: input.activity.avgSpeedKmh,
    distance_km: input.activity.distanceKm,
    duration_min: input.activity.movingTimeMin,
    elevation_m: input.activity.elevationM,
    avg_hr: input.activity.avgHr,
    avg_power: input.activity.avgPower,
    np: input.activity.np,
    if: input.activity.ifValue,
    tss: input.activity.tss,
    temperature_c: input.activity.temperatureC,
    ctl: input.activity.recentCtl,
    atl: input.activity.recentAtl,
    form: input.activity.recentForm,
  };

  return {
    key_metrics: keyMetrics,
    power_profile: deriveZoneEstimate(input.activity, input.user, raw),
    heart_rate_profile: deriveHeartRateFeatures(input.activity, input.user, raw),
    pacing_profile: derivePacingFeatures(input.activity, raw),
    energy_profile: deriveEnergyFeatures(input.activity, raw, input.fuelLog),
    load_context: deriveLoadContext(input.activity, input.recentActivities ?? []),
    stream_analysis: buildStreamDerivedFeatures(input.activity),
  };
}
