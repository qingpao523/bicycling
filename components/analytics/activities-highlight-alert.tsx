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
