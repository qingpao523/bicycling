"use client";

import { useState } from "react";
import { Activity, BarChart3, Droplets, Flame, Gauge, TimerReset } from "lucide-react";

type TabItem = {
  label: string;
  value: string;
  badge?: string;
  highlight?: string;
  highlightTone?: "positive" | "negative";
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
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
