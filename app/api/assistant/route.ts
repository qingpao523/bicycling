import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/storage";
import { encryptSecret } from "@/lib/crypto";
import type { AssistantRequest, AssistantChunk } from "@/lib/assistant/protocol";
import { processOnboardingMessage, parseOnboardingState } from "@/lib/assistant/onboarding-flow";
import { processGlobalMessage } from "@/lib/assistant/rules-engine";

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

  let chunks: AssistantChunk[];

  if (scope === "onboarding") {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const state = parseOnboardingState(dbUser?.onboardingStepJson);
    const result = processOnboardingMessage(state, message);
    chunks = result.chunks;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        onboardingStepJson: JSON.stringify(result.newState),
        updatedAt: now,
      },
    });
  } else {
    chunks = processGlobalMessage(message);
  }

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
        source: "rules",
        actions: chunks.filter((c) => c.type === "action"),
      }),
      createdAt: new Date(),
    },
  });

  for (const chunk of chunks) {
    if (chunk.type === "action" && chunk.action.kind === "set_user_field") {
      await applyUserFieldAction(user.id, chunk.action.field, chunk.action.value);
    }
    if (chunk.type === "action" && chunk.action.kind === "complete_onboarding") {
      await prisma.user.update({
        where: { id: user.id },
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
