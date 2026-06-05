import { describe, it, expect } from "vitest";
import { correlateSegmentWithTraining } from "@/lib/engine/segments/segments-correlation";
import type { Segment, SegmentEffort } from "@/lib/types";
import type { PmcDataPoint } from "@/lib/engine/pmc";

function mkSeg(over: Partial<Segment> = {}): Segment {
  return {
    id: "s1", stravaSegmentId: 1, name: "test", distance: 5000, averageGrade: 3,
    climbCategory: 0, createdAt: "", updatedAt: "", ...over,
  };
}

function mkEffort(over: Partial<SegmentEffort> = {}): SegmentEffort {
  return {
    id: "e1", segmentId: "s1", activityId: "a1", userId: "u1",
    stravaEffortId: BigInt(1), elapsedTime: 600, movingTime: 590,
    startDate: "2025-01-01T00:00:00Z", createdAt: "", ...over,
  };
}

function mkPmc(over: Partial<PmcDataPoint> = {}): PmcDataPoint {
  return { date: "2025-01-01", ctl: 50, atl: 60, tsb: -10, dailyTss: 80, activities: [], ...over };
}

describe("correlateSegmentWithTraining", () => {
  it("returns empty result for no efforts", () => {
    const result = correlateSegmentWithTraining({ efforts: [], segment: mkSeg(), pmcData: [] });
    expect(result.points).toHaveLength(0);
    expect(result.tsbToSpeedCorrelation).toBe(0);
    expect(result.insight).toContain("数据不足");
  });

  it("returns insufficient data insight when < 3 matched points", () => {
    const efforts = [
      mkEffort({ startDate: "2025-01-01T10:00:00Z" }),
      mkEffort({ id: "e2", startDate: "2025-01-02T10:00:00Z" }),
    ];
    const pmcData = [mkPmc({ date: "2025-01-01" })]; // only 1 matches
    const result = correlateSegmentWithTraining({ efforts, segment: mkSeg(), pmcData });
    expect(result.insight).toContain("数据不足");
  });

  it("computes positive TSB-speed correlation", () => {
    // Higher TSB → faster (lower elapsed time → higher speed)
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 700, startDate: "2025-01-01T10:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 650, startDate: "2025-01-08T10:00:00Z" }),
      mkEffort({ id: "e3", elapsedTime: 600, startDate: "2025-01-15T10:00:00Z" }),
      mkEffort({ id: "e4", elapsedTime: 580, startDate: "2025-01-22T10:00:00Z" }),
    ];
    const pmcData = [
      mkPmc({ date: "2025-01-01", tsb: -20 }),
      mkPmc({ date: "2025-01-08", tsb: -5 }),
      mkPmc({ date: "2025-01-15", tsb: 5 }),
      mkPmc({ date: "2025-01-22", tsb: 15 }),
    ];
    const result = correlateSegmentWithTraining({ efforts, segment: mkSeg(), pmcData });
    expect(result.points).toHaveLength(4);
    // TSB goes up, speed goes up → positive correlation
    expect(result.tsbToSpeedCorrelation).toBeGreaterThan(0.3);
    expect(result.insight).toContain("TSB");
    expect(result.insight).toContain("恢复到位");
  });

  it("generates non-correlation insight when no significant correlation", () => {
    // Constant TSB/CTL → zero variance → pearsonR = 0
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 600, startDate: "2025-01-01T10:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 610, startDate: "2025-01-08T10:00:00Z" }),
      mkEffort({ id: "e3", elapsedTime: 595, startDate: "2025-01-15T10:00:00Z" }),
    ];
    const pmcData = [
      mkPmc({ date: "2025-01-01", tsb: 0, ctl: 50 }),
      mkPmc({ date: "2025-01-08", tsb: 0, ctl: 50 }),
      mkPmc({ date: "2025-01-15", tsb: 0, ctl: 50 }),
    ];
    const result = correlateSegmentWithTraining({ efforts, segment: mkSeg(), pmcData });
    expect(result.insight).toContain("暂无显著关联");
  });
});
