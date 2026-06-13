import Link from "next/link";
import {
  type ActivityIntensityBadge,
  LEVEL_BG,
} from "@/lib/engine/cycling-levels";
import { formatDateTime, formatDuration } from "@/lib/format";

type Props = {
  activity: {
    id: string;
    name: string;
    startTime: string;
    rideType: string;
  };
  metrics: {
    durationMin: number;
    distanceKm: number;
    elevationM: number;
    tss?: number;
    ifValue?: number;
    avgSpeedKmh: number;
    avgPower?: number;
    np?: number;
    avgHr?: number;
    calories?: number;
  };
  badge: ActivityIntensityBadge;
  error?: string;
  success?: string;
};

function fmtNum(value: number | undefined, suffix = "") {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${value}${suffix}`;
}

function fmtFloat(value: number | undefined, digits = 2, suffix = "") {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

export function ActivityHero({ activity, metrics, badge, error, success }: Props) {
  const badgeColor = LEVEL_BG[badge.colorBucket];

  const secondaryBits: string[] = [
    `爬升 ${metrics.elevationM} m`,
    `平均速度 ${fmtNum(metrics.avgSpeedKmh)} km/h`,
  ];
  if (typeof metrics.calories === "number") {
    secondaryBits.push(`热量 ${metrics.calories} kcal`);
  }
  if (typeof metrics.np === "number") {
    secondaryBits.push(`NP ${metrics.np} W`);
  } else if (typeof metrics.avgPower === "number") {
    secondaryBits.push(`平均功率 ${metrics.avgPower} W`);
  }
  if (typeof metrics.avgHr === "number") {
    secondaryBits.push(`平均心率 ${metrics.avgHr} bpm`);
  }

  return (
    <section className="analytics-card" style={{ display: "grid", gap: 16 }}>
      <Link
        href="/activities"
        className="activity-back-link"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.82rem", color: "var(--muted)", textDecoration: "none" }}
      >
        ← 返回运动记录
      </Link>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">单次骑行分析</div>
          <h1 style={{ margin: "4px 0 0", fontSize: "clamp(1.4rem, 2.4vw, 1.9rem)", lineHeight: 1.2 }}>
            {activity.name}
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
            {formatDateTime(activity.startTime)}
          </p>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "6px 12px",
            borderRadius: 999,
            background: "var(--accent-soft, rgba(31,87,214,0.12))",
            color: "var(--accent, #1f57d6)",
            fontSize: "0.82rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {activity.rideType}
        </span>
      </div>

      {error ? (
        <p style={{ margin: 0, padding: "10px 14px", borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "#b91c1c", fontSize: "0.88rem" }}>
          {decodeURIComponent(error)}
        </p>
      ) : null}
      {success ? (
        <p style={{ margin: 0, padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.08)", color: "#047857", fontSize: "0.88rem" }}>
          {decodeURIComponent(success)}
        </p>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 18px",
          borderRadius: 14,
          background: `${badgeColor}1a`,
          borderLeft: `4px solid ${badgeColor}`,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: badgeColor,
            color: "#fff",
            fontWeight: 700,
            fontSize: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {badge.kind === "graded" ? `L${badge.level}` : "强度"}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text)" }}>{badge.label}</div>
          <div style={{ fontSize: "0.84rem", color: "var(--muted)", marginTop: 2 }}>{badge.detail}</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <div className="analytics-stat-card">
          <div className="eyebrow">时间</div>
          <div className="stat-value">{formatDuration(metrics.durationMin)}</div>
        </div>
        <div className="analytics-stat-card">
          <div className="eyebrow">距离</div>
          <div className="stat-value">{fmtNum(metrics.distanceKm)} <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--muted)" }}>km</span></div>
        </div>
        <div className="analytics-stat-card">
          <div className="eyebrow">TSS</div>
          <div className="stat-value">{fmtNum(metrics.tss)}</div>
        </div>
        <div className="analytics-stat-card">
          <div className="eyebrow">IF</div>
          <div className="stat-value">{fmtFloat(metrics.ifValue, 2)}</div>
        </div>
      </div>

      <div
        style={{
          fontSize: "0.86rem",
          color: "var(--muted)",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          rowGap: 6,
        }}
      >
        {secondaryBits.map((bit, idx) => (
          <span key={`${bit}-${idx}`}>{bit}</span>
        ))}
      </div>
    </section>
  );
}
