import { NextRequest } from "next/server";
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { getAssistantAiConfig } from "@/lib/assistant/llm-chat";
import { getCurrentUser } from "@/lib/auth";
import { buildCopilotActions } from "@/lib/assistant/copilot-actions";

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

  const runtime = new CopilotRuntime({
    actions: buildCopilotActions(user),
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
}
