import type { Segment, SegmentEffort } from "@/lib/types";
import { classifySegment } from "./segments-classify";

export interface SegmentRecommendation {
  segment: Segment;
  reason: string;
  currentBestTime: number;
  potentialTimeSec: number;
  gapSeconds: number;
  confidence: "high" | "medium" | "low";
}

export function recommendSegments(input: {
  segments: Segment[];
  efforts: SegmentEffort[];
  userFtp?: number;
  userWeightKg?: number;
}): SegmentRecommendation[] {
  const { segments, efforts, userFtp, userWeightKg } = input;
  if (!userFtp || !userWeightKg || userWeightKg <= 0) return [];

  const wkg = userFtp / userWeightKg;
  const effortsBySegment = new Map<string, SegmentEffort[]>();
  for (const e of efforts) {
    const arr = effortsBySegment.get(e.segmentId) ?? [];
    arr.push(e);
    effortsBySegment.set(e.segmentId, arr);
  }

  const recommendations: SegmentRecommendation[] = [];

  for (const seg of segments) {
    const segEfforts = effortsBySegment.get(seg.id);
    if (!segEfforts || segEfforts.length < 2) continue;

    const bestTime = Math.min(...segEfforts.map((e) => e.elapsedTime));
    const _category = classifySegment(seg);

    // Estimate potential time based on W/kg and segment characteristics
    // Very rough: higher W/kg = faster, scaled by distance and grade
    const distKm = seg.distance / 1000;
    const gradeEffect = 1 + Math.max(seg.averageGrade, 0) * 0.1; // steeper = more W/kg matters
    const potentialSpeed = wkg * 8 / gradeEffect; // very rough km/h estimate
    const potentialTimeSec = potentialSpeed > 0 ? Math.round((distKm / potentialSpeed) * 3600) : bestTime;

    const gap = bestTime - potentialTimeSec;
    if (gap <= 0) continue; // already at or near potential

    const confidence: "high" | "medium" | "low" = segEfforts.length >= 5 ? "high" : segEfforts.length >= 3 ? "medium" : "low";

    recommendations.push({
      segment: seg,
      reason: `当前最快 ${bestTime}s, 潜力 ${potentialTimeSec}s, 还有 ${gap}s 提升空间`,
      currentBestTime: bestTime,
      potentialTimeSec,
      gapSeconds: gap,
      confidence,
    });
  }

  return recommendations.sort((a, b) => a.gapSeconds - b.gapSeconds).slice(0, 10);
}
