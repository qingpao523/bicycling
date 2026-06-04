import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { requireAppAvailable, requireSetupReady } from "@/lib/guards";

export default async function HomePage() {
  await requireSetupReady();
  await requireUser();
  await requireAppAvailable();

  redirect("/dashboard");
}
