import { NextRequest } from "next/server";
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { getAssistantAiConfig } from "@/lib/assistant/llm-chat";
import { getCurrentUser } from "@/lib/auth";
import { buildAssistantContext } from "@/lib/assistant/context-builder";
import { buildAssistantSystemPrompt } from "@/lib/assistant/system-prompt";

function normalizeBaseUrlForSdk(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed.replace(/\/chat\/completions$/, "");
  }
  if (!trimmed.endsWith("/v1")) {
    return `${trimmed}/v1`;
  }
  return trimmed;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const aiConfig = await getAssistantAiConfig();
  if (!aiConfig) return new Response("AI not configured", { status: 503 });

  const openai = new OpenAI({
    apiKey: aiConfig.apiKey,
    baseURL: normalizeBaseUrlForSdk(aiConfig.baseUrl),
  });

  const serviceAdapter = new OpenAIAdapter({ openai, model: aiConfig.model });

  const context = await buildAssistantContext(user);
  const systemPrompt = buildAssistantSystemPrompt(user, context.recentTrainingSummary ?? undefined);

  const runtime = new CopilotRuntime({
    actions: [
      {
        name: "getTrainingStatus",
        description: "获取用户最近训练状态摘要，包括训练次数、TSS、骑行时长、距离等",
        parameters: [],
        handler: async () => ({
          activityCount: context.activityCount,
          recentTrainingSummary: context.recentTrainingSummary,
          lastSyncAt: context.lastSyncAt,
          missingFields: context.missingFields,
        }),
      },
    ],
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
}
