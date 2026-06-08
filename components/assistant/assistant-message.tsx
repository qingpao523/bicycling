"use client";

import type { ChatMessage } from "./use-assistant";
import { AssistantField } from "./assistant-field";
import type { AssistantAction } from "@/lib/assistant/protocol";

interface AssistantMessageProps {
  message: ChatMessage;
  isLast: boolean;
  onFieldSubmit: (value: string) => void;
  fieldDisabled?: boolean;
}

export function AssistantMessage({ message, isLast, onFieldSubmit, fieldDisabled }: AssistantMessageProps) {
  const isUser = message.role === "user";
  const collectAction = isLast
    ? message.actions?.find((a): a is Extract<AssistantAction, { kind: "collect_field" }> => a.kind === "collect_field")
    : undefined;

  return (
    <div className={`assistant-msg ${isUser ? "assistant-msg-user" : "assistant-msg-bot"}`}>
      <div className={`assistant-msg-bubble ${isUser ? "assistant-msg-bubble-user" : "assistant-msg-bubble-bot"}`}>
        <div className="assistant-msg-content">
          {message.content.split("\n").map((line, i) => (
            <p key={i} style={{ margin: line ? "0.3em 0" : 0 }}>
              {renderInlineMarkdown(line)}
            </p>
          ))}
        </div>
        {message.pending && !message.content && (
          <div className="assistant-typing">
            <span /><span /><span />
          </div>
        )}
      </div>
      {collectAction && (
        <div className="assistant-msg-field">
          <AssistantField
            action={collectAction}
            onSubmit={onFieldSubmit}
            disabled={fieldDisabled}
          />
        </div>
      )}
    </div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
}
