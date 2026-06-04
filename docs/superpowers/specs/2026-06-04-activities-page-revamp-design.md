# 运动记录页大重构 — 设计文档

- **日期**：2026-06-04
- **范围**：bicycling repo, `/activities` 页面重构 + nav 集成 + 段位徽章接入
- **状态**：设计待 review
- **预计工时**：1-2 人日
- **作者**：Claude (P8 协同)

---

## 1. 背景与目标

### 1.1 痛点

1. `/activities` 是早期独立路由 (app/activities/page.tsx, 711 行), 使用根 layout, **没有左侧 analytics nav 菜单**, 体感"跳出 analytics 主框架"。
2. `/analytics/activities` 只是一个 5 行的 redirect, nav 菜单点击"运动记录" → 跳走 → nav 消失。
3. 页面 UI 风格 (自定义 `.activities-hero` / `.activities-kpi-card` 类) 与 `/analytics/*` 标准风格 (`.analytics-card` / `.analytics-stat-card`) **完全脱节**, 看起来像两个产品。
4. 内容堆叠太密 — 包含 6+ 个数据模块, 每个都跟其他 analytics 页面 (PMC/功率曲线/功率形态) 有冗余。
5. 活动列表里看不到当前活动的"段位水位" (上一次重构刚做的能力分级数据没用上)。

### 1.2 目标

1. **路径迁移 + nav 接入**: `/activities` URL 保持不变, 但移到 `(analytics)` route group 自动获得左侧 nav 菜单。
2. **UI 风格统一**: 全套 `.analytics-card` / `.analytics-stat-card` / `.analytics-page-header`, 与 PMC/Level 页面无视觉断点。
3. **砍冗余**: 删除与其他 analytics 页面重复的图表 (类型分布 / 功率区间分布 / 日历热图), 让活动列表回归核心。
4. **接入段位徽章**: 每条活动右侧显示该次活动 TSS/IF 落在哪个段位的"强度段位徽章" (复用 `lib/engine/cycling-levels.ts` 体系)。
5. **IA 重新设计**: 顶层 → 趋势 → 列表三段式, 信息密度可呼吸。

### 1.3 范围 / 非范围

- ✅ 重写 page.tsx + 拆出 5-6 个组件
- ✅ 路径从 `app/activities/` 迁到 `app/(analytics)/activities/`
- ✅ 删除 `app/(analytics)/analytics/activities/page.tsx` (5 行 redirect)
- ✅ nav-menu `运动记录` 链接改为 `/activities`
- ✅ 更新所有跨页引用 (`app/layout.tsx`, 活动详情页) — URL 不变实际无需改
- ❌ 不动 `/activities/[id]` 活动详情页 (那是另一个 sprint)
- ❌ 不动 `app/api/activities/[id]/*` API 接口
- ❌ 不引入新的 API endpoint

---

## 2. 模块取舍

