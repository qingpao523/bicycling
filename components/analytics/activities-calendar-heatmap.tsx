// components/analytics/activities-calendar-heatmap.tsx
"use client";

export type CalendarDay = {
  date: string;          // YYYY-MM-DD ("" 表示占位空格)
  tss: number;
  dayOfWeek: number;     // 0 = Sunday
};

type Props = { data: CalendarDay[] };

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
