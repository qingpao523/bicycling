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
