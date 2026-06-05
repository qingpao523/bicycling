"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

type Props = { stats: { totalActivities: number; stravaActivities: number; withSegments: number; missingSegments: number } };

export function SegmentBackfillPanel({ stats }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analytics/segments/backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 9999 }) });
      const data = await res.json();
      setResult(res.ok ? `已入队 ${data.enqueued} 条, 后台处理中 (每条约 6 秒, 预计 ${Math.ceil((data.enqueued * 6) / 60)} 分钟)` : `失败: ${data.error}`);
    } catch { setResult("网络异常"); }
    setLoading(false);
  };

  const pct = stats.stravaActivities > 0 ? Math.round((stats.withSegments / stats.stravaActivities) * 100) : 0;

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2><RefreshCw size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />赛段数据补拉</h2>
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: "0.85rem", flexWrap: "wrap" }}>
        <span>Strava 活动: {stats.stravaActivities}</span>
        <span>已有赛段: {stats.withSegments} ({pct}%)</span>
        <span style={{ color: stats.missingSegments > 0 ? "#f59e0b" : "#10b981" }}>缺失: {stats.missingSegments}</span>
      </div>
      <div style={{ height: 8, background: "var(--line, #e5e7eb)", borderRadius: 4, marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#10b981", borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <button onClick={run} disabled={loading} style={{
        padding: "8px 16px", background: "var(--accent, #1f57d6)", color: "white", border: "none", borderRadius: 8, fontSize: "0.88rem", cursor: loading ? "wait" : "pointer", fontWeight: 600, opacity: loading ? 0.7 : 1,
      }}>
        {loading ? "处理中..." : `一键补拉全部赛段数据`}
      </button>
      {result && <p style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--muted)" }}>{result}</p>}
    </div>
  );
}
