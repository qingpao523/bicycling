import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeAiBaseUrl, parseAiJsonResponse } from "@/lib/ai-provider";
import { decryptSecret } from "@/lib/crypto";
import { createId, getAppConfig } from "@/lib/storage";

export async function GET() {
  try {
    const user = await requireUser();
    const messages = await prisma.analyticsAiChatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json({ error: "问题不能为空" }, { status: 400 });
    }
    if (question.length > 2000) {
      return NextResponse.json({ error: "问题过长（最多 2000 字符）" }, { status: 400 });
    }

    const config = await getAppConfig();
    if (!config.aiEnabled || !config.aiBaseUrl || !config.aiModel || !config.aiApiKeyEncrypted) {
      return NextResponse.json({ error: "AI 服务尚未配置" }, { status: 503 });
    }

    const apiKey = decryptSecret(config.aiApiKeyEncrypted);

    // Load existing analytics report as context
    const reportRecord = await prisma.analyticsAiReport.findUnique({
      where: { userId: user.id },
    });

    // Load history
    const history = await prisma.analyticsAiChatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 30,
    });

    const now = new Date();

    // Save user's question first
    await prisma.analyticsAiChatMessage.create({
      data: {
        id: createId("acm"),
        userId: user.id,
        role: "user",
        content: question,
        createdAt: now,
      },
    });

    const systemPrompt = [
      "你是一名专业的中文骑行功率训练教练 AI，正在与用户就其训练数据分析报告进行深入讨论。",
      "你的回答要直接、专业、有数据依据，避免客套话和重复已有内容。",
      "结合用户的综合训练数据与已生成的分析报告，回答用户的追问。",
      "用户可能提问：如何执行某个训练建议、某项指标的解读、如何安排周训练、特定赛事备战策略等。",
      "回答保持简洁，用列表/分段增强可读性，但控制在 300 字以内。",
    ].join(" ");

    const contextContent = reportRecord
      ? JSON.stringify({
          summary: "用户的综合训练数据分析报告",
          report: JSON.parse(reportRecord.reportJson),
          data_snapshot: JSON.parse(reportRecord.contextJson),
        })
      : "当前用户尚未生成分析报告，请提醒用户先生成。";

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: `分析报告上下文（供参考）：${contextContent}` },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ];

    const response = await fetch(normalizeAiBaseUrl(config.aiBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages,
      }),
    });

    const json = await parseAiJsonResponse(response);
    const answer = json.choices?.[0]?.message?.content;
    if (!answer) throw new Error("AI 返回为空");

    const assistantMessage = await prisma.analyticsAiChatMessage.create({
      data: {
        id: createId("acm"),
        userId: user.id,
        role: "assistant",
        content: answer,
        createdAt: new Date(),
      },
    });

    return NextResponse.json({
      message: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "对话失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    await prisma.analyticsAiChatMessage.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "清除失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