```
┌────────────────────────────────────────────────────────────────────────┐
│ 现状 711 行包含                              │ 取舍                     │
├──────────────────────────────────────────────┼─────────────────────────┤
│ ① 顶部 7d/30d 综合统计 + 周/月环比           │ ✅ 保留 (重做 UI 用 stat-card) │
│ ② 日历热力图 (近 16 周)                      │ ❌ 砍 (跟 PMC TSS 序列冗余) │
│ ③ 周 TSS 趋势图 (近 26 周)                   │ ✅ 保留 (但简化样式)     │
│ ④ 活动类型分布饼图                           │ ❌ 砍 (跟功率形态页重复)  │
│ ⑤ 功率区间分布 Z1-Z7                         │ ❌ 砍 (跟功率形态页重复)  │
│ ⑥ 活动列表 (筛选 7 维 + 排序 5 维 + 分页)    │ ✅ 保留 + 加段位徽章     │
│ + 当前状态卡 (TSB/CTL/ATL)                   │ ✅ 保留 (核心引导)       │
│ + 同步状态卡                                 │ ✅ 保留 (简化为单 stat)  │
│ + 周期对比 (本月 vs 上月)                    │ ✅ 收编进 ① 顶部统计     │
│ + 重点活动 (highlightActivities)             │ ✅ 保留 (顶部突出)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 信息架构 (三段式)

```
┌──── Top: 当前状态总览 ──────────────────────────────────────────────┐
│   .analytics-page-header                                            │
│   ┌─ 当前训练状态卡 (CTL/ATL/TSB + 状态标签 + 链接 PMC 详情)        │
│   ├─ 同步状态 stat-card                                              │
│   ├─ 重点活动 alert (≤ 4 条需要处理的)                              │
│   └─ KPI 行: 4 个 stat-card (7d 活动数 / 时长 / TSS / 距离)         │
│       含周环比 + 链接到对应 filter 的列表                            │
└─────────────────────────────────────────────────────────────────────┘
┌──── Middle: 周期趋势 ───────────────────────────────────────────────┐
│   .analytics-card 周 TSS 趋势图 (recharts BarChart, 26 周)          │
│   .analytics-card 周期对比 (本周 vs 上周 + 本月 vs 上月 stat row)   │
└─────────────────────────────────────────────────────────────────────┘
┌──── Bottom: 活动列表 ───────────────────────────────────────────────┐
│   .analytics-card 筛选 toolbar (q / time / rideType / ai / fuel / load / sort) │
│   .analytics-card 列表 (每条活动: 名称 / 时间 / 距离 / TSS / IF /  │
│                          段位徽章 / AI 报告标记 / 补给标记 / →)     │
│   分页                                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 段位徽章设计

### 4.1 维度: 单次活动强度段位

复用 `lib/engine/cycling-levels.ts` 的段位体系, 但作用于**单次活动**而非用户综合段位。

新增 engine 函数 `evaluateActivityIntensity(activity, user)` → 输出 `ActivityIntensityBadge`:

```typescript
export type ActivityIntensityBadge = {
  // 基于本次活动的 NP / 时长档位的最佳功率, 评定该次 ride 在 6 维度里最强的那一档
  primaryDimension: Dimension;       // 哪个维度命中段位最高
  level: number;                     // 0-11
  label: string;                     // "中PRO 入门"
  colorBucket: "gray" | "blue" | ... ;
  detail: string;                    // "20min NP 290W = 3.81 W/kg → L4"
};
```

**算法**:
1. 取活动的 IF (intensity factor) 和 TSS 推断主要强度类型 (sprint / vo2 / threshold / endurance)
2. 用对应维度的 `evaluateDimension(dim, wkg, weight)` 评级
3. 返回最高级别那一维度作为本次活动的"代表段位"

**Fallback**: 无 W/kg 数据 (无 power / 无 weight) → 用 IF 估个粗略类别:
- IF ≥ 0.85 → "高强度骑" (橘色)
- IF ≥ 0.70 → "节奏骑" (蓝色)
- IF < 0.70 → "耐力骑" (灰色)

### 4.2 UI 呈现

```
┌────────────────────────────────────────────────────────────────────┐
│ 周末长爬山                                            ┌────────┐  │
│ 2026-06-01 08:32 · 4h12min · 92.3km · 1850m          │ L5 中PRO│  │
│ TSS 218 · IF 0.71 · NP 245W · 平均心率 145           │ 成长   │  │
│                                                       └────────┘  │
│ 🤖 AI 报告 ✓  🍫 补给已记 ✓                              [→]      │
└────────────────────────────────────────────────────────────────────┘
```

颜色复用 `LEVEL_BG` 5 色阶。

---

## 5. 文件结构

