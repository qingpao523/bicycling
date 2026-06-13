"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ChevronDown, ChevronUp } from "lucide-react";

export type ToolbarQuery = {
  q: string;
  time: string;
  type: string;
  rideType: string;
  ai: string;
  fuel: string;
  load: string;
  sort: string;
};

type Props = { current: ToolbarQuery };

const SELECT_STYLE: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--line, #e5e7eb)",
  borderRadius: 8,
  fontSize: "0.85rem",
  background: "white",
};

function countActiveFilters(q: ToolbarQuery): number {
  let n = 0;
  if (q.q) n++;
  if (q.time !== "all") n++;
  if (q.type !== "cycling") n++;
  if (q.rideType !== "all") n++;
  if (q.load !== "all") n++;
  if (q.ai !== "all") n++;
  if (q.fuel !== "all") n++;
  if (q.sort !== "recent") n++;
  return n;
}

export function ActivitiesToolbar({ current }: Props) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = countActiveFilters(current);

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h2>筛选活动</h2>
        <button
          type="button"
          className="activities-toolbar-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span>筛选</span>
          {activeCount > 0 && <span className="activities-toolbar-badge">{activeCount}</span>}
        </button>
      </div>

      <form
        method="get"
        className={`activities-toolbar-form ${expanded ? "activities-toolbar-form--open" : ""}`}
        style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            border: "1px solid var(--line, #e5e7eb)",
            borderRadius: 8,
            background: "white",
            minWidth: 0,
          }}
        >
          <Search size={16} style={{ color: "var(--muted)" }} />
          <input
            type="search"
            name="q"
            placeholder="搜索活动名称"
            defaultValue={current.q}
            style={{ border: "none", outline: "none", flex: 1, fontSize: "0.85rem", background: "transparent" }}
          />
        </label>

        <div className="activities-toolbar-filters">
          <select name="time" defaultValue={current.time} style={SELECT_STYLE}>
            <option value="all">全部时间</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
            <option value="90d">最近 90 天</option>
          </select>

          <select name="type" defaultValue={current.type} style={SELECT_STYLE}>
            <option value="cycling">骑行</option>
            <option value="running">跑步</option>
            <option value="hiking">徒步</option>
            <option value="fitness">健身</option>
            <option value="other">其他</option>
            <option value="all">全部运动</option>
          </select>

          <select name="rideType" defaultValue={current.rideType} style={SELECT_STYLE}>
            <option value="all">全部骑行类型</option>
            <option value="耐力骑">耐力骑</option>
            <option value="爬坡训练">爬坡训练</option>
            <option value="恢复骑">恢复骑</option>
            <option value="通勤 / 短骑">通勤 / 短骑</option>
            <option value="室内训练">室内训练</option>
            <option value="高强度骑">高强度骑</option>
          </select>

          <select name="load" defaultValue={current.load} style={SELECT_STYLE}>
            <option value="all">全部负荷</option>
            <option value="high">高负荷</option>
            <option value="medium">中负荷</option>
            <option value="low">低负荷</option>
          </select>

          <select name="ai" defaultValue={current.ai} style={SELECT_STYLE}>
            <option value="all">全部 AI 状态</option>
            <option value="ready">已生成</option>
            <option value="pending">待生成</option>
          </select>

          <select name="fuel" defaultValue={current.fuel} style={SELECT_STYLE}>
            <option value="all">全部补给状态</option>
            <option value="recorded">已记录</option>
            <option value="missing">未记录</option>
          </select>

          <select name="sort" defaultValue={current.sort} style={SELECT_STYLE}>
            <option value="recent">时间倒序</option>
            <option value="load">按 TSS</option>
            <option value="duration">按时长</option>
            <option value="distance">按距离</option>
            <option value="pending">待处理优先</option>
          </select>
        </div>

        <div className="activities-toolbar-actions">
          <button
            type="submit"
            style={{
              padding: "6px 14px",
              background: "var(--accent, #1f57d6)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: "0.85rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            应用
          </button>

          <Link
            href="/activities"
            style={{
              padding: "6px 14px",
              background: "var(--surface-alt, #f8fafc)",
              border: "1px solid var(--line, #e5e7eb)",
              borderRadius: 8,
              fontSize: "0.85rem",
              textDecoration: "none",
              color: "var(--text)",
              textAlign: "center",
            }}
          >
            清空
          </Link>
        </div>
      </form>
    </div>
  );
}
