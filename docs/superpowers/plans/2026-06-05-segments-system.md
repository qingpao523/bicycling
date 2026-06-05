# 赛段系统完整实现计划 — 34 Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建完整赛段功能 (A-J 全 10 个), 含 DB/数据管道/Engine 6 模块/UI 11 组件+2 页面/AI 集成/18 标签分类体系。

**Spec:** `docs/superpowers/specs/2026-06-04-cycling-level-system-design.md` + `.claude/plans/squishy-waddling-fern.md`

**Status:** Phase 1-3 (Tasks 1-7) 已完成并合并到 main (commit 72841ce)。从 Task 8 开始。

---

## Phase 1-3: DB + Storage + Pipeline ✅ 已完成

### Task 1 ✅: Prisma schema — Segment + SegmentEffort 表
### Task 2 ✅: lib/types.ts — Segment/SegmentEffort 类型 + SyncJob.jobType 加 segment_fetch
### Task 3 ✅: lib/storage.ts — 8 个 segment CRUD 函数
### Task 4 ✅: lib/strava.ts — fetchStravaActivityDetail + StravaSegmentEffortPayload
### Task 5 ✅: lib/strava-sync.ts — handleStravaSegmentFetchJob + runStravaSync 自动入队
### Task 6 ✅: lib/system-sync.ts — segment_fetch handler 注册
### Task 7 ✅: app/api/analytics/segments/backfill/route.ts — GET stats + POST trigger

---

## Phase 4: Engine 6 模块 (Tasks 8-14)

### Task 8: lib/engine/segments/segments-classify.ts — 赛段分类 + 18 标签 + 能力分级

**Files:**
- Create: `lib/engine/segments/segments-classify.ts`
- Create: `tests/segments-classify.test.ts`

**功能:**
- `SegmentTag` 类型 (22 个标签: 5 UCI + 3 冲刺 + 3 攻击 + 3 阈值 + 4 长耐力 + 2 下坡 + 1 综合)
- `autoTagSegment(segment): SegmentTag[]` — 基于 distance/avgGrade/maxGrade/climbCategory 自动打标
- `classifySegment(segment): SegmentCategory` — 6 大类 (冲刺/攻击/阈值/长耐力/下坡/综合)
- `gradeSegmentAbility(input): SegmentAbilityGrade` — 复用 cycling-levels LEVEL_TABLE 评级
  映射: 冲刺型→sprint5s, 攻击型→vo2_5min, 阈值型→ftp_20min, 长耐力→endurance_60min
- `segmentTypeLabel(category): string` — 中文标签

**标签判定规则 (核心):**
```
⚡ 冲刺型 (< 2min 全力):
  平路冲刺: avgGrade < 1% && dist < 1km
  缓坡冲刺: avgGrade 1-4% && dist < 1km
  陡坡冲刺: avgGrade > 4% && dist < 0.8km

🔥 攻击型 (2-10min):
  短坡攻击: avgGrade > 5% && dist 0.8-3km
  陡坡攻击: avgGrade > 8% && dist 0.5-2km
  起伏攻击: avgGrade 2-5% && dist 1-3km && maxGrade > 10%

🏋 阈值型 (10-30min):
  中距离爬坡: avgGrade > 4% && dist 3-8km
  中距离起伏: avgGrade 1-4% && dist 5-15km && elevGain > 100m
  中距离平路: avgGrade < 1% && dist 5-15km

🐢 长耐力型 (30min+):
  长距离爬坡: avgGrade > 3% && dist > 8km
  长距离起伏: avgGrade 1-3% && dist > 15km && elevGain > 200m
  长距离绕圈: avgGrade < 1% && dist > 15km
  超长耐力: dist > 30km

⬇ 下坡型:
  技术下坡: avgGrade < -3% && dist > 2km
  缓降: avgGrade -1%~-3% && dist > 3km

🔀 综合型: 不符合以上
```

**Tests:** 每个标签至少 1 个 case + 多标签 case + 能力分级边界

---

### Task 9: lib/engine/segments/segments-history.ts — 赛段历史趋势

**Files:**
- Create: `lib/engine/segments/segments-history.ts`
- Create: `tests/segments-history.test.ts`

