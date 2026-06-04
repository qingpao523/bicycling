import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { streamActivityChatReply } from "@/lib/ai";
import {
  createId,
  getActivity,
  getAiReportByActivityId,
  getFuelLogByActivityId,
  listActivitiesByUser,
  listAiChatMessagesByActivityId,
  listRidePlansByUser,
  saveAiChatMessages,
} from "@/lib/storage";
import type { AiChatMessage } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { question?: string } | null;
  const question = body?.question?.trim();

  if (!question) {
    return NextResponse.json({ ok: false, error: "请输入问题后再发送。" }, { status: 400 });
  }

  const [activity, fuelLog, ridePlans, recentActivities, aiReport, existingMessages] = await Promise.all([
    getActivity(id),
    getFuelLogByActivityId(id),
    listRidePlansByUser(user.id),
    listActivitiesByUser(user.id),
    getAiReportByActivityId(id),
    listAiChatMessagesByActivityId(id),
  ]);

  if (!activity || activity.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "活动不存在或无权访问。" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        write({ type: "start" });

        const ai = await streamActivityChatReply({
          activity,
          user,
          fuelLog,
          referenceRidePlan: ridePlans[0],
          recentActivities,
          aiReport: aiReport?.reviewText,
          messages: existingMessages,
          question,
          onDelta(chunk) {
            write({ type: "delta", content: chunk });
          },
        });

        const now = new Date().toISOString();
        const created = await saveAiChatMessages([
          {
            id: createId("chat"),
            activityId: activity.id,
            userId: user.id,
            role: "user",
            content: question,
            createdAt: now,
          },
          {
            id: createId("chat"),
            activityId: activity.id,
            userId: user.id,
            role: "assistant",
            content: ai.reply,
            createdAt: new Date(Date.now() + 1).toISOString(),
          },
        ] satisfies AiChatMessage[]);

        write({
          type: "done",
          messages: [...existingMessages, ...created],
        });
      } catch (error) {
        write({
          type: "error",
          error: error instanceof Error ? error.message : "AI 对话失败。",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
