export function normalizeAiBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("AI Base URL 不能为空。");
  }

  if (trimmed.endsWith("/v1/chat/completions") || trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}

export async function parseAiJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!response.ok) {
    const short = text.slice(0, 220);
    throw new Error(`AI 调用失败：${response.status} ${short}`);
  }

  if (!contentType.includes("application/json")) {
    throw new Error(
      `AI 返回的不是 JSON，而是 ${contentType || "未知类型"}。通常说明 Base URL 填成了网站首页，请改成 API 根地址或直接填可用的 /v1/chat/completions。返回片段：${text.slice(0, 120)}`,
    );
  }

  return JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
}
