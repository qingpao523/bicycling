// components/analytics/upgrade-path-card.tsx
"use client";

import type { UpgradePlan } from "@/lib/engine/level-progression";
import { DIMENSION_META, type Dimension } from "@/lib/engine/cycling-levels";
import { TrendingUp, Calendar, Target } from "lucide-react";

type Props = { plan: UpgradePlan };

export function UpgradePathCard({ plan }: Props) {
  if (plan.skip) {
    return (
      <div className="analytics-card" style={{ textAlign: "center", padding: 28 }}>
        <Target size={32} style={{ color: "#10b981" }} />
        <h3 style={{ margin: "12px 0 4px" }}>✓ 已全面达标</h3>
        <p style={{ color: "var(--muted)", margin: 0 }}>{plan.skip}</p>
      </div>
    );
  }

  return (
    <div className="analytics-card" style={{ borderLeft: "4px solid #8b5cf6" }}>
      <div className="analytics-card-header">
        <h2>
          <TrendingUp size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          升级训练块
          <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "var(--muted)", marginTop: 4 }}>
            {plan.block?.name}
          </span>
        </h2>
        <span style={{ fontSize: "0.78rem", color: "#8b5cf6" }}>
          目标维度: {plan.targetDimension && DIMENSION_META[plan.targetDimension as Dimension].label}
        </span>
      </div>

      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        {plan.block?.sessions.map((s, i) => (
          <div
            key={i}
            style={{
              padding: 12,
              background: "var(--surface-alt, #f8fafc)",
              borderRadius: 8,
              borderLeft: "3px solid #8b5cf6",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <strong style={{ fontSize: "0.92rem" }}>{s.name}</strong>
              <span style={{ fontSize: "0.78rem", color: "#8b5cf6" }}>{s.freq}</span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{s.detail}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: "0.82rem", flexWrap: "wrap" }}>
        <div>
          <Calendar size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
          周排课: {plan.weeklySchedule?.join(" / ")}
        </div>
        <div style={{ color: "#10b981" }}>
          📈 预期: {plan.block?.expectedGain}
        </div>
      </div>

      {plan.note && (
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 12, marginBottom: 0 }}>
          ⚠ {plan.note}
        </p>
      )}
    </div>
  );
}
