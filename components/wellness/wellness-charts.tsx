"use client";

interface ChartDataPoint {
  date: string;
  hrv: number | null;
  restingHr: number | null;
  sleepHours: number | null;
  sleepScore: number | null;
}

interface WellnessChartsProps {
  data: ChartDataPoint[];
}

function MiniChart({
  data,
  label,
  unit,
  color,
}: {
  data: (number | null)[];
  label: string;
  unit: string;
  color: string;
}) {
  const valid = data.filter((v): v is number => v != null);
  if (valid.length < 2) {
    return (
      <div className="wellness-chart-card">
        <h4>{label}</h4>
        <p className="wellness-chart-empty">数据不足</p>
      </div>
    );
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const latest = valid[valid.length - 1];

  const width = 200;
  const height = 60;
  const points = data
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 10) - 5;
      return `${x},${y}`;
    })
    .filter(Boolean);

  return (
    <div className="wellness-chart-card">
      <div className="wellness-chart-header">
        <h4>{label}</h4>
        <span className="wellness-chart-value" style={{ color }}>
          {latest} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="wellness-chart-svg">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          points={points.join(" ")}
        />
      </svg>
    </div>
  );
}

export function WellnessCharts({ data }: WellnessChartsProps) {
  return (
    <div className="wellness-charts-grid">
      <MiniChart
        data={data.map((d) => d.hrv)}
        label="HRV"
        unit="ms"
        color="#8b5cf6"
      />
      <MiniChart
        data={data.map((d) => d.restingHr)}
        label="静息心率"
        unit="bpm"
        color="#ef4444"
      />
      <MiniChart
        data={data.map((d) => d.sleepHours)}
        label="睡眠时长"
        unit="h"
        color="#3b82f6"
      />
      <MiniChart
        data={data.map((d) => d.sleepScore)}
        label="睡眠评分"
        unit=""
        color="#06b6d4"
      />
    </div>
  );
}
