import { requireUser } from "@/lib/auth";
import { PlanBuilder } from "@/components/race-plan/plan-builder";
import type { RiderData } from "@/components/race-plan/rider-card";

export default async function NewRacePlanPage() {
  const user = await requireUser();

  const selfRider: RiderData = {
    role: "self",
    name: user.name,
    ftp: user.ftp ?? null,
    weightKg: user.weightKg ?? null,
    wpKg5min: null,
    wpKg1min: null,
    strength: null,
    weakness: null,
  };

  return (
    <div className="race-plan-page">
      <h2>新建比赛计划</h2>
      <PlanBuilder selfRider={selfRider} />
    </div>
  );
}
