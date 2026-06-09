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
  const isNewUser = user.onboardingStatus !== "completed";
  const systemPrompt = isNewUser
    ? buildOnboardingSystemPrompt(user)
    : buildAssistantSystemPrompt(user, context.recentTrainingSummary ?? undefined);

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
      {
        name: "getUserProfile",
        description: "获取用户当前已配置的个人资料，包括 FTP、体重、心率等",
        parameters: [],
        handler: async () => ({
          name: user.name,
          userType: user.userType,
          ftp: user.ftp,
          weightKg: user.weightKg,
          maxHr: user.maxHr,
          thresholdHr: user.thresholdHr,
          restingHr: user.restingHr,
          primaryDevice: user.primaryDevice,
          onboardingStatus: user.onboardingStatus,
          hasIntervalsKey: !!user.intervalsApiKeyEncrypted,
          hasStravaConnection: !!user.stravaAthleteId,
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

function buildOnboardingSystemPrompt(user: { name: string }): string {
  return `你是一名专业骑行训练 AI 助手。这是用户首次使用系统，你需要通过自然对话收集以下信息：

## 需要收集的信息
1. **姓名** — 用户怎么称呼
2. **训练记录方式 (userType)** — power(功率计)、watch(智能手表)、basic(不用设备)
3. **体重 (weightKg)** — 单位 kg
4. **FTP (ftp)** — 仅功率计用户，单位瓦
5. **最大心率 (maxHr)** — 仅手表用户，单位 bpm
6. **主力设备 (primaryDevice)** — 仅手表用户：garmin/apple_watch/whoop/coros/other
7. **intervals.icu API Key (intervalsApiKey)** — 仅功率计用户，可选
8. **训练目标 (goal)** — race(备赛)/fitness(健身)/weight(减脂)/fun(乐趣)

## 对话策略
- 用中文对话，语气自然直接，不要客服腔
- 不要一次问太多问题，2-3 个一组
- 用户提供信息后，立即调用 saveUserProfile action 保存
- 所有字段都可以跳过，用户说"跳过"、"不知道"、"以后再说"时不要追问
- 收集完毕后告诉用户设置完成，引导他探索系统功能

## 当前已知信息
- 用户名: ${user.name || "未设置"}

## 约束
- 只回答骑行训练相关问题
- 用中文回答，专业术语保留英文缩写（如 FTP、TSS）`;
}
