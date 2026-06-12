/**
 * 验证功率曲线页 vs 能力水位页的数据一致性
 * 两页都用 buildPowerCurve，historical scope 应产生相同结果
 */
import { describe, it, expect } from "vitest";
import { buildPowerCurve } from "@/lib/engine/power-curve";
import { evaluateLevel } from "@/lib/engine/cycling-levels";
import type { Activity, User } from "@/lib/types";

function makeActivity(id: string, startTime: string, watts: number[]): Activity {
  return {
    id,
    userId: "u1",
    source: "intervals.icu",
    externalActivityId: `ext-${id}`,
    name: `Ride ${id}`,
    startTime,
    distanceKm: 50,
    movingTimeMin: Math.ceil(watts.length / 60),
    elevationM: 500,
    avgSpeedKmh: 28,
    avgHr: 145,
    avgPower: Math.round(watts.reduce((s, v) => s + v, 0) / watts.length),
    np: undefined,
    ifValue: undefined,
    tss: undefined,
    rawSummaryJson: {},
    rawStreamsJson: { watts },
    createdAt: startTime,
    updatedAt: startTime,
  };
}

function generateWatts(basePower: number, durationSecs: number, spikes?: { at: number; power: number; dur: number }[]): number[] {
  const watts = Array.from({ length: durationSecs }, () => basePower + Math.round((Math.random() - 0.5) * 20));
  for (const spike of spikes ?? []) {
    for (let i = spike.at; i < Math.min(spike.at + spike.dur, durationSecs); i++) {
      watts[i] = spike.power;
    }
  }
  return watts;
}

const user: User = {
  id: "u1",
  email: "test@test.com",
  name: "Test",
  passwordHash: "",
  role: "user",
  userType: "cyclist",
  weightKg: 76,
  ftp: undefined,  // no FTP override
  syncedFtp: undefined,
  syncedWeightKg: undefined,
  maxHr: 190,
  thresholdHr: 170,
  restingHr: 45,
  syncedMaxHr: undefined,
  syncedThresholdHr: undefined,
  syncedRestingHr: undefined,
  primaryDevice: undefined,
  intervalsAthleteId: undefined,
  intervalsApiKeyEncrypted: undefined,
  stravaAthleteId: undefined,
  stravaAccessTokenEncrypted: undefined,
  stravaRefreshTokenEncrypted: undefined,
  onboardingStatus: "complete",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
};

