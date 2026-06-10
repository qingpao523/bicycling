import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { requireSetupReady } from "@/lib/guards";

export default async function HomePage() {
  await requireSetupReady();
  await requireUser();

  redirect("/analytics");
}
