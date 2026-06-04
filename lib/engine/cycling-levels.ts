// 骑行能力分级常量 + 评定算法
// 设计文档: docs/superpowers/specs/2026-06-04-cycling-level-system-design.md

import { buildPowerCurve } from "./power-curve";
import type { Activity, User } from "@/lib/types";

export const DIMENSIONS = [
  "sprint5s",
  "burst1min",
  "vo2_5min",
  "ftp_20min",
  "endurance_60min",
  "vo2max_mlkgmin",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

/**
 * 12 段位中文名 (L0-L11)
 * 来源: Coggan 等价 + 小红书骑友圈段位命名
 */
export const LEVEL_NAMES = [
  "入门骑友",       // L0
  "小PRO 入门",     // L1
  "小PRO 成长",     // L2
  "小PRO 毕业",     // L3
  "中PRO 入门",     // L4
  "中PRO 成长",     // L5
  "中PRO 毕业",     // L6
  "大PRO 入门",     // L7
  "大PRO 成长",     // L8
  "大PRO 毕业",     // L9
  "准职业",         // L10
  "职业",           // L11
] as const;

/**
 * 段位 → 颜色色阶 (UI 用)
 */
export const LEVEL_COLOR_BUCKET = (level: number): "gray" | "blue" | "green" | "purple" | "gold" => {
  if (level <= 0) return "gray";
  if (level <= 3) return "blue";
  if (level <= 6) return "green";
  if (level <= 9) return "purple";
  return "gold";
};

/**
 * 色阶 bucket → 实际十六进制色值 (UI 单一数据源)
 * 改这里 → 所有徽章/进度条/表头/雷达填充全部联动
 */
export const LEVEL_BG: Record<"gray" | "blue" | "green" | "purple" | "gold", string> = {
  gray: "#94a3b8",
  blue: "#3b82f6",
  green: "#10b981",
  purple: "#8b5cf6",
  gold: "#f59e0b",
};

/**
 * 6 维度 × 12 段位阈值矩阵 (W/kg 下限, vo2max 是 ml/kg/min)
 * 设计文档 §3.2
 */
export const LEVEL_TABLE: Record<Dimension, readonly number[]> = {
  sprint5s:        [0,  8.0,  9.5, 11.0, 12.0, 13.0, 14.0, 16.0, 17.5, 19.0, 20.5, 22.0],
  burst1min:       [0,  4.5,  5.3,  6.0,  6.5,  7.0,  7.5,  8.5,  9.0,  9.5, 10.0, 11.0],
  vo2_5min:        [0,  3.0,  3.5,  4.0,  4.4,  4.8,  5.2,  5.5,  5.8,  6.2,  6.6,  7.0],
  ftp_20min:       [0,  2.0,  2.4,  2.8,  3.2,  3.6,  4.0,  4.4,  4.8,  5.2,  5.6,  6.0],
  endurance_60min: [0,  1.8,  2.2,  2.5,  2.9,  3.2,  3.6,  4.0,  4.3,  4.7,  5.1,  5.5],
  vo2max_mlkgmin:  [0,   35,   40,   45,   49,   52,   56,   60,   64,   68,   71,   75],
};

/**
 * 维度元信息 (UI 显示用)
 */
export const DIMENSION_META: Record<Dimension, { label: string; unit: "W/kg" | "ml/kg/min"; durationSeconds?: number }> = {
  sprint5s:        { label: "5s 峰值",      unit: "W/kg", durationSeconds: 5 },
  burst1min:       { label: "1min 无氧",    unit: "W/kg", durationSeconds: 60 },
  vo2_5min:        { label: "5min VO2",     unit: "W/kg", durationSeconds: 300 },
  ftp_20min:       { label: "FTP (20min)",  unit: "W/kg", durationSeconds: 1200 },
  endurance_60min: { label: "60min 耐力",   unit: "W/kg", durationSeconds: 3600 },
  vo2max_mlkgmin:  { label: "VO2max",       unit: "ml/kg/min" },
};

export type DimensionEvaluation = {
  dimension: Dimension;
  value: number | null;          // 当前 W/kg 或 ml/kg/min
  unit: "W/kg" | "ml/kg/min";
  level: number | null;          // 0-11, null = 数据缺失
  label: string | null;
  nextLevel?: number;
  nextLabel?: string;
  nextThreshold?: number;
  gapValue?: number;             // 距下一级差多少 W/kg 或 ml/kg/min
  gapWatts?: number;             // 差多少瓦 (仅 W/kg 维度且有 weight)
};

/**
 * 单维度评级
 * @param dim    维度 key
 * @param value  当前值 (W/kg 或 ml/kg/min, undefined 表示数据缺失)
 * @param weightKg 体重 (用于将 W/kg 差距换算成瓦; undefined 时 gapWatts 不算)
 */
export function evaluateDimension(
  dim: Dimension,
  value: number | undefined,
  weightKg: number | undefined,
): DimensionEvaluation {
  const meta = DIMENSION_META[dim];
  const thresholds = LEVEL_TABLE[dim];

  if (value === undefined || value === null || !Number.isFinite(value)) {
    return {
      dimension: dim,
      value: null,
      unit: meta.unit,
      level: null,
      label: null,
    };
  }

  // 找最大的 i 使 thresholds[i] <= value
  let level = 0;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (value >= thresholds[i]) {
      level = i;
      break;
    }
  }

  const nextLevel = level < 11 ? level + 1 : undefined;
  const nextThreshold = nextLevel !== undefined ? thresholds[nextLevel] : undefined;
  const gapValue = nextThreshold !== undefined ? Number((nextThreshold - value).toFixed(2)) : undefined;
  const gapWatts =
    gapValue !== undefined && meta.unit === "W/kg" && weightKg && weightKg > 0
      ? Math.round(gapValue * weightKg)
      : undefined;

  return {
    dimension: dim,
    value,
    unit: meta.unit,
    level,
    label: LEVEL_NAMES[level],
    nextLevel,
    nextLabel: nextLevel !== undefined ? LEVEL_NAMES[nextLevel] : undefined,
    nextThreshold,
    gapValue,
    gapWatts,
  };
}

