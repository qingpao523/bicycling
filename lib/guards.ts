import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getAppConfig, hasAnyUser } from "@/lib/storage";

export async function requireSetupReady() {
  const ready = await hasAnyUser();
  if (!ready) {
    redirect("/setup");
  }
}

export async function redirectIfSetupDone() {
  const ready = await hasAnyUser();
  if (ready) {
    redirect("/login");
  }
}

export async function requireAuthModeForRegister() {
  const config = await getAppConfig();
  if (config.authMode !== "open_registration") {
    redirect("/login");
  }
}

export async function getLayoutContext() {
  const [config, user, ready] = await Promise.all([getAppConfig(), getCurrentUser(), hasAnyUser()]);
  return { config, user, ready };
}

export async function requireAppAvailable() {
  const [config, user] = await Promise.all([getAppConfig(), getCurrentUser()]);
  if (config.maintenanceMode && user?.role !== "admin") {
    redirect("/maintenance");
  }
  return { config, user };
}
