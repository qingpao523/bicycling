import { describe, it, expect } from "vitest";
import { analyzeSegmentCausation } from "@/lib/engine/segments/segments-causation";
import type { Activity, Segment, SegmentEffort } from "@/lib/types";

function mkSeg(over: Partial<Segment> = {}): Segment {
  return {
    id: "s1", stravaSegmentId: 1, name: "test climb", distance: 5000, averageGrade: 5,
    climbCategory: 0, createdAt: "", updatedAt: "", ...over,
  };
}

function mkEffort(over: Partial<SegmentEffort> = {}): SegmentEffort {
  return {
    id: "e1", segmentId: "s1", activityId: "a1", userId: "u1",
    stravaEffortId: BigInt(1), elapsedTime: 600, movingTime: 590,
    startDate: "2025-03-01T10:00:00Z", createdAt: "", ...over,
  };
}

function mkActivity(over: Partial<Activity> = {}): Activity {
  return {
    id: "a1", userId: "u1", source: "strava", externalActivityId: "ext1",
    name: "Ride", startTime: "2025-02-15T10:00:00Z", distanceKm: 50,
    movingTimeMin: 120, elevationM: 500, avgSpeedKmh: 25,
    tss: 100, ifValue: 0.7,
    rawSummaryJson: {}, createdAt: "", updatedAt: "", ...over,
  };
}

describe("analyzeSegmentCausation", () => {
  it("returns empty when no PRs (only one effort = no delta)", () => {
    const result = analyzeSegmentCausation({
      efforts: [mkEffort()],
      segment: mkSeg(),
      activities: [],
      pmcData: [],
    });
    expect(result.prImprovements).toHaveLength(0);
    expect(result.insights).toHaveLength(0);
    expect(result.strongestCorrelation).toBeNull();
  });

  it("detects single PR with preceding training block", () => {
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 650, startDate: "2025-02-01T10:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 600, startDate: "2025-03-01T10:00:00Z" }),
    ];
    // Activities in the 4 weeks before the PR (2025-03-01)
    const activities = [
      mkActivity({ id: "a1", startTime: "2025-02-10T10:00:00Z", tss: 80, ifValue: 0.7 }),
      mkActivity({ id: "a2", startTime: "2025-02-17T10:00:00Z", tss: 90, ifValue: 0.72 }),
      mkActivity({ id: "a3", startTime: "2025-02-24T10:00:00Z", tss: 85, ifValue: 0.68 }),
    ];
    const result = analyzeSegmentCausation({
      efforts, segment: mkSeg(), activities, pmcData: [],
    });
    expect(result.prImprovements).toHaveLength(1);
    expect(result.prImprovements[0].timeDelta).toBe(50); // 650 - 600
    expect(result.prImprovements[0].precedingBlock).not.toBeNull();
    expect(result.prImprovements[0].precedingBlock!.dominantZone).toBe("Z3 节奏");
  });

  it("detects multiple PRs and generates insights", () => {
    const efforts = [
      mkEffort({ id: "e1", elapsedTime: 700, startDate: "2025-01-01T10:00:00Z" }),
      mkEffort({ id: "e2", elapsedTime: 680, startDate: "2025-02-01T10:00:00Z" }),
      mkEffort({ id: "e3", elapsedTime: 690, startDate: "2025-03-01T10:00:00Z" }), // not a PR
      mkEffort({ id: "e4", elapsedTime: 650, startDate: "2025-04-01T10:00:00Z" }),
    ];
    const activities = [
      mkActivity({ id: "a1", startTime: "2025-01-15T10:00:00Z", tss: 120, ifValue: 0.8 }),
      mkActivity({ id: "a2", startTime: "2025-01-22T10:00:00Z", tss: 130, ifValue: 0.82 }),
      mkActivity({ id: "a3", startTime: "2025-03-10T10:00:00Z", tss: 150, ifValue: 0.78 }),
      mkActivity({ id: "a4", startTime: "2025-03-20T10:00:00Z", tss: 140, ifValue: 0.76 }),
    ];
    const result = analyzeSegmentCausation({
      efforts, segment: mkSeg(), activities, pmcData: [],
    });
    // PRs: e2 (700→680, delta=20), e4 (680→650, delta=30). e3 is not a PR.
    expect(result.prImprovements).toHaveLength(2);
    expect(result.prImprovements[0].timeDelta).toBe(20);
    expect(result.prImprovements[1].timeDelta).toBe(30);
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.insights[0]).toContain("训练 4 周");
    expect(result.strongestCorrelation).not.toBeNull();
    expect(result.strongestCorrelation!.segmentCategory).toBe("threshold"); // 5km, 5% grade
  });
});
