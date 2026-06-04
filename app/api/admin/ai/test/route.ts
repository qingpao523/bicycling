import { NextResponse } from "next/server";

import { normalizeAiBaseUrl, parseAiJsonResponse } from "@/lib/ai-provider";
import { requireAdmin } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { buildRequestUrl } from "@/lib/request-url";
import { getAppConfig } from "@/lib/storage";

export async function POST(request: Request) {
  await requireAdmin();
  const config = await getAppConfig();

  if (!config.aiBaseUrl || !config.aiModel || !config.aiApiKeyEncrypted) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/admin?error=" + encodeURIComponent("请先保存完整的 AI Base URL、模型和 API key。")),
      303,
    );
  }

  try {
    const endpoint = normalizeAiBaseUrl(config.aiBaseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${decryptSecret(config.aiApiKeyEncrypted)}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages: [
          {
            role: "system",
            content: "Reply with exactly: ok",
          },
          {
            role: "user",
            content: "connectivity test",
          },
        ],
        max_tokens: 5,
      }),
    });

    const payload = await parseAiJsonResponse(response);
    const content = payload.choices?.[0]?.message?.content?.trim() || "无返回文本";

    return NextResponse.redirect(
      buildRequestUrl(
        request,
        "/admin?success=" +
          encodeURIComponent(
            `AI 连通性测试成功，端点 ${endpoint} 可用，模型 ${config.aiModel} 返回：${content.slice(0, 60)}`,
          ),
      ),
      303,
    );
  } catch (error) {
    return NextResponse.redirect(
      buildRequestUrl(
        request,
        "/admin?error=" +
          encodeURIComponent(error instanceof Error ? `AI 连通性测试异常：${error.message}` : "AI 连通性测试异常。"),
      ),
      303,
    );
  }
}
