"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TAGS = [
  { value: "tired", label: "累了", emoji: "😴" },
  { value: "sick", label: "生病", emoji: "🤒" },
  { value: "stressed", label: "压力大", emoji: "😰" },
] as const;

interface StatusTagInputProps {
  currentTag: string | null;
  date: string;
}

export function StatusTagInput({ currentTag, date }: StatusTagInputProps) {
  const [selected, setSelected] = useState<string | null>(currentTag);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleTag(tag: string) {
    const newTag = selected === tag ? null : tag;
    setSelected(newTag);
    setSaving(true);

    try {
      await fetch("/api/wellness/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, statusTag: newTag }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="status-tag-pills">
      {TAGS.map(({ value, label, emoji }) => (
        <button
          key={value}
          type="button"
          disabled={saving}
          className={`status-pill ${selected === value ? "status-pill--active" : ""}`}
          onClick={() => handleTag(value)}
        >
          {emoji} {label}
        </button>
      ))}
    </div>
  );
}
