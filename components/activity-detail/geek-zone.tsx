import type { ReactNode } from "react";

type Props = {
  trainingBackground: ReactNode;
  streamModal: ReactNode;
};

export function ActivityGeekZone({ trainingBackground, streamModal }: Props) {
  return (
    <details
      className="analytics-card"
      style={{
        padding: 0,
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: "16px 24px",
          fontSize: "0.95rem",
          fontWeight: 600,
          color: "var(--muted)",
          userSelect: "none",
        }}
      >
        ▾ 极客数据 (折叠)
      </summary>
      <div style={{ padding: "0 24px 24px", display: "grid", gap: 16 }}>
        <div>{trainingBackground}</div>
        <div>{streamModal}</div>
      </div>
    </details>
  );
}
