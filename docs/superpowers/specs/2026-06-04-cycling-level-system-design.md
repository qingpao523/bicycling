# 骑行能力分级系统 — 设计文档

- **日期**：2026-06-04
- **范围**：bicycling repo, 旗舰版（含训练计划生成 + PMC 达成时间预测）
- **状态**：设计待 review
- **预计工时**：5.5-7.5 人日，分 3 个 sub-sprint
- **作者**：Claude (P8 协同)
- **修订**：
  - 2026-06-04 v1 初稿
  - 2026-06-04 v2 加入 §7.6 分级标准透明度 (level-standard-table)

---

## 1. 背景与目标

### 1.1 痛点

当前 AI 数据分析报告（`lib/engine/ai-analytics.ts` → `lib/ai.ts`）输出全是相对描述："偏低""不足""远低于全能型"，缺**绝对标尺**。用户读完不知道：

1. 我现在处于什么水位？
2. 下一个台阶在哪？
3. 差多少？怎么练？

### 1.2 目标

引入"骑行能力分级系统"，让每份报告：

- **每个能力维度**（5s / 1min / 5min / FTP / 60min / VO2max）显示当前 W/kg + 中文段位（如"小PRO 毕业"）+ 距下一级差多少瓦
- **综合段位**用木桶短板法评定（最弱维度决定整体），明确告诉用户"卡在哪"
- **升级训练计划**针对短板维度，生成 4 周训练块
- **PMC 趋势预测**基于近期 CTL / FTP 增长率，外推"预计 X 周达成下一段位"
- AI 报告里以分级词汇叙述（"FTP 3.29 W/kg = 小PRO 成长"），与可视化对齐

### 1.3 范围 / 非范围

- ✅ 落在 `engine` 层为主，配 UI 可视化 + AI prompt 升级
- ✅ 复用既有 `lib/engine/power-curve.ts`、`pmc.ts`、`ftp-estimator.ts`
- ❌ 不引入"速度型"评定（速度受路况干扰大，首版只走功率维度）
- ❌ 不做 admin 后台动态编辑分级表（首版常量入码，后期可演进）
- ❌ 不对接外部 ranking 数据库 / 社交对比

---

## 2. 模块拓扑

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                              UI 层                                             │
│  app/(analytics)/analytics/level/page.tsx       (新路由)                       │
│  components/analytics/                                                         │
│    ├─ level-radar.tsx           6 维雷达 + 综合段位徽章                        │
│    ├─ level-progress.tsx        6 维进度条 (当前位/下一级/差多少瓦)            │
│    ├─ upgrade-path-card.tsx     短板维度的 4 周训练块                          │
│    └─ eta-prediction-card.tsx   预计达成下一段位的 ETA + 置信区间              │
└───────────────────────────┬───────────────────────────────────────────────────┘
                            │ HTTP GET
                            ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│                              API 层                                            │
│  app/api/analytics/level/route.ts                                              │
│  GET → LevelDashboard JSON (evaluation + upgradePath + eta)                    │
└───────────────────────────┬───────────────────────────────────────────────────┘
                            │ 调用 (纯函数,无 IO 除 DB 读)
                            ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│                          engine 层 (3 个新文件)                                │
│                                                                                │
│  cycling-levels.ts                                                             │
│    ├─ LEVEL_TABLE          (12 段位 × 6 维度阈值常量)                          │
│    ├─ evaluateLevel(input) (木桶短板算法)                                      │
│    └─ findGap(value, dim)  (差多少瓦到下一级)                                  │
│                                                                                │
│  level-progression.ts                                                          │
│    ├─ TRAINING_RULES       (短板维度 → 推荐训练课字典)                          │
│    └─ generateUpgradePlan(eval) → 4 周训练块                                   │
│                                                                                │
│  level-eta.ts                                                                  │
│    └─ predictEta(eval, pmcSeries) → { weeks, confidence }                      │
└───────────────────────────┬───────────────────────────────────────────────────┘
                            │ 复用 (零改动)
                            ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│  现有 engine: power-curve / pmc / ftp-estimator / activity-features            │
