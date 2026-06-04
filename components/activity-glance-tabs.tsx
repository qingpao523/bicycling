"use client";

import { useState } from "react";
import { Activity, BarChart3, Droplets, Flame, Gauge, TimerReset } from "lucide-react";

type TabItem = {
  label: string;
  value: string;
  badge?: string;
  highlight?: string;
  highlightTone?: "positive" | "negative";
  // 新增: 空状态时的 action
  action?: {
    kind: "backfill" | "fill_fuel";
    activityId?: string; // backfill 需要
  };
};

type TabKey = "recovery" | "pacing" | "fatigue" | "compare";

type TabConfig = {
  key: TabKey;
  label: string;
  items: TabItem[];
};

const tabIcons = {
  recovery: Flame,
  pacing: Gauge,
  fatigue: Droplets,
  compare: BarChart3,
} satisfies Record<TabKey, typeof Flame>;

export function ActivityGlanceTabs({ tabs }: { tabs: TabConfig[] }) {
  const defaultTab = tabs.find((tab) => tab.key === "fatigue")?.key ?? tabs[0]?.key ?? "recovery";
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const currentTab = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];

  if (!currentTab) return null;

  return (
    <div className="activity-glance-tabs">
      <div className="activity-glance-tab-list" role="tablist" aria-label="一眼结论分类">
        {tabs.map((tab) => {
          const isActive = tab.key === currentTab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`activity-glance-tab ${isActive ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="activity-status-list">
        {currentTab.items.map((item) => {
          const Icon = tabIcons[currentTab.key] ?? Activity;
          return (
            <div key={`${currentTab.key}-${item.label}`} className="activity-status-row">
              <Icon size={16} />
              <div>
                <strong className="activity-status-label">
                  <span>{item.label}</span>
                  {item.badge ? <span className="activity-status-badge">{item.badge}</span> : null}
                </strong>
                <span>
                  {item.value}
                  {item.highlight ? (
                    <>
                      ，
                      <span className={`activity-status-highlight ${item.highlightTone === "negative" ? "negative" : "positive"}`}>
                        {item.highlight}
                      </span>
                    </>
                  ) : null}
                  {item.action ? (
                    <ActionButton action={item.action} />
                  ) : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionButton({ action }: { action: NonNullable<TabItem["action"]> }) {
  if (action.kind === "backfill" && action.activityId) {
    // 复用 SingleActivityBackfillButton 不可,因为它是 client-only,这里已是 client.
    // 直接 inline 一个简化版触发 POST
    const onClick = async () => {
      try {
        const res = await fetch(`/api/analytics/backfill/single`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityId: action.activityId }),
        });
        if (res.ok) {
          location.reload();
        } else {
          alert("补拉失败,请稍后重试");
        }
      } catch {
        alert("网络异常");
      }
    };
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          marginLeft: 8,
          padding: "2px 10px",
          fontSize: "0.75rem",
          background: "var(--accent, #1f57d6)",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        ▶ 补拉流数据
      </button>
    );
  }
  if (action.kind === "fill_fuel") {
    return (
      <a
        href="#fuel-log"
        style={{
          marginLeft: 8,
          padding: "2px 10px",
          fontSize: "0.75rem",
          background: "var(--accent, #1f57d6)",
          color: "white",
          borderRadius: 6,
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        ▶ 立即填写
      </a>
    );
  }
  return null;
}
