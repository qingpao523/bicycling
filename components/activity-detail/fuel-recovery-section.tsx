import type { ReactNode } from "react";

type Props = {
  fuelForm: ReactNode;
  recoveryCards: ReactNode;
};

export function ActivityFuelRecoverySection({ fuelForm, recoveryCards }: Props) {
  return (
    <div
      className="fuel-recovery-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 20,
      }}
    >
      <div className="analytics-card" id="fuel-log">
        {fuelForm}
      </div>
      <div className="analytics-card">{recoveryCards}</div>
    </div>
  );
}
