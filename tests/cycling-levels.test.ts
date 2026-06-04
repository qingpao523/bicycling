import { describe, it, expect } from "vitest";
import { LEVEL_TABLE, LEVEL_NAMES, DIMENSIONS, evaluateDimension, evaluateLevel, evaluateActivityIntensity } from "@/lib/engine/cycling-levels";
import type { Activity, User } from "@/lib/types";

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

// helper: 构造最小可用 activity
function mkAct(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    userId: "u1",
    source: "intervals.icu",
    externalActivityId: "ext1",
    name: "test",
    startTime: new Date().toISOString(),
    distanceKm: 0,
    movingTimeMin: 0,
    elevationM: 0,
    avgSpeedKmh: 0,
    rawSummaryJson: {},
    rawStreamsJson: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const mkUser = (over: Partial<User> = {}): User => ({
  id: "u1",
  name: "test",
  email: "t@e.com",
  passwordHash: "x",
  role: "user",
  weightKg: 76,
  ftp: 250,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe("evaluateLevel 木桶综合", () => {
  it("活动 < 5 条 → warnings", () => {
    const r = evaluateLevel({ activities: [], user: mkUser() });
    expect(r.warnings).toContain("活动数据不足");
  });

  it("体重缺失 → warnings + W/kg 维度 level null", () => {
    const acts = Array.from({ length: 6 }, () => mkAct());
    const r = evaluateLevel({
      activities: acts,
      user: mkUser({ weightKg: undefined, syncedWeightKg: undefined }),
    });
    expect(r.warnings).toContain("缺少体重数据");
    expect(r.byDimension.ftp_20min.level).toBeNull();
  });

  it("有 user.ftp + weight → FTP 维度评级", () => {
    const acts = Array.from({ length: 6 }, () => mkAct({ tss: 50 }));
    const r = evaluateLevel({
      activities: acts,
      user: mkUser({ ftp: 304, weightKg: 76 }), // 304/76 = 4.0 → L6
    });
    expect(r.byDimension.ftp_20min.level).toBe(6);
  });

  it("数据窗口: 仅取 90 天内", () => {
    const old = mkAct({ startTime: new Date(Date.now() - 200 * 86400000).toISOString(), tss: 100 });
    const fresh = mkAct({ id: "a2", startTime: new Date().toISOString(), tss: 50 });
    const r = evaluateLevel({
      activities: [old, fresh, fresh, fresh, fresh, fresh],
      user: mkUser(),
    });
    expect(r.dataWindow.activityCount).toBe(5); // old 被过滤
  });
});

function mkActivity(over: Partial<Activity> = {}): Activity {
  return {
    id: "act1",
    userId: "u1",
    source: "intervals.icu",
    externalActivityId: "ext1",
    name: "test",
    startTime: new Date().toISOString(),
    distanceKm: 50,
    movingTimeMin: 120,
    elevationM: 600,
    avgSpeedKmh: 25,
    rawSummaryJson: {},
    rawStreamsJson: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe("evaluateActivityIntensity", () => {
  it("有 NP 和 weight → 评 ftp 维度段位", () => {
    // NP 230W / 76kg = 3.03 W/kg → ftp_20min L3 (2.8-3.2)
    const r = evaluateActivityIntensity(mkActivity({ np: 230, ifValue: 0.92, tss: 100 }), 76);
    expect(r.kind).toBe("graded");
    if (r.kind === "graded") {
      expect(r.level).toBe(3);
      expect(r.label).toBe("小PRO 毕业");
    }
  });

  it("无 NP 无 power → IF fallback 类别", () => {
    const r = evaluateActivityIntensity(mkActivity({ ifValue: 0.88 }), 76);
    expect(r.kind).toBe("fallback");
    if (r.kind === "fallback") {
      expect(r.category).toBe("high");
      expect(r.label).toBe("高强度骑");
    }
  });

  it("中 IF → 节奏骑 fallback", () => {
    const r = evaluateActivityIntensity(mkActivity({ ifValue: 0.75 }), 76);
    expect(r.kind).toBe("fallback");
    if (r.kind === "fallback") {
      expect(r.category).toBe("tempo");
    }
  });

  it("无 IF 无 NP → 耐力骑 fallback", () => {
    const r = evaluateActivityIntensity(mkActivity({}), 76);
    expect(r.kind).toBe("fallback");
    if (r.kind === "fallback") {
      expect(r.category).toBe("endurance");
    }
  });

  it("无 weight → graded 路径不走, 走 fallback", () => {
    const r = evaluateActivityIntensity(mkActivity({ np: 230, ifValue: 0.92 }), undefined);
    expect(r.kind).toBe("fallback");
  });
});
