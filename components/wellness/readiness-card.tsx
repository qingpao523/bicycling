"use client";

import type { ReadinessFactor } from "@/lib/engine/readiness-engine";
import type { ChartDataPoint } from "./wellness-charts";
import { MiniChart } from "./wellness-charts";

interface ReadinessCardProps {
  score: number;
  label: string;
  color: string;
  factors: ReadinessFactor[];
  chartData?: ChartDataPoint[];
}

export function ReadinessCard({ score, label, color, factors, chartData }: ReadinessCardProps) {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="readiness-card">
      <div className="readiness-overview-top">
        <div className="readiness-score-ring">
          <svg viewBox="0 0 100 100" className="readiness-svg">
            <circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke="var(--border-color, #e5e7eb)"
              strokeWidth="8"
            />
            <circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="readiness-score-text">
            <span className="readiness-number" style={{ color }}>{score}</span>
            <span className="readiness-label">{label}</span>
          </div>
        </div>

        {chartData && chartData.length > 0 && (
          <div className="readiness-mini-charts">
            <MiniChart data={chartData.map((d) => d.hrv)} label="HRV" unit="ms" color="#8b5cf6" />
            <MiniChart data={chartData.map((d) => d.restingHr)} label="静息心率" unit="bpm" color="#ef4444" />
            <MiniChart data={chartData.map((d) => d.sleepHours)} label="睡眠时长" unit="h" color="#3b82f6" />
            <MiniChart data={chartData.map((d) => d.sleepScore)} label="睡眠评分" unit="" color="#06b6d4" />
          </div>
        )}
      </div>

      <div className="readiness-factors">
        {factors.map((f) => {
          const factorColor =
            f.score >= 85 ? "#22c55e" :
            f.score >= 65 ? "#84cc16" :
            f.score >= 45 ? "#eab308" :
            f.score >= 25 ? "#f97316" : "#ef4444";
          return (
            <div key={f.name} className="readiness-factor">
              <div className="readiness-factor-header">
                <span className="readiness-factor-name">{f.name}</span>
                <span className="readiness-factor-score" style={{ color: factorColor }}>{f.score}</span>
              </div>
              <div className="readiness-factor-bar">
                <div
                  className="readiness-factor-fill"
                  style={{ width: `${f.score}%`, backgroundColor: factorColor }}
                />
              </div>
              <span className="readiness-factor-detail">{f.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
