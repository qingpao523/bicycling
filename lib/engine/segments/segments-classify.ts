import type { Segment } from "@/lib/types";
import { LEVEL_TABLE, LEVEL_NAMES, type Dimension } from "@/lib/engine/cycling-levels";

export type SegmentTag =
  // UCI 爬坡
  | "HC" | "Cat 1" | "Cat 2" | "Cat 3" | "Cat 4"
  // 冲刺型
  | "平路冲刺" | "缓坡冲刺" | "陡坡冲刺"
  // 攻击型
  | "短坡攻击" | "陡坡攻击" | "起伏攻击"
  // 阈值型
  | "中距离爬坡" | "中距离起伏" | "中距离平路"
  // 长耐力型
  | "长距离爬坡" | "长距离起伏" | "长距离绕圈" | "超长耐力"
  // 下坡型
  | "技术下坡" | "缓降"
  // 综合
  | "综合赛段";

export type SegmentCategory = "sprint" | "attack" | "threshold" | "endurance" | "downhill" | "mixed";

export type SegmentAbilityGrade = {
  level: number;
  label: string;
  dimension: Dimension;
};

const UCI_MAP: Record<number, SegmentTag> = {
  5: "HC", 4: "Cat 1", 3: "Cat 2", 2: "Cat 3", 1: "Cat 4",
};

const CATEGORY_TO_DIMENSION: Record<SegmentCategory, Dimension> = {
  sprint: "sprint5s",
  attack: "vo2_5min",
  threshold: "ftp_20min",
  endurance: "endurance_60min",
  downhill: "endurance_60min",
  mixed: "ftp_20min",
};

const CATEGORY_LABEL: Record<SegmentCategory, string> = {
  sprint: "冲刺型",
  attack: "攻击型",
  threshold: "阈值型",
  endurance: "长耐力型",
  downhill: "下坡型",
  mixed: "综合型",
};

export function autoTagSegment(segment: Segment): SegmentTag[] {
  const tags: SegmentTag[] = [];
  const dist = segment.distance; // meters
  const grade = segment.averageGrade;
  const maxGrade = segment.maximumGrade ?? Math.abs(grade) * 1.5;
  const elevGain = segment.totalElevationGain ?? (dist * Math.max(grade, 0)) / 100;

  // UCI 爬坡
  const uci = UCI_MAP[segment.climbCategory];
  if (uci) tags.push(uci);

  // 下坡型 (先判, 因为 grade < 0 不该进爬坡)
  if (grade < -3 && dist > 2000) tags.push("技术下坡");
  else if (grade >= -3 && grade < -1 && dist > 3000) tags.push("缓降");

  if (grade < -1) {
    return tags.length ? tags : ["综合赛段"];
  }

  // 冲刺型 (< ~2min, 通常 < 1km)
  if (dist < 800 && grade > 4) tags.push("陡坡冲刺");
  else if (dist < 1000 && grade >= 1 && grade <= 4) tags.push("缓坡冲刺");
  else if (dist < 1000 && grade < 1) tags.push("平路冲刺");

  // 攻击型 (2-10min, 0.8-3km)
  if (grade > 8 && dist >= 500 && dist <= 2000) tags.push("陡坡攻击");
  if (grade > 5 && dist >= 800 && dist <= 3000 && !tags.includes("陡坡攻击")) tags.push("短坡攻击");
  if (grade >= 2 && grade <= 5 && dist >= 1000 && dist <= 3000 && maxGrade > 10) tags.push("起伏攻击");

  // 阈值型 (10-30min, 3-15km)
  if (grade > 4 && dist >= 3000 && dist <= 8000) tags.push("中距离爬坡");
  if (grade >= 1 && grade <= 4 && dist >= 5000 && dist <= 15000 && elevGain > 100) tags.push("中距离起伏");
  if (grade < 1 && grade >= 0 && dist >= 5000 && dist <= 15000) tags.push("中距离平路");

  // 长耐力型 (30min+)
  if (dist > 30000) tags.push("超长耐力");
  if (grade > 3 && dist > 8000) tags.push("长距离爬坡");
  if (grade >= 1 && grade <= 3 && dist > 15000 && elevGain > 200) tags.push("长距离起伏");
  if (grade < 1 && grade >= 0 && dist > 15000 && !tags.includes("超长耐力")) tags.push("长距离绕圈");

  // 去重 (UCI + 特征标签可共存)
  const unique = [...new Set(tags)];
  return unique.length ? unique : ["综合赛段"];
}

export function classifySegment(segment: Segment): SegmentCategory {
  const dist = segment.distance;
  const grade = segment.averageGrade;

  if (grade < -1) return "downhill";
  if (dist < 1000) return "sprint";
  if (dist <= 3000 && grade > 3) return "attack";
  if (dist <= 15000) return "threshold";
  if (dist > 15000) return "endurance";
  return "mixed";
}

export function segmentTypeLabel(category: SegmentCategory): string {
  return CATEGORY_LABEL[category] ?? "综合型";
}

export function gradeSegmentAbility(input: {
  segment: Segment;
  bestEffortWkg: number;
}): SegmentAbilityGrade {
  const category = classifySegment(input.segment);
  const dimension = CATEGORY_TO_DIMENSION[category];
  const thresholds = LEVEL_TABLE[dimension];

  let level = 0;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (input.bestEffortWkg >= thresholds[i]) {
      level = i;
      break;
    }
  }

  return {
    level,
    label: LEVEL_NAMES[level] as string,
    dimension,
  };
}
