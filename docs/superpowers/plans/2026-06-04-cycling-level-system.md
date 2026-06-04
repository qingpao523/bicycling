# 骑行能力分级系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 bicycling repo 增加"骑行能力分级系统"，让每份数据分析报告带绝对标尺（12 段位 × 6 维度 W/kg 阈值 + 木桶短板综合段位 + 4 周训练计划 + PMC 达成时间 + 透明的分级标准），解决"用户阅读困难（没有对应标准）"的根因。

**Architecture:**
- **engine 层**（3 个纯函数模块）：`cycling-levels.ts` / `level-progression.ts` / `level-eta.ts`，确定性 + 单测覆盖
- **API 层**：`GET /api/analytics/level` 返回完整 LevelDashboard
- **AI 层**：复用 `lib/ai.ts` + `lib/engine/ai-analytics.ts`，注入 levelEvaluation，prompt 强制引用段位词汇
- **UI 层**：新路由 `/analytics/level` + 5 个组件（雷达 / 进度条 / 训练卡 / ETA / 标准表）

**Tech Stack:**
Next.js 15 (App Router) · TypeScript strict · Prisma 6 + SQLite · React 19 · recharts (已装) · lucide-react · **Vitest (新引入)**

**Spec:** `docs/superpowers/specs/2026-06-04-cycling-level-system-design.md`

---

## 文件结构（locks in decomposition）

| 路径 | 责任 | 行数估算 |
|---|---|---|
| `lib/engine/cycling-levels.ts` | 12 段位常量 + 单维度评级 + 木桶综合 | ~200 |
| `lib/engine/level-progression.ts` | 训练规则字典 + 升级计划生成 | ~150 |
| `lib/engine/level-eta.ts` | PMC → ETA 线性外推 | ~80 |
| `app/api/analytics/level/route.ts` | GET endpoint | ~40 |
| `lib/engine/ai-analytics.ts` | 改造：context 注入 levelEvaluation | +30 |
| `lib/ai.ts` | 改造：system prompt 加段位规则 | +15 |
| `components/analytics/level-radar.tsx` | 6 维雷达 + 段位徽章中心 | ~120 |
| `components/analytics/level-progress.tsx` | 6 行进度条 + 阈值标记 | ~150 |
| `components/analytics/upgrade-path-card.tsx` | 4 周训练块卡片 | ~80 |
| `components/analytics/eta-prediction-card.tsx` | ETA + 置信度 | ~80 |
| `components/analytics/level-standard-table.tsx` | 完整 12×6 阈值表（折叠） | ~150 |
| `app/(analytics)/analytics/level/page.tsx` | 页面入口 + SSR 数据加载 | ~80 |
| `components/analytics/nav-menu.tsx` | 修改：加 "能力水位" 入口 | +1 |
| `tests/cycling-levels.test.ts` | 段位边界 + 木桶 + null 维度 | ~120 |
| `tests/level-progression.test.ts` | 短板优先级 + aliasOf + 规则完整 | ~80 |
| `tests/level-eta.test.ts` | 外推正确性 + confidence + 兜底 | ~80 |
| `tests/api-analytics-level.test.ts` | 422 / 401 / 200 路径 | ~60 |
| `vitest.config.ts` | 测试配置 | ~15 |
| `package.json` | +vitest devDependency + test script | +3 |

---

## Sub-sprint A — Engine 核心

### Task 1: 引入 Vitest 测试基建

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json:6-11` (scripts) + `package.json:22-29` (devDependencies)
- Create: `tests/.gitkeep`

- [ ] **Step 1: 安装 Vitest**

```bash
cd ~/bicycling && npm install --save-dev vitest@^2.0 @vitest/coverage-v8@^2.0 --no-audit --no-fund
```

Expected: `added N packages`，无 ERR。

- [ ] **Step 2: 写 vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["lib/engine/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

- [ ] **Step 3: 改 package.json scripts**

在 `"scripts"` 内插入：

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 4: 建 tests 目录 + 写 smoke test**

```bash
mkdir -p ~/bicycling/tests
```

写 `tests/smoke.test.ts`：

```typescript
import { describe, it, expect } from "vitest";

