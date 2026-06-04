import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { buildFuelPlan } from "@/lib/engine/fuel";
import { buildRequestUrl } from "@/lib/request-url";
import { createId, saveRidePlanAndFuelPlan } from "@/lib/storage";
import type { RidePlan } from "@/lib/types";

function numberValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return Number(value);
}

function boolValue(value: FormDataEntryValue | null) {
  return value === "true";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const user = await requireUser();

  const expectedDurationMin = numberValue(formData.get("expectedDurationMin"));
  const expectedSpeedKmh = numberValue(formData.get("expectedSpeedKmh"));
  const distanceKm = numberValue(formData.get("distanceKm"));
  const elevationM = numberValue(formData.get("elevationM"));

  if (!expectedDurationMin && !distanceKm) {
    return NextResponse.redirect(buildRequestUrl(request, "/ride-plans/new"), { status: 303 });
  }

  const ridePlan: RidePlan = {
    id: createId("rp"),
    userId: user.id,
    distanceKm: distanceKm ?? 0,
    elevationM: elevationM ?? 0,
    expectedSpeedKmh,
    expectedDurationMin,
    rideType: String(formData.get("rideType")) as RidePlan["rideType"],
    temperatureC: numberValue(formData.get("temperatureC")),
    isHotHumid: boolValue(formData.get("isHotHumid")),
    hasResupply: boolValue(formData.get("hasResupply")),
    weightKg: numberValue(formData.get("weightKg")),
    breakfastStatus: String(formData.get("breakfastStatus")) as RidePlan["breakfastStatus"],
    fuelPreference: String(formData.get("fuelPreference")) as RidePlan["fuelPreference"],
    caffeineAccepted: boolValue(formData.get("caffeineAccepted")),
    notes: String(formData.get("notes") ?? ""),
    createdAt: new Date().toISOString(),
  };

  const computed = buildFuelPlan(ridePlan);

  await saveRidePlanAndFuelPlan(ridePlan, {
    id: createId("fp"),
    ...computed,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.redirect(buildRequestUrl(request, `/ride-plans/${ridePlan.id}`), { status: 303 });
}
