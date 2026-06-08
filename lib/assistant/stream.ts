import type { AssistantChunk } from "./protocol";

export async function consumeAssistantStream(
  response: Response,
  handlers: {
    onStart?: (conversationId: string) => void;
    onDelta?: (content: string) => void;
    onAction?: (action: AssistantChunk & { type: "action" }) => void;
    onDone?: (messageId: string) => void;
    onError?: (error: string) => void;
  },
) {
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "流式请求启动失败。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const raw = line.trim();
      if (!raw) continue;

      let chunk: AssistantChunk;
      try {
        chunk = JSON.parse(raw) as AssistantChunk;
      } catch {
        continue;
      }

      switch (chunk.type) {
        case "start":
          handlers.onStart?.(chunk.conversationId);
          break;
        case "delta":
          handlers.onDelta?.(chunk.content);
          break;
        case "action":
          handlers.onAction?.(chunk);
          break;
        case "done":
          handlers.onDone?.(chunk.messageId);
          break;
        case "error":
          handlers.onError?.(chunk.error);
          break;
      }
    }
  }
}
