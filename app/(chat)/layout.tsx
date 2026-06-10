import { requireUser } from "@/lib/auth";
import { requireAppAvailable, requireSetupReady } from "@/lib/guards";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSetupReady();
  await requireUser();
  await requireAppAvailable();

  return <main className="chat-layout">{children}</main>;
}
