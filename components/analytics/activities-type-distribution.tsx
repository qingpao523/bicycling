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