**功能:**
- `SegmentHistoryPoint` 类型: date/elapsedTime/movingTime/avgWatts/avgHr/isPr/speed(km/h)
- `SegmentTrend` 类型: points[]/bestTime/worstTime/avgTime/totalAttempts/improvementPct/recentTrend
- `buildSegmentHistory(efforts[], segment): SegmentTrend`
  - 按 startDate 排序
  - 计算 speed = (segment.distance / 1000) / (elapsedTime / 3600)
  - 判 recentTrend: 近 3 次 vs 前 3 次, improving/stable/declining
  - improvementPct = (first - best) / first * 100

**Tests:** 3次/5次/1次/PR判定/trend判定

---

### Task 10: lib/engine/segments/segments-correlation.ts — 赛段×训练状态关联

**Files:**
- Create: `lib/engine/segments/segments-correlation.ts`
- Create: `tests/segments-correlation.test.ts`

**功能:**
- `CorrelationPoint`: date/elapsedTime/ctl/atl/tsb/speed/avgWatts
- `CorrelationResult`: points[]/tsbToSpeedCorrelation(Pearson r)/ctlToSpeedCorrelation/optimalTsbRange/optimalCtlRange/insight
- `correlateSegmentWithTraining(input: {efforts[], segment, pmcData}): CorrelationResult`
  - 用 effort.startDate 找对应日期的 PMC 点
  - 计算 Pearson r (TSB vs speed, CTL vs speed)
  - 找最佳 TSB/CTL 区间 (performance top 25% 的平均 TSB/CTL)
  - insight 文案: "你在 TSB 5-15 时这个赛段表现最好, 说明恢复到位是关键"

**Tests:** 正相关/负相关/无数据/最佳区间

---

### Task 11: lib/engine/segments/segments-prediction.ts — 赛段进步预测

**Files:**
- Create: `lib/engine/segments/segments-prediction.ts`
- Create: `tests/segments-prediction.test.ts`

**功能:**
- `SegmentPrediction`: targetTime/currentBest/predictedWeeks/confidence/weeklyGainSeconds/rangeWeeks/method/note
- `predictSegmentEta(input: {efforts[], targetTime}): SegmentPrediction`
  - 线性回归 (elapsedTime vs date) → 斜率 = 每周进步多少秒
  - weeks = (currentBest - targetTime) / weeklyGain
  - confidence: ≥5 次 high, 3-4 medium, ≤2 low
  - method: "linear_regression" / "insufficient_data"
  - edge: 已达成 → weeks=0, 退步中 → Infinity

**Tests:** 正常进步/已达成/退步/数据不足

---

### Task 12: lib/engine/segments/segments-causation.ts — 训练因果分析

**Files:**
- Create: `lib/engine/segments/segments-causation.ts`
- Create: `tests/segments-causation.test.ts`

**功能:**
- `TrainingBlock`: startDate/endDate/weeklyTss/dominantZone/weeklyHours
- `CausationResult`: prImprovements[{date, timeDelta, precedingBlock}]/insights[]/strongestCorrelation
- `analyzeSegmentCausation(input: {efforts[], segment, activities[], pmcData, userFtp}): CausationResult`
  - 找所有 PR improvement events (effort.prRank === 1 且比前一个 PR 快)
  - 每个 PR 前 4 周活动 → 构建 TrainingBlock (算 weeklyTss, 找主要训练区间)
  - 生成 insights: "4 周 VO2 训练后 Cat 3 爬坡快了 8%"
  - strongestCorrelation: 哪种训练类型 → 哪类赛段效果最大

**Tests:** 有 PR/无 PR/多次 PR/训练块识别

---

### Task 13: lib/engine/segments/segments-recommend.ts — 赛段推荐

**Files:**
- Create: `lib/engine/segments/segments-recommend.ts`
- Create: `tests/segments-recommend.test.ts`

**功能:**
- `SegmentRecommendation`: segment/reason/currentBestTime/estimatedTop10Time/gapSeconds/potentialRank/confidence
- `recommendSegments(input: {segments[], efforts[], userFtp, userWeightKg}): SegmentRecommendation[]`
  - 基于 power-to-weight 估算用户在每个赛段的理论最佳时间
  - 对比实际最佳 → gap 小的 = "你有潜力进 Top 10"
  - 排序: gap 最小的排前面
  - 至少 2 次 attempt 才推荐 (有足够数据)

