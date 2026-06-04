import { describe, it, expect } from "vitest";
import { generateUpgradePlan, TRAINING_RULES } from "@/lib/engine/level-progression";
import type { LevelEvaluation } from "@/lib/engine/cycling-levels";

function mkEval(overrideBottlenecks: string[], overallLevel = 2): LevelEvaluation {
  return {
    byDimension: {} as any,
    overall: {
      level: overallLevel,
      label: "test",
      bottlenecks: overrideBottlenecks as any,
    },
    dataWindow: { startDate: "", endDate: "", activityCount: 10 },
    warnings: [],
  };
}

describe("generateUpgradePlan", () => {
  it("无短板 → 返回 skip", () => {
    const plan = generateUpgradePlan(mkEval([]));
    expect(plan.skip).toBeTruthy();
  });

  it("FTP 单短板 → 选 ftp_20min 训练块", () => {
    const plan = generateUpgradePlan(mkEval(["ftp_20min"]));
    expect(plan.targetDimension).toBe("ftp_20min");
    expect(plan.block?.name).toContain("FTP");
    expect((plan.block?.sessions ?? []).length).toBeGreaterThan(0);
  });

  it("多短板按优先级: FTP > VO2 > 1min > 5s > 60min", () => {
    const plan = generateUpgradePlan(mkEval(["sprint5s", "ftp_20min", "endurance_60min"]));
    expect(plan.targetDimension).toBe("ftp_20min");
  });

  it("vo2max 短板走 aliasOf 回退到 vo2_5min", () => {
    const plan = generateUpgradePlan(mkEval(["vo2max_mlkgmin"]));
    expect(plan.targetDimension).toBe("vo2max_mlkgmin");
    expect(plan.block?.name).toContain("VO2");
  });

  it("TRAINING_RULES 每维度都有 name 或 aliasOf", () => {
    const dims = ["sprint5s", "burst1min", "vo2_5min", "ftp_20min", "endurance_60min", "vo2max_mlkgmin"];
    for (const d of dims) {
      const rule = TRAINING_RULES[d as keyof typeof TRAINING_RULES];
      expect(rule.name || rule.aliasOf).toBeTruthy();
    }
  });
});
