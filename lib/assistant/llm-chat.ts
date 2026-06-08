import { normalizeAiBaseUrl, parseAiJsonResponse } from "@/lib/ai-provider";
import { decryptSecret } from "@/lib/crypto";
import { getAppConfig } from "@/lib/storage";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmStreamResult {
  reply: string;
  model: string;
}

export async function getAssistantAiConfig() {
  const config = await getAppConfig();
  if (!config.aiEnabled || !config.aiBaseUrl || !config.aiApiKeyEncrypted || !config.aiModel) {
    return null;
  }
  return {
    baseUrl: config.aiBaseUrl,
    model: config.aiModel,
    apiKey: decryptSecret(config.aiApiKeyEncrypted),
  };
}

export async function streamAssistantChat(
  messages: ChatMessage[],
  onDelta: (chunk: string) => Promise<void> | void,
): Promise<LlmStreamResult> {
  const aiConfig = await getAssistantAiConfig();
  if (!aiConfig) {
    throw new Error("AI 未配置。请在设置中填写 API 地址和密钥。");
  }

  const response = await fetch(normalizeAiBaseUrl(aiConfig.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${aiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: aiConfig.model,
      stream: true,
      messages,
    }),
  });

  if (!response.ok) {
    const short = (await response.text()).slice(0, 220);
    throw new Error(`AI 调用失败：${response.status} ${short}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/event-stream")) {
    const json = await parseAiJsonResponse(response);
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI 返回为空。");
    }
    await onDelta(content);
    return { reply: content, model: aiConfig.model };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("AI 流式输出不可用。");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  const handleDataLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") {
      return payload === "[DONE]";
    }
    try {
      const json = JSON.parse(payload) as {
        choices?: Array<{
          delta?: { content?: string };
          message?: { content?: string };
        }>;
      };
      const chunk = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
      if (chunk) {
        fullText += chunk;
        await onDelta(chunk);
      }
    } catch {
      // skip malformed SSE lines
    }
    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const lines = event.split("\n");
      for (const line of lines) {
        const finished = await handleDataLine(line);
        if (finished) {
          return { reply: fullText.trim(), model: aiConfig.model };
        }
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error("AI 返回为空。");
  }

  return { reply: fullText.trim(), model: aiConfig.model };
}
