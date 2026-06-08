import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/storage";
import { encryptSecret } from "@/lib/crypto";
import type { AssistantRequest, AssistantChunk } from "@/lib/assistant/protocol";
import { processOnboardingMessage, parseOnboardingState } from "@/lib/assistant/onboarding-flow";
import { classifyIntent, processGlobalMessage, type RulesContext, type WellnessSnapshot } from "@/lib/assistant/rules-engine";
import { streamAssistantChat, getAssistantAiConfig } from "@/lib/assistant/llm-chat";
import { buildAssistantSystemPrompt } from "@/lib/assistant/system-prompt";
import { buildAssistantContext } from "@/lib/assistant/context-builder";
import { listDailyWellness } from "@/lib/storage";
import { computeReadiness } from "@/lib/engine/readiness-engine";
import type { User } from "@/lib/types";

function ndjsonLine(chunk: AssistantChunk): string {
  return JSON.stringify(chunk) + "\n";
}

async function applyUserFieldAction(
  userId: string,
  field: string,
  value: unknown,
) {
  const data: Record<string, unknown> = { updatedAt: new Date() };

  switch (field) {
    case "userType":
      data.userType = String(value);
      break;
    case "weightKg":
      data.weightKg = typeof value === "number" ? value : parseFloat(String(value));
      break;
    case "ftp":
      data.ftp = typeof value === "number" ? value : parseInt(String(value), 10);
      break;
    case "maxHr":
      data.maxHr = typeof value === "number" ? value : parseInt(String(value), 10);
      break;
    case "primaryDevice":
      data.primaryDevice = String(value);
      break;
    case "intervalsApiKey":
      data.intervalsApiKeyEncrypted = encryptSecret(String(value));
      break;
    default:
      return;
  }

  await prisma.user.update({ where: { id: userId }, data });
}

