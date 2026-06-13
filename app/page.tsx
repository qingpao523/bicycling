import { requireUser } from "@/lib/auth";
import { requireSetupReady } from "@/lib/guards";
import { HomeRedirect } from "@/components/home-redirect";

export default async function HomePage() {
  await requireSetupReady();
  await requireUser();

  return <HomeRedirect />;
}