**Tests:** 有数据/无数据/ranking logic

---

### Task 14: lib/engine/segments/index.ts — barrel export

**Files:**
- Create: `lib/engine/segments/index.ts`

Re-export all 6 modules:
```typescript
export * from "./segments-classify";
export * from "./segments-history";
export * from "./segments-correlation";
export * from "./segments-prediction";
export * from "./segments-causation";
export * from "./segments-recommend";
```

---

### Task 15: 补充 tests — 7 个 test 文件全部 pass

**Files:** 已在 Task 8-13 各自创建

- [ ] `npm test` 全 pass (35 旧 + ~40 新 = ~75 total)
- [ ] `npx tsc --noEmit` EXIT=0

---

## Phase 5: 活动详情页赛段 section (Tasks 16-17)

### Task 16: components/activity-detail/segments-section.tsx — 活动页赛段列表 (Feature A)

**Files:**
- Create: `components/activity-detail/segments-section.tsx`

**Props:**
```typescript
type Props = {
  efforts: Array<{
    id: string;
    segment: { id: string; name: string; distance: number; averageGrade: number; climbCategory: number; tags?: string[] };
    elapsedTime: number;
    movingTime: number;
    averageWatts?: number;
    averageHr?: number;
    prRank?: number;
    komRank?: number;
  }>;
};
```

**UI:**
- analytics-card 容器, h2 "本次赛段"
- 每条 effort: 赛段名 + 距离/坡度 + 用时 + 功率 + 心率
- PR 徽章 (金/银/铜 for rank 1/2/3)
- KOM 徽章
- 标签 chips (来自 segment.tags)
- 点击 → /analytics/segments/{segmentId}

---

### Task 17: 修改 app/activities/[id]/page.tsx — 嵌入 segments-section

**Files:**
- Modify: `app/activities/[id]/page.tsx`

- import SegmentsSection + listSegmentEffortsByActivity
- 在 §D 补给恢复 和 §E 深度数据之间插入 SegmentsSection
- 无赛段数据时不显示 (efforts.length === 0 → null)

---

## Phase 6: Analytics 赛段页面 (Tasks 18-30)

### Task 18: components/analytics/segment-history-chart.tsx — Feature B 历史曲线

**Files:** Create
**Props:** `{ history: SegmentTrend; segment: Segment }`
**UI:** recharts LineChart — X 轴日期, Y 轴用时(秒), 标注 PR 点, 趋势线

---

### Task 19: components/analytics/segment-correlation-chart.tsx — Feature C 关联散点图

**Files:** Create
**Props:** `{ correlation: CorrelationResult }`
**UI:** recharts ScatterChart — X 轴 TSB, Y 轴 speed, 颜色标注最佳区间, 显示 r 值

---

### Task 20: components/analytics/segment-pr-dashboard.tsx — Feature D PR/KOM 面板

**Files:** Create
**Props:** `{ efforts: SegmentEffort[]; segments: Segment[] }`
**UI:**
- 顶部 KPI: 总赛段数 / 总 PR 数 / 近 90 天新 PR / KOM 数
- PR 列表: 按日期倒序, 每条显示赛段名 + 用时 + vs 上次差距
- 进步统计: 近 90 天 PR 进步百分比分布

---

### Task 21: components/analytics/segment-classification-table.tsx — Feature E 分类+能力分级

**Files:** Create
**Props:** `{ segments: Segment[]; grades: Map<string, SegmentAbilityGrade> }`
**UI:**
- 按 6 大类分组 tab (冲刺/攻击/阈值/长耐力/下坡/综合)
- 每组内: 赛段名 + 标签 chips + 最佳时间 + 能力段位 (复用 LEVEL_BG 色阶)
- 各类别汇总: "你的攻击型赛段综合是 L4 中PRO 入门"

---

### Task 22: components/analytics/segment-prediction-card.tsx — Feature F ETA

**Files:** Create
**Props:** `{ prediction: SegmentPrediction; segment: Segment }`
**UI:** 卡片: 大数字 "X 周后破 Y 分", 置信度标签, 区间