└───────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│                          AI 层 (改造)                                          │
│  lib/engine/ai-analytics.ts                                                   │
│    └─ buildAnalyticsContext() 注入 levelEvaluation 字段                        │
│  lib/ai.ts (system prompt)                                                    │
│    └─ 强制要求引用段位词汇,严禁自己重算 W/kg                                   │
└───────────────────────────────────────────────────────────────────────────────┘
```

**底层逻辑**：engine 是确定性纯函数（可单测），AI 只做叙述。`FTP 3.29 W/kg = 小PRO 成长` 永远不会幻觉。

---

## 3. 分级常量表

### 3.1 段位命名（12 级）

| 段位 | 中文名 | Coggan 等价 | FTP W/kg 阈值（下限） |
|---|---|---|---|
| L0 | 入门骑友 | Untrained | < 2.0 |
| L1 | 小PRO 入门 | Cat 5 | 2.0 |
| L2 | 小PRO 成长 | Cat 5+ | 2.4 |
| L3 | 小PRO 毕业 | Cat 4 | 2.8 |
| L4 | 中PRO 入门 | Cat 4+ | 3.2 |
| L5 | 中PRO 成长 | Cat 3 | 3.6 |
| L6 | 中PRO 毕业 | Cat 3+ | 4.0 |
| L7 | 大PRO 入门 | Cat 2 | 4.4 |
| L8 | 大PRO 成长 | Cat 2+ | 4.8 |
| L9 | 大PRO 毕业 | Cat 1 | 5.2 |
| L10 | 准职业 | Cat 1+ / 国家级 | 5.6 |
| L11 | 职业 | World Class | ≥ 6.0 |

为什么 12 级而不是小红书的 20 级：颗粒度太细会上下震荡（用户多骑一次就升一级、漏一周就掉级），影响信任感。12 级 ≈ 0.4 W/kg 跨度，约对应 1-2 个月训练成效。

### 3.2 6 维度阈值矩阵（W/kg 下限）

| 维度 | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sprint5s | 0 | 8.0 | 9.5 | 11.0 | 12.0 | 13.0 | 14.0 | 16.0 | 17.5 | 19.0 | 20.5 | 22.0 |
| burst1min | 0 | 4.5 | 5.3 | 6.0 | 6.5 | 7.0 | 7.5 | 8.5 | 9.0 | 9.5 | 10.0 | 11.0 |
| vo2_5min | 0 | 3.0 | 3.5 | 4.0 | 4.4 | 4.8 | 5.2 | 5.5 | 5.8 | 6.2 | 6.6 | 7.0 |
| ftp_20min | 0 | 2.0 | 2.4 | 2.8 | 3.2 | 3.6 | 4.0 | 4.4 | 4.8 | 5.2 | 5.6 | 6.0 |
| endurance_60min | 0 | 1.8 | 2.2 | 2.5 | 2.9 | 3.2 | 3.6 | 4.0 | 4.3 | 4.7 | 5.1 | 5.5 |
| vo2max_mlkgmin | 0 | 35 | 40 | 45 | 49 | 52 | 56 | 60 | 64 | 68 | 71 | 75 |

> **数据来源**：Coggan《Training and Racing with a Power Meter》分级表 + 业余圈中位数。落到 `LEVEL_TABLE` 常量，每个维度独立。

### 3.3 评定输出 schema

```typescript
type Dimension = 'sprint5s' | 'burst1min' | 'vo2_5min' | 'ftp_20min' | 'endurance_60min' | 'vo2max_mlkgmin';

type DimensionEvaluation = {
  dimension: Dimension;
  value: number;                  // 当前 W/kg 或 ml/kg/min
  unit: 'wkg' | 'mlkgmin';
  level: number;                  // 0-11
  label: string;                  // "小PRO 成长"
  nextLevel?: number;             // 12 时为 undefined (已封顶)
  nextLabel?: string;
  nextThreshold?: number;         // 下一级 W/kg 阈值
  gapValue?: number;              // 差多少 W/kg
  gapWatts?: number;              // 差多少瓦 (W/kg × weightKg, vo2max 不算)
  rawSource?: string;             // 数据来源 activity id (审计用)
};

