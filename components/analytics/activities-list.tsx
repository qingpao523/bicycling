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
