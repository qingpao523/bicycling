// lib/engine/level-progression.ts
// 短板维度 → 4 周训练块生成 (设计文档 §5)

import type { Dimension, LevelEvaluation } from "./cycling-levels";

export type TrainingSession = {
  freq: string;
  name: string;
  detail: string;
};

export type TrainingBlock = {
  name: string;
  sessions: TrainingSession[];
  expectedGain: string;
  aliasOf?: Dimension;
};

/**
 * 训练规则字典 (设计文档 §5.1)
 * 每维度 → 4 周训练块, 含若干 sessions
 */
export const TRAINING_RULES: Record<Dimension, TrainingBlock> = {
  sprint5s: {
    name: "爆发力提升 4 周",
    sessions: [
      { freq: "2次/周", name: "Max Sprints", detail: "6×15s 全力冲刺, 间歇 5min 滑行" },
      { freq: "1次/周", name: "基础有氧", detail: "90min Z2, 保留腿部新鲜" },
    ],
    expectedGain: "+0.5-1.0 W/kg 5s 峰值",
  },
  burst1min: {
    name: "无氧能力提升 4 周",
    sessions: [
      { freq: "2次/周", name: "Anaerobic Intervals", detail: "5×1min @ 120% FTP, 4min 恢复" },
      { freq: "1次/周", name: "Tempo 60min", detail: "维持 75-80% FTP" },
    ],
    expectedGain: "+0.3-0.6 W/kg 1min",
  },
  vo2_5min: {
    name: "VO2max 提升 4 周",
    sessions: [
      { freq: "2次/周", name: "VO2 Intervals", detail: "5×5min @ 105-110% FTP, 5min 恢复" },
      { freq: "1次/周", name: "Long Z2", detail: "2.5-3h 持续低强度" },
    ],
    expectedGain: "+0.2-0.4 W/kg 5min",
  },
  ftp_20min: {
    name: "FTP 阈值提升 4 周",
    sessions: [
      { freq: "2次/周", name: "Sweet Spot", detail: "2×20min @ 88-93% FTP, 5min 恢复" },
      { freq: "1次/周", name: "Threshold", detail: "3×12min @ 95-100% FTP, 4min 恢复" },
      { freq: "1次/周", name: "基础有氧 Z2", detail: "90-120min" },
    ],
    expectedGain: "+0.2-0.4 W/kg FTP",
  },
  endurance_60min: {
    name: "耐力提升 4 周",
    sessions: [
      { freq: "1次/周", name: "Long Endurance", detail: "4-5h Z2, 含 2×30min 节奏段" },
      { freq: "2次/周", name: "Tempo 90min", detail: "维持 78-85% FTP" },
    ],
    expectedGain: "+0.15-0.3 W/kg 60min",
  },
  vo2max_mlkgmin: {
    name: "(同 vo2_5min)",
    sessions: [],
    expectedGain: "",
    aliasOf: "vo2_5min",
  },
};

const PRIORITY: Dimension[] = [
  "ftp_20min",
  "vo2_5min",
  "burst1min",
  "sprint5s",
  "endurance_60min",
  "vo2max_mlkgmin",
];

export type UpgradePlan = {
  skip?: string;
  targetDimension?: Dimension;
  block?: TrainingBlock;
  weeklySchedule?: string[];
  expectedNewLevel?: number;
  note?: string;
};

export function generateUpgradePlan(evalResult: LevelEvaluation): UpgradePlan {
  // v2 改: 训练计划目标 = improvable 维度 (仍低于综合段位的项, 有提升空间)
  // 若无 improvable 项 (所有维度都达 max level), 说明全面达标
  if (!evalResult.overall.improvable.length) {
    return { skip: "已经全面达标, 继续巩固即可" };
  }

  const target = PRIORITY.find((d) => evalResult.overall.improvable.includes(d));
  if (!target) return { skip: "无可优化维度" };

  const rule = TRAINING_RULES[target];
  const block = rule.aliasOf ? TRAINING_RULES[rule.aliasOf] : rule;

  const weeklySchedule = layoutWeek(block.sessions);

  return {
    targetDimension: target,
    block,
    weeklySchedule,
    expectedNewLevel: evalResult.overall.level + 1,
    note: "通用建议, 实际请结合恢复、伤病、赛季阶段调整",
  };
}

function layoutWeek(sessions: TrainingSession[]): string[] {
  // 简化版排课: 周二/周四/周六/周日 (周一/三/五留作恢复或弹性)
  const slots = ["周二", "周四", "周六", "周日"];
  const schedule: string[] = [];
  let slotIdx = 0;
  for (const s of sessions) {
    const matches = s.freq.match(/(\d+)/);
    const count = matches ? parseInt(matches[1], 10) : 1;
    for (let i = 0; i < count && slotIdx < slots.length; i++) {
      schedule.push(`${slots[slotIdx++]}: ${s.name} (${s.detail})`);
    }
  }
  return schedule;
}
