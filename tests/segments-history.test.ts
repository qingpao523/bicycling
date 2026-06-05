import { describe, it, expect } from "vitest";
import { buildSegmentHistory } from "@/lib/engine/segments/segments-history";
import type { Segment, SegmentEffort } from "@/lib/types";

function mkSeg(over: Partial<Segment> = {}): Segment {
  return {
    id: "s1", stravaSegmentId: 1, name: "test", distance: 1000, averageGrade: 3,
    climbCategory: 0, createdAt: "", updatedAt: "", ...over,
  };
}

function mkEffort(over: Partial<SegmentEffort> = {}): SegmentEffort {
  return {
    id: "e1", segmentId: "s1", activityId: "a1", userId: "u1",
    stravaEffortId: BigInt(1), elapsedTime: 120, movingTime: 118,
    startDate: "2025-01-01T00:00:00Z", createdAt: "", ...over,
  };
}

describe("buildSegmentHistory", () => {
  it("returns empty trend for no efforts", () => {
    const trend = buildSegmentHistory([], mkSeg());
    expect(trend.points).toHaveLength(0);
    expect(trend.bestTime).toBe(0);
    expect(trend.totalAttempts).toBe(0);
    expect(trend.recentTrend).toBe("stable");
  });

  it("handles single effort", () => {
    const trend = buildSegmentHistory([mkEffort()], mkSeg());
    expect(trend.points).toHaveLength(1);
    expect(trend.bestTime).toBe(120);
    expect(trend.worstTime).toBe(120);
    expect(trend.totalAttempts).toBe(1);
    expect(trend.points[0].isPr).toBe(true);
    expect(trend.points[0].speed).toBeGreaterThan(0);
  });

  it("detects PRs across 5 efforts", () => {
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 130, startDate: "2025-01-01T00:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 125, startDate: "2025-01-08T00:00:00Z" }),
      mkEffort({ id: "e3", elapsedTime: 128, startDate: "2025-01-15T00:00:00Z" }),
      mkEffort({ id: "e4", elapsedTime: 120, startDate: "2025-01-22T00:00:00Z" }),
      mkEffort({ id: "e5", elapsedTime: 122, startDate: "2025-01-29T00:00:00Z" }),
    ];
    const trend = buildSegmentHistory(efforts, mkSeg());
    expect(trend.totalAttempts).toBe(5);
    // PRs: e1 (first=always PR), e2 (125<130), e4 (120<125)
    const prs = trend.points.filter((p) => p.isPr);
    expect(prs).toHaveLength(3);
    expect(trend.bestTime).toBe(120);
    expect(trend.worstTime).toBe(130);
  });

  it("calculates improvement percentage", () => {
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 200, startDate: "2025-01-01T00:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 180, startDate: "2025-02-01T00:00:00Z" }),
      mkEffort({ id: "e3", elapsedTime: 160, startDate: "2025-03-01T00:00:00Z" }),
    ];
    const trend = buildSegmentHistory(efforts, mkSeg());
    // improvementPct = (200 - 160) / 200 * 100 = 20%
    expect(trend.improvementPct).toBe(20);
  });

  it("detects declining trend", () => {
    // Need >= 4 efforts, prev3 exist (slice(-6,-3)), recent3 faster by > 2%
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 100, startDate: "2025-01-01T00:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 102, startDate: "2025-01-08T00:00:00Z" }),
      mkEffort({ id: "e3", elapsedTime: 101, startDate: "2025-01-15T00:00:00Z" }),
      mkEffort({ id: "e4", elapsedTime: 110, startDate: "2025-01-22T00:00:00Z" }),
      mkEffort({ id: "e5", elapsedTime: 112, startDate: "2025-01-29T00:00:00Z" }),
      mkEffort({ id: "e6", elapsedTime: 115, startDate: "2025-02-05T00:00:00Z" }),
    ];
    const trend = buildSegmentHistory(efforts, mkSeg());
    // prev3 avg = (100+102+101)/3 = 101, recent3 avg = (110+112+115)/3 = 112.3
    // delta = (112.3-101)/101 = 0.112 > 0.02 → declining
    expect(trend.recentTrend).toBe("declining");
  });
});
