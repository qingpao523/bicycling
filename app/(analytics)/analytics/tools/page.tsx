import { StreamBackfillPanel } from "@/components/analytics/stream-backfill-panel";

export default function AnalyticsToolsPage() {
  return (
    <div>
      <div className="analytics-page-header">
        <h1>数据工具</h1>
        <p>补拉历史活动流数据，提升功率分析准确度</p>
      </div>

      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>流数据补拉</h2>
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>watts / heartrate / cadence / altitude</span>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "0 0 16px", lineHeight: 1.6 }}>
          系统在同步活动时默认只拉取最新 20 条的详细流数据（watts、heartrate、cadence、altitude）。
          其他活动仅保存了汇总数据。此工具可以批量补拉历史活动的完整流数据，让功率曲线、功率形态、疲劳分析等模块用上完整数据。
        </p>

        <StreamBackfillPanel />
      </div>

      <div className="analytics-card" style={{ background: "rgba(31,87,214,0.04)" }}>
        <h3 style={{ margin: "0 0 10px" }}>💡 使用建议</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.88rem", lineHeight: 1.7, color: "var(--muted)" }}>
          <li><strong style={{ color: "var(--text)" }}>首次补拉：</strong>勾选"仅补拉有功率的活动"，设置 50-100 条，分批执行</li>
          <li><strong style={{ color: "var(--text)" }}>intervals.icu 限制：</strong>免费账户 API 限制约 100 次/分钟，付费账户更宽松</li>
          <li><strong style={{ color: "var(--text)" }}>Strava 限制：</strong>100 次/15 分钟，1000 次/天</li>
          <li><strong style={{ color: "var(--text)" }}>补拉过程：</strong>过程中可以关闭页面，补拉会继续进行。重新打开查看结果</li>
          <li><strong style={{ color: "var(--text)" }}>自动跳过：</strong>已有流数据的活动会自动跳过，不会重复拉取</li>
        </ul>
      </div>
    </div>
  );
}
