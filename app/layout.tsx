import type { Metadata } from "next";
import Link from "next/link";
import { Bike, CalendarClock, LockKeyhole, Route, Settings, Shield } from "lucide-react";

import "@/app/globals.css";
import { getLayoutContext } from "@/lib/guards";

export const metadata: Metadata = {
  title: "AI 骑行助手",
  description: "真实可配置的骑行补给、恢复与 AI 分析系统",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { config, user, ready } = await getLayoutContext();

  return (
    <html lang="zh-CN">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="brand">
              <div className="brand-badge">
                <Bike size={22} />
              </div>
              <div>
                <div className="eyebrow">AI Cycling Assistant</div>
                <strong>{config.appName}</strong>
              </div>
            </div>
            <nav className="nav">
              {ready && user ? (
                <>
                  <Link href="/analytics">功率训练</Link>
                  <Link href="/activities">
                    <CalendarClock size={16} /> 训练历史
                  </Link>
                  {config.featureRidePlans ? (
                    <Link href="/ride-plans/new">
                      <Route size={16} /> 骑前计划
                    </Link>
                  ) : null}
                  <Link href="/settings">
                    <Settings size={16} /> 设置
                  </Link>
                  {user.role === "admin" ? (
                    <Link href="/admin">
                      <Shield size={16} /> 管理端
                    </Link>
                  ) : null}
                  <form action="/api/auth/logout" method="post">
                    <button type="submit">
                      <LockKeyhole size={16} /> 退出
                    </button>
                  </form>
                </>
              ) : ready ? (
                <>
                  <Link href="/login">登录</Link>
                  {config.authMode === "open_registration" ? (
                    <Link href="/register">注册</Link>
                  ) : (
                    <span className="button button-disabled" aria-disabled="true">
                      注册已关闭
                    </span>
                  )}
                </>
              ) : (
                <Link href="/setup">初始化系统</Link>
              )}
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
