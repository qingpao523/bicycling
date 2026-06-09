"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  Award,
  BarChart3,
  Battery,
  Brain,
  Database,
  Gauge,
  Heart,
  Home,
  MessageSquare,
  Route,
  Swords,
  Target,
  Trophy,
  Zap,
  Menu,
  Mountain,
  X,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/analytics", label: "首页", icon: Home },
  { href: "/analytics/power-curve", label: "功率曲线", icon: Zap },
  { href: "/analytics/power-profile", label: "功率形态", icon: Target },
  { href: "/analytics/level", label: "能力水位", icon: Award },
  { href: "/analytics/fatigue", label: "疲劳形态", icon: Activity },
  { href: "/analytics/recovery", label: "状态恢复", icon: Heart },
  { href: "/analytics/data", label: "数据分析", icon: BarChart3 },
  { href: "/activities", label: "运动记录", icon: Gauge },
  { href: "/wellness", label: "个人状态", icon: Heart },
  { href: "/analytics/prediction", label: "表现预测", icon: Brain },
  { href: "/analytics/leaderboard", label: "排行榜", icon: Trophy },
  { href: "/analytics/segments", label: "赛段", icon: Mountain },
  { href: "/race-plan", label: "辣堡战术", icon: Swords },
  { href: "/ride-plans/new", label: "骑前计划", icon: Route },
  { href: "/analytics/tools", label: "数据工具", icon: Database },
  { href: "/analytics/feedback", label: "意见反馈", icon: MessageSquare },
];

export function AnalyticsNavMenu() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/analytics") return pathname === "/analytics";
    return pathname.startsWith(href);
  };

  return (
    <>
      <button
        className="analytics-nav-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="切换导航菜单"
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {mobileOpen && (
        <div
          className="analytics-nav-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <nav className={`analytics-nav ${mobileOpen ? "analytics-nav--open" : ""}`}>
        <div className="analytics-nav-header">
          <Battery size={20} />
          <strong>Power Analytics</strong>
        </div>
        <ul className="analytics-nav-list">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                className={`analytics-nav-item ${isActive(item.href) ? "analytics-nav-item--active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
