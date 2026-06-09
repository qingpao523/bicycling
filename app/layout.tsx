import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { Bike, CalendarClock } from "lucide-react";

import "@/app/globals.css";
import { getLayoutContext } from "@/lib/guards";
import { CopilotProvider } from "@/components/assistant/copilot-provider";
import { CopilotSidebarWrapper } from "@/components/assistant/copilot-sidebar-wrapper";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { BottomNav } from "@/components/layout/bottom-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { buildAssistantSystemPrompt } from "@/lib/assistant/system-prompt";

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

  const showOnboarding = ready && user && user.onboardingStatus !== "completed";
  const showCopilot = ready && user && user.onboardingStatus === "completed";

  return (
    <html lang="zh-CN" className={`${ibmPlex.variable} ${spaceGrotesk.variable}`}>
      <body>
        <CopilotProvider>
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
                    <Link href="/analytics">功率训练</Link>
                    <Link href="/activities">
                      <CalendarClock size={16} /> 训练历史
                    </Link>
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
          {showOnboarding && <OnboardingWizard initialName={user.name} />}
          {showCopilot && (
            <CopilotSidebarWrapper
              user={{
                name: user.name,
                userType: user.userType ?? undefined,
                ftp: user.ftp ?? undefined,
                weightKg: user.weightKg ?? undefined,
                maxHr: user.maxHr ?? undefined,
              }}
              systemPrompt={buildAssistantSystemPrompt(user)}
            />
          )}
          {showCopilot && <BottomNav isAdmin={user.role === "admin"} />}
        </CopilotProvider>
      </body>
    </html>
  );
}
