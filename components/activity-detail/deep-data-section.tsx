import type { ReactNode } from "react";

type Props = {
  streamChart: ReactNode;
  rawFeatures: ReactNode;
  recentCompare: ReactNode;
  timeAnalysis: ReactNode;
};

export function ActivityDeepDataSection({ streamChart, rawFeatures, recentCompare, timeAnalysis }: Props) {
  return (
    <section className="analytics-card" style={{ display: "grid", gap: 20 }}>
      <div className="analytics-card-header" style={{ marginBottom: 0 }}>
        <h2>深度数据分析</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>图表为主, 数字摘要为辅</span>
      </div>

      <div>{streamChart}</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <div>{rawFeatures}</div>
        <div>{recentCompare}</div>
        <div>{timeAnalysis}</div>
      </div>
    </section>
  );
}
