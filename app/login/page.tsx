import { requireSetupReady } from "@/lib/guards";
import { LoginClient } from "@/components/auth/login-client";

export default async function LoginPage() {
  await requireSetupReady();
  return <LoginClient />;
}
