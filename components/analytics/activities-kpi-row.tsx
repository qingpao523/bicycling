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
