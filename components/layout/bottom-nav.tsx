"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { BarChart3, CalendarClock, Heart, MessageCircle, Settings, Shield } from "lucide-react";

interface BottomNavProps {
  isAdmin: boolean;
}

const TABS = [
  { href: "/chat", icon: MessageCircle, label: "对话", prefetch: true },
  { href: "/analytics", icon: BarChart3, label: "分析", prefetch: true },
  { href: "/activities", icon: CalendarClock, label: "训练", prefetch: true },
  { href: "/wellness", icon: Heart, label: "状态", prefetch: true },
  { href: "/settings", icon: Settings, label: "设置", prefetch: false },
] as const;

export function BottomNav({ isAdmin }: BottomNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
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
    </nav>
  );
}