describe("vitest smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 跑 test 验证**

```bash
cd ~/bicycling && npm test
```

Expected:
```
✓ tests/smoke.test.ts (1 test)
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

- [ ] **Step 6: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add package.json package-lock.json vitest.config.ts tests/smoke.test.ts && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "chore: 引入 Vitest 测试基建"
```

---

### Task 2: cycling-levels.ts — LEVEL_TABLE 常量

**Files:**
- Create: `lib/engine/cycling-levels.ts`
- Create: `tests/cycling-levels.test.ts`

- [ ] **Step 1: 写 failing test 验证常量完整性**

写 `tests/cycling-levels.test.ts`：

```typescript
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
```

- [ ] **Step 2: 跑 test 验证 fail**

```bash
cd ~/bicycling && npm test -- tests/cycling-levels.test.ts
```

Expected: FAIL "Failed to load url @/lib/engine/cycling-levels" 或 "Cannot find module"

- [ ] **Step 3: 写 cycling-levels.ts 常量部分**

```typescript
// lib/engine/cycling-levels.ts
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
```

- [ ] **Step 4: 跑 test 验证 pass**

```bash
cd ~/bicycling && npm test -- tests/cycling-levels.test.ts
```

Expected: PASS 4 tests。

- [ ] **Step 5: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add lib/engine/cycling-levels.ts tests/cycling-levels.test.ts && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(engine): LEVEL_TABLE 12 段位 × 6 维度常量"
```

---

### Task 3: cycling-levels.ts — evaluateDimension 单维度评级

**Files:**
- Modify: `lib/engine/cycling-levels.ts` (append)
- Modify: `tests/cycling-levels.test.ts` (append)

- [ ] **Step 1: 写 failing test**

在 `tests/cycling-levels.test.ts` append：

```typescript
import { evaluateDimension } from "@/lib/engine/cycling-levels";

describe("evaluateDimension 单维度评级", () => {
  it("FTP 3.29 W/kg → L3 小PRO 毕业", () => {
    const r = evaluateDimension("ftp_20min", 3.29, 76);
    expect(r.level).toBe(3);
    expect(r.label).toBe("小PRO 毕业");
    expect(r.nextLevel).toBe(4);
    expect(r.nextLabel).toBe("中PRO 入门");
    expect(r.nextThreshold).toBe(3.2);
    // gap = 3.2 - 3.29 = -0.09 (已超过 nextThreshold? wait L3=2.8, L4=3.2,3.29 在 L3 区间)
    // 实际: 3.29 落在 [2.8, 3.2) ❌  落在 [3.2, 3.6) ✓ 应该是 L4
  });

  it("FTP 3.29 W/kg 边界精确检查", () => {
    // L3 阈值 2.8, L4 阈值 3.2, L5 阈值 3.6
    // 3.29 在 [3.2, 3.6) → L4
    const r = evaluateDimension("ftp_20min", 3.29, 76);
    expect(r.level).toBe(4);
  });

  it("差距换算成 watts (体重 76kg)", () => {
    const r = evaluateDimension("ftp_20min", 3.29, 76);
    // L4 → L5: 阈值 3.6, 差 0.31 W/kg, × 76kg = 23.56 → round 24
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
    // 注意: W/kg 维度若 value 已知,无需 weight 即可评级 (value 已是 W/kg)
    const r = evaluateDimension("ftp_20min", 3.5, undefined);
    expect(r.level).toBe(4);
    expect(r.gapWatts).toBeUndefined();
    expect(r.gapValue).toBeCloseTo(0.1, 2);
  });
});
```

- [ ] **Step 2: 跑 test 验证 fail**

```bash
cd ~/bicycling && npm test -- tests/cycling-levels.test.ts -t "evaluateDimension"
```

Expected: FAIL with `evaluateDimension is not a function`

- [ ] **Step 3: 实现 evaluateDimension**

在 `lib/engine/cycling-levels.ts` append：

```typescript
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

  // 二分查找最大的 i 使 thresholds[i] <= value
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
```

- [ ] **Step 4: 跑 test 验证 pass**

```bash
cd ~/bicycling && npm test -- tests/cycling-levels.test.ts
```

Expected: 所有 11 个 test PASS。注意第一个 test "FTP 3.29 W/kg → L3 小PRO 毕业" 会失败（设计上 3.29 在 L4 区间），把它从描述上 fix 成 "3.29 → L4 中PRO 入门" 并删除 expect(level).toBe(3) 重复声明（保留正确的 toBe(4)）。

- [ ] **Step 5: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add lib/engine/cycling-levels.ts tests/cycling-levels.test.ts && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(engine): evaluateDimension 单维度查表评级"
```

---

### Task 4: cycling-levels.ts — evaluateLevel 木桶综合

**Files:**
- Modify: `lib/engine/cycling-levels.ts` (append)
- Modify: `tests/cycling-levels.test.ts` (append)

- [ ] **Step 1: 写 failing test**

append 到 `tests/cycling-levels.test.ts`：

```typescript
import { evaluateLevel } from "@/lib/engine/cycling-levels";
import type { Activity, User } from "@/lib/types";

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
    expect(r.overall.level).toBe(0);
  });

  it("体重缺失 → W/kg 维度 level 全 null", () => {
    const acts = Array.from({ length: 6 }, () => mkAct());
    const r = evaluateLevel({ activities: acts, user: mkUser({ weightKg: undefined, syncedWeightKg: undefined }) });
    expect(r.warnings).toContain("缺少体重数据");
    expect(r.byDimension.ftp_20min.level).toBeNull();
  });

  it("木桶: 综合段位 = 最低维度", () => {
    // 构造 6 个 activity, ftp 给 4.0 W/kg 但 vo2_5min 只给 3.0 W/kg
    // 由于实际算 W/kg 需要 power curve, 这里用 user.ftp 路径(快通道)
    const acts = Array.from({ length: 6 }, () => mkAct({ tss: 50 }));
    const r = evaluateLevel({
      activities: acts,
      user: mkUser({ ftp: 304, weightKg: 76 }), // 304/76 = 4.0 → L6
    });
    // 其他维度无数据 → 应被跳过, 不卡 overall
    // overall 应只看有数据维度的最低 level
    expect(r.overall.level).toBeGreaterThanOrEqual(0);
    expect(r.byDimension.ftp_20min.level).toBe(6);
  });

  it("数据窗口: 仅取 90 天内最佳", () => {
    const old = mkAct({ startTime: new Date(Date.now() - 200 * 86400000).toISOString(), tss: 100 });
    const fresh = mkAct({ id: "a2", startTime: new Date().toISOString(), tss: 50 });
    const r = evaluateLevel({
      activities: [old, fresh, fresh, fresh, fresh, fresh],
      user: mkUser(),
    });
    expect(r.dataWindow.activityCount).toBe(5); // old 被过滤
  });
});
```

- [ ] **Step 2: 跑 test 验证 fail**

```bash
cd ~/bicycling && npm test -- tests/cycling-levels.test.ts -t "evaluateLevel"
```

Expected: FAIL `evaluateLevel is not a function`

- [ ] **Step 3: 实现 evaluateLevel**

append 到 `lib/engine/cycling-levels.ts`：

```typescript
import { buildPowerCurve } from "./power-curve";
import type { Activity, User } from "@/lib/types";

export type LevelEvaluation = {
  byDimension: Record<Dimension, DimensionEvaluation>;
  overall: {
    level: number;
    label: string;
    bottlenecks: Dimension[];      // 所有 level === overall.level 的维度 (≠ null)
  };
  dataWindow: {
    startDate: string;
    endDate: string;
    activityCount: number;
  };
  warnings: string[];
};

const WINDOW_DAYS = 90;
const MIN_ACTIVITIES = 5;

function estimateVo2max(ftpWatts: number | undefined, weightKg: number | undefined): number | undefined {
  if (!ftpWatts || !weightKg || weightKg <= 0) return undefined;
  // 基础公式 (Hawley & Noakes): VO2max ≈ FTP × 10.8 / weight + 7
  return Math.round((ftpWatts * 10.8) / weightKg + 7);
}

export function evaluateLevel(input: { activities: Activity[]; user: User }): LevelEvaluation {
  const { activities, user } = input;
  const warnings: string[] = [];

  // 1. 时间窗口过滤
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - WINDOW_DAYS * 86400000);
  const windowActs = activities.filter((a) => new Date(a.startTime) >= startDate);

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

  // 8. 木桶: 综合段位 = 有数据维度的最低 level (null 维度跳过)
  const validLevels = DIMENSIONS.map((d) => byDimension[d].level).filter(
    (l): l is number => l !== null,
  );
  const overallLevel = validLevels.length ? Math.min(...validLevels) : 0;
  const bottlenecks = DIMENSIONS.filter((d) => byDimension[d].level === overallLevel);

  return {
    byDimension,
    overall: {
      level: overallLevel,
      label: LEVEL_NAMES[overallLevel],
      bottlenecks,
    },
    dataWindow: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      activityCount: windowActs.length,
    },
    warnings,
  };
}
```

- [ ] **Step 4: 跑 test 验证 pass**

```bash
cd ~/bicycling && npm test -- tests/cycling-levels.test.ts
```

Expected: 所有 test PASS。

- [ ] **Step 5: 跑 tsc 确认无类型错**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: `EXIT=0`

- [ ] **Step 6: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add lib/engine/cycling-levels.ts tests/cycling-levels.test.ts && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(engine): evaluateLevel 木桶短板综合段位"
```

---

### Task 5: level-progression.ts — 训练计划生成

**Files:**
- Create: `lib/engine/level-progression.ts`
- Create: `tests/level-progression.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/level-progression.test.ts
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
    expect(plan.block?.sessions.length).toBeGreaterThan(0);
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

  it("TRAINING_RULES 每维度都有 block 或 aliasOf", () => {
    const dims = ["sprint5s", "burst1min", "vo2_5min", "ftp_20min", "endurance_60min", "vo2max_mlkgmin"];
    for (const d of dims) {
      const rule = TRAINING_RULES[d as keyof typeof TRAINING_RULES];
      expect(rule.name || rule.aliasOf).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: 跑 test 验证 fail**

```bash
cd ~/bicycling && npm test -- tests/level-progression.test.ts
```

Expected: FAIL `Cannot find module`

- [ ] **Step 3: 实现 level-progression.ts**

```typescript
// lib/engine/level-progression.ts
import type { Dimension } from "./cycling-levels";
import type { LevelEvaluation } from "./cycling-levels";

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
 * 每维度 → 4 周训练块, 包含若干 sessions
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
  weeklySchedule?: string[];      // 周一/周三/周五 文本排课
  expectedNewLevel?: number;
  note?: string;
};

export function generateUpgradePlan(evalResult: LevelEvaluation): UpgradePlan {
  if (!evalResult.overall.bottlenecks.length) {
    return { skip: "已经全面达标, 继续巩固即可" };
  }

  const target = PRIORITY.find((d) => evalResult.overall.bottlenecks.includes(d));
  if (!target) return { skip: "无可优化短板" };

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
  // 简化版排课: 周一 / 周三 / 周五 / 周日
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
```

- [ ] **Step 4: 跑 test 验证 pass**

```bash
cd ~/bicycling && npm test -- tests/level-progression.test.ts
```

Expected: 5 PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add lib/engine/level-progression.ts tests/level-progression.test.ts && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(engine): generateUpgradePlan 短板训练规则"
```

---

### Task 6: level-eta.ts — PMC 达成时间预测

**Files:**
- Create: `lib/engine/level-eta.ts`
- Create: `tests/level-eta.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/level-eta.test.ts
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
    overall: { level: 4, label: "中PRO 入门", bottlenecks: ["ftp_20min"] },
    dataWindow: { startDate: "", endDate: "", activityCount: 30 },
    warnings: [],
  };
}

function mkPmcSeries(days: number, ctlStart: number, ctlEnd: number): PmcDataPoint[] {
  const series: PmcDataPoint[] = [];
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1);
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
```

- [ ] **Step 2: 跑 test 验证 fail**

```bash
cd ~/bicycling && npm test -- tests/level-eta.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 level-eta.ts**

```typescript
// lib/engine/level-eta.ts
import type { LevelEvaluation } from "./cycling-levels";
import type { PmcDataPoint } from "./pmc";

export type EtaPrediction = {
  weeks: number;
  confidence: "high" | "medium" | "low";
  basis: {
    weeklyGainWkg: number;
    dataPoints: number;
  };
  rangeWeeks: [number, number];
  note?: string;
};

/**
 * 经验系数: 每周 CTL 上升 5 点 ≈ FTP 提升 0.05 W/kg (业余中位水平)
 */
const WEEKLY_CTL_GAIN_TO_WKG = 0.01;

export function predictEta(evalResult: LevelEvaluation, pmcSeries: PmcDataPoint[]): EtaPrediction {
  // 取 FTP 维度作为升段位的"瓶颈轴" (overall 不一定是 ftp, 但 FTP 是综合训练效果)
  const ftpDim = evalResult.byDimension.ftp_20min;
  const gapWkg = ftpDim?.gapValue ?? 0;

  // 已达成
  if (gapWkg <= 0) {
    return {
      weeks: 0,
      confidence: "high",
      basis: { weeklyGainWkg: 0, dataPoints: pmcSeries.length },
      rangeWeeks: [0, 0],
      note: `已达到 ${ftpDim?.nextLabel ?? "下一段位"}, 继续巩固`,
    };
  }

  // 数据不足
  if (pmcSeries.length < 7) {
    return {
      weeks: Infinity,
      confidence: "low",
      basis: { weeklyGainWkg: 0, dataPoints: pmcSeries.length },
      rangeWeeks: [Infinity, Infinity],
      note: "训练数据不足, 再训练 4 周后可预测",
    };
  }

  // CTL 增长率
  const recent = pmcSeries.slice(-30);
  const ctlStart = recent[0].ctl;
  const ctlEnd = recent[recent.length - 1].ctl;
  const days = recent.length;
  const ctlChange = ctlEnd - ctlStart;
  const weeklyCtlChange = (ctlChange / days) * 7;

  // CTL 下降
  if (weeklyCtlChange <= 0) {
    return {
      weeks: Infinity,
      confidence: "high",
      basis: { weeklyGainWkg: 0, dataPoints: pmcSeries.length },
      rangeWeeks: [Infinity, Infinity],
      note: "CTL 下降中, 需先恢复训练量才能达成升级",
    };
  }

  // 经验外推
  const weeklyGainWkg = weeklyCtlChange * WEEKLY_CTL_GAIN_TO_WKG;
  const weeks = Math.max(2, Math.round(gapWkg / weeklyGainWkg));

  // 置信度
  const confidence: "high" | "medium" | "low" =
    pmcSeries.length >= 60 ? "high" : pmcSeries.length >= 21 ? "medium" : "low";

  return {
    weeks,
    confidence,
    basis: { weeklyGainWkg: Number(weeklyGainWkg.toFixed(3)), dataPoints: pmcSeries.length },
    rangeWeeks: [Number((weeks * 0.7).toFixed(1)), Number((weeks * 1.4).toFixed(1))],
  };
}
```

- [ ] **Step 4: 跑 test 验证 pass**

```bash
cd ~/bicycling && npm test
```

Expected: 全部 PASS (smoke + cycling-levels + level-progression + level-eta)。

- [ ] **Step 5: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add lib/engine/level-eta.ts tests/level-eta.test.ts && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(engine): predictEta PMC 达成时间外推"
```

---

## Sub-sprint B — API + AI 集成

### Task 7: GET /api/analytics/level

**Files:**
- Create: `app/api/analytics/level/route.ts`
- Create: `tests/api-analytics-level.test.ts`

- [ ] **Step 1: 写 route**

```typescript
// app/api/analytics/level/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listActivitiesByUser } from "@/lib/storage";
import { evaluateLevel } from "@/lib/engine/cycling-levels";
import { generateUpgradePlan } from "@/lib/engine/level-progression";
import { predictEta } from "@/lib/engine/level-eta";
import { calculatePmc } from "@/lib/engine/pmc";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const activities = await listActivitiesByUser(user.id);

    if (activities.length < 5) {
      return NextResponse.json(
        { error: "活动数据不足", minimumActivities: 5, current: activities.length },
        { status: 422 },
      );
    }

    const evaluation = evaluateLevel({ activities, user });
    const upgradePlan = generateUpgradePlan(evaluation);
    const pmcSeries = calculatePmc(activities);
    const eta = predictEta(evaluation, pmcSeries);

    return NextResponse.json({
      evaluation,
      upgradePlan,
      eta,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("redirect")) throw error;
    const message = error instanceof Error ? error.message : "评级生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 手动 curl 验证 (需先启动 dev)**

```bash
cd ~/bicycling && npm run dev &
sleep 5
curl -s http://localhost:3000/api/analytics/level
```

Expected: 401 redirect (未登录) 或 422 (活动 < 5)。

- [ ] **Step 3: 跑 tsc**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: `EXIT=0`

- [ ] **Step 4: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add app/api/analytics/level/route.ts && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(api): GET /api/analytics/level 综合评级 endpoint"
```

---

### Task 8: AI 集成 — context 注入 + system prompt 升级

**Files:**
- Modify: `lib/engine/ai-analytics.ts:13-58` (AnalyticsAiContext type) + `:195-299` (buildAnalyticsContext)
- Modify: `lib/ai.ts` (system prompts)

- [ ] **Step 1: 扩展 AnalyticsAiContext type**

在 `lib/engine/ai-analytics.ts` import 顶部加：

```typescript
import { evaluateLevel, type LevelEvaluation } from "./cycling-levels";
import { generateUpgradePlan, type UpgradePlan } from "./level-progression";
import { predictEta, type EtaPrediction } from "./level-eta";
```

在 `AnalyticsAiContext` interface (现行 13-58 行) 末尾追加字段（保留所有原字段，仅追加）：

```typescript
  // 新增: 骑行能力分级
  level_evaluation?: LevelEvaluation;
  upgrade_plan?: UpgradePlan;
  eta_prediction?: EtaPrediction;
```

- [ ] **Step 2: buildAnalyticsContext 末尾注入**

在 `lib/engine/ai-analytics.ts` 现行 `buildAnalyticsContext` 函数 `return { ... }` 之前添加：

```typescript
  // 骑行能力分级评定 (engine 算好后喂给 AI, 严禁 AI 自己重算)
  const levelEvaluation = evaluateLevel({ activities, user });
  const upgradePlan = generateUpgradePlan(levelEvaluation);
  const etaPrediction = predictEta(levelEvaluation, pmcData);
```

然后在 `return { ... }` 对象末尾追加（保留所有现有字段）：

```typescript
    level_evaluation: levelEvaluation,
    upgrade_plan: upgradePlan,
    eta_prediction: etaPrediction,
```

- [ ] **Step 3: 升级 system prompt 加段位规则**

修改 `lib/engine/ai-analytics.ts` 的 `buildSystemPrompt` 函数（约 88-102 行），在数组末尾追加规则：

```typescript
    "重要 — 骑行能力分级 (level_evaluation) 已由 engine 算好, 必须严格遵守：",
    "  • 引用任何 W/kg 或 VO2max 数字时, 必须紧跟段位标签, 格式: 'FTP 3.29 W/kg (中PRO 入门 L4/11)'",
    "  • 综合段位用 level_evaluation.overall.label, 不要自己重新评判",
    "  • 短板维度优先讲 level_evaluation.overall.bottlenecks",
    "  • 训练建议直接引用 upgrade_plan, 不要另起炉灶",
    "  • ETA 引用 eta_prediction.weeks 和 eta_prediction.confidence, 不要自己估时间",
    "  • 严禁自己重算 W/kg 或重新判段位 — engine 已经算好, AI 只负责叙述",
```

- [ ] **Step 4: 跑 tsc**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: `EXIT=0`

- [ ] **Step 5: 跑现有 engine 测试确保未破坏**

```bash
cd ~/bicycling && npm test
```

Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add lib/engine/ai-analytics.ts lib/ai.ts && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ai): 注入 level_evaluation + 段位词汇 prompt 规则"
```

---

### Task 9: 集成 smoke — 完整链路 curl 验证

**Files:**
- 无新增/修改，仅验证

- [ ] **Step 1: 启动 dev (后台)**

```bash
cd ~/bicycling && pkill -f "next dev" 2>/dev/null; nohup npm run dev > /tmp/bicycling-dev.log 2>&1 &
sleep 8
```

- [ ] **Step 2: 验证 /api/analytics/level 端点存在 (无登录 → 应是 redirect 到 /login)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/analytics/level
```

Expected: `307` 或 `308` (redirect to /login)。如果是 200/500 排查。

- [ ] **Step 3: 看 dev log 确认无 type 错误**

```bash
tail -30 /tmp/bicycling-dev.log
```

Expected: 无 `TypeError` / `Error: Failed to compile`

- [ ] **Step 4: 关 dev**

```bash
pkill -f "next dev"
```

- [ ] **Step 5: Commit (无文件改动跳过)**

无 commit。Task 9 是验证 step, 无落地。

---

## Sub-sprint C — UI

### Task 10: level-radar.tsx — 6 维雷达 + 段位徽章中心

**Files:**
- Create: `components/analytics/level-radar.tsx`

- [ ] **Step 1: 写组件**

```typescript
// components/analytics/level-radar.tsx
"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { LevelEvaluation } from "@/lib/engine/cycling-levels";
import { DIMENSIONS, DIMENSION_META, LEVEL_COLOR_BUCKET } from "@/lib/engine/cycling-levels";

const LEVEL_BG: Record<string, string> = {
  gray: "#94a3b8",
  blue: "#3b82f6",
  green: "#10b981",
  purple: "#8b5cf6",
  gold: "#f59e0b",
};

type Props = { evaluation: LevelEvaluation };

export function LevelRadar({ evaluation }: Props) {
  const radarData = DIMENSIONS.map((dim) => ({
    dimension: DIMENSION_META[dim].label,
    level: evaluation.byDimension[dim].level ?? 0,
    fullMark: 11,
  }));

  const overallColor = LEVEL_BG[LEVEL_COLOR_BUCKET(evaluation.overall.level)];

  return (
    <div className="analytics-card" style={{ padding: 20 }}>
      <div className="analytics-card-header">
        <h2>能力水位雷达</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>木桶短板法 · 近 90 天最佳</span>
      </div>

      <div style={{ position: "relative" }}>
        <div className="analytics-chart-container" style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="rgba(0,0,0,0.1)" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "#555" }} />
              <PolarRadiusAxis domain={[0, 11]} tick={{ fontSize: 9, fill: "#999" }} />
              <Radar
                dataKey="level"
                stroke={overallColor}
                fill={overallColor}
                fillOpacity={0.3}
                strokeWidth={2.5}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 中心段位徽章 */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: overallColor,
            color: "white",
            padding: "10px 16px",
            borderRadius: 12,
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: "0.7rem", opacity: 0.9 }}>综合段位</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{evaluation.overall.label}</div>
          <div style={{ fontSize: "0.7rem", opacity: 0.9 }}>L{evaluation.overall.level}/11</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 跑 tsc**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: `EXIT=0`

- [ ] **Step 3: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/level-radar.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): level-radar 6 维雷达 + 段位徽章"
```

---

### Task 11: level-progress.tsx — 6 行进度条 + 阈值标记 + hover

**Files:**
- Create: `components/analytics/level-progress.tsx`

- [ ] **Step 1: 写组件**

```typescript
// components/analytics/level-progress.tsx
"use client";

