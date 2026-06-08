"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { BarChart3, CalendarClock, Heart, Settings, Shield, MessageCircle } from "lucide-react";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

interface BottomNavProps {
  isAdmin: boolean;
}

const TABS = [
  { href: "/analytics", icon: BarChart3, label: "首页", prefetch: true },
  { href: "/activities", icon: CalendarClock, label: "训练", prefetch: true },
  { href: "/wellness", icon: Heart, label: "状态", prefetch: true },
  { href: "/settings", icon: Settings, label: "设置", prefetch: false },
] as const;

export function BottomNav({ isAdmin }: BottomNavProps) {
  const pathname = usePathname();
  const [assistantOpen, setAssistantOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {assistantOpen && (
        <AssistantPanel
          mode="fullscreen"
          scope={pathname.startsWith("/analytics") ? "analytics" : "global"}
          onClose={() => setAssistantOpen(false)}
        />
      )}
      <nav className="bottom-nav">
        {TABS.map(({ href, icon: Icon, label, prefetch }) => (
          <Link
            key={href}
            href={href}
            prefetch={prefetch}
            className={`bottom-nav-item ${isActive(href) ? "bottom-nav-item--active" : ""}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
        {isAdmin && (
          <Link
            href="/admin"
            prefetch={false}
            className={`bottom-nav-item ${isActive("/admin") ? "bottom-nav-item--active" : ""}`}
          >
            <Shield size={20} />
            <span>管理</span>
          </Link>
        )}
        <button
          type="button"
          className={`bottom-nav-item ${assistantOpen ? "bottom-nav-item--active" : ""}`}
          onClick={() => setAssistantOpen(!assistantOpen)}
        >
          <MessageCircle size={20} />
          <span>助手</span>
        </button>
      </nav>
    </>
  );
}
