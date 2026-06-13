"use client";

import { MessageCircle } from "lucide-react";

export default function ChatPage() {
  return (
    <div
      className="chat-main"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: "60vh",
        gap: 16,
        color: "var(--muted)",
        textAlign: "center",
        padding: "0 24px",
      }}
    >
      <MessageCircle size={48} strokeWidth={1.5} />
      <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
        AI 骑行助手
      </h2>
      <p style={{ fontSize: "0.9rem", maxWidth: 320, lineHeight: 1.6 }}>
        AI 功能建设中，敬请期待
      </p>
    </div>
  );
}
