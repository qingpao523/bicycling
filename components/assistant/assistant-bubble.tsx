"use client";

import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { AssistantPanel } from "./assistant-panel";
import type { AssistantScope } from "@/lib/assistant/protocol";

interface AssistantBubbleProps {
  autoOpen?: boolean;
  scope?: AssistantScope;
  onboardingPending?: boolean;
}

const SESSION_KEY = "assistant_greeted";

export function AssistantBubble({
  autoOpen = false,
  scope = "global",
  onboardingPending = false,
}: AssistantBubbleProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpen && !sessionStorage.getItem(SESSION_KEY)) {
      setOpen(true);
      if (!onboardingPending) {
        sessionStorage.setItem(SESSION_KEY, "1");
      }
    }
  }, [autoOpen, onboardingPending]);

  const handleClose = () => {
    setOpen(false);
    if (!onboardingPending) {
      sessionStorage.setItem(SESSION_KEY, "1");
    }
  };

  return (
    <>
      {open && (
        <AssistantPanel
          mode="panel"
          scope={scope}
          onClose={handleClose}
        />
      )}
      <button
        className={`assistant-bubble ${onboardingPending && !open ? "assistant-bubble--pulse" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="打开 AI 助手"
        type="button"
      >
        <MessageCircle size={24} />
        {onboardingPending && !open && (
          <span className="assistant-bubble-badge">设置</span>
        )}
      </button>
    </>
  );
}
