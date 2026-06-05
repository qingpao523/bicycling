import type { Segment, SegmentEffort } from "@/lib/types";
import type { PmcDataPoint } from "@/lib/engine/pmc";

export interface CorrelationPoint {
  date: string;
  elapsedTime: number;
  ctl: number;
  atl: number;
  tsb: number;
  speed: number;
  avgWatts?: number;
}

export interface CorrelationResult {
  points: CorrelationPoint[];
  tsbToSpeedCorrelation: number;
  ctlToSpeedCorrelation: number;
  optimalTsbRange: [number, number];
  optimalCtlRange: [number, number];
  insight: string;
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : Number((num / denom).toFixed(3));
}

function findOptimalRange(values: number[], performances: number[], topPct = 0.25): [number, number] {
  if (values.length < 3) return [0, 0];
  const pairs = values.map((v, i) => ({ v, p: performances[i] }));
  pairs.sort((a, b) => b.p - a.p); // best performance first (highest speed)
  const topN = Math.max(2, Math.ceil(pairs.length * topPct));
  const topValues = pairs.slice(0, topN).map((p) => p.v);
  return [Math.round(Math.min(...topValues)), Math.round(Math.max(...topValues))];
}

export function correlateSegmentWithTraining(input: {
  efforts: SegmentEffort[];
  segment: Segment;
  pmcData: PmcDataPoint[];
}): CorrelationResult {
  const { efforts, segment, pmcData } = input;
  const distKm = segment.distance / 1000;
  const pmcByDate = new Map(pmcData.map((p) => [p.date, p]));

  const points: CorrelationPoint[] = [];
  for (const e of efforts) {
    const dateStr = (typeof e.startDate === "string" ? e.startDate : new Date(e.startDate).toISOString()).slice(0, 10);
    const pmc = pmcByDate.get(dateStr);
    if (!pmc) continue;
    points.push({
      date: dateStr,
      elapsedTime: e.elapsedTime,
      ctl: pmc.ctl,
      atl: pmc.atl,
      tsb: pmc.tsb,
      speed: distKm > 0 ? Number((distKm / (e.elapsedTime / 3600)).toFixed(1)) : 0,
      avgWatts: e.averageWatts ?? undefined,
    });
  }

  if (points.length < 3) {
    return { points, tsbToSpeedCorrelation: 0, ctlToSpeedCorrelation: 0, optimalTsbRange: [0, 0], optimalCtlRange: [0, 0], insight: "数据不足 (需至少 3 次尝试 + PMC 数据)" };
  }

  const speeds = points.map((p) => p.speed);
  const tsbs = points.map((p) => p.tsb);
  const ctls = points.map((p) => p.ctl);

  const tsbR = pearsonR(tsbs, speeds);
  const ctlR = pearsonR(ctls, speeds);
  const optTsb = findOptimalRange(tsbs, speeds);
  const optCtl = findOptimalRange(ctls, speeds);

  let insight: string;
  if (tsbR > 0.3) insight = `你在 TSB ${optTsb[0]}-${optTsb[1]} 时这个赛段表现最好 (r=${tsbR}), 说明恢复到位是关键`;
  else if (ctlR > 0.3) insight = `体能越高 (CTL ${optCtl[0]}-${optCtl[1]}) 这个赛段越快 (r=${ctlR}), 说明基础体能是关键`;
  else insight = "训练状态与赛段速度暂无显著关联, 可能其他因素 (天气/路况/策略) 影响更大";

  return { points, tsbToSpeedCorrelation: tsbR, ctlToSpeedCorrelation: ctlR, optimalTsbRange: optTsb, optimalCtlRange: optCtl, insight };
}