type LevelEvaluation = {
  byDimension: Record<Dimension, DimensionEvaluation>;
  overall: {
    level: number;                // 木桶 = byDimension 最低
    label: string;
    bottlenecks: Dimension[];     // 所有等于最低 level 的维度
  };
  dataWindow: { startDate: string; endDate: string; activityCount: number };
  warnings: string[];             // "体重缺失"、"5min 数据不足" 等
};
```

---

## 4. 木桶评定算法

### 4.1 数据窗口

- **滚动 90 天最佳功率**（与 PMC 的 CTL 时间尺度一致）
- 取每个维度时长（5s/1min/5min/20min/60min）在窗口内的**单次最佳**
- 体重：优先 `user.weightKg`，回退 `user.syncedWeightKg`
- VO2max：复用现有 `ftp-estimator.ts` 公式 `FTP × 10.8 / weightKg + 7`，再用 EF 微调

### 4.2 算法步骤

```typescript
function evaluateLevel(input: {
  activities: Activity[];   // 来自 listActivitiesByUser
  user: User;
}): LevelEvaluation {
  // 1. 过滤窗口 (now - 90d)
  const window = filterByDateRange(input.activities, 90);

  // 2. 提取每维度的窗口最佳功率 (复用 buildPowerCurve)
  const curve = buildPowerCurve(window);
  const best = {
    sprint5s:        curve.find(p => p.seconds === 5)?.watts,
    burst1min:       curve.find(p => p.seconds === 60)?.watts,
    vo2_5min:        curve.find(p => p.seconds === 300)?.watts,
    ftp_20min:       curve.find(p => p.seconds === 1200)?.watts ?? user.ftp,
    endurance_60min: curve.find(p => p.seconds === 3600)?.watts,
  };

  // 3. 换 W/kg
  const weightKg = input.user.weightKg ?? input.user.syncedWeightKg;
  const wkg = mapValues(best, w => w && weightKg ? w / weightKg : undefined);

  // 4. VO2max 估算
  const vo2max = estimateVo2max(best.ftp_20min, weightKg, window);

  // 5. 每维度查表评级 (二分查找阈值表)
  const byDimension = mapValues({...wkg, vo2max_mlkgmin: vo2max}, (v, dim) =>
    evaluateDimension(dim, v, weightKg)
  );

  // 6. 木桶: 综合段位 = 最低维度的 level
  const minLevel = Math.min(...Object.values(byDimension).map(d => d.level));
  const bottlenecks = Object.entries(byDimension)
    .filter(([_, d]) => d.level === minLevel)
    .map(([k]) => k as Dimension);

  return {
    byDimension,
    overall: { level: minLevel, label: LEVEL_NAMES[minLevel], bottlenecks },
    dataWindow: { ... },
    warnings: [...]
  };
}
```

### 4.3 缺失数据处理

| 场景 | 行为 |
|---|---|
| 体重缺失 | 所有 W/kg 维度 level = null，UI 显示"请先在设置里填写体重"，VO2max 不算 |
| 窗口内活动 < 5 | 整体不评，返回 `warnings: ['活动数据不足，至少需要 5 条']`，UI 显示引导文案 |
| 某维度最佳功率为空（如无 5min 数据）| 该维度 level = null，显示 "—"，不参与木桶（避免被一个"没冲过 5min"的用户卡到 L0） |
| FTP 缺失 | 用 `ftp_20min` 最佳功率反推；都没有则整 ftp 维度 = null |

### 4.4 防震荡

- 单次活动数据更新后，评定结果不立即变（前端缓存 1h）
- 段位升降仅在新最佳功率比当前阈值高/低 **3%** 以上时触发（避免边缘抖动）

---

## 5. 升级路径生成

### 5.1 训练规则字典

落到 `lib/engine/level-progression.ts` 常量：

```typescript
const TRAINING_RULES: Record<Dimension, TrainingBlock> = {
  sprint5s: {
    name: '爆发力提升 4 周',
    sessions: [
      { freq: '2次/周', name: 'Max Sprints', detail: '6×15s 全力冲刺,间歇 5min 滑行' },
      { freq: '1次/周', name: '基础有氧', detail: '90min Z2,保留腿部新鲜' },
    ],
    expectedGain: '+0.5-1.0 W/kg 5s 峰值',
  },
  burst1min: {
    name: '无氧能力提升 4 周',
    sessions: [
      { freq: '2次/周', name: 'Anaerobic Intervals', detail: '5×1min @ 120% FTP, 4min 恢复' },
      { freq: '1次/周', name: 'Tempo 60min', detail: '维持 75-80% FTP' },
    ],
    expectedGain: '+0.3-0.6 W/kg 1min',
  },
  vo2_5min: {
    name: 'VO2max 提升 4 周',
    sessions: [
      { freq: '2次/周', name: 'VO2 Intervals', detail: '5×5min @ 105-110% FTP, 5min 恢复' },
      { freq: '1次/周', name: 'Long Z2', detail: '2.5-3h 持续低强度' },
    ],
    expectedGain: '+0.2-0.4 W/kg 5min',
  },
  ftp_20min: {
    name: 'FTP 阈值提升 4 周',
    sessions: [
      { freq: '2次/周', name: 'Sweet Spot', detail: '2×20min @ 88-93% FTP, 5min 恢复' },
      { freq: '1次/周', name: 'Threshold', detail: '3×12min @ 95-100% FTP, 4min 恢复' },
      { freq: '1次/周', name: '基础有氧 Z2', detail: '90-120min' },
    ],
    expectedGain: '+0.2-0.4 W/kg FTP',
  },
  endurance_60min: {
    name: '耐力提升 4 周',
    sessions: [
      { freq: '1次/周', name: 'Long Endurance', detail: '4-5h Z2, 含 2×30min 节奏段' },
      { freq: '2次/周', name: 'Tempo 90min', detail: '维持 78-85% FTP' },
    ],
    expectedGain: '+0.15-0.3 W/kg 60min',
  },
  vo2max_mlkgmin: {
    // 同 vo2_5min,VO2max 与 5min 功率高度相关
    aliasOf: 'vo2_5min',
  },
};
```

### 5.2 生成逻辑

```typescript
function generateUpgradePlan(eval: LevelEvaluation): UpgradePlan {
  if (eval.overall.bottlenecks.length === 0) return { skip: '已经全面达标' };

  // 多个短板时,优先选 FTP > VO2 > 1min > 5s > 60min (按训练 ROI)
  const PRIORITY: Dimension[] = ['ftp_20min', 'vo2_5min', 'burst1min', 'sprint5s', 'endurance_60min', 'vo2max_mlkgmin'];
  const target = PRIORITY.find(d => eval.overall.bottlenecks.includes(d))!;

  const block = TRAINING_RULES[target].aliasOf
    ? TRAINING_RULES[TRAINING_RULES[target].aliasOf!]
    : TRAINING_RULES[target];

  return {
    targetDimension: target,
    block,
    weeklySchedule: layoutWeek(block.sessions),  // 周一/周三/周五排课逻辑
    expectedNewLevel: eval.byDimension[target].level + 1,
    note: '此为通用建议,实际请结合恢复、伤病、赛季阶段调整',
  };
}
```

### 5.3 与 RidePlan 模块的对接

**首版**：升级计划只展示，不写入 `RidePlan` 表。
**后续 sprint**：在 `upgrade-path-card.tsx` 加 "一键导入骑前计划" 按钮，调用 `/api/ride-plans` 创建对应的 RidePlan 记录。

---

## 6. PMC 达成时间预测（ETA）

### 6.1 预测模型

线性外推：
- 取近 90 天的 FTP 增长率（如有多次 FTP 检测则取斜率；若只有一次，用 CTL 增长率 × 经验系数 0.15 W/kg per CTL+10 代理）
- `weeksToNext = max(2, gapWkg / weeklyWkgGain)`

### 6.2 输出 schema

```typescript
type EtaPrediction = {
  weeks: number;                  // 预计周数
  confidence: 'high' | 'medium' | 'low';  // 数据点 ≥ 5 → high; 2-4 → medium; ≤ 1 → low
  basis: {
    weeklyGainWkg: number;        // 当前周均增长
    dataPoints: number;
  };
  rangeWeeks: [number, number];   // 置信区间 (低: weeks × 0.7, 高: weeks × 1.4)
  note?: string;                  // "CTL 下降中,需先恢复训练量才能达成"
};
```

### 6.3 边界

- **CTL 下降中**：返回 `weeks: Infinity, note: 'CTL 下降中,需先恢复训练量'`，UI 显示 "继续躺平,段位会掉" 风格警告
- **数据点 < 2**：confidence = low, weeks 显示 "—"，提示"再训练 4 周后可预测"
- **gap = 0**（已到下一级）：UI 显示 "✓ 已达成 Lx,继续巩固"

---

## 7. UI 落地

### 7.1 路由

新建 `app/(analytics)/analytics/level/page.tsx`，挂在已有 `(analytics)` group 下，复用现有 `nav-menu.tsx`，菜单加 "能力水位" 入口。

### 7.2 组件清单

| 组件 | 职责 | 复用 chart 库 |
|---|---|---|
| `level-radar.tsx` | 6 维雷达图 + 中心显示综合段位徽章 | recharts (已装) |
| `level-progress.tsx` | 6 行进度条,每行显示 [维度名] [W/kg] [当前段位徽章] [——————▮————] [下一级阈值] [差 X W] | 纯 CSS |
| `upgrade-path-card.tsx` | 4 周训练块卡片,显示训练名/频率/详情/预期收益 | 纯 JSX |
| `eta-prediction-card.tsx` | ETA 数字 + 置信度标签 + 进度条样视觉 | 纯 JSX |
| `level-standard-table.tsx` | 完整 12×6 分级标准表,默认折叠展开后展示全部阈值 + 数据来源引用 + "如何评定"说明 | 纯 CSS |

### 7.3 段位徽章设计

```
┌────────────────────────────┐
│  小PRO 成长   L2/11        │  ← 圆角徽章,色阶 L0灰 → L11金
│  ▶ 距小PRO毕业 还差 0.4 W/kg│
└────────────────────────────┘
```

色阶：L0-L3 蓝 / L4-L6 绿 / L7-L9 紫 / L10-L11 金。

### 7.4 页面结构

```
/analytics/level
├─ 顶部: 综合段位大徽章 + 短板维度提示
├─ 中部: level-radar (左) + level-progress (右)
├─ 训练: upgrade-path-card
├─ 预测: eta-prediction-card + "去看 PMC 详情"链接
└─ 底部: level-standard-table (默认折叠, "查看完整分级标准 ▾" 触发)
```

### 7.5 数据加载

- SSR 加载初始数据（避免闪动）
- 客户端缓存 1h，跨页面共享 React context

### 7.6 分级标准透明度 (level-standard-table)

**底层逻辑**：用户能看到"为什么我是这个段位"才会信任系统。标准必须透明,不能黑盒。

#### 7.6.1 组件结构

```
┌─ 📊 完整分级标准 ▾ (默认折叠)
└─ 展开后:
    ├─ 简介段
    │   "本系统基于 Coggan 功率训练分级 + 中文骑友圈段位命名,
    │    采用木桶短板法评定综合段位 — 你的最弱维度决定整体等级"
    │
    ├─ 12×6 完整阈值表 (横轴段位 / 纵轴维度)
    │   高亮当前所在格 (你这次评定数据)
    │   每段位颜色与徽章一致 (L0-3 蓝 / L4-6 绿 / L7-9 紫 / L10-11 金)
    │
    ├─ 名词解释折叠组
    │   ├─ "什么是 W/kg" → "功率除体重,反映绝对耐力"
    │   ├─ "什么是 FTP" → "Functional Threshold Power, 60min 持续输出"
    │   ├─ "什么是 VO2max" → "最大摄氧量, 高强度天花板"
    │   └─ "木桶短板法为什么这样设计" → 训练学解释
    │
    └─ 数据来源引用
        ├─ Coggan & Allen《Training and Racing with a Power Meter》第 3 版
        ├─ 小红书 @骑行实验室 段位命名参考
        └─ "数据有疑问? 联系 admin 调整"
