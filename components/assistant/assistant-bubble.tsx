"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { AssistantPanel } from "./assistant-panel";

export function AssistantBubble() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <AssistantPanel
          mode="panel"
          scope="global"
          onClose={() => setOpen(false)}
        />
      )}
      <button
        className="assistant-bubble"
        onClick={() => setOpen(!open)}
        aria-label="打开 AI 助手"
        type="button"
      >
        <MessageCircle size={24} />
      </button>
    </>
  );
}
