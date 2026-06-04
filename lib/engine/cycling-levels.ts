// 骑行能力分级常量 + 评定算法
// 设计文档: docs/superpowers/specs/2026-06-04-cycling-level-system-design.md

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
export const LEVEL_NAMES: readonly string[] = [
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