export type LevelEvaluation = {
  byDimension: Record<Dimension, DimensionEvaluation>;
  overall: {
    level: number;
    label: string;
    // 最高 level 的维度集合 — 你的"代表水位"由这些维度决定
    topDimensions: Dimension[];
    // 仍低于 overall.level 的维度 (有提升空间, 用于训练计划)
    improvable: Dimension[];
  };
  dataWindow: {
    startDate: string;
    endDate: string;
    activityCount: number;
    scope: "recent" | "historical";  // 区分近期窗口 vs 全历史
  };
  warnings: string[];
};

const DEFAULT_WINDOW_DAYS = 90;
const MIN_ACTIVITIES = 5;
const MIN_VALID_DIMENSIONS_FOR_OVERALL = 2;  // 至少 2 个维度有数据才评 overall, 防单维度异常拉飞

function estimateVo2max(ftpWatts: number | undefined, weightKg: number | undefined): number | undefined {
  if (!ftpWatts || !weightKg || weightKg <= 0) return undefined;
  // 基础公式 (Hawley & Noakes): VO2max ≈ FTP × 10.8 / weight + 7
  return Math.round((ftpWatts * 10.8) / weightKg + 7);
}

/**
 * 评定用户骑行能力段位
 * @param input.scope "recent" (默认) 用 windowDays 滑动窗口; "historical" 全历史
 * @param input.windowDays 仅 scope="recent" 时生效, 默认 90 天
 *
 * 评定规则 (从 v1 木桶短板法改为最强项法):
 * - overall.level = 有数据维度中的最高 level (业余车手往往专精某项, 用最高代表水位)
 * - overall.topDimensions = 所有 level === max 的维度
 * - overall.improvable = 仍低于 max 的维度 (训练计划目标)
 * - 至少 2 个维度有数据才评 overall, 否则给 warning
 */
