"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, Gauge, HeartPulse, X } from "lucide-react";

type StreamKey = "watts" | "velocity_smooth" | "heartrate";
type ChartPoint = { index: number; time: number; value: number };

const CHART_WIDTH = 720;
const CHART_HEIGHT = 320;
const CHART_MARGIN = { top: 18, right: 18, bottom: 38, left: 56 };

function toNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "number" ? item : typeof item === "string" && item.trim() ? Number(item) : undefined))
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function formatDurationLabel(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h${minutes.toString().padStart(2, "0")}`;
}

function formatValue(value: number, unit: string) {
  if (!Number.isFinite(value)) return "--";
  const digits = unit === "km/h" ? 1 : 0;
  return `${value.toFixed(digits)} ${unit}`;
}

function buildSampledPoints(values: number[], times: number[], limit = 260) {
  if (!values.length) return [] as ChartPoint[];
  const step = values.length <= limit ? 1 : values.length / limit;

  return Array.from({ length: Math.min(values.length, limit) }, (_, index) => {
    const sourceIndex = values.length <= limit ? index : Math.min(values.length - 1, Math.floor(index * step));
    return {
      index: sourceIndex,
      time: times[sourceIndex] ?? sourceIndex,
      value: values[sourceIndex],
    };
  }).filter((point, index, array) => index === 0 || point.index !== array[index - 1]?.index);
}

function buildLinearTrend(values: ChartPoint[]) {
  const count = values.length;
  if (count < 2) return [] as ChartPoint[];

  const sumX = values.reduce((total, point) => total + point.index, 0);
  const sumY = values.reduce((total, point) => total + point.value, 0);
  const sumXY = values.reduce((total, point) => total + point.index * point.value, 0);
  const sumXX = values.reduce((total, point) => total + point.index * point.index, 0);
  const denominator = count * sumXX - sumX * sumX;

  if (!denominator) return values;

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;

  return values.map((point) => ({ ...point, value: intercept + slope * point.index }));
}

function getTickValues(min: number, max: number, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (Math.abs(max - min) < 0.0001) return [min];
  return Array.from({ length: count }, (_, index) => min + ((max - min) / (count - 1)) * index);
}

function describeTrend(first: number, last: number, unit: string) {
  if (!Number.isFinite(first) || !Number.isFinite(last)) return "暂无趋势";
  return `从 ${formatValue(first, unit)} 到 ${formatValue(last, unit)}`;
}

function averageNumbers(values: number[]) {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getIntervalAverage(points: ChartPoint[], position: "start" | "end", unit: string) {
  if (!points.length) return undefined;

  const windowSize = Math.min(points.length, Math.max(12, Math.round(points.length * 0.08)));
  const slice = position === "start" ? points.slice(0, windowSize) : points.slice(-windowSize);
  const filtered =
    unit === "W" || unit === "km/h"
      ? slice.filter((point) => point.value > 0).map((point) => point.value)
      : slice.filter((point) => point.value > 0).map((point) => point.value);

  return averageNumbers(filtered.length ? filtered : slice.map((point) => point.value));
}

function StreamChart({
  label,
  unit,
  color,
  values,
  times,
}: {
  label: string;
  unit: string;
  color: string;
  values: number[];
  times: number[];
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const sampled = useMemo(() => buildSampledPoints(values, times), [values, times]);
  const trendPoints = useMemo(() => buildLinearTrend(sampled), [sampled]);
  const chartInnerWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
  const chartInnerHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const minValue = sampled.length ? Math.min(...sampled.map((point) => point.value)) : 0;
  const maxValue = sampled.length ? Math.max(...sampled.map((point) => point.value)) : 0;
  const avgValue = sampled.length ? sampled.reduce((sum, point) => sum + point.value, 0) / sampled.length : 0;
  const firstValue = getIntervalAverage(sampled, "start", unit);
  const lastValue = getIntervalAverage(sampled, "end", unit);
  const totalSeconds = sampled[sampled.length - 1]?.time ?? 0;
  const valuePadding = Math.max((maxValue - minValue) * 0.08, unit === "km/h" ? 1 : 4);
  const domainMin = sampled.length ? minValue - valuePadding : 0;
  const domainMax = sampled.length ? maxValue + valuePadding : 100;
  const domainSpan = Math.max(domainMax - domainMin, 1);
  const yTicks = getTickValues(domainMin, domainMax, 5);
  const xTicks = sampled.length
    ? Array.from({ length: 6 }, (_, index) => {
        const pointIndex = Math.min(sampled.length - 1, Math.round((index / 5) * (sampled.length - 1)));
        return sampled[pointIndex];
      }).filter((point, index, array) => index === 0 || point.index !== array[index - 1]?.index)
    : [];

  const toX = (point: ChartPoint) => CHART_MARGIN.left + (point.time / Math.max(totalSeconds, 1)) * chartInnerWidth;
  const toY = (point: ChartPoint) =>
    CHART_MARGIN.top + chartInnerHeight - ((point.value - domainMin) / domainSpan) * chartInnerHeight;

  const linePath = sampled
    .map((point, index) => `${index === 0 ? "M" : "L"}${toX(point).toFixed(2)} ${toY(point).toFixed(2)}`)
    .join(" ");
  const trendPath = trendPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${toX(point).toFixed(2)} ${toY(point).toFixed(2)}`)
    .join(" ");
  const areaPath = sampled.length
    ? `${linePath} L${toX(sampled[sampled.length - 1]).toFixed(2)} ${(CHART_MARGIN.top + chartInnerHeight).toFixed(2)} L${toX(sampled[0]).toFixed(2)} ${(CHART_MARGIN.top + chartInnerHeight).toFixed(2)} Z`
    : "";

  const hoveredPoint = hoverIndex == null ? null : sampled[hoverIndex] ?? null;

  return (
    <div className="stream-chart-card">
      <div className="stream-chart-head">
        <div>
          <strong>{label}</strong>
          <span>{sampled.length ? `${describeTrend(firstValue ?? 0, lastValue ?? 0, unit)}，均值 ${formatValue(avgValue, unit)}` : "暂无流数据"}</span>
        </div>
        <div className="stream-chart-meta">
          <span>最低 {formatValue(minValue, unit)}</span>
          <span>最高 {formatValue(maxValue, unit)}</span>
          <span>时长 {formatDurationLabel(totalSeconds)}</span>
        </div>
      </div>
      <div className="stream-chart-stat-row">
        <div className="stream-chart-stat">
          <span>起点</span>
          <strong>{formatValue(firstValue ?? 0, unit)}</strong>
        </div>
        <div className="stream-chart-stat">
          <span>终点</span>
          <strong>{formatValue(lastValue ?? 0, unit)}</strong>
        </div>
        <div className="stream-chart-stat">
          <span>均值</span>
          <strong>{formatValue(avgValue, unit)}</strong>
        </div>
      </div>
      <div
        className="stream-chart-frame"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(event) => {
          if (!sampled.length) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const relativeX = Math.min(Math.max(event.clientX - bounds.left, CHART_MARGIN.left), bounds.width - CHART_MARGIN.right);
          const ratio = (relativeX - CHART_MARGIN.left) / Math.max(bounds.width - CHART_MARGIN.left - CHART_MARGIN.right, 1);
          const nextIndex = Math.min(sampled.length - 1, Math.max(0, Math.round(ratio * (sampled.length - 1))));
          setHoverIndex(nextIndex);
        }}
      >
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="stream-chart-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`stream-fill-${label}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = CHART_MARGIN.top + chartInnerHeight - ((tick - domainMin) / domainSpan) * chartInnerHeight;
            return (
              <g key={tick}>
                <line x1={CHART_MARGIN.left} y1={y} x2={CHART_MARGIN.left + chartInnerWidth} y2={y} className="stream-chart-grid" />
                <text x={CHART_MARGIN.left - 10} y={y + 4} className="stream-chart-axis-label">
                  {unit === "km/h" ? tick.toFixed(1) : Math.round(tick)}
                </text>
              </g>
            );
          })}

          {xTicks.map((point) => {
            const x = toX(point);
            return (
              <g key={point.index}>
                <line x1={x} y1={CHART_MARGIN.top} x2={x} y2={CHART_MARGIN.top + chartInnerHeight} className="stream-chart-grid vertical" />
                <text x={x} y={CHART_MARGIN.top + chartInnerHeight + 24} textAnchor="middle" className="stream-chart-axis-label">
                  {formatDurationLabel(point.time)}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill={`url(#stream-fill-${label})`} />
          <path d={linePath} fill="none" stroke={color} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={trendPath} fill="none" stroke="rgba(18, 32, 58, 0.48)" strokeWidth="2" strokeDasharray="7 6" />

          {hoveredPoint ? (
            <g>
              <line x1={toX(hoveredPoint)} y1={CHART_MARGIN.top} x2={toX(hoveredPoint)} y2={CHART_MARGIN.top + chartInnerHeight} className="stream-chart-crosshair" />
              <line x1={CHART_MARGIN.left} y1={toY(hoveredPoint)} x2={CHART_MARGIN.left + chartInnerWidth} y2={toY(hoveredPoint)} className="stream-chart-crosshair" />
              <circle cx={toX(hoveredPoint)} cy={toY(hoveredPoint)} r="5.5" fill={color} stroke="#fff" strokeWidth="2.4" />
            </g>
          ) : null}
        </svg>
        {hoveredPoint ? (
          <div
            className="stream-chart-tooltip"
            style={{
              left: `${Math.min(Math.max(((toX(hoveredPoint) / CHART_WIDTH) * 100), 14), 86)}%`,
              top: `${Math.max(((toY(hoveredPoint) / CHART_HEIGHT) * 100) - 10, 8)}%`,
            }}
          >
            <strong>{formatValue(hoveredPoint.value, unit)}</strong>
            <span>{formatDurationLabel(hoveredPoint.time)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ActivityStreamModal({ rawStreamsJson }: { rawStreamsJson?: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<StreamKey>("watts");
  const streams = rawStreamsJson ?? {};
  const timeSeries = toNumberArray(streams.time);

  const chartData = {
    watts: toNumberArray(streams.watts),
    velocity_smooth: toNumberArray(streams.velocity_smooth).map((value) => Number((value * 3.6).toFixed(2))),
    heartrate: toNumberArray(streams.heartrate),
  };

  const chartMap = {
    watts: { label: "功率趋势", unit: "W", color: "#8b72f6", icon: Gauge },
    velocity_smooth: { label: "速度趋势", unit: "km/h", color: "#ff52d2", icon: Activity },
    heartrate: { label: "心率趋势", unit: "bpm", color: "#ff5f78", icon: HeartPulse },
  } as const;

  const activeConfig = chartMap[active];
  const activeValues = chartData[active];

  return (
    <>
      <div className="activity-stream-trigger-row">
        {(Object.keys(chartMap) as StreamKey[]).map((key) => {
          const config = chartMap[key];
          const Icon = config.icon;
          const hasData = chartData[key].length > 0;
          return (
            <button key={key} type="button" className="activity-stream-trigger" onClick={() => { setActive(key); setOpen(true); }} disabled={!hasData}>
              <Icon size={15} />
              {config.label}
            </button>
          );
        })}
      </div>

      {open
        ? createPortal(
            <div className="stream-modal-backdrop" onClick={() => setOpen(false)}>
              <div className="stream-modal" onClick={(event) => event.stopPropagation()}>
                <div className="stream-modal-head">
                  <div>
                    <h3>趋势图参考</h3>
                    <p className="muted">基于本次活动同步下来的原始时序流，不改变当前页面结构。</p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} aria-label="关闭趋势图">
                    <X size={16} />
                  </button>
                </div>
                <div className="activity-glance-tab-list stream-modal-tabs">
                  {(Object.keys(chartMap) as StreamKey[]).map((key) => (
                    <button key={key} type="button" className={`activity-glance-tab ${active === key ? "active" : ""}`} onClick={() => setActive(key)}>
                      {chartMap[key].label}
                    </button>
                  ))}
                </div>
                <StreamChart label={activeConfig.label} unit={activeConfig.unit} color={activeConfig.color} values={activeValues} times={timeSeries} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
