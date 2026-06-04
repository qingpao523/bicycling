"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";

export default function FeedbackPage() {
  const [type, setType] = useState("feature_request");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) { setError("请填写标题"); return; }
    if (title.length > 100) { setError("标题不能超过 100 字符"); return; }
    if (!description.trim()) { setError("请填写详细描述"); return; }
    if (description.length > 2000) { setError("描述不能超过 2000 字符"); return; }

    try {
      const res = await fetch("/api/analytics/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, description, priority, pagePath: window.location.pathname }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTitle("");
        setDescription("");
      } else {
        setError("提交失败，请重试");
      }
    } catch {
      setError("网络错误，请重试");
    }
  }

  if (submitted) {
    return (
      <div>
        <div className="analytics-page-header">
          <h1>意见反馈</h1>
          <p>提交功能建议和问题反馈</p>
        </div>
        <div className="analytics-card" style={{ textAlign: "center", padding: 48 }}>
          <CheckCircle2 size={48} style={{ color: "var(--ok)", marginBottom: 16 }} />
          <h2>反馈已提交</h2>
          <p style={{ color: "var(--muted)" }}>感谢你的反馈，我们会尽快处理。</p>
          <button className="time-range-btn time-range-btn--active" onClick={() => setSubmitted(false)} style={{ marginTop: 16 }}>
            继续提交
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="analytics-page-header">
        <h1>意见反馈</h1>
        <p>提交功能建议和问题反馈</p>
      </div>

      <div className="analytics-card">
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
          {/* Type */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: 6 }}>反馈类型</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { value: "feature_request", label: "功能建议" },
                { value: "bug_report", label: "问题报告" },
                { value: "experience", label: "体验反馈" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`time-range-btn ${type === opt.value ? "time-range-btn--active" : ""}`}
                  onClick={() => setType(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: 6 }}>
              标题 <span style={{ color: "var(--muted)", fontWeight: 400 }}>({title.length}/100)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="简要描述你的反馈"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)", fontSize: "0.9rem" }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: 6 }}>
              详细描述 <span style={{ color: "var(--muted)", fontWeight: 400 }}>({description.length}/2000)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={6}
              placeholder="详细描述你的建议或遇到的问题..."
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)", fontSize: "0.9rem", resize: "vertical" }}
            />
          </div>

          {/* Priority */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: 6 }}>优先级</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { value: "high", label: "高" },
                { value: "medium", label: "中" },
                { value: "low", label: "低" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`time-range-btn ${priority === opt.value ? "time-range-btn--active" : ""}`}
                  onClick={() => setPriority(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</div>}

          <button
            type="submit"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "12px 24px", borderRadius: 12, border: "none",
              background: "var(--accent)", color: "white", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            <Send size={16} /> 提交反馈
          </button>
        </form>
      </div>
    </div>
  );
}
