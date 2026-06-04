"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, X, RefreshCw, Trash2, Bot, User as UserIcon } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export function AiChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history when modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingHistory(true);
      try {
        const res = await fetch("/api/analytics/chat", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages ?? []);
        }
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [open]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/analytics/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "发送失败");
        // Remove the temp user message on error
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setInput(question);
      } else {
        setMessages((prev) => [...prev, data.message]);
      }
    } catch {
      setError("网络错误，请重试");
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(question);
    } finally {
      setLoading(false);
    }
  }

  async function clearHistory() {
    if (!confirm("确定清空所有对话记录？")) return;
    try {
      const res = await fetch("/api/analytics/chat", { method: "DELETE" });
      if (res.ok) {
        setMessages([]);
      }
    } catch {
      setError("清除失败");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (!open) return null;

  const suggestions = [
    "如何执行推荐的 Z2 训练？一周怎么安排？",
    "我的阈值能力弱，具体要怎么训练？",
    "现在 TSB 是 16.8，可以安排高强度训练吗？",
    "针对 100km 公路赛，应该重点训什么？",
  ];

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 20, 40, 0.45)",
          backdropFilter: "blur(4px)",
          zIndex: 2000,
          animation: "fadeIn 0.15s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          width: "min(460px, calc(100vw - 48px))",
          height: "min(640px, calc(100vh - 48px))",
          background: "white",
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(36, 60, 110, 0.25)",
          display: "flex",
          flexDirection: "column",
          zIndex: 2001,
          overflow: "hidden",
          animation: "slideIn 0.2s ease",
        }}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes dots { 0%, 20% { content: ''; } 40% { content: '·'; } 60% { content: '··'; } 80%, 100% { content: '···'; } }
        `}</style>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #1f57d6, #7c3aed)", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bot size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: "0.95rem" }}>与 AI 继续讨论</strong>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>基于你的分析报告深入探讨</div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              title="清空对话"
              style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            title="关闭"
            style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {loadingHistory ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
              <RefreshCw size={18} style={{ animation: "spin 1.2s linear infinite" }} />
              <div style={{ marginTop: 8, fontSize: "0.82rem" }}>加载历史对话...</div>
            </div>
          ) : messages.length === 0 ? (
            <div>
              <div style={{ padding: 16, borderRadius: 12, background: "var(--surface-alt)", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: 16 }}>
                👋 你好！我是你的专属骑行 AI 教练。基于你已生成的数据分析报告，我们可以继续讨论：
                <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                  <li>如何执行具体的训练建议</li>
                  <li>某个指标背后的含义</li>
                  <li>特定赛事的备战策略</li>
                  <li>周训练计划安排</li>
                </ul>
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 8 }}>试试这些问题：</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      background: "white",
                      textAlign: "left",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      color: "var(--text)",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-soft)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.background = "white"; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  gap: 10,
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: 8,
                    background: msg.role === "user" ? "var(--accent)" : "linear-gradient(135deg, #1f57d6, #7c3aed)",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {msg.role === "user" ? <UserIcon size={14} /> : <Bot size={14} />}
                </div>
                <div
                  style={{
                    maxWidth: "78%",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: msg.role === "user" ? "var(--accent)" : "var(--surface-alt)",
                    color: msg.role === "user" ? "white" : "var(--text)",
                    fontSize: "0.88rem",
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #1f57d6, #7c3aed)", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bot size={14} />
              </div>
              <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--surface-alt)", fontSize: "0.88rem", color: "var(--muted)" }}>
                <span>AI 思考中</span>
                <span style={{ display: "inline-block", width: 20 }}>
                  <span style={{ animation: "dots 1.4s infinite" }}>...</span>
                </span>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(196,77,59,0.08)", color: "var(--danger)", fontSize: "0.82rem" }}>
              ⚠️ {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", background: "var(--surface-alt)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题... (Enter 发送，Shift+Enter 换行)"
              rows={2}
              disabled={loading}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: "0.88rem",
                fontFamily: "inherit",
                resize: "none",
                outline: "none",
                background: "white",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: "none",
                background: input.trim() && !loading ? "var(--accent)" : "var(--line)",
                color: "white",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function AiChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: 10,
        border: "none",
        background: "linear-gradient(135deg, #1f57d6, #7c3aed)",
        color: "white",
        fontSize: "0.88rem",
        fontWeight: 600,
        cursor: "pointer",
        transition: "transform 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <MessageCircle size={16} /> 继续讨论
    </button>
  );
}