async function getConversationHistory(conversationId: string) {
  const messages = await prisma.assistantMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { role: true, content: true },
  });
  return messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: AssistantRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { message, scope, scopeRef } = body;
  if (!message?.trim()) {
    return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  }

  const conversationId = body.conversationId || createId("conv");
  const now = new Date();

  if (!body.conversationId) {
    await prisma.assistantConversation.create({
      data: {
        id: conversationId,
        userId: user.id,
        scope: scope || "global",
        scopeRef: scopeRef || null,
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const userMsgId = createId("msg");
  await prisma.assistantMessage.create({
    data: {
      id: userMsgId,
      conversationId,
      role: "user",
      content: message,
      createdAt: now,
    },
  });

  if (scope === "onboarding") {
    return handleOnboarding(user.id, conversationId, message);
  }

  const intent = classifyIntent(message);

  if (intent.kind !== "chat") {
    if (intent.kind === "status") {
      const ctx = await buildAssistantContext(user as User);
      return handleRulesResponse(user.id, conversationId, message, {
        missingFields: ctx.missingFields,
        activityCount: ctx.activityCount,
        recentTrainingSummary: ctx.recentTrainingSummary,
      });
    }
    if (intent.kind === "wellness") {
      const wellness = await buildWellnessSnapshot(user.id);
      return handleRulesResponse(user.id, conversationId, message, { wellness });
    }
    if (intent.kind === "race_plan") {
      return handleRulesResponse(user.id, conversationId, message);
    }
    return handleRulesResponse(user.id, conversationId, message);
  }

  const aiConfig = await getAssistantAiConfig();
  if (!aiConfig) {
    return handleRulesResponse(user.id, conversationId, message);
  }

  return handleLlmStream(user as User, conversationId, message);
}

async function buildWellnessSnapshot(userId: string): Promise<WellnessSnapshot | null> {
  const [recent7, baseline30] = await Promise.all([
    listDailyWellness(userId, 7),
    listDailyWellness(userId, 30),
  ]);

  if (baseline30.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = recent7.find((d) => d.date === today) ?? {
    id: "", userId, date: today,
    restingHr: null, hrv: null, sleepSecs: null, sleepScore: null,
    weight: null, spO2: null, steps: null,
    statusTag: null, note: null, readinessScore: null,
    createdAt: new Date(), updatedAt: new Date(),
  };

  const latestActivity = await prisma.activity.findFirst({
    where: { userId },
    orderBy: { startTime: "desc" },
    select: { recentForm: true },
  });

  const result = computeReadiness(todayEntry, recent7, baseline30, latestActivity?.recentForm ?? undefined);

  return {
    score: result.score,
    label: result.label,
    suggestions: result.suggestions,
    sleepHours: todayEntry.sleepSecs != null ? Math.round((todayEntry.sleepSecs / 3600) * 10) / 10 : null,
    hrv: todayEntry.hrv,
    restingHr: todayEntry.restingHr,
  };
}

async function handleOnboarding(userId: string, conversationId: string, message: string) {
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  const state = parseOnboardingState(dbUser?.onboardingStepJson);
  const result = processOnboardingMessage(state, message);
  const chunks = result.chunks;

  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingStepJson: JSON.stringify(result.newState),
      updatedAt: new Date(),
    },
  });

  return finishWithChunks(userId, conversationId, chunks, "onboarding");
}

async function handleRulesResponse(userId: string, conversationId: string, message: string, ctx?: RulesContext) {
  const chunks = processGlobalMessage(message, ctx);
  return finishWithChunks(userId, conversationId, chunks, "rules");
}

async function finishWithChunks(
  userId: string,
  conversationId: string,
  chunks: AssistantChunk[],
  source: string,
) {
  const assistantContent = chunks
    .filter((c) => c.type === "delta")
    .map((c) => (c as { type: "delta"; content: string }).content)
    .join("");

  const assistantMsgId = createId("msg");
  await prisma.assistantMessage.create({
    data: {
      id: assistantMsgId,
      conversationId,
      role: "assistant",
      content: assistantContent,
      metadata: JSON.stringify({
        source,
        actions: chunks.filter((c) => c.type === "action"),
      }),
      createdAt: new Date(),
    },
  });

  for (const chunk of chunks) {
    if (chunk.type === "action" && chunk.action.kind === "set_user_field") {
      await applyUserFieldAction(userId, chunk.action.field, chunk.action.value);
    }
    if (chunk.type === "action" && chunk.action.kind === "complete_onboarding") {
      await prisma.user.update({
        where: { id: userId },
        data: { onboardingStatus: "completed", updatedAt: new Date() },
      });
    }
  }

  await prisma.assistantConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(ndjsonLine({ type: "start", conversationId })));
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(ndjsonLine(chunk)));
      }
      controller.enqueue(encoder.encode(ndjsonLine({ type: "done", messageId: assistantMsgId })));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}

async function handleLlmStream(user: User, conversationId: string, message: string) {
  const history = await getConversationHistory(conversationId);
  const ctx = await buildAssistantContext(user);
  const systemPrompt = buildAssistantSystemPrompt(user, ctx.recentTrainingSummary ?? undefined);

  const chatMessages = [
    { role: "system" as const, content: systemPrompt },
    ...history.slice(0, -1).map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  const assistantMsgId = createId("msg");
  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(ndjsonLine({ type: "start", conversationId })));

      try {
        await streamAssistantChat(chatMessages, async (chunk) => {
          fullText += chunk;
          controller.enqueue(encoder.encode(ndjsonLine({ type: "delta", content: chunk })));
        });

        controller.enqueue(encoder.encode(ndjsonLine({ type: "done", messageId: assistantMsgId })));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "LLM 调用失败";
        controller.enqueue(encoder.encode(ndjsonLine({ type: "error", error: errorMsg })));
      } finally {
        await prisma.assistantMessage.create({
          data: {
            id: assistantMsgId,
            conversationId,
            role: "assistant",
            content: fullText || "[error]",
            metadata: JSON.stringify({ source: "llm" }),
            createdAt: new Date(),
          },
        });
        await prisma.assistantConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const conversations = await prisma.assistantConversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 50,
      },
    },
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      scope: c.scope,
      scopeRef: c.scopeRef,
      status: c.status,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messages: c.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    })),
  });
}