export function evaluateLevel(input: {
  activities: Activity[];
  user: User;
  scope?: "recent" | "historical";
  windowDays?: number;
}): LevelEvaluation {
  const { activities, user } = input;
  const scope: "recent" | "historical" = input.scope ?? "recent";
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const warnings: string[] = [];

  // 1. 时间窗口过滤 (historical 取全部)
  const endDate = new Date();
  const startDate =
    scope === "historical"
      ? new Date(0)  // epoch 起点, 全历史
      : new Date(endDate.getTime() - windowDays * 86400000);
  const windowActs =
    scope === "historical"
      ? activities
      : activities.filter((a) => new Date(a.startTime) >= startDate);

  // 2. 数据量校验
  if (windowActs.length < MIN_ACTIVITIES) {
    warnings.push("活动数据不足");
  }

  // 3. 体重校验
  const weightKg = user.weightKg ?? user.syncedWeightKg ?? undefined;
  if (!weightKg) {
    warnings.push("缺少体重数据");
  }

  // 4. 提取 power curve 最佳值
  const { curve } = buildPowerCurve(windowActs, weightKg, startDate, endDate);
  const bestAt = (sec: number) => curve.find((p) => p.duration === sec);

  // 5. FTP 来源: 用户档案 FTP 优先, 否则用 20min 最佳
  const ftpWatts = user.ftp ?? bestAt(1200)?.power;
  const ftpWkg = ftpWatts && weightKg ? Number((ftpWatts / weightKg).toFixed(2)) : undefined;

  // 6. 6 维度值
  const wkg = (sec: number): number | undefined => {
    const p = bestAt(sec);
    if (!p || !weightKg) return undefined;
    return Number((p.power / weightKg).toFixed(2));
  };

  const dimensionValues: Record<Dimension, number | undefined> = {
    sprint5s:        wkg(5),
    burst1min:       wkg(60),
    vo2_5min:        wkg(300),
    ftp_20min:       ftpWkg,
    endurance_60min: wkg(3600),
    vo2max_mlkgmin:  estimateVo2max(ftpWatts, weightKg),
  };

  // 7. 每维度评级
  const byDimension = DIMENSIONS.reduce(
    (acc, dim) => {
      acc[dim] = evaluateDimension(dim, dimensionValues[dim], weightKg);
      return acc;
    },
    {} as Record<Dimension, DimensionEvaluation>,
  );

  // 8. 最强项法: 综合段位 = 有数据维度的最高 level
  const validLevels = DIMENSIONS.map((d) => byDimension[d].level).filter(
    (l): l is number => l !== null,
  );

  if (validLevels.length < MIN_VALID_DIMENSIONS_FOR_OVERALL) {
    warnings.push(`仅 ${validLevels.length} 个维度有数据 (需至少 ${MIN_VALID_DIMENSIONS_FOR_OVERALL} 个才评综合段位)`);
  }

  const overallLevel = validLevels.length ? Math.max(...validLevels) : 0;
  const topDimensions = DIMENSIONS.filter((d) => byDimension[d].level === overallLevel);
  const improvable = DIMENSIONS.filter(
    (d) => byDimension[d].level !== null && byDimension[d].level! < overallLevel,
  );

  return {
    byDimension,
    overall: {
      level: overallLevel,
      label: LEVEL_NAMES[overallLevel],
      topDimensions,
      improvable,
    },
    dataWindow: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      activityCount: windowActs.length,
      scope,
    },
    warnings,
  };
}

/**
 * 单次活动的强度段位评定
 * - graded: 有 NP + weight → 用 ftp_20min 维度查表评级 (NP ≈ 20min 输出近似)
 * - fallback: 缺数据时, 用 IF 粗分类
 */
export type ActivityIntensityBadge =
  | {
      kind: "graded";
      level: number;          // 0-11
      label: string;          // "小PRO 毕业"
      colorBucket: ReturnType<typeof LEVEL_COLOR_BUCKET>;
      detail: string;         // "NP 230W = 3.03 W/kg → L3"
    }
  | {
      kind: "fallback";
      category: "high" | "tempo" | "endurance";
      label: string;          // "高强度骑" / "节奏骑" / "耐力骑"
      colorBucket: ReturnType<typeof LEVEL_COLOR_BUCKET>;
      detail: string;         // "IF 0.88 → 高强度"
    };

export function evaluateActivityIntensity(
  activity: Activity,
  weightKg: number | undefined,
): ActivityIntensityBadge {
  // graded path: 需要 NP + weight
  if (activity.np && weightKg && weightKg > 0) {
    const wkg = activity.np / weightKg;
    const dimEval = evaluateDimension("ftp_20min", wkg, weightKg);
    if (dimEval.level !== null && dimEval.label !== null) {
      return {
        kind: "graded",
        level: dimEval.level,
        label: dimEval.label,
        colorBucket: LEVEL_COLOR_BUCKET(dimEval.level),
        detail: `NP ${activity.np}W = ${wkg.toFixed(2)} W/kg → L${dimEval.level}`,
      };
    }
  }

  // fallback path: IF 粗分类
  const iff = activity.ifValue ?? 0;
  if (iff >= 0.85) {
    return {
      kind: "fallback",
      category: "high",
      label: "高强度骑",
      colorBucket: "gold",
      detail: `IF ${iff.toFixed(2)} → 高强度`,
    };
  }
  if (iff >= 0.70) {
    return {
      kind: "fallback",
      category: "tempo",
      label: "节奏骑",
      colorBucket: "blue",
      detail: `IF ${iff.toFixed(2)} → 节奏`,
    };
  }
  return {
    kind: "fallback",
    category: "endurance",
    label: "耐力骑",
    colorBucket: "gray",
    detail: iff > 0 ? `IF ${iff.toFixed(2)} → 耐力` : "耐力骑 (无 IF 数据)",
  };
}
