"use client";

import { useState, type FormEvent } from "react";
import type { AssistantAction } from "@/lib/assistant/protocol";

type CollectFieldAction = Extract<AssistantAction, { kind: "collect_field" }>;

interface AssistantFieldProps {
  action: CollectFieldAction;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export function AssistantField({ action, onSubmit, disabled }: AssistantFieldProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() || action.skippable) {
      onSubmit(value.trim() || "skip");
    }
  };

  if (action.inputType === "select" && action.options?.length) {
    return (
      <div className="assistant-field">
        <div className="assistant-field-options">
          {action.options.map((opt) => (
            <button
              key={opt.value}
              className="assistant-field-option"
              onClick={() => onSubmit(opt.value)}
              disabled={disabled}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form className="assistant-field" onSubmit={handleSubmit}>
      <div className="assistant-field-row">
        <input
          type={action.inputType === "password" ? "password" : action.inputType === "number" ? "number" : "text"}
          className="assistant-field-input"
          placeholder={action.placeholder || action.label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          min={action.validation?.min}
          max={action.validation?.max}
          autoFocus
        />
        <button type="submit" className="assistant-field-submit" disabled={disabled || (!value.trim() && !action.skippable)}>
          确认
        </button>
      </div>
      {action.skippable && (
        <button
          type="button"
          className="assistant-field-skip"
          onClick={() => onSubmit("skip")}
          disabled={disabled}
        >
          跳过
        </button>
      )}
    </form>
  );
}
