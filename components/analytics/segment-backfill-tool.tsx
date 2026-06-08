"use client";
import { useState, useEffect } from "react";

interface Stats {
  totalActivities: number;
  stravaActivities: number;
  withSegments: number;
  missingSegments: number;
}

export function SegmentBackfillTool() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics/segments/backfill")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analytics/segments/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 9999 }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`已入队 ${data.enqueued} 条活动，后台逐条拉取赛段（每条约 6s，预计 ${Math.ceil((data.enqueued * 6) / 60)} 分钟）`);
      } else {
        setResult(`失败: ${data.error}`);
      }
    } catch {
      setResult("网络异常");
    }
    setLoading(false);
  };

  if (!stats) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h2>赛段数据补全</h2>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>加载中...</p>
      </div>
    );
  }

  const pct = stats.stravaActivities > 0
    ? Math.round((stats.withSegments / stats.stravaActivities) * 100)
    : 0;

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>赛段数据补全</h2>
        <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>segments / efforts / PR</span>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "0 0 16px", lineHeight: 1.6 }}>
        赛段数据来自 intervals.icu（通过 Strava 活动关联）。补拉后可在「赛段」页面查看 PR 趋势和赛段分析。
      </p>

      <div className="segment-coverage-grid">
        <div className="coverage-stat">
          <span className="coverage-stat-value">{stats.stravaActivities}</span>
          <span className="coverage-stat-label">Strava 活动</span>
        </div>
        <div className="coverage-stat">
          <span className="coverage-stat-value coverage-good">{stats.withSegments}</span>
          <span className="coverage-stat-label">已拉取赛段</span>
        </div>
        <div className="coverage-stat">
          <span className="coverage-stat-value coverage-warn">{stats.missingSegments}</span>
          <span className="coverage-stat-label">待补拉</span>
        </div>
        <div className="coverage-stat">
          <span className="coverage-stat-value">{pct}%</span>
          <span className="coverage-stat-label">覆盖率</span>
        </div>
      </div>

      <div className="coverage-track">
        <div className="coverage-fill" style={{ width: `${pct}%` }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <button
          onClick={run}
          disabled={loading || stats.missingSegments === 0}
          className="btn-primary btn-generate"
          style={{ width: "auto", padding: "10px 20px", fontSize: "0.88rem" }}
        >
          {loading ? "处理中..." : stats.missingSegments === 0 ? "已全部补全 ✓" : `补拉 ${stats.missingSegments} 条活动赛段`}
        </button>
      </div>
      {result && <p style={{ marginTop: 10, fontSize: "0.82rem", color: "var(--muted)" }}>{result}</p>}
    </div>
  );
}
