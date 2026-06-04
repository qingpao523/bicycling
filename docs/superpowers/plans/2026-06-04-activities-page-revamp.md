# 运动记录页大重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/activities` 从独立路由迁到 `(analytics)` route group (URL 不变, 自动获得左侧 nav), 全 UI 用 `.analytics-card` 体系重做, 全部 6 模块保留并优化, 每条活动挂段位徽章。

**Architecture:**
- **Sub-sprint A (engine + 迁移)**: 加 `evaluateActivityIntensity()` engine 函数 + git mv 路径 + 改 nav 链接 + 删 redirect, 完成时 /activities 仍是老 UI 但 nav 到位
- **Sub-sprint B (UI 重写)**: 拆 10 个 server/client 组件 + 重写 page.tsx 为 4 段式 IA + 删旧 chart 组件 + 段位徽章接入

**Tech Stack:**
Next.js 15 (App Router, route group) · TypeScript strict · React 19 · recharts (已装) · lucide-react · Vitest (已装)

**Spec:** `docs/superpowers/specs/2026-06-04-activities-page-revamp-design.md`

---

## 文件结构

| 路径 | 责任 | 状态 |
|---|---|---|
| `lib/engine/cycling-levels.ts` | 追加 `evaluateActivityIntensity()` + 类型 | **改 (追加)** |
| `tests/cycling-levels.test.ts` | 加 4 个 evaluateActivityIntensity 测试 | **改 (追加)** |
| `app/activities/page.tsx` | 旧 711 行实现 | **删除** |
| `app/(analytics)/analytics/activities/page.tsx` | 5 行 redirect | **删除** |
| `app/(analytics)/activities/page.tsx` | 主页面 server component, ~150 行 | **新建** |
| `components/analytics/nav-menu.tsx` | nav 列表 | 改一行 href |
| `components/analytics/training-history-charts.tsx` | 旧 chart 组件 | **删除** |
| `components/analytics/activities-state-card.tsx` | 当前训练状态卡 | **新建** |
| `components/analytics/activities-highlight-alert.tsx` | 重点活动 alert | **新建** |
| `components/analytics/activities-kpi-row.tsx` | 4 个 7d stat-card 行 | **新建** |
| `components/analytics/activities-calendar-heatmap.tsx` | 16 周日历热图 (6 阶) | **新建** |
| `components/analytics/activities-weekly-trend.tsx` | 周 TSS 趋势 BarChart | **新建** |
| `components/analytics/activities-period-compare.tsx` | 周/月对比 stat row | **新建** |
| `components/analytics/activities-type-distribution.tsx` | 类型水平 stacked bar | **新建** |
| `components/analytics/activities-power-zones.tsx` | Z1-Z7 horizontal bar | **新建** |
| `components/analytics/activities-toolbar.tsx` | 筛选/搜索/排序 form | **新建** |
| `components/analytics/activities-list.tsx` | 活动列表 (含段位徽章 + 分页) | **新建** |

---

## Sub-sprint A — Engine + 路径迁移

### Task 1: evaluateActivityIntensity engine 函数

**Files:**
- Modify: `lib/engine/cycling-levels.ts` (append)
- Modify: `tests/cycling-levels.test.ts` (append)

- [ ] **Step 1: 追加 failing tests 到 `/Users/qingpao/bicycling/tests/cycling-levels.test.ts`**

```typescript
import { evaluateActivityIntensity } from "@/lib/engine/cycling-levels";
import type { Activity } from "@/lib/types";

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
```

- [ ] **Step 2: 跑 test 验证 fail**

```bash
cd ~/bicycling && npm test -- tests/cycling-levels.test.ts -t "evaluateActivityIntensity"
```

Expected: 5 tests fail with `evaluateActivityIntensity is not a function`

- [ ] **Step 3: 追加 `/Users/qingpao/bicycling/lib/engine/cycling-levels.ts` 末尾**

```typescript

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

import type { Activity } from "@/lib/types";

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
```

- [ ] **Step 4: 跑 test 验证 pass**

```bash
cd ~/bicycling && npm test
```

Expected: 全部 31 个测试通过 (26 旧 + 5 新)。

- [ ] **Step 5: tsc**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "TSC=$?"
```

Expected: TSC=0

- [ ] **Step 6: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add lib/engine/cycling-levels.ts tests/cycling-levels.test.ts && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(engine): evaluateActivityIntensity 单次活动段位徽章"
```

---

### Task 2: 路径迁移 (git mv + 删 redirect + nav 改)

**Files:**
- Move: `app/activities/page.tsx` → `app/(analytics)/activities/page.tsx`
- Delete: `app/(analytics)/analytics/activities/page.tsx`
- Modify: `components/analytics/nav-menu.tsx:34`

- [ ] **Step 1: 创建 (analytics)/activities 目录并 git mv 主页面**

```bash
cd ~/bicycling && mkdir -p "app/(analytics)/activities" && git mv app/activities/page.tsx "app/(analytics)/activities/page.tsx"
```

- [ ] **Step 2: 检查 app/activities 是否还有其他文件**

```bash
cd ~/bicycling && ls -la app/activities/ 2>/dev/null
```

Expected: 只剩 `[id]/` 子目录 (活动详情页, 不动)。

- [ ] **Step 3: 删除 (analytics)/analytics/activities/ redirect**

```bash
cd ~/bicycling && git rm "app/(analytics)/analytics/activities/page.tsx" && rmdir "app/(analytics)/analytics/activities" 2>/dev/null || true
```

- [ ] **Step 4: 改 nav-menu href**

读 `/Users/qingpao/bicycling/components/analytics/nav-menu.tsx` 找到这行 (大约 line 34):

```typescript
  { href: "/analytics/activities", label: "运动记录", icon: Gauge },
```

用 Edit 工具改为:

```typescript
  { href: "/activities", label: "运动记录", icon: Gauge },
```

- [ ] **Step 5: tsc 验证无路由冲突**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "TSC=$?"
```

Expected: TSC=0

- [ ] **Step 6: build 验证路由正确**

```bash
cd ~/bicycling && DATABASE_URL="file:./data/app.db" npm run build 2>&1 | grep -E "/activities|error" | head -10
```

Expected:
- `✓ Compiled successfully`
- `/activities` 出现在 routes 列表
- `/analytics/activities` 不再出现

- [ ] **Step 7: dev smoke 验证 nav 到位**

```bash
cd ~/bicycling && pkill -f "next dev" 2>/dev/null; sleep 1
nohup npm run dev > /tmp/bicycling-task2.log 2>&1 &
sleep 12
curl -s -o /dev/null -w "HTTP=%{http_code} location=" http://localhost:3000/activities
curl -s -I http://localhost:3000/activities 2>/dev/null | grep -i location
pkill -f "next dev" 2>/dev/null
```

Expected: 307 → /login (因为未登录, 但说明路由编译正常, 进了 (analytics) layout 走 requireUser redirect)

- [ ] **Step 8: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/nav-menu.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "$(printf '%s\n%s' 'refactor(activities): /activities 迁入 (analytics) route group' '路径不变, 获得左侧 nav. 删 /analytics/activities redirect.')"
```

