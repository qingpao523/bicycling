import { redirect } from "next/navigation";

import { RidePlanBuilder } from "@/components/ride-plan-builder";
import { requireUser } from "@/lib/auth";
import { requireAppAvailable, requireSetupReady } from "@/lib/guards";
import { getAppConfig, listRidePlansByUser } from "@/lib/storage";

function pickDraftString(value: number | undefined) {
  return typeof value === "number" ? String(value) : "";
}

export default async function NewRidePlanPage() {
  await requireSetupReady();
  const user = await requireUser();
  await requireAppAvailable();
  const config = await getAppConfig();

  if (!config.featureRidePlans) {
    redirect("/");
  }

  const recentRidePlans = (await listRidePlansByUser(user.id)).slice(0, 3);

  return (
    <RidePlanBuilder
      initialDraft={{
        distanceKm: "",
        elevationM: "",
        expectedSpeedKmh: "",
        expectedDurationMin: "",
        rideType: "耐力骑",
        temperatureC: "",
        weightKg: pickDraftString(user.weightKg),
        fuelPreference: "胶+能量棒",
        breakfastStatus: "已进食",
        isHotHumid: false,
        hasResupply: false,
        caffeineAccepted: true,
        notes: "",
      }}
      recentPlans={recentRidePlans.map((plan) => ({
        id: plan.id,
        label: `${plan.rideType} · ${plan.expectedDurationMin ? `${Math.round(plan.expectedDurationMin / 60)}h` : `${plan.distanceKm}km`}`,
        description: `${plan.distanceKm} km / ${plan.elevationM} m${plan.temperatureC ? ` / ${plan.temperatureC}℃` : ""}`,
        draft: {
          distanceKm: pickDraftString(plan.distanceKm),
          elevationM: pickDraftString(plan.elevationM),
          expectedSpeedKmh: pickDraftString(plan.expectedSpeedKmh),
          expectedDurationMin: pickDraftString(plan.expectedDurationMin),
          rideType: plan.rideType,
          temperatureC: pickDraftString(plan.temperatureC),
          weightKg: pickDraftString(plan.weightKg ?? user.weightKg),
          fuelPreference: plan.fuelPreference,
          breakfastStatus: plan.breakfastStatus,
          isHotHumid: plan.isHotHumid,
          hasResupply: plan.hasResupply,
          caffeineAccepted: plan.caffeineAccepted,
          notes: plan.notes ?? "",
        },
      }))}
    />
  );
}
