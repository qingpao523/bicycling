// lib/engine/level-eta.ts
// PMC 趋势 → 达成下一段位预测 (设计文档 §6)

import type { LevelEvaluation } from "./cycling-levels";
import type { PmcDataPoint } from "./pmc";

export type EtaPrediction = {
  weeks: number;
  confidence: "high" | "medium" | "low";
  basis: {
    weeklyGainWkg: number;
    dataPoints: number;
  };
  rangeWeeks: [number, number];
  note?: string;
};

/**
 * 经验系数: 每周 CTL 上升 1 点 ≈ FTP 提升 0.01 W/kg (业余中位水平的粗略估计)
 */
const WEEKLY_CTL_GAIN_TO_WKG = 0.01;

export function predictEta(evalResult: LevelEvaluation, pmcSeries: PmcDataPoint[]): EtaPrediction {
  const ftpDim = evalResult.byDimension.ftp_20min;
  const gapWkg = ftpDim?.gapValue ?? 0;

  // 已达成
  if (gapWkg <= 0) {
    return {
      weeks: 0,
      confidence: "high",
      basis: { weeklyGainWkg: 0, dataPoints: pmcSeries.length },
      rangeWeeks: [0, 0],
      note: `已达到 ${ftpDim?.nextLabel ?? "下一段位"}, 继续巩固`,
    };
  }

  // 数据不足
  if (pmcSeries.length < 7) {
    return {
      weeks: Infinity,
      confidence: "low",
      basis: { weeklyGainWkg: 0, dataPoints: pmcSeries.length },
      rangeWeeks: [Infinity, Infinity],
      note: "训练数据不足, 再训练 4 周后可预测",
    };
  }

  // CTL 增长率 (最近 30 天)
  const recent = pmcSeries.slice(-30);
  const ctlStart = recent[0].ctl;
  const ctlEnd = recent[recent.length - 1].ctl;
  const days = recent.length;
  const ctlChange = ctlEnd - ctlStart;
  const weeklyCtlChange = (ctlChange / days) * 7;

  // CTL 下降
  if (weeklyCtlChange <= 0) {
    return {
      weeks: Infinity,
      confidence: "high",
      basis: { weeklyGainWkg: 0, dataPoints: pmcSeries.length },
      rangeWeeks: [Infinity, Infinity],
      note: "CTL 下降中, 需先恢复训练量才能达成升级",
    };
  }

  const weeklyGainWkg = weeklyCtlChange * WEEKLY_CTL_GAIN_TO_WKG;
  const weeks = Math.max(2, Math.round(gapWkg / weeklyGainWkg));

  const confidence: "high" | "medium" | "low" =
    pmcSeries.length >= 60 ? "high" : pmcSeries.length >= 21 ? "medium" : "low";

  return {
    weeks,
    confidence,
    basis: { weeklyGainWkg: Number(weeklyGainWkg.toFixed(3)), dataPoints: pmcSeries.length },
    rangeWeeks: [Number((weeks * 0.7).toFixed(1)), Number((weeks * 1.4).toFixed(1))],
  };
}
