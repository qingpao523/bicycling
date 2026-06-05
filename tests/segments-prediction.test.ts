import { describe, it, expect } from "vitest";
import { predictSegmentEta } from "@/lib/engine/segments/segments-prediction";
import type { SegmentEffort } from "@/lib/types";

function mkEffort(over: Partial<SegmentEffort> = {}): SegmentEffort {
  return {
    id: "e1", segmentId: "s1", activityId: "a1", userId: "u1",
    stravaEffortId: BigInt(1), elapsedTime: 120, movingTime: 118,
    startDate: "2025-01-01T00:00:00Z", createdAt: "", ...over,
  };
}

describe("predictSegmentEta", () => {
  it("returns already achieved when currentBest <= targetTime", () => {
    const result = predictSegmentEta({
      efforts: [mkEffort({ elapsedTime: 100 })],
      targetTime: 110,
    });
    expect(result.predictedWeeks).toBe(0);
    expect(result.note).toBe("已达成目标");
    expect(result.confidence).toBe("high");
  });

  it("returns insufficient data for single effort", () => {
    const result = predictSegmentEta({
      efforts: [mkEffort({ elapsedTime: 120 })],
      targetTime: 100,
    });
    expect(result.predictedWeeks).toBe(Infinity);
    expect(result.method).toBe("insufficient_data");
    expect(result.note).toContain("数据不足");
  });

  it("predicts weeks for improving efforts", () => {
    // Efforts improving ~5s per week over 4 weeks
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 140, startDate: "2025-01-01T00:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 135, startDate: "2025-01-08T00:00:00Z" }),
      mkEffort({ id: "e3", elapsedTime: 130, startDate: "2025-01-15T00:00:00Z" }),
      mkEffort({ id: "e4", elapsedTime: 125, startDate: "2025-01-22T00:00:00Z" }),
      mkEffort({ id: "e5", elapsedTime: 120, startDate: "2025-01-29T00:00:00Z" }),
    ];
    const result = predictSegmentEta({ efforts, targetTime: 100 });
    expect(result.predictedWeeks).toBeGreaterThan(0);
    expect(result.predictedWeeks).toBeLessThan(20);
    expect(result.weeklyGainSeconds).toBeGreaterThan(0);
    expect(result.confidence).toBe("high"); // 5 efforts
    expect(result.method).toBe("linear_regression");
  });

  it("returns Infinity for non-improving efforts", () => {
    // Times getting worse
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 120, startDate: "2025-01-01T00:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 125, startDate: "2025-01-08T00:00:00Z" }),
      mkEffort({ id: "e3", elapsedTime: 130, startDate: "2025-01-15T00:00:00Z" }),
    ];
    const result = predictSegmentEta({ efforts, targetTime: 100 });
    expect(result.predictedWeeks).toBe(Infinity);
    expect(result.note).toContain("未见进步");
  });

  it("calculates range as [0.6x, 1.5x] of predicted weeks", () => {
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 200, startDate: "2025-01-01T00:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 190, startDate: "2025-01-08T00:00:00Z" }),
      mkEffort({ id: "e3", elapsedTime: 180, startDate: "2025-01-15T00:00:00Z" }),
    ];
    const result = predictSegmentEta({ efforts, targetTime: 150 });
    expect(result.rangeWeeks[0]).toBeLessThan(result.predictedWeeks);
    expect(result.rangeWeeks[1]).toBeGreaterThan(result.predictedWeeks);
    expect(result.confidence).toBe("medium"); // 3 efforts
  });
});
