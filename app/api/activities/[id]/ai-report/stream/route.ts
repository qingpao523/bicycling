import { requireUser } from "@/lib/auth";
import { streamAiReportNarrative } from "@/lib/ai";
import {
  createId,
  getActivity,
  getFuelLogByActivityId,
  listActivitiesByUser,
  listRidePlansByUser,
  saveAiReport,
} from "@/lib/storage";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const [activity, fuelLog, ridePlans, recentActivities] = await Promise.all([
    getActivity(id),
    getFuelLogByActivityId(id),
    listRidePlansByUser(user.id),
    listActivitiesByUser(user.id),
  ]);

  if (!activity || activity.userId !== user.id) {
    return new Response(JSON.stringify({ type: "error", error: "活动不存在或无权访问。" }), {
      status: 404,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
      },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        write({ type: "start" });

        const ai = await streamAiReportNarrative({
          activity,
          user,
          fuelLog,
          referenceRidePlan: ridePlans[0],
          recentActivities,
          onDelta(chunk) {
            write({ type: "delta", content: chunk });
          },
        });

        await saveAiReport({
          id: createId("air"),
          activityId: activity.id,
          userId: user.id,
          reviewText: ai.reviewText,
          recoveryText: ai.recoveryText,
          fuelReviewText: ai.fuelReviewText,
          model: ai.model,
          generatedAt: new Date().toISOString(),
        });

        write({
          type: "done",
          reportText: ai.reviewText,
        });
      } catch (error) {
        write({
          type: "error",
          error: error instanceof Error ? error.message : "AI 报告生成失败。",
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
