import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";

export interface AssistantContext {
  user: User;
  missingFields: string[];
  recentTrainingSummary: string | null;
  lastSyncAt: string | null;
  activityCount: number;
}

const REQUIRED_FIELDS: { field: keyof User; label: string }[] = [
  { field: "ftp", label: "FTP" },
  { field: "weightKg", label: "体重" },
  { field: "intervalsApiKeyEncrypted", label: "intervals.icu API Key" },
];

export async function buildAssistantContext(user: User): Promise<AssistantContext> {
  const missingFields = REQUIRED_FIELDS
    .filter((f) => !user[f.field])
    .map((f) => f.label);

  const activityCount = await prisma.activity.count({
    where: { userId: user.id },
  });

  const recentActivities = await prisma.activity.findMany({
    where: { userId: user.id },
    orderBy: { startTime: "desc" },
    take: 7,
    select: {
      startTime: true,
      movingTimeMin: true,
      distanceKm: true,
      tss: true,
      avgPower: true,
    },
  });

  let recentTrainingSummary: string | null = null;
  if (recentActivities.length > 0) {
    const totalTss = recentActivities.reduce((s, a) => s + (a.tss ?? 0), 0);
    const totalHours = recentActivities.reduce((s, a) => s + (a.movingTimeMin ?? 0), 0) / 60;
    const totalKm = recentActivities.reduce((s, a) => s + (a.distanceKm ?? 0), 0);
    const avgPower = recentActivities.filter((a) => a.avgPower).length
      ? Math.round(
          recentActivities.reduce((s, a) => s + (a.avgPower ?? 0), 0) /
            recentActivities.filter((a) => a.avgPower).length,
        )
      : null;

    recentTrainingSummary = [
      `最近 ${recentActivities.length} 次骑行`,
      `总 TSS ${totalTss}`,
      `${totalHours.toFixed(1)} 小时`,
      `${totalKm.toFixed(0)} km`,
      avgPower ? `均功 ${avgPower}W` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const lastActivity = recentActivities[0];
  const lastSyncAt = lastActivity ? lastActivity.startTime.toISOString() : null;

  return {
    user,
    missingFields,
    recentTrainingSummary,
    lastSyncAt,
    activityCount,
  };
}
