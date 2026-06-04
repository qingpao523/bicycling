import { redirect } from "next/navigation";

export default async function AnalyticsActivityDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/activities/${id}`);
}
