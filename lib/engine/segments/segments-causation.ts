import type { Activity, Segment, SegmentEffort } from "@/lib/types";
import type { PmcDataPoint } from "@/lib/engine/pmc";
import { classifySegment, type SegmentCategory } from "./segments-classify";

export interface TrainingBlock {
  startDate: string;
  endDate: string;
  weeklyTss: number;
  dominantZone: string;
  weeklyHours: number;
}

export interface CausationResult {
  prImprovements: { date: string; timeDelta: number; precedingBlock: TrainingBlock | null }[];
  insights: string[];
  strongestCorrelation: { trainingType: string; segmentCategory: SegmentCategory; effectSize: number } | null;
}

function buildTrainingBlock(activities: Activity[], endDate: Date): TrainingBlock | null {
  const start = new Date(endDate.getTime() - 28 * 86400000);
  const blockActs = activities.filter((a) => {
    const d = new Date(a.startTime);
    return d >= start && d <= endDate;
  });
  if (!blockActs.length) return null;

  const totalTss = blockActs.reduce((s, a) => s + (a.tss ?? 0), 0);
  const totalMin = blockActs.reduce((s, a) => s + a.movingTimeMin, 0);
  const weeks = 4;

  // Rough zone detection based on IF
  const withIf = blockActs.filter((a) => a.ifValue);
  const avgIf = withIf.length > 0 ? withIf.reduce((s, a) => s + (a.ifValue ?? 0), 0) / withIf.length : 0;
  let zone = "Z2 耐力";
  if (avgIf > 0.85) zone = "Z5 VO2max";
  else if (avgIf > 0.75) zone = "Z4 阈值";
  else if (avgIf > 0.65) zone = "Z3 节奏";

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    weeklyTss: Math.round(totalTss / weeks),
    dominantZone: zone,
    weeklyHours: Number((totalMin / 60 / weeks).toFixed(1)),
  };
}

export function analyzeSegmentCausation(input: {
  efforts: SegmentEffort[];
  segment: Segment;
  activities: Activity[];
  pmcData: PmcDataPoint[];
}): CausationResult {
  const { efforts, segment, activities } = input;
  const sorted = [...efforts].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const prImprovements: CausationResult["prImprovements"] = [];
  let bestSoFar = Infinity;

  for (const e of sorted) {
    if (e.elapsedTime < bestSoFar) {
      const delta = bestSoFar === Infinity ? 0 : bestSoFar - e.elapsedTime;
      if (delta > 0) {
        const block = buildTrainingBlock(activities, new Date(e.startDate));
        prImprovements.push({
          date: typeof e.startDate === "string" ? e.startDate.slice(0, 10) : new Date(e.startDate).toISOString().slice(0, 10),
          timeDelta: delta,
          precedingBlock: block,
        });
      }
      bestSoFar = e.elapsedTime;
    }
  }

  const insights: string[] = [];
  const category = classifySegment(segment);

  for (const pr of prImprovements) {
    if (!pr.precedingBlock) continue;
    const pct = sorted.length > 1 ? Math.round((pr.timeDelta / (bestSoFar + pr.timeDelta)) * 100) : 0;
    if (pct > 0) {
      insights.push(`${pr.precedingBlock.dominantZone} 训练 4 周 (周均 TSS ${pr.precedingBlock.weeklyTss}) 后, 赛段快了 ${pr.timeDelta}s (${pct}%)`);
    }
  }

  const strongest = prImprovements.length > 0 && prImprovements[prImprovements.length - 1].precedingBlock
    ? {
        trainingType: prImprovements[prImprovements.length - 1].precedingBlock!.dominantZone,
        segmentCategory: category,
        effectSize: prImprovements.reduce((s, p) => s + p.timeDelta, 0) / Math.max(prImprovements.length, 1),
      }
    : null;

  return { prImprovements, insights, strongestCorrelation: strongest };
}
