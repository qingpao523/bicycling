"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 300_000; // 5 minutes

interface PollResult {
  newActivities: number;
  totalChecked: number;
  lastSeenId: string | null;
  skipped?: string;
  error?: string;
}

interface UseActivityPollOptions {
  /** Whether to start polling automatically (default: true) */
  enabled?: boolean;
  /** Callback when new activities are detected */
  onNewActivities?: (count: number) => void;
}

export function useActivityPoll(options: UseActivityPollOptions = {}) {
  const { enabled = true, onNewActivities } = options;
  const [paused, setPaused] = useState(false);
  const [lastResult, setLastResult] = useState<PollResult | null>(null);
  const [polling, setPolling] = useState(false);
  const [newActivityBanner, setNewActivityBanner] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onNewActivitiesRef = useRef(onNewActivities);
  onNewActivitiesRef.current = onNewActivities;

  const poll = useCallback(async () => {
    if (!mountedRef.current) return;
    setPolling(true);
    try {
      const res = await fetch("/api/sync/poll", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLastResult({
          newActivities: 0,
          totalChecked: 0,
          lastSeenId: null,
          error: (body as Record<string, unknown>).error
            ? String((body as Record<string, unknown>).error)
            : `HTTP ${res.status}`,
        });
        return;
      }
      const data = (await res.json()) as PollResult;
      if (!mountedRef.current) return;
      setLastResult(data);
      if (data.newActivities > 0) {
        setNewActivityBanner(data.newActivities);
        onNewActivitiesRef.current?.(data.newActivities);
      }
    } catch {
      if (!mountedRef.current) return;
      setLastResult({
        newActivities: 0,
        totalChecked: 0,
        lastSeenId: null,
        error: "网络错误",
      });
    } finally {
      if (mountedRef.current) setPolling(false);
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setNewActivityBanner(0);
  }, []);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Schedule recurring polls
  useEffect(() => {
    if (!enabled || paused) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Initial poll after a short delay (don't block page load)
    const initialDelay = setTimeout(() => {
      void poll();
    }, 5_000);

    // Recurring poll
    const interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, paused, poll]);

  return {
    /** Whether a poll request is in-flight */
    polling,
    /** Whether polling is paused */
    paused,
    /** Most recent poll result */
    lastResult,
    /** Number of new activities detected (for banner display) */
    newActivityBanner,
    /** Dismiss the new-activity banner */
    dismissBanner,
    /** Pause automatic polling */
    pause,
    /** Resume automatic polling */
    resume,
    /** Trigger an immediate poll */
    pollNow: poll,
  };
}