---

### Task 23: components/analytics/segment-causation-card.tsx — Feature G 训练因果

**Files:** Create
**Props:** `{ causation: CausationResult }`
**UI:** 卡片列表: 每个 insight 一行, "4 周 VO2 训练 → Cat 3 爬坡快了 8%"

---

### Task 24: components/analytics/segment-recommend-list.tsx — Feature H 推荐

**Files:** Create
**Props:** `{ recommendations: SegmentRecommendation[] }`
**UI:** 推荐卡片列表: 赛段名 + "距 Top 10 差 X 秒" + 信心度

---

### Task 25: components/analytics/segment-leaderboard.tsx — Feature I 排行榜

**Files:** Create
**Props:** `{ efforts: SegmentEffort[]; segments: Segment[] }`
**UI:** 按赛段分组, 显示用户在每个赛段的排名 (同系统多用户对比)

---

### Task 26: components/analytics/segment-map.tsx — Feature J 地图+高程

**Files:** Create
**Props:** `{ segment: Segment }`
**UI:**
- 起终点坐标标注 (用 div 实现简易标注, 不引入 leaflet)
- 高程剖面: recharts AreaChart (elevationLow → elevationHigh)
- 赛段信息: 距离/坡度/爬升/分类

---

### Task 27: components/analytics/segment-backfill-panel.tsx — 补拉面板

**Files:** Create
**Props:** `{ stats: { totalActivities, stravaActivities, withSegments, missingSegments } }`
**UI:** 进度条 + "开始补拉赛段数据" 按钮, 调 /api/analytics/segments/backfill

---

### Task 28: components/analytics/segments-dashboard.tsx — 主页面 orchestrator

**Files:** Create
**Props:** `{ segments, efforts, pmcData, user, activities }`
**UI:** Tab 布局:
- 概览 (PR dashboard + 分类表)
- 历史 (选赛段 → 看曲线)
- 分析 (关联 + 因果 + 预测)
- 推荐 (推荐列表)
- 排行 (leaderboard)
- 工具 (backfill panel)

---

### Task 29: app/(analytics)/analytics/segments/page.tsx — 赛段主页

**Files:** Create
**UI:** Server component, 加载所有数据, 传给 segments-dashboard

---

### Task 30: app/(analytics)/analytics/segments/[id]/page.tsx — 赛段详情页

**Files:** Create
**UI:** 单赛段: 历史曲线 + 关联散点 + 预测卡 + 因果 + 地图

---

## Phase 7: AI + Nav + Final (Tasks 31-34)

### Task 31: app/api/analytics/segments/route.ts — 赛段 list API

**Files:** Create
**UI:** GET 返回用户所有赛段 + efforts 汇总

---

### Task 32: app/api/analytics/segments/[id]/route.ts — 赛段详情 API

**Files:** Create
**UI:** GET 返回单赛段 history + correlation + prediction

---

### Task 33: nav-menu + AI 集成

**Files:**
- Modify: `components/analytics/nav-menu.tsx` — 加 "赛段" 入口 (Mountain icon)
- Modify: `lib/engine/ai-analytics.ts` — AnalyticsAiContext 加 segment_summary + prompt 规则

---

### Task 34: 全流程 smoke + build 验证

- [ ] `npx prisma db push` — tables created
- [ ] `npm test` — ~75 tests pass
- [ ] `npx tsc --noEmit` — TSC=0
- [ ] `npm run build` — Compiled successfully
- [ ] Dev: /analytics/segments 页面渲染
- [ ] Dev: /activities/{id} 赛段 section 显示
- [ ] Dev: AI 报告含赛段 insight
- [ ] commit + merge + push GitHub

---

## 估算汇总

| Phase | Tasks | 工时 |
|---|---|---|
| ~~Phase 1-3~~ | ~~1-7~~ | ~~✅ 已完成~~ |
| Phase 4 Engine | 8-15 | 3-4d |
| Phase 5 活动赛段 | 16-17 | 0.5d |
| Phase 6 赛段页面 | 18-30 | 4-5d |
| Phase 7 AI+Nav | 31-34 | 1d |
| **总计 (剩余)** | **27 tasks** | **8.5-10.5d** |