describe("Power curve vs Level page consistency", () => {
  const activities: Activity[] = [
    makeActivity("a1", "2025-01-15T10:00:00Z", generateWatts(200, 3600, [
      { at: 100, power: 900, dur: 5 },    // 5s spike
      { at: 200, power: 500, dur: 60 },   // 1min effort
      { at: 500, power: 350, dur: 300 },  // 5min effort
    ])),
    makeActivity("a2", "2025-03-20T10:00:00Z", generateWatts(220, 7200, [
      { at: 100, power: 850, dur: 5 },
      { at: 300, power: 480, dur: 60 },
      { at: 600, power: 330, dur: 300 },
    ])),
    makeActivity("a3", "2026-05-01T10:00:00Z", generateWatts(210, 5400, [
      { at: 50, power: 800, dur: 5 },
      { at: 200, power: 460, dur: 60 },
      { at: 500, power: 320, dur: 300 },
    ])),
    makeActivity("a4", "2026-05-15T10:00:00Z", generateWatts(230, 3600)),
    makeActivity("a5", "2026-06-01T10:00:00Z", generateWatts(240, 3600)),
  ];

  it("historical evaluateLevel should match buildPowerCurve for non-FTP dimensions", () => {
    const weightKg = user.weightKg!;

    // Path 1: Power curve page - buildPowerCurve without date filter
    const curveAll = buildPowerCurve(activities, weightKg);

    // Path 2: Level page historical - evaluateLevel with scope="historical"
    const historical = evaluateLevel({ activities, user, scope: "historical" });

    // Compare 5s, 1min, 5min
    const durations = [
      { sec: 5, dim: "sprint5s" as const },
      { sec: 60, dim: "burst1min" as const },
      { sec: 300, dim: "vo2_5min" as const },
    ];

    for (const { sec, dim } of durations) {
      const curvePoint = curveAll.curve.find((p) => p.duration === sec);
      const levelValue = historical.byDimension[dim].value;

      const expectedWpkg = curvePoint ? Number((curvePoint.power / weightKg).toFixed(2)) : undefined;

      console.log(`${dim} (${sec}s): curve=${curvePoint?.power}W ${curvePoint?.wpkg} W/kg | level=${levelValue} W/kg | expected=${expectedWpkg}`);

      expect(levelValue).toBe(expectedWpkg);
    }
  });

  it("FTP dimension: with user.ftp set, level page should differ from power curve", () => {
    const userWithFtp = { ...user, ftp: 250 };
    const weightKg = userWithFtp.weightKg!;

    const curveAll = buildPowerCurve(activities, weightKg);
    const historical = evaluateLevel({ activities, user: userWithFtp, scope: "historical" });

    const curve20min = curveAll.curve.find((p) => p.duration === 1200);
    const levelFtp = historical.byDimension.ftp_20min.value;

    const expectedFromFtp = Number((250 / weightKg).toFixed(2));

    console.log(`FTP: curve 20min=${curve20min?.power}W ${curve20min?.wpkg} W/kg | level ftp=${levelFtp} W/kg | expected(from user.ftp)=${expectedFromFtp}`);

    // Level page uses user.ftp=250, not computed 20min best
    expect(levelFtp).toBe(expectedFromFtp);
    // And this should differ from the curve's 20min value (unless they coincidentally match)
    if (curve20min && curve20min.power !== 250) {
      expect(levelFtp).not.toBe(curve20min.wpkg);
    }
  });

  it("FTP dimension: without user.ftp, level page should match power curve 20min", () => {
    const userNoFtp = { ...user, ftp: undefined };
    const weightKg = userNoFtp.weightKg!;

    const curveAll = buildPowerCurve(activities, weightKg);
    const historical = evaluateLevel({ activities, user: userNoFtp, scope: "historical" });

    const curve20min = curveAll.curve.find((p) => p.duration === 1200);
    const levelFtp = historical.byDimension.ftp_20min.value;

    const expectedWpkg = curve20min ? Number((curve20min.power / weightKg).toFixed(2)) : undefined;

    console.log(`FTP (no override): curve=${curve20min?.power}W ${curve20min?.wpkg} W/kg | level=${levelFtp} W/kg | expected=${expectedWpkg}`);

    expect(levelFtp).toBe(expectedWpkg);
  });

  it("recent scope (90d) should show DIFFERENT values from all-time curve when old activities have higher power", () => {
    const weightKg = user.weightKg!;

    const curveAll = buildPowerCurve(activities, weightKg);
    const recent = evaluateLevel({ activities, user, scope: "recent", windowDays: 90 });

    // a1 (2025-01-15) has the highest 5s spike (900W) but is > 90 days old
    // recent should only include a3, a4, a5 (within 90 days of "now")
    const curve5s = curveAll.curve.find((p) => p.duration === 5);
    const recent5s = recent.byDimension.sprint5s.value;

    console.log(`5s: all-time=${curve5s?.power}W ${curve5s?.wpkg} W/kg | recent(90d)=${recent5s} W/kg`);
    console.log(`recent window: ${recent.dataWindow.startDate} ~ ${recent.dataWindow.endDate}, ${recent.dataWindow.activityCount} acts`);

    // If the best 5s is from an old activity, recent should be lower
    if (curve5s && curve5s.power === 900) {
      // a1's 900W spike is from 2025-01-15, which is > 90 days ago
      // So recent 5s should be from a3's 800W spike (or lower)
      expect(recent5s).toBeLessThan(curve5s.wpkg!);
    }
  });
});
