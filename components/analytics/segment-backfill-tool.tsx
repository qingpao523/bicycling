"use client";
import { useState, useEffect, useRef } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

interface Stats {
  totalActivities: number;
  stravaActivities: number;
  withSegments: number;
  missingSegments: number;
}

interface Progress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  currentActivity?: string;
  errors: { activityId: string; name: string; error: string }[];
}

export function SegmentBackfillTool() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [lastResult, setLastResult] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function loadStats() {
    try {
      const r = await fetch("/api/analytics/segments/backfill");
      if (r.ok) setStats(await r.json());
    } catch {}
  }

  useEffect(() => { loadStats(); }, []);

  async function startBackfill() {
    if (running) return;
    setRunning(true);
    setError("");
    setLastResult(null);
    setProgress({ total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/analytics/segments/backfill/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 9999 }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        setError(await res.text() || "启动失败");
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6).trim());
            if (data.type === "progress") setProgress(data.progress);
            else if (data.type === "done") {
              setProgress(data.progress);
              setLastResult(data.progress);
              setRunning(false);
              await loadStats();
            } else if (data.type === "error") {
              setError(data.error);
              setRunning(false);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || "网络错误");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setRunning(false);
  }

  if (!stats) {
    return (
      <div className="analytics-card">
        <div className="analytics-card-header"><h2>赛段数据补全</h2></div>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>加载中...</p>
      </div>
    );
  }

  const pct = stats.stravaActivities > 0
    ? Math.round((stats.withSegments / stats.stravaActivities) * 100)
    : 0;
  const progressPct = progress && progress.total > 0
    ? (progress.processed / progress.total) * 100
    : 0;

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>赛段数据补全</h2>
        <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>segments / efforts / PR</span>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "0 0 16px", lineHeight: 1.6 }}>
        为缺失赛段的活动补拉赛段数据。补拉后可在「赛段」页面查看 PR 趋势和赛段分析。
      </p>

      <div className="segment-coverage-grid">
        <div className="coverage-stat">
          <span className="coverage-stat-value">{stats.stravaActivities}</span>
          <span className="coverage-stat-label">活动总数</span>
        </div>
        <div className="coverage-stat">
          <span className="coverage-stat-value coverage-good">{stats.withSegments}</span>
          <span className="coverage-stat-label">已有赛段</span>
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
        {!running ? (
          <button
            onClick={startBackfill}
            disabled={stats.missingSegments === 0}
            className="btn-primary btn-generate"
            style={{ width: "auto", padding: "10px 20px", fontSize: "0.88rem" }}
          >
            {stats.missingSegments === 0 ? "已全部补全 ✓" : `补拉 ${stats.missingSegments} 条活动赛段`}
          </button>
        ) : (
          <>
            <button
              disabled
              className="btn-primary btn-generate"
              style={{ width: "auto", padding: "10px 20px", fontSize: "0.88rem", opacity: 0.7 }}
            >
              <RefreshCw size={14} style={{ animation: "spin 1.2s linear infinite", marginRight: 6 }} />
              正在补拉...
            </button>
            <button
              onClick={cancel}
              style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--line)", background: "white", cursor: "pointer" }}
            >
              取消
            </button>
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {running && progress && (
        <div style={{ marginTop: 16, padding: 16, background: "rgba(31,87,214,0.04)", borderRadius: 12, border: "1px solid rgba(31,87,214,0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <strong>进度: {progress.processed} / {progress.total}</strong>
            <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>{progressPct.toFixed(1)}%</span>
          </div>
          <div style={{ height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--accent)", transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: "0.82rem" }}>
            <span style={{ color: "var(--ok)" }}>✓ 成功: {progress.succeeded}</span>
            <span style={{ color: "var(--cta)" }}>⊘ 跳过: {progress.skipped}</span>
            {progress.failed > 0 && <span style={{ color: "var(--danger)" }}>✗ 失败: {progress.failed}</span>}
          </div>
          {progress.currentActivity && (
            <div style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              当前: {progress.currentActivity}
            </div>
          )}
        </div>
      )}

      {lastResult && !running && (
        <div style={{ marginTop: 16, padding: 16, background: "rgba(15,138,98,0.06)", borderRadius: 12, borderLeft: "4px solid var(--ok)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle2 size={20} style={{ color: "var(--ok)" }} />
            <strong>补拉完成</strong>
          </div>
          <div style={{ fontSize: "0.88rem" }}>
            成功 <strong>{lastResult.succeeded}</strong> 条 · 跳过 <strong>{lastResult.skipped}</strong> 条
            {lastResult.failed > 0 && <> · 失败 <strong style={{ color: "var(--danger)" }}>{lastResult.failed}</strong> 条</>}
          </div>
          {lastResult.errors.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: "0.82rem", color: "var(--muted)", cursor: "pointer" }}>查看详情 ({lastResult.errors.length})</summary>
              <div style={{ marginTop: 8, maxHeight: 200, overflowY: "auto", fontSize: "0.82rem" }}>
                {lastResult.errors.slice(0, 30).map((err, i) => (
                  <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ fontWeight: 500 }}>{err.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{err.error}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 16, padding: 16, background: "rgba(196,77,59,0.06)", borderRadius: 12, borderLeft: "4px solid var(--danger)", display: "flex", gap: 10 }}>
          <AlertCircle size={20} style={{ color: "var(--danger)", flexShrink: 0 }} />
          <div>
            <strong>补拉失败</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "var(--muted)" }}>{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
