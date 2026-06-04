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

      <Link href="/analytics#pmc-chart" className="button">
        查看完整 PMC <ChevronRight size={14} />
      </Link>
    </div>
  );
}
