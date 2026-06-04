import { describe, it, expect } from "vitest";
import { LEVEL_TABLE, LEVEL_NAMES, DIMENSIONS, evaluateDimension } from "@/lib/engine/cycling-levels";

describe("LEVEL_TABLE 常量", () => {
  it("有 12 段位 × 6 维度", () => {
    expect(LEVEL_NAMES).toHaveLength(12);
    expect(DIMENSIONS).toHaveLength(6);
    for (const dim of DIMENSIONS) {
      expect(LEVEL_TABLE[dim]).toHaveLength(12);
    }
  });

  it("段位阈值单调递增", () => {
    for (const dim of DIMENSIONS) {
      const thresholds = LEVEL_TABLE[dim];
      for (let i = 1; i < thresholds.length; i++) {
        expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1]);
      }
    }
  });

  it("FTP L6 (中PRO 毕业) 阈值 = 4.0 W/kg (设计约定)", () => {
    expect(LEVEL_TABLE.ftp_20min[6]).toBe(4.0);
  });

  it("L0 入门骑友 + L11 职业", () => {
    expect(LEVEL_NAMES[0]).toBe("入门骑友");
    expect(LEVEL_NAMES[11]).toBe("职业");
  });
});

describe("evaluateDimension 单维度评级", () => {
  it("FTP 3.29 W/kg 落在 [3.2, 3.6) → L4 中PRO 入门", () => {
    // L3 阈值 2.8, L4 阈值 3.2, L5 阈值 3.6 → 3.29 在 L4 区间
    const r = evaluateDimension("ftp_20min", 3.29, 76);
    expect(r.level).toBe(4);
    expect(r.label).toBe("中PRO 入门");
    expect(r.nextLevel).toBe(5);
    expect(r.nextLabel).toBe("中PRO 成长");
    expect(r.nextThreshold).toBe(3.6);
  });

  it("差距换算成 watts (体重 76kg)", () => {
    const r = evaluateDimension("ftp_20min", 3.29, 76);
    // L4 → L5: 阈值 3.6, gap 0.31 W/kg × 76kg ≈ 23.56 → round 24
    expect(r.gapValue).toBeCloseTo(0.31, 2);
    expect(r.gapWatts).toBe(24);
  });

  it("vo2max 单位 ml/kg/min, gapWatts 为 undefined", () => {
    const r = evaluateDimension("vo2max_mlkgmin", 43, 76);
    expect(r.level).toBe(2); // 40 ≤ 43 < 45 → L2
    expect(r.gapValue).toBeCloseTo(2, 2);
    expect(r.gapWatts).toBeUndefined();
  });

  it("L0 极低值", () => {
    const r = evaluateDimension("ftp_20min", 1.5, 70);
    expect(r.level).toBe(0);
    expect(r.label).toBe("入门骑友");
  });

  it("L11 封顶", () => {
    const r = evaluateDimension("ftp_20min", 7.0, 70);
    expect(r.level).toBe(11);
    expect(r.nextLevel).toBeUndefined();
    expect(r.nextThreshold).toBeUndefined();
  });

  it("value undefined → null 结果", () => {
    const r = evaluateDimension("ftp_20min", undefined, 70);
    expect(r.level).toBeNull();
  });

  it("weightKg undefined → gapWatts undefined 但 level 可算", () => {
    const r = evaluateDimension("ftp_20min", 3.5, undefined);
    expect(r.level).toBe(4);
    expect(r.gapWatts).toBeUndefined();
    expect(r.gapValue).toBeCloseTo(0.1, 2);
  });
});
