import { AnalyticsNavMenu } from "@/components/analytics/nav-menu";
import { requireUser } from "@/lib/auth";
import { requireAppAvailable, requireSetupReady } from "@/lib/guards";

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSetupReady();
  await requireUser();
  await requireAppAvailable();

  return (
    <div className="analytics-layout">
      <AnalyticsNavMenu />
      <main className="analytics-content">{children}</main>
    </div>
  );
}
