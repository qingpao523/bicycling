import { describe, it, expect } from "vitest";
import { autoTagSegment, classifySegment, gradeSegmentAbility, segmentTypeLabel } from "@/lib/engine/segments/segments-classify";
import type { Segment } from "@/lib/types";

function mkSeg(over: Partial<Segment> = {}): Segment {
  return {
    id: "s1", stravaSegmentId: 1, name: "test", distance: 1000, averageGrade: 0,
    climbCategory: 0, createdAt: "", updatedAt: "", ...over,
  };
}

describe("autoTagSegment", () => {
  // UCI 爬坡
  it("climbCategory 5 → HC", () => {
    expect(autoTagSegment(mkSeg({ climbCategory: 5 }))).toContain("HC");
  });
  it("climbCategory 4 → Cat 1", () => {
    expect(autoTagSegment(mkSeg({ climbCategory: 4 }))).toContain("Cat 1");
  });
  it("climbCategory 3 → Cat 2", () => {
    expect(autoTagSegment(mkSeg({ climbCategory: 3 }))).toContain("Cat 2");
  });
  it("climbCategory 2 → Cat 3", () => {
    expect(autoTagSegment(mkSeg({ climbCategory: 2 }))).toContain("Cat 3");
  });
  it("climbCategory 1 → Cat 4", () => {
    expect(autoTagSegment(mkSeg({ climbCategory: 1 }))).toContain("Cat 4");
  });

  // 冲刺型
  it("平路冲刺: avgGrade < 1%, dist < 1km", () => {
    expect(autoTagSegment(mkSeg({ distance: 800, averageGrade: 0.5 }))).toContain("平路冲刺");
  });
  it("缓坡冲刺: avgGrade 1-4%, dist < 1km", () => {
    expect(autoTagSegment(mkSeg({ distance: 900, averageGrade: 2.5 }))).toContain("缓坡冲刺");
  });
  it("陡坡冲刺: avgGrade > 4%, dist < 0.8km", () => {
    expect(autoTagSegment(mkSeg({ distance: 600, averageGrade: 6 }))).toContain("陡坡冲刺");
  });

  // 攻击型
  it("短坡攻击: avgGrade > 5%, dist 0.8-3km", () => {
    expect(autoTagSegment(mkSeg({ distance: 2000, averageGrade: 6 }))).toContain("短坡攻击");
  });
  it("陡坡攻击: avgGrade > 8%, dist 0.5-2km", () => {
    expect(autoTagSegment(mkSeg({ distance: 1200, averageGrade: 10 }))).toContain("陡坡攻击");
  });
  it("起伏攻击: avgGrade 2-5%, dist 1-3km, maxGrade > 10%", () => {
    expect(autoTagSegment(mkSeg({ distance: 2000, averageGrade: 3, maximumGrade: 12 }))).toContain("起伏攻击");
  });

  // 阈值型
  it("中距离爬坡: avgGrade > 4%, dist 3-8km", () => {
    expect(autoTagSegment(mkSeg({ distance: 5000, averageGrade: 5 }))).toContain("中距离爬坡");
  });
  it("中距离起伏: avgGrade 1-4%, dist 5-15km, elevGain > 100m", () => {
    expect(autoTagSegment(mkSeg({ distance: 8000, averageGrade: 2, totalElevationGain: 150 }))).toContain("中距离起伏");
  });
  it("中距离平路: avgGrade < 1%, dist 5-15km", () => {
    expect(autoTagSegment(mkSeg({ distance: 10000, averageGrade: 0.3 }))).toContain("中距离平路");
  });

  // 长耐力型
  it("长距离爬坡: avgGrade > 3%, dist > 8km", () => {
    expect(autoTagSegment(mkSeg({ distance: 12000, averageGrade: 4 }))).toContain("长距离爬坡");
  });
  it("长距离起伏: avgGrade 1-3%, dist > 15km, elevGain > 200m", () => {
    expect(autoTagSegment(mkSeg({ distance: 20000, averageGrade: 2, totalElevationGain: 300 }))).toContain("长距离起伏");
  });
  it("长距离绕圈: avgGrade < 1%, dist > 15km", () => {
    expect(autoTagSegment(mkSeg({ distance: 25000, averageGrade: 0.2 }))).toContain("长距离绕圈");
  });
  it("超长耐力: dist > 30km", () => {
    expect(autoTagSegment(mkSeg({ distance: 40000, averageGrade: 1 }))).toContain("超长耐力");
  });

  // 下坡型
  it("技术下坡: avgGrade < -3%, dist > 2km", () => {
    expect(autoTagSegment(mkSeg({ distance: 5000, averageGrade: -5 }))).toContain("技术下坡");
  });
  it("缓降: avgGrade -1%~-3%, dist > 3km", () => {
    expect(autoTagSegment(mkSeg({ distance: 4000, averageGrade: -2 }))).toContain("缓降");
  });

  // 多标签
  it("Cat 2 + 长距离爬坡 (多标签)", () => {
    const tags = autoTagSegment(mkSeg({ distance: 12000, averageGrade: 5, climbCategory: 3 }));
    expect(tags).toContain("Cat 2");
    expect(tags).toContain("长距离爬坡");
  });

  // 综合赛段
  it("不符合任何 → 综合赛段", () => {
    expect(autoTagSegment(mkSeg({ distance: 3500, averageGrade: 1.5 }))).toContain("综合赛段");
  });
});

describe("classifySegment", () => {
  it("冲刺型: dist < 1km", () => {
    expect(classifySegment(mkSeg({ distance: 800, averageGrade: 0 }))).toBe("sprint");
  });
  it("攻击型: dist 0.8-3km, steep", () => {
    expect(classifySegment(mkSeg({ distance: 2000, averageGrade: 6 }))).toBe("attack");
  });
  it("阈值型: dist 3-15km", () => {
    expect(classifySegment(mkSeg({ distance: 6000, averageGrade: 3 }))).toBe("threshold");
  });
  it("长耐力型: dist > 15km", () => {
    expect(classifySegment(mkSeg({ distance: 20000, averageGrade: 1 }))).toBe("endurance");
  });
  it("下坡型: avgGrade < -1%", () => {
    expect(classifySegment(mkSeg({ distance: 5000, averageGrade: -4 }))).toBe("downhill");
  });
});

describe("segmentTypeLabel", () => {
  it("sprint → 冲刺型", () => {
    expect(segmentTypeLabel("sprint")).toBe("冲刺型");
  });
  it("endurance → 长耐力型", () => {
    expect(segmentTypeLabel("endurance")).toBe("长耐力型");
  });
});

describe("gradeSegmentAbility", () => {
  it("冲刺型赛段 → 用 sprint5s 维度评级", () => {
    const grade = gradeSegmentAbility({
      segment: mkSeg({ distance: 500, averageGrade: 0 }),
      bestEffortWkg: 11.0,
    });
    expect(grade.level).toBeGreaterThanOrEqual(0);
    expect(grade.label).toBeTruthy();
  });
  it("阈值型赛段 → 用 ftp_20min 维度评级", () => {
    const grade = gradeSegmentAbility({
      segment: mkSeg({ distance: 6000, averageGrade: 4 }),
      bestEffortWkg: 3.5,
    });
    expect(grade.level).toBe(4); // 3.2-3.6 = L4
  });
});
