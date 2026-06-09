import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { saveUser } from "@/lib/storage";
import type { User } from "@/lib/types";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json();

  const updated: User = {
    ...user,
    onboardingStatus: "completed",
    onboardingStepJson: undefined,
    updatedAt: new Date().toISOString(),
  };

  if (body.name) updated.name = body.name;
  if (body.userType) updated.userType = body.userType;
  if (body.weightKg) updated.weightKg = Number(body.weightKg);
  if (body.ftp) updated.ftp = Number(body.ftp);
  if (body.maxHr) updated.maxHr = Number(body.maxHr);
  if (body.primaryDevice) updated.primaryDevice = body.primaryDevice;
  if (body.intervalsApiKey) {
    updated.intervalsApiKeyEncrypted = encryptSecret(body.intervalsApiKey);
  }
  if (body.goal) {
    const prefs = user.preferencesJson ? JSON.parse(user.preferencesJson) : {};
    prefs.goal = body.goal;
    updated.preferencesJson = JSON.stringify(prefs);
  }

  await saveUser(updated);

  return NextResponse.json({ success: true });
}