```

#### 7.6.2 进度条上的阈值标记

`level-progress.tsx` 的进度条额外标注**关键阈值线**（避免用户只在折叠表里能看到对照），鼠标 hover 显示该格阈值：

```
sprint5s | 11.5 W/kg [小PRO 毕业]
[L0──L1──L2──L3▮▮▮▮L4──L5──L6──L7──L8──L9──L10──L11]
                  ↑当前位
```

#### 7.6.3 内容来源

`level-standard-table` 的内容直接从 §3.1 段位命名表 + §3.2 阈值矩阵生成（同一份常量,落 `lib/engine/cycling-levels.ts` LEVEL_TABLE 和 LEVEL_NAMES）—— **单一数据源**,doc / engine / UI 永远一致,改一处全联动。

---

## 8. API 设计

### 8.1 新增端点

```
GET /api/analytics/level
  Auth: requireUser()
  Response 200:
    {
      evaluation: LevelEvaluation,
      upgradePlan: UpgradePlan,
      eta: EtaPrediction,
      generatedAt: ISO8601
    }
  Response 401: redirect /login
  Response 422: { error: '活动数据不足', minimumActivities: 5 }
```

### 8.2 实现

```typescript
// app/api/analytics/level/route.ts
export async function GET() {
  const user = await requireUser();
  const activities = await listActivitiesByUser(user.id);

  if (activities.length < 5) {
    return NextResponse.json({ error: '活动数据不足', minimumActivities: 5 }, { status: 422 });
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
}
```

### 8.3 缓存策略

- 不写 DB（评级是纯函数，活动数据已在 DB），每次请求实时算
- 前端 React Query / SWR 缓存 1h
- 后续如果性能问题再加 `LevelSnapshot` 表

---

## 9. AI Prompt 集成

### 9.1 buildAnalyticsContext 改造

`lib/engine/ai-analytics.ts` 在已有 context 上加：

```typescript
context.levelEvaluation = evaluateLevel({ activities, user });
context.upgradePlan = generateUpgradePlan(context.levelEvaluation);
context.eta = predictEta(context.levelEvaluation, pmcSeries);
```

### 9.2 system prompt 增量

在 `lib/ai.ts` 现有 system prompt 后追加：

```
重要 — 段位词汇必须用：
  • 引用任何 W/kg 或 VO2max 数字时,必须紧跟段位标签,格式:"FTP 3.29 W/kg (小PRO 成长 L3/11)"
  • 综合段位用 levelEvaluation.overall.label,不要自己重新评判
  • 短板维度用 levelEvaluation.overall.bottlenecks,叙述时优先提示这些维度
  • 训练建议直接引用 upgradePlan,不要另起炉灶
  • ETA 引用 eta.weeks 和 eta.confidence,不要自己估时间
  • 严禁自己重算 W/kg 或重新判段位 — engine 已经算好,AI 只负责叙述
```

### 9.3 防幻觉

- 用户问 "我能升到大PRO 吗"，AI 看的是 engine 算的 ETA 而非自己推算
- 用户提供伪造数据时（如手动改 FTP），engine 仍按 DB 数据评，AI 不替用户造数

---

## 10. 边界 / 错误处理

| 场景 | 处理 |
|---|---|
| 用户未填体重 | UI 顶部黄色横幅引导去 `/settings`，本页所有 W/kg 显示 "需要体重" |
| 活动 < 5 条 | 全页面替换为引导卡，提示 "先同步 Strava / Intervals.icu" |
| 90 天内无活动 | 同上 + 提示 "训练中断超过 90 天,数据已过期" |
| 5min/60min 最佳功率缺失 | 该维度 level=null, UI 显示 "—" + 灰色"未冲过此时长" |
| 某段位 + 训练规则未匹配（如 vo2max 短板） | 走 `aliasOf` 回退到最近匹配维度 |
| ETA 算出负数 / Infinity | UI 显示 "暂无法预测，按当前训练继续 4 周再看" |
| Recharts 雷达图渲染失败（极端低数据） | catch 兜底，降级为 level-progress 进度条视图 |

---

## 11. 测试策略

### 11.1 单元测试（新增 `tests/`）

项目当前无测试。本次借机引入 Vitest（轻量 + 与 Next.js 兼容）。

| 文件 | 覆盖点 |
|---|---|
| `tests/cycling-levels.test.ts` | 12 段位阈值边界（每段位 ± 0.01 W/kg） + 木桶最低算法 + null 维度跳过 |
| `tests/level-progression.test.ts` | 多短板时按优先级选择 + aliasOf 回退 + 训练课字段完整性 |
| `tests/level-eta.test.ts` | 线性外推正确性 + 各 confidence 等级触发条件 + CTL 下降兜底 |

### 11.2 集成测试

- `tests/api-analytics-level.test.ts`：mock prisma + assert 422 / 401 / 200 路径
- 手动 smoke test：跑 dev 服务，登录后访问 `/analytics/level`，观察 4 个组件渲染

### 11.3 验收标准

- [ ] 6 维度评级与人工对照表一致（边界值 ± 0.01）
- [ ] AI 报告引用段位词汇 ≥ 6 处（每维度 1 次）
- [ ] 木桶逻辑：单维度跌落能正确触发综合段位下调
- [ ] 缺失体重 / 数据 / 5min 等场景 UI 不崩
- [ ] ETA 在 CTL 下降时正确显示警告
- [ ] **分级标准透明度** (新增):
  - [ ] `level-standard-table` 折叠面板能展开完整 12×6 阈值表
  - [ ] 当前所在格在表中高亮 (颜色与徽章一致)
  - [ ] 名词解释 (W/kg / FTP / VO2max / 木桶法) 文案准确
  - [ ] 数据来源引用完整 (Coggan + 小红书)
  - [ ] 进度条上阈值线 hover 显示对应段位

---

## 12. 实施路线（3 sub-sprint）

### Sub-sprint A — engine 核心（2 day）

1. 新增 `lib/engine/cycling-levels.ts`（常量表 + evaluateLevel）
2. 新增 `lib/engine/level-progression.ts`（训练规则 + generateUpgradePlan）
3. 新增 `lib/engine/level-eta.ts`（PMC 外推）
4. 单元测试 ≥ 80% coverage
5. 验证：本地 Node REPL 喂真实数据验算

### Sub-sprint B — API + AI 集成（1.5 day）

1. 新增 `app/api/analytics/level/route.ts`
2. 改造 `lib/engine/ai-analytics.ts` 注入 levelEvaluation
3. 改造 `lib/ai.ts` system prompt 加段位规则
4. 集成测试 + curl 真实端点验证 AI 报告产物

### Sub-sprint C — UI（3 day, 因加 standard-table 从 2.5 上调）

1. 新建 5 个组件（radar / progress / upgrade-path / eta / **standard-table**）
2. 新建 `app/(analytics)/analytics/level/page.tsx` + 路由
3. nav-menu 加 "能力水位" 入口
4. 体重缺失 / 数据不足等引导 UI
5. **standard-table 折叠组件 + 进度条阈值线 hover 提示**
6. 单一数据源验证: doc § 3 阈值表 ↔ engine LEVEL_TABLE 常量 ↔ UI 渲染必须完全一致
5. 手动 smoke：3 类用户（无数据 / 部分数据 / 完整数据）

---

## 13. 风险与对齐项

| 风险 | 缓解 |
|---|---|
| **分级表阈值争议**（"我朋友 4 W/kg 都不算中PRO 毕业"） | 落常量表，admin 可后期改；附 Coggan 引用来源 |
| **VO2max 估算误差** | 注释说明"基于 FTP 推算的估值,非实测",UI 加问号 tooltip |
| **训练规则太通用** | 首版定位为"启发性",首屏注明"实际请结合恢复/伤病/赛季阶段" |
| **ETA 不准** | 显示置信度标签,低置信度时弱化数字 |
| **木桶法 frustrate 用户**（一个短板拖累整体） | UI 突出"距下一段位差 X W/kg"而不是反复强调 L0；强项另设"亮点"区 |

---

## 14. 未来演进（不在本次范围）

- 速度型评定（基于 Strava 段子分析 + 风/坡过滤）
- 车手类型分类（爬坡型 / 冲刺型 / 全能型 / 耐力型）
- 与车队 / 朋友横向对比（社交化）
- 分级历史曲线（一年内段位变化轨迹）
- Admin 后台编辑分级表（不入码）
- "一键导入骑前计划"按钮（已在 §5.3 提及，单独 sprint）

---

## 附录 A — 命名约定

- 段位英文 `L0-L11`；中文展示用 "小PRO 成长" 等
- 维度英文 key 见 §3.3 type Dimension
- 文件命名：`cycling-levels.ts` 用 kebab-case，与现有 engine 一致

## 附录 B — 数据来源引用

- Coggan & Allen, *Training and Racing with a Power Meter* 第 3 版
- 小红书 @骑行实验室 "你的骑行是什么水平？对号入座" 图（用户提供）
- 业余车队公开数据中位数（多家 Strava 公开账户聚合）
