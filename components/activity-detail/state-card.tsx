type Props = {
  tss?: number;
  recentAvgTss?: number;
  ifValue?: number;
  movingTimeMin: number;
  pmcPhase?: { label: string; description: string };
};

function buildStatusLine(tss: number | undefined, recentAvgTss: number | undefined): string {
  if (typeof tss !== "number") {
    return "本次缺少 TSS 数据，无法做负荷对比。";
  }
  if (typeof recentAvgTss !== "number") {
    return `本次 TSS ${tss}，暂无近期基线对比。`;
  }
  const delta = tss - recentAvgTss;
  const sign = delta > 0 ? "+" : "";
  const phase = delta > 30 ? "建设期" : delta < -30 ? "恢复期" : "正常";
  const tone = delta > 30 ? "刺激明显增加" : delta < -30 ? "刺激明显降低" : "刺激";
  return `本次 TSS ${tss}，比近 7 天均值 ${sign}${delta.toFixed(0)}，处于"${phase}"${tone}。`;
}

function buildRiskBadges(
  tss: number | undefined,
  recentAvgTss: number | undefined,
  ifValue: number | undefined,
  movingTimeMin: number,
): string[] {
  const warnings: string[] = [];
  if (typeof ifValue === "number" && ifValue > 0.85) {
    warnings.push(`⚠ 高强度负荷 (IF ${ifValue.toFixed(2)})，注意恢复`);
  }
  if (movingTimeMin > 240) {
    warnings.push(`⚠ 超长时长 (${Math.round(movingTimeMin)} 分钟)，注意补给`);
  }
  if (typeof tss === "number" && typeof recentAvgTss === "number" && tss - recentAvgTss > 50) {
    warnings.push(`⚠ 单日负荷激增 (+${(tss - recentAvgTss).toFixed(0)} TSS)`);
  }
  return warnings;
}

export function ActivityStateCard({ tss, recentAvgTss, ifValue, movingTimeMin, pmcPhase }: Props) {
  const statusLine = buildStatusLine(tss, recentAvgTss);
  const warnings = buildRiskBadges(tss, recentAvgTss, ifValue, movingTimeMin);

  return (
    <section className="analytics-card" style={{ display: "grid", gap: 12 }}>
      <div className="analytics-card-header" style={{ marginBottom: 0 }}>
        <h2>今天怎么样</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>一眼看清负荷 + 风险</span>
      </div>

      <p style={{ margin: 0, fontSize: "0.96rem", color: "var(--text)", lineHeight: 1.55 }}>
        {statusLine}
      </p>

      {pmcPhase ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--accent-soft, rgba(31,87,214,0.08))",
            fontSize: "0.88rem",
          }}
        >
          <strong style={{ color: "var(--accent, #1f57d6)" }}>{pmcPhase.label}</strong>
          <span style={{ color: "var(--muted)" }}>{pmcPhase.description}</span>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          {warnings.map((warning) => (
            <div
              key={warning}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(245,158,11,0.08)",
                borderLeft: "3px solid #f59e0b",
                color: "#92400e",
                fontSize: "0.88rem",
              }}
            >
              {warning}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>暂无明显风险信号。</div>
      )}
    </section>
  );
}
