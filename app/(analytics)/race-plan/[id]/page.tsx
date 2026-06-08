import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getRacePlan } from "@/lib/storage";
import { RouteProfileChart } from "@/components/race-plan/route-profile-chart";
import { RiderCard } from "@/components/race-plan/rider-card";
import { TacticsView } from "@/components/race-plan/tactics-view";
import { GenerateButton } from "./generate-button";
import type { RouteProfile } from "@/lib/engine/gpx-parser";

export default async function RacePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const plan = await getRacePlan(id);

  if (!plan || plan.userId !== user.id) notFound();

  const route: RouteProfile = JSON.parse(plan.routeJson);
  const selfRider = plan.riders.find((r) => r.role === "self");
  const teammates = plan.riders.filter((r) => r.role === "teammate");
  const opponents = plan.riders.filter((r) => r.role === "opponent");

  return (
    <div className="race-plan-page">
      <div className="race-plan-detail-header">
        <Link href="/race-plan" className="back-link">← 返回</Link>
        <h2>{plan.name}</h2>
        {plan.raceDate && <span className="race-date">{plan.raceDate}</span>}
      </div>

      {plan.weatherNote && (
        <p className="weather-note">🌤️ {plan.weatherNote}</p>
      )}

      <section className="plan-detail-section">
        <h3>路线概览 {plan.gpxFileName && <span className="text-muted">({plan.gpxFileName})</span>}</h3>
        <RouteProfileChart route={route} />
      </section>

      <section className="plan-detail-section">
        <h3>参赛人员</h3>
        <div className="riders-grid">
          {selfRider && <RiderCard rider={{ ...selfRider, role: "self" } as any} readonly />}
          {teammates.map((r) => (
            <RiderCard key={r.id} rider={{ ...r, role: "teammate" } as any} readonly />
          ))}
          {opponents.map((r) => (
            <RiderCard key={r.id} rider={{ ...r, role: "opponent" } as any} readonly />
          ))}
        </div>
      </section>

      <section className="plan-detail-section">
        {plan.tacticsJson ? (
          <TacticsView tacticsJson={plan.tacticsJson} />
        ) : (
          <div className="tactics-pending">
            <p>战术方案尚未生成</p>
            <GenerateButton planId={plan.id} />
          </div>
        )}
      </section>
    </div>
  );
}
