"use client";

import { useState, useEffect, useRef } from "react";
import { Download, RefreshCw, CheckCircle2, AlertCircle, Database, ArrowRight } from "lucide-react";

interface BackfillStats {
  total: number;
  withStreams: number;
  withoutStreams: number;
  withoutStreamsWithPower: number;
  bySource: Record<string, { total: number; withStreams: number; withoutStreams: number }>;
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

export function StreamBackfillPanel() {
  const [stats, setStats] = useState<BackfillStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [limit, setLimit] = useState(9999);
  const [source, setSource] = useState<"all" | "intervals.icu" | "strava">("all");
  const [onlyWithPower, setOnlyWithPower] = useState(true);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<Progress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function loadStats() {
    try {
      const res = await fetch("/api/analytics/backfill", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function startBackfill() {
    if (running) return;
    setRunning(true);
    setError("");
    setLastResult(null);
    setProgress({ total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/analytics/backfill/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, source, onlyWithPower }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.text();
        setError(err || "启动失败");
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
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const data = JSON.parse(payload);
            if (data.type === "progress") {
              setProgress(data.progress);
            } else if (data.type === "done") {
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
      if (e?.name !== "AbortError") {
        setError(e?.message || "网络错误");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setRunning(false);
  }

  if (loading) {
    return (
      <div style={{ padding: 24, background: "var(--surface-alt)", borderRadius: 12, textAlign: "center", color: "var(--muted)" }}>
        <RefreshCw size={18} style={{ animation: "spin 1.2s linear infinite" }} /> 加载中...
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const completionRate = stats && stats.total > 0 ? (stats.withStreams / stats.total) * 100 : 0;
  const progressPct = progress && progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Stats Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div style={{ padding: 14, background: "var(--surface-alt)", borderRadius: 10 }}>
          <div className="eyebrow">活动总数</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{stats?.total ?? 0}</div>
        </div>
        <div style={{ padding: 14, background: "rgba(15,138,98,0.08)", borderRadius: 10 }}>
          <div className="eyebrow" style={{ color: "var(--ok)" }}>有完整流数据</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--ok)" }}>{stats?.withStreams ?? 0}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{completionRate.toFixed(0)}%</div>
        </div>
        <div style={{ padding: 14, background: "rgba(245,158,11,0.08)", borderRadius: 10 }}>
          <div className="eyebrow" style={{ color: "var(--cta)" }}>缺失流数据</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cta)" }}>{stats?.withoutStreams ?? 0}</div>
        </div>
        <div style={{ padding: 14, background: "rgba(31,87,214,0.08)", borderRadius: 10 }}>
          <div className="eyebrow" style={{ color: "var(--accent)" }}>有功率但缺流数据</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--accent)" }}>{stats?.withoutStreamsWithPower ?? 0}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>推荐优先补拉</div>
        </div>
      </div>

      {/* By Source Breakdown */}
      {stats && Object.keys(stats.bySource).length > 0 && (
        <div style={{ padding: 14, background: "var(--surface-alt)", borderRadius: 10 }}>
          <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 8 }}>按来源分布</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(stats.bySource).map(([src, s]) => (
              <div key={src} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ minWidth: 120, fontWeight: 600 }}>{src}</span>
                <div style={{ flex: 1, height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(s.withStreams / s.total) * 100}%`, background: "var(--ok)" }} />
                </div>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)", minWidth: 100, textAlign: "right" }}>
                  {s.withStreams}/{s.total} 有流数据
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Options */}
      <div style={{ padding: 16, background: "white", border: "1px solid var(--line)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>补拉配置</h3>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.88rem" }}>
            补拉数量
            <input
              type="number"
              min={1}
              max={9999}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 9999))}
              disabled={running}
              style={{ width: 80, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
            />
            条 (默认全部)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.88rem" }}>
            数据来源
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as any)}
              disabled={running}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
            >
              <option value="all">全部</option>
              <option value="intervals.icu">intervals.icu</option>
              <option value="strava">Strava</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.88rem" }}>
            <input type="checkbox" checked={onlyWithPower} onChange={(e) => setOnlyWithPower(e.target.checked)} disabled={running} />
            仅补拉有功率的活动
          </label>
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          💡 建议先补拉 "有功率但缺流数据" 的活动（{stats?.withoutStreamsWithPower ?? 0} 条）。批量补拉会使用 API 频率限制（30 次/分钟）以避免被限流。
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!running ? (
            <button
              onClick={startBackfill}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Download size={16} /> 开始补拉
            </button>
          ) : (
            <>
              <button
                disabled
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--accent)",
                  color: "white",
                  fontWeight: 600,
                  opacity: 0.7,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <RefreshCw size={16} style={{ animation: "spin 1.2s linear infinite" }} /> 正在补拉...
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
      </div>

      {/* Live Progress */}
      {running && progress && (
        <div style={{ padding: 16, background: "rgba(31,87,214,0.04)", borderRadius: 12, border: "1px solid rgba(31,87,214,0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong>正在进行: {progress.processed} / {progress.total}</strong>
            <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
              {progressPct.toFixed(1)}%
            </span>
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

      {/* Last Result */}
      {lastResult && !running && (
        <div style={{ padding: 16, background: "rgba(15,138,98,0.06)", borderRadius: 12, borderLeft: "4px solid var(--ok)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle2 size={20} style={{ color: "var(--ok)" }} />
            <strong>补拉完成</strong>
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--text)" }}>
            成功 <strong>{lastResult.succeeded}</strong> 条 · 跳过 <strong>{lastResult.skipped}</strong> 条
            {lastResult.failed > 0 && <> · 失败 <strong style={{ color: "var(--danger)" }}>{lastResult.failed}</strong> 条</>}
          </div>
          {lastResult.errors.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: "0.82rem", color: "var(--muted)", cursor: "pointer" }}>查看失败详情 ({lastResult.errors.length})</summary>
              <div style={{ marginTop: 8, maxHeight: 200, overflowY: "auto", fontSize: "0.82rem" }}>
                {lastResult.errors.slice(0, 20).map((err, i) => (
                  <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ fontWeight: 500 }}>{err.name}</div>
                    <div style={{ color: "var(--danger)", fontSize: "0.78rem" }}>{err.error}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: 16, background: "rgba(196,77,59,0.06)", borderRadius: 12, borderLeft: "4px solid var(--danger)", display: "flex", gap: 10 }}>
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

/**
 * Single activity backfill button (for use on activity detail pages)
 */
export function SingleActivityBackfillButton({ activityId, onSuccess }: { activityId: string; onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setLoading(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/analytics/backfill/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
        setMessage("流数据补拉成功，刷新后查看");
        onSuccess?.();
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setStatus("error");
        setMessage(data.error || "拉取失败");
      }
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        onClick={handleClick}
        disabled={loading}
        className="button"
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        {loading ? <RefreshCw size={14} style={{ animation: "spin 1.2s linear infinite" }} /> : <Download size={14} />}
        {loading ? "拉取中..." : "补拉流数据"}
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {status === "success" && <span style={{ fontSize: "0.82rem", color: "var(--ok)" }}>✓ {message}</span>}
      {status === "error" && <span style={{ fontSize: "0.82rem", color: "var(--danger)" }}>✗ {message}</span>}
    </div>
  );
}
