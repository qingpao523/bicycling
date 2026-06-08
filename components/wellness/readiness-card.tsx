"use client";

import type { ReadinessFactor } from "@/lib/engine/readiness-engine";

interface ReadinessCardProps {
  score: number;
  label: string;
  color: string;
  factors: ReadinessFactor[];
}

export function ReadinessCard({ score, label, color, factors }: ReadinessCardProps) {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="readiness-card">
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

      <div className="readiness-factors">
        {factors.map((f) => (
          <div key={f.name} className="readiness-factor">
            <div className="readiness-factor-header">
              <span className="readiness-factor-name">{f.name}</span>
              <span className="readiness-factor-score">{f.score}</span>
            </div>
            <div className="readiness-factor-bar">
              <div
                className="readiness-factor-fill"
                style={{ width: `${f.score}%`, backgroundColor: color }}
              />
            </div>
            <span className="readiness-factor-detail">{f.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
