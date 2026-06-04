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