---

## Sub-sprint B — UI 重写 (10 组件 + page)

### Task 3: components/analytics/activities-state-card.tsx — 当前训练状态卡

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-state-card.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-state-card.tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { PmcDataPoint } from "@/lib/engine/pmc";

type Tone = "ok" | "warn" | "idle";

export type TodayState = {
  label: string;
  tone: Tone;
  summary: string;
};

type Props = {
  pmc: PmcDataPoint | null;
  state: TodayState;
};

const TONE_COLOR: Record<Tone, string> = {
  ok: "#10b981",
  warn: "#f59e0b",
  idle: "#94a3b8",
};

function round(value: number, digits = 1) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function ActivitiesStateCard({ pmc, state }: Props) {
  const color = TONE_COLOR[state.tone];

  return (
    <div className="analytics-card" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="analytics-card-header">
        <h2>当前训练状态</h2>
        <span
          style={{
            fontSize: "0.75rem",
            padding: "2px 10px",
            borderRadius: 6,
            background: color,
            color: "white",
            fontWeight: 600,
          }}
        >
          {state.label}
        </span>
      </div>

      <p style={{ color: "var(--muted)", margin: "0 0 12px" }}>{state.summary}</p>

      {pmc && (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div className="eyebrow">CTL 体能</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1f57d6" }}>{round(pmc.ctl)}</div>
          </div>
          <div>
            <div className="eyebrow">ATL 疲劳</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#c44d3b" }}>{round(pmc.atl)}</div>
          </div>
          <div>
            <div className="eyebrow">TSB 状态</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: pmc.tsb >= 0 ? "#0f8a62" : "#c44d3b" }}>
              {round(pmc.tsb)}
            </div>
          </div>
        </div>
      )}

      <Link href="/analytics/pmc" className="button">
        查看完整 PMC <ChevronRight size={14} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-state-card.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-state-card 当前训练状态卡"
```

---

### Task 4: components/analytics/activities-highlight-alert.tsx — 重点活动 alert

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-highlight-alert.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-highlight-alert.tsx
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export type HighlightItem = {
  id: string;
  name: string;
  startTime: string;     // ISO
  movingTimeMin: number;
  distanceKm: number;
  tss?: number;
  ifValue?: number;
  loadLevel: "high" | "medium" | "low";
  aiReady: boolean;
  fuelLogged: boolean;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const m = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${m(d.getMonth() + 1)}-${m(d.getDate())} ${m(d.getHours())}:${m(d.getMinutes())}`;
}

type Props = { items: HighlightItem[] };

