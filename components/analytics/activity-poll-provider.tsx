"use client";

import { RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { useActivityPoll } from "@/lib/hooks/use-activity-poll";

/**
 * A client component that runs the 5-minute activity poll in the background.
 * When new activities are detected from ICU, displays a non-intrusive banner
 * that the user can click to refresh the page or dismiss.
 */
export function ActivityPollProvider() {
  const router = useRouter();
  const { newActivityBanner, dismissBanner } = useActivityPoll({
    enabled: true,
    onNewActivities: () => {
      // Could play a sound or trigger other side effects here
    },
  });

  if (newActivityBanner <= 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        right: "1rem",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        borderRadius: "0.5rem",
        backgroundColor: "var(--poll-banner-bg, #1d4ed8)",
        color: "var(--poll-banner-fg, #ffffff)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        fontSize: "0.875rem",
        fontWeight: 500,
        maxWidth: "24rem",
      }}
    >
      <RefreshCw size={16} style={{ flexShrink: 0 }} />
      <span>
        检测到 {newActivityBanner} 条新活动，已加入同步队列
      </span>
      <button
        type="button"
        onClick={() => {
          dismissBanner();
          router.refresh();
        }}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "none",
          borderRadius: "0.25rem",
          padding: "0.25rem 0.5rem",
          color: "inherit",
          cursor: "pointer",
          fontSize: "0.8125rem",
          whiteSpace: "nowrap",
        }}
      >
        刷新页面
      </button>
      <button
        type="button"
        onClick={dismissBanner}
        style={{
          background: "none",
          border: "none",
          padding: "0.125rem",
          color: "inherit",
          cursor: "pointer",
          opacity: 0.7,
          flexShrink: 0,
        }}
        aria-label="关闭"
      >
        <X size={14} />
      </button>
    </div>
  );
}
