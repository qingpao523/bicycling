import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { Bike } from "lucide-react";

import "@/app/globals.css";
import { getLayoutContext } from "@/lib/guards";
import { BottomNav } from "@/components/layout/bottom-nav";
import { UserMenu } from "@/components/layout/user-menu";

// next/font 在 build 时下载并自托管字体, 消除运行时 fonts.googleapis.com 阻塞请求
const ibmPlex = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI 骑行助手",
  description: "真实可配置的骑行补给、恢复与 AI 分析系统",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { config, user, ready } = await getLayoutContext();

  const showBottomNav = ready && !!user;

  return (
    <html lang="zh-CN" className={`${ibmPlex.variable} ${spaceGrotesk.variable}`}>
      <body>
          <div className="shell">
            <header className="topbar desktop-only">
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
                    <UserMenu name={user.name} role={user.role} />
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
          {showBottomNav && <BottomNav isAdmin={user.role === "admin"} />}
      </body>
    </html>
  );
}