import type { LevelEvaluation } from "@/lib/engine/cycling-levels";
import { DIMENSIONS, DIMENSION_META, LEVEL_TABLE, LEVEL_NAMES, LEVEL_COLOR_BUCKET } from "@/lib/engine/cycling-levels";

const LEVEL_BG: Record<string, string> = {
  gray: "#94a3b8",
  blue: "#3b82f6",
  green: "#10b981",
  purple: "#8b5cf6",
  gold: "#f59e0b",
};

type Props = { evaluation: LevelEvaluation };

export function LevelProgress({ evaluation }: Props) {
  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>6 维能力进度</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>悬停阈值线查看段位</span>
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        {DIMENSIONS.map((dim) => {
          const ev = evaluation.byDimension[dim];
          const meta = DIMENSION_META[dim];
          const thresholds = LEVEL_TABLE[dim];
          const maxValue = thresholds[11] * 1.05;
          const currentPct = ev.value !== null ? Math.min((ev.value / maxValue) * 100, 100) : 0;
          const color = LEVEL_BG[LEVEL_COLOR_BUCKET(ev.level ?? 0)];

          return (
            <div key={dim}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <strong style={{ fontSize: "0.92rem" }}>{meta.label}</strong>
                {ev.value !== null ? (
                  <span style={{ fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>{ev.value.toFixed(2)} {meta.unit}</span>
                    <span
                      style={{
                        marginLeft: 8,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: color,
                        color: "white",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      {ev.label} L{ev.level}
                    </span>
                  </span>
                ) : (
                  <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>— 数据不足</span>
                )}
              </div>

              {/* 进度条 + 阈值线 */}
              <div
                style={{
                  position: "relative",
                  height: 16,
                  background: "var(--line, #e5e7eb)",
                  borderRadius: 8,
                  overflow: "visible",
                }}
              >
                {/* 当前值填充 */}
                {ev.value !== null && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: "100%",
                      width: `${currentPct}%`,
                      background: color,
                      borderRadius: 8,
                      transition: "width 0.6s",
                    }}
                  />
                )}

                {/* 12 段位阈值刻度 */}
                {thresholds.map((t, i) => {
                  if (i === 0) return null;
                  const leftPct = (t / maxValue) * 100;
                  return (
                    <div
                      key={i}
                      title={`L${i} ${LEVEL_NAMES[i]} 阈值: ${t} ${meta.unit}`}
                      style={{
                        position: "absolute",
                        left: `${leftPct}%`,
                        top: -2,
                        height: 20,
                        width: 1,
                        background: "rgba(0,0,0,0.3)",
                        cursor: "help",
                      }}
                    />
                  );
                })}
              </div>

              {/* 距下一级提示 */}
              {ev.nextLabel && ev.gapValue !== undefined && ev.gapValue > 0 && (
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4 }}>
                  ▶ 距 {ev.nextLabel} 还差 {ev.gapValue.toFixed(2)} {meta.unit}
                  {ev.gapWatts !== undefined && ` (~${ev.gapWatts} W)`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 跑 tsc**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: `EXIT=0`

- [ ] **Step 3: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/level-progress.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): level-progress 6 维进度条 + 12 段位阈值标记"
```

---

### Task 12: upgrade-path-card.tsx — 4 周训练块卡片

**Files:**
- Create: `components/analytics/upgrade-path-card.tsx`

- [ ] **Step 1: 写组件**

```typescript
// components/analytics/upgrade-path-card.tsx
"use client";

import type { UpgradePlan } from "@/lib/engine/level-progression";
import { DIMENSION_META, type Dimension } from "@/lib/engine/cycling-levels";
import { TrendingUp, Calendar, Target } from "lucide-react";

type Props = { plan: UpgradePlan };

export function UpgradePathCard({ plan }: Props) {
  if (plan.skip) {
    return (
      <div className="analytics-card" style={{ textAlign: "center", padding: 28 }}>
        <Target size={32} style={{ color: "#10b981" }} />
        <h3 style={{ margin: "12px 0 4px" }}>✓ 已全面达标</h3>
        <p style={{ color: "var(--muted)", margin: 0 }}>{plan.skip}</p>
      </div>
    );
  }

  return (
    <div className="analytics-card" style={{ borderLeft: "4px solid #8b5cf6" }}>
      <div className="analytics-card-header">
        <h2>
          <TrendingUp size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          升级训练块 — {plan.block?.name}
        </h2>
        <span style={{ fontSize: "0.78rem", color: "#8b5cf6" }}>
          目标维度: {plan.targetDimension && DIMENSION_META[plan.targetDimension as Dimension].label}
        </span>
      </div>

      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        {plan.block?.sessions.map((s, i) => (
          <div
            key={i}
            style={{
              padding: 12,
              background: "var(--surface-alt, #f8fafc)",
              borderRadius: 8,
              borderLeft: "3px solid #8b5cf6",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <strong style={{ fontSize: "0.92rem" }}>{s.name}</strong>
              <span style={{ fontSize: "0.78rem", color: "#8b5cf6" }}>{s.freq}</span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{s.detail}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: "0.82rem", flexWrap: "wrap" }}>
        <div>
          <Calendar size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
          周排课: {plan.weeklySchedule?.join(" / ")}
        </div>
        <div style={{ color: "#10b981" }}>
          📈 预期: {plan.block?.expectedGain}
        </div>
      </div>

      {plan.note && (
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 12, marginBottom: 0 }}>
          ⚠ {plan.note}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: tsc + Commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/upgrade-path-card.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): upgrade-path-card 4 周训练块卡片"
```

---

### Task 13: eta-prediction-card.tsx — ETA + 置信度

**Files:**
- Create: `components/analytics/eta-prediction-card.tsx`

- [ ] **Step 1: 写组件**

```typescript
// components/analytics/eta-prediction-card.tsx
"use client";

import type { EtaPrediction } from "@/lib/engine/level-eta";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";

type Props = { eta: EtaPrediction; nextLabel?: string };

const CONFIDENCE_LABEL: Record<EtaPrediction["confidence"], string> = {
  high: "高置信度",
  medium: "中等置信度",
  low: "低置信度 (数据有限)",
};

const CONFIDENCE_COLOR: Record<EtaPrediction["confidence"], string> = {
  high: "#10b981",
  medium: "#f59e0b",
  low: "#94a3b8",
};

export function EtaPredictionCard({ eta, nextLabel }: Props) {
  const isDecline = !Number.isFinite(eta.weeks);
  const isAchieved = eta.weeks === 0;

  if (isAchieved) {
    return (
      <div className="analytics-card" style={{ textAlign: "center", padding: 24 }}>
        <CheckCircle size={32} style={{ color: "#10b981" }} />
        <h3 style={{ margin: "12px 0 4px" }}>✓ 已达成下一段位</h3>
        <p style={{ color: "var(--muted)", margin: 0 }}>{eta.note}</p>
      </div>
    );
  }

  if (isDecline) {
    return (
      <div className="analytics-card" style={{ padding: 24, borderLeft: "4px solid #ef4444" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <AlertTriangle size={18} style={{ color: "#ef4444" }} />
          <strong>暂无法预测达成时间</strong>
        </div>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.88rem" }}>{eta.note}</p>
      </div>
    );
  }

  return (
    <div className="analytics-card" style={{ padding: 24 }}>
      <div className="analytics-card-header">
        <h2>
          <Clock size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          预计 ETA — {nextLabel ?? "下一段位"}
        </h2>
        <span
          style={{
            fontSize: "0.75rem",
            padding: "2px 8px",
            borderRadius: 6,
            background: CONFIDENCE_COLOR[eta.confidence],
            color: "white",
            fontWeight: 600,
          }}
        >
          {CONFIDENCE_LABEL[eta.confidence]}
        </span>
      </div>

      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--accent, #1f57d6)" }}>
          {eta.weeks}
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>周后达成</div>
        <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 8 }}>
          区间: {eta.rangeWeeks[0]}-{eta.rangeWeeks[1]} 周
        </div>
      </div>

      <div style={{ fontSize: "0.78rem", color: "var(--muted)", borderTop: "1px solid var(--line, #e5e7eb)", paddingTop: 10 }}>
        基于近 {eta.basis.dataPoints} 天 PMC 趋势 · 周均 +{(eta.basis.weeklyGainWkg * 1000).toFixed(1)} mW/kg
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + Commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/eta-prediction-card.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): eta-prediction-card ETA + 置信度"
```

---

### Task 14: level-standard-table.tsx — 完整 12×6 阈值表 (透明度抓手)

**Files:**
- Create: `components/analytics/level-standard-table.tsx`

- [ ] **Step 1: 写组件**

```typescript
// components/analytics/level-standard-table.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import type { LevelEvaluation } from "@/lib/engine/cycling-levels";
import {
  DIMENSIONS,
  DIMENSION_META,
  LEVEL_TABLE,
  LEVEL_NAMES,
  LEVEL_COLOR_BUCKET,
} from "@/lib/engine/cycling-levels";

const LEVEL_BG: Record<string, string> = {
  gray: "#94a3b8",
  blue: "#3b82f6",
  green: "#10b981",
  purple: "#8b5cf6",
  gold: "#f59e0b",
};

type Props = { evaluation: LevelEvaluation };

export function LevelStandardTable({ evaluation }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="analytics-card">
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          padding: "12px 4px",
          cursor: "pointer",
          fontSize: "1rem",
          fontWeight: 600,
        }}
      >
        <span>
          <BookOpen size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          完整分级标准
        </span>
        {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: 16 }}>
            本系统基于 <strong>Coggan 功率训练分级</strong> + 中文骑友圈段位命名,
            采用 <strong>木桶短板法</strong> 评定综合段位 — 你的最弱维度决定整体等级。
          </p>

          {/* 12×6 阈值表 */}
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: "var(--surface-alt, #f8fafc)" }}>
                  <th style={{ padding: 8, textAlign: "left", borderBottom: "1px solid var(--line, #e5e7eb)" }}>维度</th>
                  {LEVEL_NAMES.map((name, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "8px 6px",
                        textAlign: "center",
                        borderBottom: "1px solid var(--line, #e5e7eb)",
                        background: LEVEL_BG[LEVEL_COLOR_BUCKET(i)],
                        color: "white",
                        fontSize: "0.7rem",
                      }}
                    >
                      L{i}<br />{name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIMENSIONS.map((dim) => {
                  const currentLevel = evaluation.byDimension[dim].level;
                  return (
                    <tr key={dim}>
                      <td style={{ padding: 8, fontWeight: 600, borderBottom: "1px solid var(--line, #e5e7eb)" }}>
                        {DIMENSION_META[dim].label} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({DIMENSION_META[dim].unit})</span>
                      </td>
                      {LEVEL_TABLE[dim].map((t, i) => {
                        const isCurrent = currentLevel === i;
                        return (
                          <td
                            key={i}
                            style={{
                              padding: "6px 4px",
                              textAlign: "center",
                              borderBottom: "1px solid var(--line, #e5e7eb)",
                              background: isCurrent ? LEVEL_BG[LEVEL_COLOR_BUCKET(i)] : undefined,
                              color: isCurrent ? "white" : undefined,
                              fontWeight: isCurrent ? 700 : 400,
                              outline: isCurrent ? "2px solid #1f2937" : undefined,
                            }}
                          >
                            {i === 0 ? "—" : t}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 8 }}>
              ⬛ 高亮: 你当前所在格 · 颜色与左侧徽章一致
            </p>
          </div>

          {/* 名词解释 */}
          <details style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer", fontSize: "0.88rem", fontWeight: 600 }}>📖 名词解释</summary>
            <div style={{ fontSize: "0.84rem", color: "var(--muted)", padding: "10px 0", lineHeight: 1.7 }}>
              <p><strong>W/kg</strong>: 功率除以体重, 反映绝对耐力水平。同等功率下越轻 W/kg 越高。</p>
              <p><strong>FTP (Functional Threshold Power)</strong>: 60 分钟最大持续输出功率, 衡量阈值能力的核心指标。</p>
              <p><strong>VO2max</strong>: 最大摄氧量 (ml/kg/min), 决定高强度天花板, 由心肺基因 + 训练共同决定。</p>
              <p><strong>木桶短板法</strong>: 综合段位 = 6 维度中最低的那个。理由: 真实比赛 / 长距离骑行中, 最弱维度决定你的赛事完成度, 教练学上提示训练应优先补短板。</p>
            </div>
          </details>

          {/* 来源 */}
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", borderTop: "1px solid var(--line, #e5e7eb)", paddingTop: 10, marginTop: 8 }}>
            数据来源: Coggan & Allen 《Training and Racing with a Power Meter》第 3 版 · 段位命名参考小红书骑友圈共识 · 如对阈值有疑问请联系 admin。
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: tsc + Commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/level-standard-table.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): level-standard-table 12×6 完整分级标准表 (透明度抓手)"
```

---

### Task 15: 能力水位页面 + nav-menu 入口

**Files:**
- Create: `app/(analytics)/analytics/level/page.tsx`
- Modify: `components/analytics/nav-menu.tsx:24-37` (navItems 数组)

- [ ] **Step 1: 写页面**

```typescript
// app/(analytics)/analytics/level/page.tsx
import { requireUser } from "@/lib/auth";
import { listActivitiesByUser } from "@/lib/storage";
import { evaluateLevel } from "@/lib/engine/cycling-levels";
import { generateUpgradePlan } from "@/lib/engine/level-progression";
import { predictEta } from "@/lib/engine/level-eta";
import { calculatePmc } from "@/lib/engine/pmc";
import { LevelRadar } from "@/components/analytics/level-radar";
import { LevelProgress } from "@/components/analytics/level-progress";
import { UpgradePathCard } from "@/components/analytics/upgrade-path-card";
import { EtaPredictionCard } from "@/components/analytics/eta-prediction-card";
import { LevelStandardTable } from "@/components/analytics/level-standard-table";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LevelPage() {
  const user = await requireUser();
  const activities = await listActivitiesByUser(user.id);

  // 数据不足引导
  if (activities.length < 5) {
    return (
      <main className="analytics-page">
        <div className="analytics-card" style={{ textAlign: "center", padding: 40 }}>
          <h1>能力水位</h1>
          <p style={{ color: "var(--muted)" }}>
            活动数据不足 — 当前 {activities.length} 条, 至少需要 5 条才能评级。
          </p>
          <Link href="/settings" style={{ color: "var(--accent, #1f57d6)" }}>
            ▶ 去同步 Strava / Intervals.icu
          </Link>
        </div>
      </main>
    );
  }

  const evaluation = evaluateLevel({ activities, user });
  const upgradePlan = generateUpgradePlan(evaluation);
  const pmcSeries = calculatePmc(activities);
  const eta = predictEta(evaluation, pmcSeries);

  const weightMissing = evaluation.warnings.includes("缺少体重数据");
  const ftpNextLabel = evaluation.byDimension.ftp_20min.nextLabel;

  return (
    <main className="analytics-page" style={{ display: "grid", gap: 20 }}>
      <header>
        <h1 style={{ margin: 0 }}>🚴 能力水位</h1>
        <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>
          基于近 90 天 ({evaluation.dataWindow.activityCount} 条活动) · 木桶短板法
        </p>
      </header>

      {weightMissing && (
        <div className="analytics-card" style={{ background: "#fef3c7", borderLeft: "4px solid #f59e0b", padding: 14 }}>
          ⚠ 你还没填写体重, W/kg 维度无法评级。请去 <Link href="/settings" style={{ color: "#92400e", textDecoration: "underline" }}>设置</Link> 完善个人信息。
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <LevelRadar evaluation={evaluation} />
        <LevelProgress evaluation={evaluation} />
      </div>

      <UpgradePathCard plan={upgradePlan} />

      <EtaPredictionCard eta={eta} nextLabel={ftpNextLabel} />

      <LevelStandardTable evaluation={evaluation} />

      <div style={{ textAlign: "center", padding: 12 }}>
        <Link href="/analytics/pmc" style={{ color: "var(--accent, #1f57d6)", fontSize: "0.88rem" }}>
          → 查看 PMC 趋势详情
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: nav-menu 加入口**

修改 `components/analytics/nav-menu.tsx`，在现有 navItems 数组中（lucide-react import 加 `Award` 图标），找到 `{ href: "/analytics/power-profile", label: "功率形态", icon: Target },` 后面插入：

```typescript
  { href: "/analytics/level", label: "能力水位", icon: Award },
```

并在顶部 `lucide-react` import 列表中加 `Award`：

```typescript
import {
  Activity,
  Award,  // ← 加这行
  BarChart3,
  // ...
} from "lucide-react";
```

- [ ] **Step 3: tsc**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: `EXIT=0`

- [ ] **Step 4: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add app/\(analytics\)/analytics/level/page.tsx components/analytics/nav-menu.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): /analytics/level 能力水位页面 + nav-menu 入口"
```

---

### Task 16: 体重缺失引导 + 数据不足引导 (已包含在 Task 15, 此 Task 验证)

**Files:**
- 无新增，仅 smoke

- [ ] **Step 1: 启 dev**

```bash
cd ~/bicycling && nohup npm run dev > /tmp/bicycling-dev.log 2>&1 &
sleep 8
```

- [ ] **Step 2: 浏览器手动验证 (用户操作)**

```
打开浏览器访问 http://localhost:3000/analytics/level
登录后预期看到:
  - 若活动 < 5: 引导卡 + "去同步" 链接
  - 若体重缺失: 顶部黄色横幅 + W/kg 维度显示 "数据不足"
  - 若正常: 4 个组件 + 折叠的分级标准表
```

- [ ] **Step 3: 关 dev**

```bash
pkill -f "next dev"
```

- [ ] **Step 4: Commit (无 file change)**

无 commit。

---

### Task 17: 全流程 smoke test (final)

**Files:**
- 无

- [ ] **Step 1: 全测试通跑**

```bash
cd ~/bicycling && npm test
```

Expected: 全 PASS, 4 个 test 文件。

- [ ] **Step 2: 全项目 tsc**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: `EXIT=0`

- [ ] **Step 3: build 验证**

```bash
cd ~/bicycling && npm run build 2>&1 | tail -20
```

Expected: `Compiled successfully`, 看到 `/analytics/level` 路由出现在 routes 列表。

- [ ] **Step 4: git log 验证 commit 数 ≈ 16**

```bash
cd ~/bicycling && git log --oneline | head -20
```

Expected: 看到 Task 1-15 各自的 feat/chore commit。

- [ ] **Step 5: 最终 commit (若有遗留改动)**

```bash
cd ~/bicycling && git status --short
# 若有未 commit 文件, 集中收尾:
# git add -p ...
```

---

## 总结

- **Task 数**: 17 个
- **Commit 数**: ≈ 16 (每 Task 一个, Task 9/16/17 是 smoke 不 commit)
- **新增文件**: 12 个 source + 4 个 test + 1 vitest.config
- **修改文件**: 4 个 (package.json / ai-analytics.ts / ai.ts / nav-menu.tsx)
- **测试覆盖**: engine 层 100% 单测, API 层 smoke (curl), UI 层 smoke (手动)
- **预计工时**: 5.5-7.5 人日

---

## Self-Review (writing-plans 协议要求)

**Spec coverage:**
- §2 模块拓扑 ✓ Task 2-15 全部对齐
- §3 分级常量表 ✓ Task 2 LEVEL_TABLE
- §4 木桶评定 ✓ Task 4
- §5 升级路径 ✓ Task 5
- §6 ETA ✓ Task 6
- §7 UI 落地 (radar/progress/upgrade-path/eta/**standard-table**) ✓ Task 10-14
- §7.6 分级标准透明度 ✓ Task 14
- §8 API ✓ Task 7
- §9 AI 集成 ✓ Task 8
- §10 边界 ✓ Task 15 (页面引导) + Task 16 (验证)
- §11 测试策略 ✓ Task 1-6 引入 Vitest + 单测
- §12 sub-sprint 路线 ✓ 按 A/B/C 组织

**Placeholder scan:** 全文 grep `TBD|TODO|占位` 应为 0 (Task 内代码都是完整可跑的)。

**Type 一致性:**
- `Dimension` 跨 cycling-levels / level-progression / level-eta / UI 全部使用同一 type 别名 ✓
- `LevelEvaluation.byDimension` 是 `Record<Dimension, DimensionEvaluation>` 全文一致 ✓
- `UpgradePlan` / `EtaPrediction` 类型在 Task 5 / 6 定义, Task 12 / 13 引用一致 ✓

**遗留风险**: Task 3 的 test description "FTP 3.29 → L3" 写错被 Task 内 Step 4 自我修正,实施时注意将 description 改成正确的 "L4 中PRO 入门"。