| 路径 | 责任 | 状态 |
|---|---|---|
| `app/(analytics)/activities/page.tsx` | 主页面 (server component, ~250 行) | **新建** (从老页面迁移精简) |
| `app/activities/page.tsx` | 旧实现 | **删除** |
| `app/activities/[id]/page.tsx` | 活动详情 | 不动 |
| `app/(analytics)/analytics/activities/page.tsx` | 5 行 redirect | **删除** |
| `components/analytics/nav-menu.tsx` | nav 列表 | 改一行: href 从 `/analytics/activities` → `/activities` |
| `components/analytics/activities-state-card.tsx` | 当前训练状态 (TSB/CTL/ATL + 状态文案) | **新建** |
| `components/analytics/activities-kpi-row.tsx` | 4 个 7d 统计 stat-card 行 | **新建** |
| `components/analytics/activities-weekly-trend.tsx` | 周 TSS 趋势 BarChart | **新建** (从 training-history-charts.tsx 拆出来) |
| `components/analytics/activities-period-compare.tsx` | 周/月对比 stat row | **新建** |
| `components/analytics/activities-toolbar.tsx` | 筛选/搜索/排序工具栏 | **新建** |
| `components/analytics/activities-list.tsx` | 活动列表 (含段位徽章) | **新建** |
| `components/analytics/training-history-charts.tsx` | 旧 chart 组件 | **删除** (内容已分配) |
| `lib/engine/cycling-levels.ts` | 加 `evaluateActivityIntensity` | **新增函数** |
| `tests/cycling-levels.test.ts` | 加 4 个测试 | **追加** |

`app/layout.tsx`:36 的 `<Link href="/activities">` — URL 不变, 无需改。

---

## 6. 风格指南 (与 /analytics/level 对齐)

### 6.1 页面骨架

```tsx
export default async function ActivitiesPage({ searchParams }) {
  // ... data loading

  return (
    <main className="analytics-page" style={{ display: "grid", gap: 20 }}>
      <header className="analytics-page-header">
        <h1>🚴 训练历史</h1>
        <p>{summary}</p>
      </header>

      <ActivitiesStateCard pmc={latestPmc} state={todayState} />
      <ActivitiesKpiRow stats={stats7} compare={weekCompare} currentQuery={...} />
      <ActivitiesWeeklyTrend data={weeklyTrend} />
      <ActivitiesPeriodCompare ... />
      <ActivitiesToolbar currentQuery={currentQuery} />
      <ActivitiesList items={pagedItems} badges={badges} />
      <Pagination ... />
    </main>
  );
}
```

### 6.2 卡片样式

- 每个卡片包 `.analytics-card`
- 卡内头部 `.analytics-card-header` 含 h2 + 右侧副标题
- 统计单元 `.analytics-stat-card` 含 `.eyebrow` + `.stat-value` + `.stat-change`
- 列表项不用纯 hover 表格 — 用卡片堆叠式 (列表内每条 ride 是 mini-card)

### 6.3 段位徽章 token

```tsx
<span style={{
  padding: "4px 10px",
  borderRadius: 8,
  background: LEVEL_BG[badge.colorBucket],
  color: "white",
  fontSize: "0.78rem",
  fontWeight: 600,
}}>
  L{badge.level} {badge.label}
</span>
```

---

## 7. 数据流

```
SearchParams → ActivitiesPage
                 │
                 ↓
           loadAnalyticsData(user)         (现有)
                 │
                 ├─→ activities[]
                 │       ↓
                 │   batch evaluateActivityIntensity()  (新)
                 │       ↓
                 │   badges: Map<activityId, badge>
                 │
                 ├─→ filter + sort + paginate
                 │
                 ├─→ calculatePmc()                     (现有)
                 ├─→ listFuelLogsByActivityIds()        (现有)
                 ├─→ listAiReportsByActivityIds()       (现有)
                 │
                 └─→ 计算 stats7/14/30 + 趋势 + highlight
```

---

## 8. 路径迁移机制

Next.js 15 route group `(name)` 不算 URL 段, 因此 `app/(analytics)/activities/page.tsx` 的 URL 仍然是 `/activities`。同时该 page 自动继承 `app/(analytics)/layout.tsx` 的左侧 nav。

