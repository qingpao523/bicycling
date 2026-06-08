"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, X, Send, RotateCcw } from "lucide-react";
import { useAssistant } from "./use-assistant";
import { AssistantMessage } from "./assistant-message";
import type { AssistantScope, AssistantAction } from "@/lib/assistant/protocol";

interface AssistantPanelProps {
  mode: "panel" | "fullscreen";
  scope: AssistantScope;
  scopeRef?: string;
  onClose?: () => void;
}

export function AssistantPanel({ mode, scope, scopeRef, onClose }: AssistantPanelProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAction = (action: AssistantAction) => {
    if (action.kind === "navigate") {
      router.push(action.path);
    }
    if (action.kind === "complete_onboarding") {
      router.refresh();
    }
    if (action.kind === "sync") {
      fetch(`/api/integrations/${action.source === "intervals" ? "intervals" : "strava"}/sync`, {
        method: "POST",
      }).catch(() => {});
    }
  };

  const { messages, loading, suggestedPrompts, sendMessage, reset } = useAssistant({
    scope,
    scopeRef,
    onAction: handleAction,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (scope === "onboarding" && messages.length === 0) {
      sendMessage("__init__");
    }
  }, [scope, messages.length, sendMessage]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
      setInput("");
    }
  };

  const handleFieldSubmit = (value: string) => {
    sendMessage(value);
  };

  const handlePromptClick = (prompt: string) => {
    sendMessage(prompt);
  };

  const isFullscreen = mode === "fullscreen";

  return (
    <div className={`assistant-panel ${isFullscreen ? "assistant-panel-fullscreen" : "assistant-panel-floating"}`}>
      <div className="assistant-panel-header">
        <div className="assistant-panel-title">
          <MessageCircle size={18} />
          <span>{scope === "onboarding" ? "初始设置" : "AI 骑行助手"}</span>
        </div>
        <div className="assistant-panel-actions">
          {scope !== "onboarding" && (
            <button className="assistant-panel-btn" onClick={reset} title="新对话" type="button">
              <RotateCcw size={16} />
            </button>
          )}
          {!isFullscreen && onClose && (
            <button className="assistant-panel-btn" onClick={onClose} title="关闭" type="button">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="assistant-panel-messages" ref={scrollRef}>
        {messages.map((msg, i) => (
          <AssistantMessage
            key={msg.id}
            message={msg}
            isLast={i === messages.length - 1}
            onFieldSubmit={handleFieldSubmit}
            fieldDisabled={loading}
          />
        ))}

        {suggestedPrompts.length > 0 && !loading && (
          <div className="assistant-suggestions">
            {suggestedPrompts.map((p) => (
              <button
                key={p}
                className="assistant-suggestion"
                onClick={() => handlePromptClick(p)}
                type="button"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <form className="assistant-panel-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={scope === "onboarding" ? "输入回复..." : "问我任何骑行问题..."}
          disabled={loading}
          className="assistant-input"
        />
        <button type="submit" className="assistant-send" disabled={loading || !input.trim()}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
