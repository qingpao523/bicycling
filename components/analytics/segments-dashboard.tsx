"use client";

import { useState, useMemo } from "react";
import type { Segment, SegmentEffort, Activity } from "@/lib/types";
import type { PmcDataPoint } from "@/lib/engine/pmc";
import { buildSegmentHistory, correlateSegmentWithTraining, predictSegmentEta, analyzeSegmentCausation, recommendSegments, type SegmentAbilityGrade } from "@/lib/engine/segments";

import { SegmentPrDashboard } from "./segment-pr-dashboard";
import { SegmentClassificationTable } from "./segment-classification-table";
import { SegmentHistoryChart } from "./segment-history-chart";
import { SegmentCorrelationChart } from "./segment-correlation-chart";
import { SegmentPredictionCard } from "./segment-prediction-card";
import { SegmentCausationCard } from "./segment-causation-card";
import { SegmentRecommendList } from "./segment-recommend-list";
import { SegmentLeaderboard } from "./segment-leaderboard";
import { SegmentBackfillPanel } from "./segment-backfill-panel";

type Props = {
  segments: Segment[];
  efforts: SegmentEffort[];
  activities: Activity[];
  pmcData: PmcDataPoint[];
  user: { ftp?: number; weightKg?: number };
  grades: Record<string, SegmentAbilityGrade>;
  backfillStats: { totalActivities: number; stravaActivities: number; withSegments: number; missingSegments: number };
};

type Tab = "overview" | "history" | "analysis" | "recommend" | "leaderboard" | "tools";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "概览" },
  { key: "history", label: "历史" },
  { key: "analysis", label: "分析" },
  { key: "recommend", label: "推荐" },
  { key: "leaderboard", label: "排行" },
  { key: "tools", label: "工具" },
];

export function SegmentsDashboard({ segments, efforts, activities, pmcData, user, grades, backfillStats }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(segments[0]?.id ?? null);

  // O(n) index: group efforts by segmentId once
  const effortsBySegment = useMemo(() => {
    const map = new Map<string, SegmentEffort[]>();
    for (const e of efforts) {
      let arr = map.get(e.segmentId);
      if (!arr) { arr = []; map.set(e.segmentId, arr); }
      arr.push(e);
    }
    return map;
  }, [efforts]);

  // Selected segment data
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId) ?? null;
  const selectedEfforts = selectedSegmentId ? (effortsBySegment.get(selectedSegmentId) ?? []) : [];
  const selectedHistory = selectedSegment ? buildSegmentHistory(selectedEfforts, selectedSegment) : null;
  const selectedCorrelation = selectedSegment && selectedEfforts.length >= 3
    ? correlateSegmentWithTraining({ efforts: selectedEfforts, segment: selectedSegment, pmcData })
    : null;
  const selectedPrediction = selectedSegment && selectedHistory && selectedHistory.bestTime > 0
    ? predictSegmentEta({ efforts: selectedEfforts, targetTime: Math.round(selectedHistory.bestTime * 0.95) })
    : null;
  const selectedCausation = selectedSegment
    ? analyzeSegmentCausation({ efforts: selectedEfforts, segment: selectedSegment, activities, pmcData })
    : null;

  const recommendations = recommendSegments({
    segments, efforts, userFtp: user.ftp, userWeightKg: user.weightKg,
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "6px 16px", borderRadius: 8, border: "1px solid var(--line, #e5e7eb)",
            background: tab === t.key ? "var(--accent, #1f57d6)" : "transparent",
            color: tab === t.key ? "white" : "var(--muted)", fontSize: "0.88rem", cursor: "pointer", fontWeight: 600,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <>
          <SegmentPrDashboard efforts={efforts} segments={segments} />
          <SegmentClassificationTable segments={segments} grades={grades} />
        </>
      )}

      {tab === "history" && (
        <>
          {/* Segment selector */}
          <div className="analytics-card" style={{ padding: 14 }}>
            <label style={{ fontSize: "0.88rem", fontWeight: 600 }}>
              选择赛段
              <select
                value={selectedSegmentId ?? ""}
                onChange={(e) => setSelectedSegmentId(e.target.value || null)}
                style={{ marginLeft: 10, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--line, #e5e7eb)", fontSize: "0.85rem" }}
              >
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({(s.distance / 1000).toFixed(1)}km)</option>
                ))}
              </select>
            </label>
          </div>
          {selectedHistory && selectedSegment && (
            <SegmentHistoryChart history={selectedHistory} segment={selectedSegment} />
          )}
        </>
      )}

      {tab === "analysis" && selectedSegment && (
        <>
          {selectedCorrelation && <SegmentCorrelationChart correlation={selectedCorrelation} />}
          {selectedPrediction && <SegmentPredictionCard prediction={selectedPrediction} segment={selectedSegment} />}
          {selectedCausation && <SegmentCausationCard causation={selectedCausation} />}
          {!selectedCorrelation && !selectedPrediction && !selectedCausation && (
            <div className="analytics-card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
              选择一个有 3 次以上尝试的赛段查看深度分析
            </div>
          )}
        </>
      )}

      {tab === "recommend" && <SegmentRecommendList recommendations={recommendations} />}
      {tab === "leaderboard" && <SegmentLeaderboard efforts={efforts} segments={segments} />}
      {tab === "tools" && <SegmentBackfillPanel stats={backfillStats} />}
    </div>
  );
}
