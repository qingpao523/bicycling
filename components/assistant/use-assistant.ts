"use client";

import { useState, useCallback, useRef } from "react";
import type { AssistantChunk, AssistantAction, AssistantScope } from "@/lib/assistant/protocol";
import { consumeAssistantStream } from "@/lib/assistant/stream";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];
  pending?: boolean;
}

interface UseAssistantOptions {
  scope: AssistantScope;
  scopeRef?: string;
  onAction?: (action: AssistantAction) => void;
}

export function useAssistant({ scope, scopeRef, onAction }: UseAssistantOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = {
        id: `tmp_${Date.now()}`,
        role: "user",
        content: trimmed,
      };

      const assistantMsg: ChatMessage = {
        id: `tmp_a_${Date.now()}`,
        role: "assistant",
        content: "",
        actions: [],
        pending: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setLoading(true);
      setSuggestedPrompts([]);

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            message: trimmed,
            scope,
            scopeRef,
          }),
          signal: abortRef.current.signal,
        });

        await consumeAssistantStream(res, {
          onStart(id) {
            setConversationId(id);
          },
          onDelta(content) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role !== "assistant") return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + content },
              ];
            });
          },
          onAction(chunk) {
            const action = chunk.action;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role !== "assistant") return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, actions: [...(last.actions || []), action] },
              ];
            });
            if (action.kind === "suggest_prompts") {
              setSuggestedPrompts(action.prompts);
            }
            onAction?.(action);
          },
          onDone(messageId) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role !== "assistant") return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, id: messageId, pending: false },
              ];
            });
          },
          onError(error) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role !== "assistant") return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, content: `出错了：${error}`, pending: false },
              ];
            });
          },
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role !== "assistant") return prev;
            return [
              ...prev.slice(0, -1),
              { ...last, content: "网络错误，请稍后重试。", pending: false },
            ];
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [conversationId, scope, scopeRef, loading, onAction],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setSuggestedPrompts([]);
    setLoading(false);
  }, []);

  return { messages, loading, suggestedPrompts, sendMessage, reset, conversationId };
}