export function ActivitiesHighlightAlert({ items }: Props) {
  if (!items.length) return null;

  return (
    <div className="analytics-card" style={{ borderLeft: "4px solid #f59e0b" }}>
      <div className="analytics-card-header">
        <h2>
          <AlertCircle size={18} style={{ verticalAlign: "middle", marginRight: 6, color: "#f59e0b" }} />
          重点活动
        </h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>近期最值得复盘 ({items.length})</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/activities/${item.id}`}
            style={{
              display: "block",
              padding: 14,
              background: "var(--surface-alt, #f8fafc)",
              borderRadius: 10,
              textDecoration: "none",
              color: "var(--text)",
              transition: "transform 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <strong style={{ fontSize: "0.92rem" }}>{item.name}</strong>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: item.loadLevel === "high" ? "#fef3c7" : "#dbeafe",
                  color: item.loadLevel === "high" ? "#92400e" : "#1e40af",
                  fontWeight: 600,
                }}
              >
                {item.loadLevel === "high" ? "高负荷" : !item.aiReady ? "待 AI" : "待补给"}
              </span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 4 }}>
              {formatDateTime(item.startTime)}
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: "0.78rem", color: "var(--muted)", flexWrap: "wrap" }}>
              <span>{item.distanceKm}km</span>
              <span>TSS {item.tss ?? "—"}</span>
              <span>{item.ifValue ? `IF ${item.ifValue}` : "IF —"}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-highlight-alert.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-highlight-alert 重点活动卡"
```

---

### Task 5: components/analytics/activities-kpi-row.tsx — 4 个 7d stat-card

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-kpi-row.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-kpi-row.tsx
import Link from "next/link";
import { Activity, CalendarClock, Gauge, Mountain, TrendingUp, TrendingDown, Minus } from "lucide-react";

export type KpiStats = {
  count: number;
  tss: number;
  durationMin: number;
  distanceKm: number;
  elevationM: number;
};

export type KpiCompare = {
  count: { diff: number; pct: number; direction: "up" | "down" | "flat" };
  tss: { diff: number; pct: number; direction: "up" | "down" | "flat" };
  duration: { diff: number; pct: number; direction: "up" | "down" | "flat" };
  distance: { diff: number; pct: number; direction: "up" | "down" | "flat" };
};

type Props = {
  stats: KpiStats;
  compare: KpiCompare;
  prevStats: KpiStats;
};

function round(v: number, d = 0) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function TrendArrow({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <TrendingUp size={12} style={{ color: "var(--ok, #10b981)" }} />;
  if (direction === "down") return <TrendingDown size={12} style={{ color: "var(--danger, #ef4444)" }} />;
  return <Minus size={12} style={{ color: "var(--muted)" }} />;
}

type Card = {
  href: string;
  icon: typeof Activity;
  eyebrow: string;
  value: string;
  changeText: string;
  direction: "up" | "down" | "flat";
};

export function ActivitiesKpiRow({ stats, compare, prevStats }: Props) {
  const cards: Card[] = [
    {
      href: "/activities?time=7d",
      icon: Activity,
      eyebrow: "近 7 天活动",
      value: `${stats.count}`,
      changeText: `vs 上周 ${compare.count.diff >= 0 ? "+" : ""}${compare.count.diff} (${compare.count.pct >= 0 ? "+" : ""}${round(compare.count.pct)}%)`,
      direction: compare.count.direction,
    },
    {
      href: "/activities?time=7d&sort=duration",
      icon: CalendarClock,
      eyebrow: "近 7 天训练时长",
      value: `${round(stats.durationMin / 60, 1)} h`,
      changeText: `vs 上周 ${round((stats.durationMin - prevStats.durationMin) / 60, 1)} h`,
      direction: compare.duration.direction,
    },
    {
      href: "/activities?time=7d&load=high",
      icon: Gauge,
      eyebrow: "近 7 天总 TSS",
      value: `${stats.tss}`,
      changeText: `vs 上周 ${compare.tss.diff >= 0 ? "+" : ""}${compare.tss.diff} (${compare.tss.pct >= 0 ? "+" : ""}${round(compare.tss.pct)}%)`,
      direction: compare.tss.direction,
    },
    {
      href: "/activities?time=7d&sort=distance",
      icon: Mountain,
      eyebrow: "近 7 天总距离",
      value: `${stats.distanceKm} km`,
      changeText: `${stats.elevationM} m 爬升`,
      direction: compare.distance.direction,
    },
  ];

  return (
    <div className="analytics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
      {cards.map((c) => (
        <Link
          key={c.eyebrow}
          href={c.href}
          className="analytics-stat-card"
          style={{
            display: "block",
            padding: 16,
            background: "var(--surface, #fff)",
            border: "1px solid var(--line, #e5e7eb)",
            borderRadius: 12,
            textDecoration: "none",
            color: "var(--text)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "var(--muted)" }}>
            <span className="eyebrow" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {c.eyebrow}
            </span>
            <c.icon size={16} />
          </div>
          <div className="stat-value" style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 6 }}>
            {c.value}
          </div>
          <div className="stat-change" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.78rem", color: "var(--muted)" }}>
            <TrendArrow direction={c.direction} />
            <span>{c.changeText}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-kpi-row.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-kpi-row 4 个 7d stat-card 行"
```

---

### Task 6: components/analytics/activities-calendar-heatmap.tsx — 16 周热图

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-calendar-heatmap.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-calendar-heatmap.tsx
"use client";

export type CalendarDay = {
  date: string;          // YYYY-MM-DD ("" 表示占位空格)
  tss: number;
  dayOfWeek: number;     // 0 = Sunday
};

type Props = { data: CalendarDay[] };

// 6 阶色阶 (空 + 5 阶), 与段位徽章色系呼应
const COLORS = ["rgba(0,0,0,0.05)", "#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a8a"];

function bucket(tss: number, max: number): number {
  if (tss === 0) return 0;
  const r = Math.min(tss / max, 1);
  if (r < 0.2) return 1;
  if (r < 0.4) return 2;
  if (r < 0.6) return 3;
  if (r < 0.85) return 4;
  return 5;
}

export function ActivitiesCalendarHeatmap({ data }: Props) {
  if (!data.length) return null;

  const maxTss = Math.max(100, ...data.map((d) => d.tss));

  // 按周分组 (周日为起点)
  const weeks: CalendarDay[][] = [];
  let current: CalendarDay[] = [];
  for (let i = 0; i < data[0].dayOfWeek; i++) {
    current.push({ date: "", tss: 0, dayOfWeek: i });
  }
  for (const d of data) {
    current.push(d);
    if (d.dayOfWeek === 6) {
      weeks.push(current);
      current = [];
    }
  }
  if (current.length) weeks.push(current);

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>训练日历</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>近 16 周 · 颜色深浅 = TSS 负荷</span>
      </div>

      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ display: "flex", gap: 3, minWidth: weeks.length * 18 + 30 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "0.65rem", color: "var(--muted)", paddingRight: 6 }}>
            {["日", "一", "二", "三", "四", "五", "六"].map((label, i) => (
              <div key={i} style={{ width: 16, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {label}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                const day = week.find((d) => d.dayOfWeek === dow);
                if (!day || !day.date) return <div key={dow} style={{ width: 15, height: 15 }} />;
                const b = bucket(day.tss, maxTss);
                return (
                  <div
                    key={dow}
                    title={`${day.date} · TSS ${day.tss}`}
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 3,
                      background: COLORS[b],
                      border: "1px solid rgba(0,0,0,0.03)",
                      cursor: "pointer",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: "0.78rem", color: "var(--muted)" }}>
        <span>少</span>
        {COLORS.map((c, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: "1px solid rgba(0,0,0,0.05)" }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-calendar-heatmap.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-calendar-heatmap 16 周日历热图 (6 阶)"
```

---

### Task 7: components/analytics/activities-weekly-trend.tsx — 周 TSS 趋势 BarChart

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-weekly-trend.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-weekly-trend.tsx
"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export type WeeklyPoint = {
  week: string;          // "MM-DD"
  tss: number;
  duration: number;      // hours
  distance: number;      // km
  count: number;
};

type Props = { data: WeeklyPoint[] };

const METRIC_LABELS = { tss: "TSS", duration: "时长 (h)", distance: "距离 (km)" } as const;
type MetricKey = keyof typeof METRIC_LABELS;

export function ActivitiesWeeklyTrend({ data }: Props) {
  const [metric, setMetric] = useState<MetricKey>("tss");

  if (!data.length) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>周训练量趋势</h2>
        </div>
        <p style={{ color: "var(--muted)" }}>暂无数据</p>
      </div>
    );
  }

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>周训练量趋势</h2>
        <div style={{ display: "flex", gap: 4 }}>
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              style={{
                border: "1px solid var(--line, #e5e7eb)",
                background: metric === key ? "var(--accent, #1f57d6)" : "transparent",
                color: metric === key ? "white" : "var(--muted)",
                fontSize: "0.78rem",
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {METRIC_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#888" }} />
            <YAxis tick={{ fontSize: 11, fill: "#888" }} />
            <Tooltip
              contentStyle={{ borderRadius: 10, fontSize: "0.82rem" }}
              formatter={(v) => [
                metric === "duration" ? `${v} h` : metric === "distance" ? `${v} km` : v,
                METRIC_LABELS[metric],
              ]}
            />
            <Bar dataKey={metric} fill="#1f57d6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-weekly-trend.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-weekly-trend 26 周 TSS 趋势 BarChart"
```

---

### Task 8: components/analytics/activities-period-compare.tsx — 周/月对比

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-period-compare.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-period-compare.tsx
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Cmp = { diff: number; pct: number; direction: "up" | "down" | "flat" };

export type CompareRow = {
  label: string;
  current: number | string;
  previous: number | string;
  cmp: Cmp;
  unit: string;
};

type Props = { rows: CompareRow[] };

function round(v: number, d = 0) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function Arrow({ direction }: { direction: Cmp["direction"] }) {
  if (direction === "up") return <TrendingUp size={12} style={{ color: "#10b981" }} />;
  if (direction === "down") return <TrendingDown size={12} style={{ color: "#ef4444" }} />;
  return <Minus size={12} style={{ color: "var(--muted)" }} />;
}

export function ActivitiesPeriodCompare({ rows }: Props) {
  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>周期对比</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>本月 vs 上月</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        {rows.map((r) => {
          const color =
            r.cmp.direction === "up" ? "#10b981" : r.cmp.direction === "down" ? "#ef4444" : "var(--muted)";
          return (
            <div key={r.label} style={{ padding: 16, background: "var(--surface-alt, #f8fafc)", borderRadius: 12 }}>
              <div className="eyebrow" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {r.label}
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, margin: "6px 0" }}>
                {r.current}
                {r.unit}
              </div>
              <div style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4, color }}>
                <Arrow direction={r.cmp.direction} />
                <span>
                  {r.cmp.pct >= 0 ? "+" : ""}
                  {round(r.cmp.pct)}% · 上月 {r.previous}
                  {r.unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-period-compare.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-period-compare 周/月对比"
```

---

### Task 9: components/analytics/activities-type-distribution.tsx — 类型水平 stacked bar

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-type-distribution.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-type-distribution.tsx
export type TypeDistItem = {
  name: string;
  value: number;
  color: string;
};

type Props = { data: TypeDistItem[] };

export function ActivitiesTypeDistribution({ data }: Props) {
  if (!data.length) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>训练类型分布</h2>
        </div>
        <p style={{ color: "var(--muted)" }}>近 30 天暂无活动</p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>训练类型分布</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>近 30 天 · 共 {total} 次</span>
      </div>

      {/* 水平 stacked bar */}
      <div
        style={{
          display: "flex",
          height: 36,
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 14,
          border: "1px solid var(--line, #e5e7eb)",
        }}
      >
        {data.map((d) => {
          const pct = (d.value / total) * 100;
          return (
            <div
              key={d.name}
              title={`${d.name} · ${d.value} 次 (${pct.toFixed(0)}%)`}
              style={{
                width: `${pct}%`,
                background: d.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "0.72rem",
                fontWeight: 600,
              }}
            >
              {pct >= 10 ? `${pct.toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>

      {/* 图例 + 数字 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, fontSize: "0.82rem" }}>
        {data.map((d) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
            <span>{d.name}</span>
            <span style={{ color: "var(--muted)", marginLeft: "auto" }}>{d.value} 次</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-type-distribution.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-type-distribution 类型水平 stacked bar"
```

---

### Task 10: components/analytics/activities-power-zones.tsx — Z1-Z7 区间分布

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-power-zones.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-power-zones.tsx
export type PowerZoneItem = {
  zone: string;
  seconds: number;
  percentage: number;
  color: string;
};

type Props = { data: PowerZoneItem[] | null };

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

export function ActivitiesPowerZones({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>功率区间分布</h2>
        </div>
        <p style={{ color: "var(--muted)" }}>近 30 天无功率数据 (需要 FTP + 活动 watts 流)</p>
      </div>
    );
  }

  const totalSec = data.reduce((s, z) => s + z.seconds, 0);

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>功率区间分布</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>近 30 天 · 总时长 {formatSeconds(totalSec)}</span>
      </div>

      {/* 水平 stacked bar */}
      <div
        style={{
          display: "flex",
          height: 36,
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 14,
          border: "1px solid var(--line, #e5e7eb)",
        }}
      >
        {data.map((z) =>
          z.percentage > 0 ? (
            <div
              key={z.zone}
              title={`${z.zone} · ${z.percentage}% · ${formatSeconds(z.seconds)}`}
              style={{
                width: `${z.percentage}%`,
                background: z.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "0.7rem",
                fontWeight: 600,
              }}
            >
              {z.percentage >= 8 ? `${z.percentage.toFixed(0)}%` : ""}
            </div>
          ) : null,
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, fontSize: "0.78rem" }}>
        {data.map((z) => (
          <div key={z.zone} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: z.color }} />
            <span>{z.zone}</span>
            <span style={{ color: "var(--muted)", marginLeft: "auto" }}>{z.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-power-zones.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-power-zones Z1-Z7 区间分布"
```

---

### Task 11: components/analytics/activities-toolbar.tsx — 筛选/搜索/排序 form

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-toolbar.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-toolbar.tsx
import Link from "next/link";
import { Search } from "lucide-react";

export type ToolbarQuery = {
  q: string;
  time: string;
  type: string;
  rideType: string;
  ai: string;
  fuel: string;
  load: string;
  sort: string;
};

type Props = { current: ToolbarQuery };

const SELECT_STYLE: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--line, #e5e7eb)",
  borderRadius: 8,
  fontSize: "0.85rem",
  background: "white",
};

export function ActivitiesToolbar({ current }: Props) {
  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>筛选活动</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>搜索并快速定位</span>
      </div>

      <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            border: "1px solid var(--line, #e5e7eb)",
            borderRadius: 8,
            background: "white",
            minWidth: 220,
          }}
        >
          <Search size={16} style={{ color: "var(--muted)" }} />
          <input
            type="search"
            name="q"
            placeholder="搜索活动名称"
            defaultValue={current.q}
            style={{ border: "none", outline: "none", flex: 1, fontSize: "0.85rem", background: "transparent" }}
          />
        </label>

        <select name="time" defaultValue={current.time} style={SELECT_STYLE}>
          <option value="all">全部时间</option>
          <option value="7d">最近 7 天</option>
          <option value="30d">最近 30 天</option>
          <option value="90d">最近 90 天</option>
        </select>

        <select name="type" defaultValue={current.type} style={SELECT_STYLE}>
          <option value="cycling">骑行</option>
          <option value="running">跑步</option>
          <option value="hiking">徒步</option>
          <option value="fitness">健身</option>
          <option value="other">其他</option>
          <option value="all">全部运动</option>
        </select>

        <select name="rideType" defaultValue={current.rideType} style={SELECT_STYLE}>
          <option value="all">全部骑行类型</option>
          <option value="耐力骑">耐力骑</option>
          <option value="爬坡训练">爬坡训练</option>
          <option value="恢复骑">恢复骑</option>
          <option value="通勤 / 短骑">通勤 / 短骑</option>
          <option value="室内训练">室内训练</option>
          <option value="高强度骑">高强度骑</option>
        </select>

        <select name="load" defaultValue={current.load} style={SELECT_STYLE}>
          <option value="all">全部负荷</option>
          <option value="high">高负荷</option>
          <option value="medium">中负荷</option>
          <option value="low">低负荷</option>
        </select>

        <select name="ai" defaultValue={current.ai} style={SELECT_STYLE}>
          <option value="all">全部 AI 状态</option>
          <option value="ready">已生成</option>
          <option value="pending">待生成</option>
        </select>

        <select name="fuel" defaultValue={current.fuel} style={SELECT_STYLE}>
          <option value="all">全部补给状态</option>
          <option value="recorded">已记录</option>
          <option value="missing">未记录</option>
        </select>

        <select name="sort" defaultValue={current.sort} style={SELECT_STYLE}>
          <option value="recent">时间倒序</option>
          <option value="load">按 TSS</option>
          <option value="duration">按时长</option>
          <option value="distance">按距离</option>
          <option value="pending">待处理优先</option>
        </select>

        <button
          type="submit"
          style={{
            padding: "6px 14px",
            background: "var(--accent, #1f57d6)",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: "0.85rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          应用
        </button>

        <Link
          href="/activities"
          style={{
            padding: "6px 14px",
            background: "var(--surface-alt, #f8fafc)",
            border: "1px solid var(--line, #e5e7eb)",
            borderRadius: 8,
            fontSize: "0.85rem",
            textDecoration: "none",
            color: "var(--text)",
          }}
        >
          清空
        </Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-toolbar.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-toolbar 筛选/搜索/排序 form"
```

---

### Task 12: components/analytics/activities-list.tsx — 活动列表 (含段位徽章)

**Files:** Create `/Users/qingpao/bicycling/components/analytics/activities-list.tsx`

- [ ] **Step 1: 写组件**

```tsx
// components/analytics/activities-list.tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ActivityIntensityBadge } from "@/lib/engine/cycling-levels";
import { LEVEL_BG } from "@/lib/engine/cycling-levels";

export type ListItem = {
  id: string;
  name: string;
  startTime: string;
  movingTimeMin: number;
  distanceKm: number;
  elevationM: number;
  tss?: number;
  ifValue?: number;
  avgPower?: number;
  avgHr?: number;
  rideType: string;
  loadLevel: "high" | "medium" | "low";
  aiReady: boolean;
  fuelLogged: boolean;
  fatigueScore?: number;
  badge: ActivityIntensityBadge;
};

type Props = {
  items: ListItem[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  buildPageUrl: (p: number) => string;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const m = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${m(d.getMonth() + 1)}-${m(d.getDate())} ${m(d.getHours())}:${m(d.getMinutes())}`;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}h${m}m`;
  return `${m}min`;
}

function ActivityBadge({ badge }: { badge: ActivityIntensityBadge }) {
  const bg = LEVEL_BG[badge.colorBucket];
  return (
    <span
      title={badge.detail}
      style={{
        padding: "4px 10px",
        borderRadius: 8,
        background: bg,
        color: "white",
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {badge.kind === "graded" ? `L${badge.level} ${badge.label}` : badge.label}
    </span>
  );
}

export function ActivitiesList({ items, totalCount, currentPage, totalPages, buildPageUrl }: Props) {
  if (!items.length) {
    return (
      <div className="analytics-card" style={{ textAlign: "center", padding: 32 }}>
        <strong>没有符合条件的活动。</strong>
        <p style={{ color: "var(--muted)", marginTop: 8 }}>
          <Link href="/activities" style={{ color: "var(--accent, #1f57d6)" }}>
            清空筛选 →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>全部活动</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>共 {totalCount} 条结果</span>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => (
          <article
            key={item.id}
            style={{
              padding: 14,
              border: "1px solid var(--line, #e5e7eb)",
              borderRadius: 10,
              position: "relative",
              background: "white",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={`/activities/${item.id}`}
                  style={{ fontWeight: 600, fontSize: "1rem", color: "var(--text)", textDecoration: "none" }}
                >
                  {item.name}
                </Link>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>
                  {formatDateTime(item.startTime)} · {item.rideType}
                </div>
              </div>
              <ActivityBadge badge={item.badge} />
            </div>

            <div
              style={{
                display: "flex",
                gap: 14,
                fontSize: "0.82rem",
                color: "var(--muted)",
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <span>{formatDuration(item.movingTimeMin)}</span>
              <span>{item.distanceKm} km</span>
              <span>{item.elevationM} m</span>
              <span>TSS {item.tss ?? "—"}</span>
              <span>{item.ifValue ? `IF ${item.ifValue}` : "IF —"}</span>
              <span>{item.avgPower ? `${item.avgPower}W` : "功率 —"}</span>
              <span>{item.avgHr ? `${item.avgHr}bpm` : "心率 —"}</span>
              {item.fatigueScore ? <span>疲劳 {item.fatigueScore}/10</span> : null}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: item.aiReady ? "#d1fae5" : "#fef3c7",
                  color: item.aiReady ? "#065f46" : "#92400e",
                  fontWeight: 600,
                }}
              >
                🤖 {item.aiReady ? "AI 已生成" : "待生成 AI"}
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: item.fuelLogged ? "#d1fae5" : "#fef3c7",
                  color: item.fuelLogged ? "#065f46" : "#92400e",
                  fontWeight: 600,
                }}
              >
                🍫 {item.fuelLogged ? "补给已记" : "待补录"}
              </span>
              <Link
                href={`/activities/${item.id}`}
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "0.85rem",
                  color: "var(--accent, #1f57d6)",
                  textDecoration: "none",
                }}
              >
                查看详情 <ChevronRight size={14} />
              </Link>
            </div>
          </article>
        ))}
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            paddingTop: 20,
            flexWrap: "wrap",
          }}
        >
          {currentPage > 1 && (
            <Link
              href={buildPageUrl(currentPage - 1)}
              style={{ padding: "4px 12px", border: "1px solid var(--line, #e5e7eb)", borderRadius: 6, textDecoration: "none", color: "var(--text)" }}
            >
              上一页
            </Link>
          )}
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            第 {currentPage} / {totalPages} 页 · 共 {totalCount} 条
          </span>
          {currentPage < totalPages && (
            <Link
              href={buildPageUrl(currentPage + 1)}
              style={{ padding: "4px 12px", border: "1px solid var(--line, #e5e7eb)", borderRadius: 6, textDecoration: "none", color: "var(--text)" }}
            >
              下一页
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/bicycling && npx tsc --noEmit && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add components/analytics/activities-list.tsx && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(ui): activities-list 活动列表 (含段位徽章 + 分页)"
```

---

### Task 13: 重写 app/(analytics)/activities/page.tsx 用全新组件

**Files:** Overwrite `/Users/qingpao/bicycling/app/(analytics)/activities/page.tsx` (currently is the old 711-line implementation that was moved in Task 2)

- [ ] **Step 1: Read 现有文件确认状态 (Task 2 后是老 711 行)**

```bash
cd ~/bicycling && head -20 "app/(analytics)/activities/page.tsx"
```

Expected: 看到老的 import 列表 (Activity as ActivityIcon, CalendarClock, etc.)

- [ ] **Step 2: 完全覆写为新 server component**

Write 到 `/Users/qingpao/bicycling/app/(analytics)/activities/page.tsx`:

```tsx
import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { listAiReportsByActivityIds, listFuelLogsByActivityIds } from "@/lib/storage";
import { calculatePmc } from "@/lib/engine/pmc";
import { evaluateActivityIntensity } from "@/lib/engine/cycling-levels";

import { ActivitiesStateCard, type TodayState } from "@/components/analytics/activities-state-card";
import { ActivitiesHighlightAlert, type HighlightItem } from "@/components/analytics/activities-highlight-alert";
import { ActivitiesKpiRow, type KpiStats, type KpiCompare } from "@/components/analytics/activities-kpi-row";
import { ActivitiesCalendarHeatmap, type CalendarDay } from "@/components/analytics/activities-calendar-heatmap";
import { ActivitiesWeeklyTrend, type WeeklyPoint } from "@/components/analytics/activities-weekly-trend";
import { ActivitiesPeriodCompare, type CompareRow } from "@/components/analytics/activities-period-compare";
import { ActivitiesTypeDistribution, type TypeDistItem } from "@/components/analytics/activities-type-distribution";
import { ActivitiesPowerZones, type PowerZoneItem } from "@/components/analytics/activities-power-zones";
import { ActivitiesToolbar, type ToolbarQuery } from "@/components/analytics/activities-toolbar";
import { ActivitiesList, type ListItem } from "@/components/analytics/activities-list";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  time?: string;
  type?: string;
  rideType?: string;
  ai?: string;
  fuel?: string;
  load?: string;
  sort?: string;
  page?: string;
}>;

function startDateDaysAgo(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function isAfterDays(value: string, days: number) {
  return new Date(value) >= startDateDaysAgo(days);
}

function round(value: number, digits = 0) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function sum(values: Array<number | undefined>) {
  return values.reduce<number>((t, v) => t + (typeof v === "number" ? v : 0), 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRideType(activity: any): string {
  const raw = activity.rawSummaryJson ?? {};
  const type = String(raw.type ?? "").toLowerCase();
  if (type.includes("virtual") || String(raw.trainer ?? "").toLowerCase() === "true") return "室内训练";
  if (activity.movingTimeMin >= 180 && activity.elevationM >= 1000) return "爬坡训练";
  if ((activity.ifValue ?? 0) >= 0.8 || (activity.tss ?? 0) >= 140) return "高强度骑";
  if (activity.movingTimeMin >= 120) return "耐力骑";
  if (activity.movingTimeMin <= 75 || activity.distanceKm <= 35) return "通勤 / 短骑";
  return "恢复骑";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSportType(activity: any): "cycling" | "running" | "hiking" | "fitness" | "other" {
  const raw = activity.rawSummaryJson ?? {};
  const type = String(raw.type ?? raw.sport_type ?? "").toLowerCase();
  if (type.includes("ride") || type.includes("bike") || type.includes("cycl") || type.includes("virtual")) return "cycling";
  if (type.includes("run")) return "running";
  if (type.includes("hike") || type.includes("walk")) return "hiking";
  if (type.includes("workout") || type.includes("weight")) return "fitness";
  return "other";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLoadLevel(activity: any): "high" | "medium" | "low" {
  if ((activity.tss ?? 0) >= 150 || (activity.ifValue ?? 0) >= 0.82 || activity.movingTimeMin >= 240) return "high";
  if ((activity.tss ?? 0) >= 80 || (activity.ifValue ?? 0) >= 0.7 || activity.movingTimeMin >= 120) return "medium";
  return "low";
}

function comparePeriod(current: number, previous: number) {
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : 0;
  if (Math.abs(pct) < 5 || Math.abs(diff) < 1) return { diff, pct, direction: "flat" as const };
  return { diff, pct, direction: (diff > 0 ? "up" : "down") as "up" | "down" };
}

function buildQueryString(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== "all");
  return new URLSearchParams(entries as [string, string][]).toString();
}

export default async function ActivitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;

  const currentQuery: ToolbarQuery = {
    q: (params.q ?? "").trim(),
    time: params.time ?? "all",
    type: params.type ?? "cycling",
    rideType: params.rideType ?? "all",
    ai: params.ai ?? "all",
    fuel: params.fuel ?? "all",
    load: params.load ?? "all",
    sort: params.sort ?? "recent",
  };

  const pageSize = 20;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const { activities } = await loadAnalyticsData(user);
  const [fuelLogs, aiReports] = await Promise.all([
    listFuelLogsByActivityIds(activities.map((a) => a.id)),
    listAiReportsByActivityIds(activities.map((a) => a.id)),
  ]);

  const fuelLogMap = new Map(fuelLogs.map((f) => [f.activityId, f]));
  const aiReportMap = new Map(aiReports.map((r) => [r.activityId, r]));
  const weightKg = user.weightKg ?? user.syncedWeightKg ?? undefined;

  const decorated = activities.map((a) => {
    const fuelLog = fuelLogMap.get(a.id);
    const aiReport = aiReportMap.get(a.id);
    return {
      ...a,
      sportType: getSportType(a),
      rideType: getRideType(a),
      loadLevel: getLoadLevel(a),
      fuelLogged: !!fuelLog,
      aiReady: !!aiReport,
      fatigueScore: fuelLog?.fatigueScore,
      badge: evaluateActivityIntensity(a, weightKg),
    };
  });

  // Filter
  let filtered = decorated;
  if (currentQuery.type !== "all") filtered = filtered.filter((a) => a.sportType === currentQuery.type);
  if (currentQuery.q) filtered = filtered.filter((a) => a.name.toLowerCase().includes(currentQuery.q.toLowerCase()));
  if (currentQuery.rideType !== "all") filtered = filtered.filter((a) => a.rideType === currentQuery.rideType);
  if (currentQuery.ai === "ready") filtered = filtered.filter((a) => a.aiReady);
  if (currentQuery.ai === "pending") filtered = filtered.filter((a) => !a.aiReady);
  if (currentQuery.fuel === "recorded") filtered = filtered.filter((a) => a.fuelLogged);
  if (currentQuery.fuel === "missing") filtered = filtered.filter((a) => !a.fuelLogged);
  if (currentQuery.load !== "all") filtered = filtered.filter((a) => a.loadLevel === currentQuery.load);
  if (currentQuery.time === "7d") filtered = filtered.filter((a) => isAfterDays(a.startTime, 7));
  if (currentQuery.time === "30d") filtered = filtered.filter((a) => isAfterDays(a.startTime, 30));
  if (currentQuery.time === "90d") filtered = filtered.filter((a) => isAfterDays(a.startTime, 90));

  // Sort
  switch (currentQuery.sort) {
    case "load": filtered = [...filtered].sort((a, b) => (b.tss ?? 0) - (a.tss ?? 0)); break;
    case "duration": filtered = [...filtered].sort((a, b) => b.movingTimeMin - a.movingTimeMin); break;
    case "distance": filtered = [...filtered].sort((a, b) => b.distanceKm - a.distanceKm); break;
    case "pending": filtered = [...filtered].sort((a, b) => {
      const pa = (a.aiReady ? 0 : 1) + (a.fuelLogged ? 0 : 1);
      const pb = (b.aiReady ? 0 : 1) + (b.fuelLogged ? 0 : 1);
      return pb - pa;
    }); break;
    default: filtered = [...filtered].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  // Stats
  const cycling = decorated.filter((a) => a.sportType === "cycling");
  const recent7 = cycling.filter((a) => isAfterDays(a.startTime, 7));
  const recent30 = cycling.filter((a) => isAfterDays(a.startTime, 30));
  const previous7 = cycling.filter((a) => {
    const d = new Date(a.startTime);
    return d >= startDateDaysAgo(14) && d < startDateDaysAgo(7);
  });
  const previous30 = cycling.filter((a) => {
    const d = new Date(a.startTime);
    return d >= startDateDaysAgo(60) && d < startDateDaysAgo(30);
  });

  const periodStats = (acts: typeof cycling): KpiStats => ({
    count: acts.length,
    tss: sum(acts.map((a) => a.tss)),
    durationMin: sum(acts.map((a) => a.movingTimeMin)),
    distanceKm: round(sum(acts.map((a) => a.distanceKm)), 1),
    elevationM: Math.round(sum(acts.map((a) => a.elevationM))),
  });

  const stats7 = periodStats(recent7);
  const stats30 = periodStats(recent30);
  const statsPrev7 = periodStats(previous7);
  const statsPrev30 = periodStats(previous30);

  const weekCompare: KpiCompare = {
    count: comparePeriod(stats7.count, statsPrev7.count),
    tss: comparePeriod(stats7.tss, statsPrev7.tss),
    duration: comparePeriod(stats7.durationMin, statsPrev7.durationMin),
    distance: comparePeriod(stats7.distanceKm, statsPrev7.distanceKm),
  };

  const monthCompareRows: CompareRow[] = [
    {
      label: "本月 TSS",
      current: stats30.tss,
      previous: statsPrev30.tss,
      cmp: comparePeriod(stats30.tss, statsPrev30.tss),
      unit: "",
    },
    {
      label: "本月时长",
      current: round(stats30.durationMin / 60, 1),
      previous: round(statsPrev30.durationMin / 60, 1),
      cmp: comparePeriod(stats30.durationMin, statsPrev30.durationMin),
      unit: " h",
    },
    {
      label: "本月距离",
      current: stats30.distanceKm,
      previous: statsPrev30.distanceKm,
      cmp: comparePeriod(stats30.distanceKm, statsPrev30.distanceKm),
      unit: " km",
    },
    {
      label: "本月活动数",
      current: stats30.count,
      previous: statsPrev30.count,
      cmp: comparePeriod(stats30.count, statsPrev30.count),
      unit: "",
    },
  ];

  // PMC
  const pmcData = calculatePmc(cycling);
  const latestPmc = pmcData[pmcData.length - 1] ?? null;

  let todayState: TodayState = { label: "等待同步", tone: "idle", summary: "同步活动数据后会显示当前训练状态" };
  if (latestPmc) {
    const tsb = latestPmc.tsb;
    if (tsb > 15) todayState = { label: "状态良好", tone: "ok", summary: `当前 TSB ${round(tsb, 1)}, 恢复充分, 适合高强度训练` };
    else if (tsb > -10) todayState = { label: "正常训练", tone: "ok", summary: `当前 TSB ${round(tsb, 1)}, 训练负荷可控` };
    else if (tsb > -30) todayState = { label: "建设期", tone: "warn", summary: `当前 TSB ${round(tsb, 1)}, 疲劳累积中, 建议中低强度` };
    else todayState = { label: "过度疲劳", tone: "warn", summary: `当前 TSB ${round(tsb, 1)}, 建议减量恢复` };
  }

  // Calendar heatmap
  const calendarData: CalendarDay[] = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: CalendarDay[] = [];
    for (let i = 111; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split("T")[0];
      const dayActs = cycling.filter((a) => a.startTime.startsWith(dateKey));
      result.push({ date: dateKey, tss: sum(dayActs.map((a) => a.tss)), dayOfWeek: d.getDay() });
    }
    return result;
  })();

  // Weekly trend
  const weeklyTrend: WeeklyPoint[] = (() => {
    const map = new Map<string, { tss: number; duration: number; distance: number; count: number }>();
    for (const a of cycling) {
      const d = new Date(a.startTime);
      const ws = new Date(d);
      ws.setDate(d.getDate() - d.getDay() + 1);
      const weekKey = ws.toISOString().split("T")[0];
      const existing = map.get(weekKey) ?? { tss: 0, duration: 0, distance: 0, count: 0 };
      existing.tss += a.tss ?? 0;
      existing.duration += a.movingTimeMin;
      existing.distance += a.distanceKm;
      existing.count += 1;
      map.set(weekKey, existing);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-26)
      .map(([week, s]) => ({
        week: week.slice(5),
        tss: Math.round(s.tss),
        duration: Math.round((s.duration / 60) * 10) / 10,
        distance: Math.round(s.distance),
        count: s.count,
      }));
  })();

  // Type distribution
  const typeDistribution: TypeDistItem[] = (() => {
    const counts = new Map<string, number>();
    for (const a of recent30) counts.set(a.rideType, (counts.get(a.rideType) ?? 0) + 1);
    const colors: Record<string, string> = {
      "耐力骑": "#1f57d6",
      "爬坡训练": "#0f8a62",
      "高强度骑": "#c44d3b",
      "通勤 / 短骑": "#f59e0b",
      "室内训练": "#7c3aed",
      "恢复骑": "#6b7280",
    };
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value, color: colors[name] ?? "#9ca3af" }));
  })();

  // Power zones
  const powerZoneDistribution: PowerZoneItem[] | null = (() => {
    const ftp = user.ftp ?? user.syncedFtp;
    if (!ftp) return null;
    const zones = [0, 0, 0, 0, 0, 0, 0];
    let hasData = false;
    for (const a of recent30) {
      if (!a.rawStreamsJson) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const watts = (a.rawStreamsJson as any).watts;
      if (!Array.isArray(watts) || !watts.length) continue;
      hasData = true;
      for (const w of watts) {
        if (typeof w !== "number") continue;
        const pct = w / ftp;
        if (pct <= 0.55) zones[0]++;
        else if (pct <= 0.75) zones[1]++;
        else if (pct <= 0.90) zones[2]++;
        else if (pct <= 1.05) zones[3]++;
        else if (pct <= 1.20) zones[4]++;
        else if (pct <= 1.50) zones[5]++;
        else zones[6]++;
      }
    }
    if (!hasData) return null;
    const total = zones.reduce((s, v) => s + v, 0) || 1;
    return [
      { zone: "Z1 恢复", seconds: zones[0], percentage: Number(((zones[0] / total) * 100).toFixed(1)), color: "#9ca3af" },
      { zone: "Z2 耐力", seconds: zones[1], percentage: Number(((zones[1] / total) * 100).toFixed(1)), color: "#60a5fa" },
      { zone: "Z3 节奏", seconds: zones[2], percentage: Number(((zones[2] / total) * 100).toFixed(1)), color: "#34d399" },
      { zone: "Z4 阈值", seconds: zones[3], percentage: Number(((zones[3] / total) * 100).toFixed(1)), color: "#fbbf24" },
      { zone: "Z5 VO2", seconds: zones[4], percentage: Number(((zones[4] / total) * 100).toFixed(1)), color: "#fb923c" },
      { zone: "Z6 无氧", seconds: zones[5], percentage: Number(((zones[5] / total) * 100).toFixed(1)), color: "#f87171" },
      { zone: "Z7 神经", seconds: zones[6], percentage: Number(((zones[6] / total) * 100).toFixed(1)), color: "#a78bfa" },
    ];
  })();

  // Highlights
  const highlightItems: HighlightItem[] = [
    ...decorated.filter((a) => a.loadLevel === "high" && !a.aiReady).slice(0, 2),
    ...decorated.filter((a) => a.loadLevel === "high" && a.aiReady).slice(0, 2),
    ...decorated.filter((a) => !a.fuelLogged && (a.tss ?? 0) >= 80).slice(0, 2),
  ]
    .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      name: a.name,
      startTime: a.startTime,
      movingTimeMin: a.movingTimeMin,
      distanceKm: a.distanceKm,
      tss: a.tss,
      ifValue: a.ifValue,
      loadLevel: a.loadLevel,
      aiReady: a.aiReady,
      fuelLogged: a.fuelLogged,
    }));

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems: ListItem[] = filtered.slice(startIdx, startIdx + pageSize).map((item) => ({
    id: item.id,
    name: item.name,
    startTime: item.startTime,
    movingTimeMin: item.movingTimeMin,
    distanceKm: item.distanceKm,
    elevationM: item.elevationM,
    tss: item.tss,
    ifValue: item.ifValue,
    avgPower: item.avgPower,
    avgHr: item.avgHr,
    rideType: item.rideType,
    loadLevel: item.loadLevel,
    aiReady: item.aiReady,
    fuelLogged: item.fuelLogged,
    fatigueScore: item.fatigueScore,
    badge: item.badge,
  }));

  const buildPageUrl = (p: number) =>
    `/activities?${buildQueryString({ ...currentQuery, page: String(p) })}`;

  return (
    <main className="analytics-page" style={{ display: "grid", gap: 20 }}>
      <header className="analytics-page-header">
        <h1 style={{ margin: 0 }}>🚴 训练历史</h1>
        <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>
          共 {activities.length} 条 · 显示 {filtered.length} 条 · {currentQuery.time === "all" ? "全部时间" : `近 ${currentQuery.time}`}
        </p>
      </header>

      {/* §A 顶部 */}
      <ActivitiesStateCard pmc={latestPmc} state={todayState} />
      <ActivitiesHighlightAlert items={highlightItems} />
      <ActivitiesKpiRow stats={stats7} compare={weekCompare} prevStats={statsPrev7} />

      {/* §B 时序 */}
      <ActivitiesCalendarHeatmap data={calendarData} />
      <ActivitiesWeeklyTrend data={weeklyTrend} />
      <ActivitiesPeriodCompare rows={monthCompareRows} />

      {/* §C 结构 (2 列) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <ActivitiesTypeDistribution data={typeDistribution} />
        <ActivitiesPowerZones data={powerZoneDistribution} />
      </div>

      {/* §D 列表 */}
      <ActivitiesToolbar current={currentQuery} />
      <ActivitiesList
        items={pageItems}
        totalCount={filtered.length}
        currentPage={currentPage}
        totalPages={totalPages}
        buildPageUrl={buildPageUrl}
      />
    </main>
  );
}
```

- [ ] **Step 3: tsc**

```bash
cd ~/bicycling && npx tsc --noEmit; echo "TSC=$?"
```

Expected: TSC=0

- [ ] **Step 4: Commit**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false add "app/(analytics)/activities/page.tsx" && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "feat(activities): 重写 page.tsx 为 4 段式 IA + 10 组件 + 段位徽章"
```

---

### Task 14: 删除旧 chart 组件 + 全流程 smoke

**Files:**
- Delete: `components/analytics/training-history-charts.tsx`

- [ ] **Step 1: 删除旧 chart 组件**

```bash
cd ~/bicycling && git rm components/analytics/training-history-charts.tsx
```

- [ ] **Step 2: 全 tests + tsc**

```bash
cd ~/bicycling && npm test 2>&1 | tail -8
cd ~/bicycling && npx tsc --noEmit; echo "TSC=$?"
```

Expected:
- 31 tests pass (26 旧 + 5 新 evaluateActivityIntensity)
- TSC=0

- [ ] **Step 3: 生产 build 验证**

```bash
cd ~/bicycling && DATABASE_URL="file:./data/app.db" npm run build 2>&1 | grep -E "Compiled|/activities|error" | head -10
```

Expected:
- `✓ Compiled successfully`
- `/activities` 路由出现
- 无 type/lint error 阻塞

- [ ] **Step 4: dev smoke 三 case**

```bash
cd ~/bicycling && pkill -f "next dev" 2>/dev/null; sleep 1
nohup npm run dev > /tmp/bicycling-task14.log 2>&1 &
sleep 12
echo "=== /activities (未登录) ==="
curl -s -o /dev/null -w "HTTP=%{http_code}\n" http://localhost:3000/activities
echo "=== /analytics/activities (应 404 或迁后无路由) ==="
curl -s -o /dev/null -w "HTTP=%{http_code}\n" http://localhost:3000/analytics/activities
echo "=== dev log error 检查 ==="
grep -iE "error|TypeError" /tmp/bicycling-task14.log | grep -v "401\|307\|verify_token\|prisma" | head -5 || echo "✓ no errors"
pkill -f "next dev" 2>/dev/null
```

Expected:
- /activities → 307 (redirect to login, prisma error 是预期)
- /analytics/activities → 404 (redirect file 已删)
- dev log 无 compile error

- [ ] **Step 5: Commit + final**

```bash
cd ~/bicycling && git -c user.email="claude@anthropic.com" -c user.name="Claude" -c commit.gpgsign=false commit -m "chore(ui): 删除 training-history-charts (已拆到 4 个新组件)"
```

---

## Self-Review

### Spec coverage
- §1 痛点 → Task 2 (路径迁移) + Task 3-12 (UI 重做) + Task 1 (段位徽章 engine)
- §2 模块全保留 → Task 6 (heatmap) / 7 (weekly trend) / 9 (type dist) / 10 (power zones) — 4 个都建了
- §3 4 段式 IA → Task 13 page.tsx 明确分段
- §4 段位徽章 → Task 1 engine + Task 12 list ActivityBadge 组件
- §5 文件结构 → 全部 14 项对齐
- §7 数据流 → Task 13 实现全部
- §8 路径迁移机制 → Task 2 严格 git mv
- §10 测试 → Task 1 4 个 engine test (实际 5 个含 weight=undef)
- §11 sub-sprint A/B 划分 → Task 1-2 是 A, Task 3-14 是 B

### Placeholder scan
全文 grep "TBD|TODO|占位|implement later" 应为 0。

### Type 一致性
- `ActivityIntensityBadge` 在 Task 1 定义, Task 12 (list) import 一致 ✓
- `TodayState` 在 Task 3 定义, Task 13 page 用 ✓
- `HighlightItem` / `KpiStats` / `KpiCompare` / `CalendarDay` / `WeeklyPoint` / `CompareRow` / `TypeDistItem` / `PowerZoneItem` / `ToolbarQuery` / `ListItem` 全部从组件文件 export, page.tsx import 一致 ✓
- `LEVEL_BG` 在 Task 12 list 从 cycling-levels.ts import (已存在 export, 上次 sprint 加的) ✓