**迁移步骤**:
1. 新建 `app/(analytics)/activities/` 目录
2. 新建 `app/(analytics)/activities/page.tsx` (重写版本)
3. 删除 `app/activities/page.tsx` (旧版)
4. 删除 `app/(analytics)/analytics/activities/page.tsx` (旧 redirect)
5. nav-menu 改 href
6. 验证 build 编译, /activities 访问能看到 nav 菜单

**Next.js 路由冲突**: 如果 `app/activities/page.tsx` 和 `app/(analytics)/activities/page.tsx` 同时存在 → build error "duplicate routes"。**必须严格按顺序**: 先 git mv (rename), 不能新建后删旧的。

---

## 9. 边界 / 错误处理

| 场景 | 处理 |
|---|---|
| 用户未填体重 | 段位徽章降级用 IF-only fallback ("高强度骑"/"节奏骑"/"耐力骑") |
| 活动无 power 数据 | 同上 fallback |
| 活动列表为空 | 大卡片引导去同步 (复用 .analytics-empty) |
| Pagination 超出范围 | 重定向到 page=1 |
| recharts BarChart 渲染失败 | catch 兜底降级为表格 |

---

## 10. 测试策略

- **engine**: `evaluateActivityIntensity` 单测 4 个 (有 power / 无 power / 边界值 / 无 weight)
- **手动 smoke**: 路径迁移后 `/activities` 渲染 + nav 显示 + 链接跳转
- **build**: `npm run build` 编译成功, 无路由冲突

---

## 11. 实施路线 (2 sub-sprint)

### Sub-sprint A — engine + 路径迁移 (4-6h)

1. 新增 `lib/engine/cycling-levels.ts` 的 `evaluateActivityIntensity()`
2. 单测覆盖 4 case
3. git mv `app/activities/page.tsx` → `app/(analytics)/activities/page.tsx` (临时, 暂不重写)
4. 删除 `app/(analytics)/analytics/activities/page.tsx` redirect
5. 改 `nav-menu.tsx` href
6. build 验证无冲突 + 访问 /activities 应有 nav 菜单
7. **Sub-sprint A 完成时, /activities 仍是老 UI 但有 nav 了**

### Sub-sprint B — 重写 UI (1 day)

8. 创建 6 个新组件 (state-card / kpi-row / weekly-trend / period-compare / toolbar / list)
9. 重写 page.tsx 用新组件 + 砍 ②④⑤ 模块
10. 删除 `components/analytics/training-history-charts.tsx`
11. 段位徽章接入 list 每条活动
12. 全 build + smoke

---

## 12. 风险与对齐项

| 风险 | 缓解 |
|---|---|
| 路径迁移导致 build 冲突 | 严格 git mv (rename), 一次操作 |
| 旧 .activities-hero 等 CSS 类失去使用方但仍在 globals.css | 第二阶段统一清理 (Sub-sprint B 末) |
| evaluateActivityIntensity 算法对单次活动判定不准 | 算法明确文档"基于本次最佳 NP 在 6 维度的最高级别", 接受单维度可能高估; 提供 IF-fallback 兜底 |
| 用户期望保留 ②④⑤ 但实际看到没了 | spec 明确砍掉, 用户 review 时可改 |
| 段位徽章把列表行变得太挤 | 设计稿留好 badge 区域宽度, 用 8rem 固定列宽 |

---

## 13. 未来演进 (不在本次范围)

- 活动详情页 (`/activities/[id]`) 也接入 analytics layout + 段位徽章 + 段位变化曲线
- "本周训练日历" 简化版回归 (3 行高的 mini-heatmap)
- 列表行点击展开 inline 详情 (替代点击跳页)
- 列表项滑动添加/删除筛选标签

---

## 附录 A — 命名约定

- 段位徽章统一叫 "intensity badge", 函数 `evaluateActivityIntensity`
- 6 个新组件全部以 `activities-` 前缀, 与 `level-*` / `pmc-*` 风格对齐
- 文件 kebab-case, 组件 PascalCase
