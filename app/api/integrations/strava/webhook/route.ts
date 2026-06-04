import { NextResponse } from "next/server";

import { enqueueSyncJob, getUserByStravaAthleteId } from "@/lib/storage";
import { getStravaWebhookVerifyToken } from "@/lib/strava";

type StravaWebhookEvent = {
  aspect_type?: string;
  object_type?: string;
  object_id?: number;
  owner_id?: number;
  event_time?: number;
  subscription_id?: number;
  updates?: Record<string, unknown>;
};

export async function GET(request: Request) {
  const token = getStravaWebhookVerifyToken();
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");

  if (!token) {
    return NextResponse.json({ error: "STRAVA_WEBHOOK_VERIFY_TOKEN 未配置" }, { status: 500 });
  }

  if (mode !== "subscribe" || !challenge || verifyToken !== token) {
    return NextResponse.json({ error: "Webhook 验证失败" }, { status: 400 });
  }

  return NextResponse.json({ "hub.challenge": challenge });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => [])) as StravaWebhookEvent[] | StravaWebhookEvent;
  const events = Array.isArray(payload) ? payload : [payload];
  const queued: Array<Record<string, unknown>> = [];

  for (const event of events) {
    if (typeof event.owner_id !== "number") continue;
    const user = await getUserByStravaAthleteId(String(event.owner_id));
    if (!user) continue;

    const externalActivityId =
      typeof event.object_id === "number" && event.object_type === "activity" ? `strava:${event.object_id}` : undefined;

    if (event.aspect_type === "delete" && externalActivityId) {
      await enqueueSyncJob({
        userId: user.id,
        source: "strava",
        jobType: "delete",
        reason: "webhook_delete",
        externalRef: externalActivityId,
        payload: {
          externalActivityId,
          eventTime: event.event_time,
          subscriptionId: event.subscription_id,
        },
      });
      queued.push({ userId: user.id, jobType: "delete", externalActivityId });
      continue;
    }

    await enqueueSyncJob({
      userId: user.id,
      source: "strava",
      jobType: "sync",
      reason: `webhook_${event.aspect_type ?? "event"}`,
      externalRef: `user:${user.id}:strava:incremental`,
      payload: {
        mode: "incremental",
        windowDays: 7,
        eventTime: event.event_time,
        objectType: event.object_type,
        objectId: event.object_id,
        updates: event.updates ?? {},
      },
    });
    queued.push({ userId: user.id, jobType: "sync", objectId: event.object_id });
  }

  return NextResponse.json({ ok: true, queued: queued.length, events: queued }, { status: 202 });
}
