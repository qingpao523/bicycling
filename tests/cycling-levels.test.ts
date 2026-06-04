import { describe, it, expect } from "vitest";
import { LEVEL_TABLE, LEVEL_NAMES, DIMENSIONS } from "@/lib/engine/cycling-levels";

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
