import { describe, it, expect } from "vitest";
import { predictEta } from "@/lib/engine/level-eta";
import type { LevelEvaluation } from "@/lib/engine/cycling-levels";
import type { PmcDataPoint } from "@/lib/engine/pmc";

function mkEval(gapWkg: number): LevelEvaluation {
  return {
    byDimension: {
      ftp_20min: {
        dimension: "ftp_20min",
        value: 3.3,
        unit: "W/kg",
        level: 4,
        label: "中PRO 入门",
        nextLevel: 5,
        nextLabel: "中PRO 成长",
        nextThreshold: 3.6,
        gapValue: gapWkg,
      },
    } as any,
    overall: { level: 4, label: "中PRO 入门", topDimensions: ["ftp_20min"], improvable: [] },
    dataWindow: { startDate: "", endDate: "", activityCount: 30, scope: "recent" },
    warnings: [],
  };
}

function mkPmcSeries(days: number, ctlStart: number, ctlEnd: number): PmcDataPoint[] {
  const series: PmcDataPoint[] = [];
  for (let i = 0; i < days; i++) {
    const t = days <= 1 ? 0 : i / (days - 1);
    series.push({
      date: new Date(Date.now() - (days - i) * 86400000).toISOString().split("T")[0],
      ctl: Number((ctlStart + (ctlEnd - ctlStart) * t).toFixed(1)),
      atl: 0,
      tsb: 0,
      dailyTss: 0,
      activities: [],
    });
  }
  return series;
}

describe("predictEta", () => {
  it("CTL 上升中 → 给出 weeks", () => {
    const r = predictEta(mkEval(0.3), mkPmcSeries(90, 40, 70));
    expect(r.weeks).toBeGreaterThan(0);
    expect(r.weeks).toBeLessThan(Infinity);
    expect(r.confidence).toBe("high");
  });

  it("CTL 下降 → weeks Infinity + 警告", () => {
    const r = predictEta(mkEval(0.3), mkPmcSeries(90, 80, 50));
    expect(r.weeks).toBe(Infinity);
    expect(r.note).toContain("CTL 下降");
  });

  it("数据点 < 7 → low confidence", () => {
    const r = predictEta(mkEval(0.3), mkPmcSeries(5, 30, 35));
    expect(r.confidence).toBe("low");
  });

  it("gap = 0 / 已达成 → weeks 0", () => {
    const r = predictEta(mkEval(0), mkPmcSeries(90, 40, 70));
    expect(r.weeks).toBe(0);
  });

  it("rangeWeeks: weeks × [0.7, 1.4]", () => {
    const r = predictEta(mkEval(0.3), mkPmcSeries(90, 40, 70));
    if (Number.isFinite(r.weeks) && r.weeks > 0) {
      expect(r.rangeWeeks[0]).toBeCloseTo(r.weeks * 0.7, 1);
      expect(r.rangeWeeks[1]).toBeCloseTo(r.weeks * 1.4, 1);
    }
  });
});
