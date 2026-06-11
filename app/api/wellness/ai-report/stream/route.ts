import { requireUser } from "@/lib/auth";
import { listDailyWellness, listActivitiesByUser, getAppConfig, createId } from "@/lib/storage";
import { computeReadiness } from "@/lib/engine/readiness-engine";
import { calculatePmc, getCurrentPmc } from "@/lib/engine/pmc";
import { normalizeAiBaseUrl } from "@/lib/ai-provider";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { WELLNESS_SYSTEM_PROMPT, buildWellnessContext, buildWellnessUserPrompt } from "@/lib/wellness-ai";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await requireUser();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        } catch {}
      };

      try {
        send({ type: "start" });

        const [recent7, baseline30, activities] = await Promise.all([
          listDailyWellness(user.id, 7),
          listDailyWellness(user.id, 30),
          listActivitiesByUser(user.id),
        ]);

        const today = new Date().toISOString().slice(0, 10);
        const todayEntry = recent7.find((d) => d.date === today) ?? {
          id: "", userId: user.id, date: today,
          restingHr: null, hrv: null, sleepSecs: null, sleepScore: null,
          weight: null, spO2: null, steps: null, statusTag: null, note: null,
          readinessScore: null, createdAt: new Date(), updatedAt: new Date(),
        };

        const pmcData = calculatePmc(activities);
        const currentPmc = getCurrentPmc(pmcData);
        const readiness = computeReadiness(todayEntry, recent7, baseline30, currentPmc?.tsb, currentPmc?.ctl, currentPmc?.atl);
        const context = buildWellnessContext(user, readiness, recent7, baseline30, currentPmc?.tsb);

        const config = await getAppConfig();
        if (!config.aiEnabled || !config.aiBaseUrl || !config.aiModel || !config.aiApiKeyEncrypted) {
          throw new Error("AI 服务尚未配置，请联系管理员在 AI 配置中启用。");
        }

        const apiKey = decryptSecret(config.aiApiKeyEncrypted);
        const payload = {
          model: config.aiModel,
          messages: [
            { role: "system", content: WELLNESS_SYSTEM_PROMPT },
            { role: "user", content: buildWellnessUserPrompt(context) },
          ],
          response_format: { type: "json_object" },
          stream: true,
        };

        send({ type: "progress", percent: 5 });

        const response = await fetch(normalizeAiBaseUrl(config.aiBaseUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          throw new Error(`AI 请求失败 (${response.status}): ${errText.slice(0, 200)}`);
        }

        let fullText = "";
        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("text/event-stream") || contentType.includes("octet-stream") || response.body) {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let isSSE = false;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            if (!isSSE && buffer.includes("data: ")) isSSE = true;

            if (isSSE) {
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6).trim();
                if (data === "[DONE]") continue;
                try {
                  const json = JSON.parse(data);
                  const delta = json.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullText += delta;
                    const percent = Math.min(95, 10 + Math.round((fullText.length / 1000) * 85));
                    send({ type: "progress", percent });
                  }
                } catch {}
              }
            } else {
              // Non-SSE: accumulate and parse at the end
            }
          }

          if (!isSSE && buffer) {
            try {
              const json = JSON.parse(buffer);
              fullText = json.choices?.[0]?.message?.content ?? "";
            } catch {}
          }
        }

        if (!fullText) throw new Error("AI 返回结果为空");

        let report;
        try {
          report = JSON.parse(fullText);
        } catch {
          throw new Error("AI 返回的不是有效的 JSON");
        }

        const now = new Date();
        await prisma.wellnessAiReport.upsert({
          where: { userId: user.id },
          create: {
            id: createId("war"),
            userId: user.id,
            reportJson: JSON.stringify(report),
            contextJson: JSON.stringify(context),
            model: config.aiModel,
            generatedAt: now,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            reportJson: JSON.stringify(report),
            contextJson: JSON.stringify(context),
            model: config.aiModel,
            generatedAt: now,
            updatedAt: now,
          },
        });

        send({ type: "done", report, generatedAt: now.toISOString() });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 分析生成失败";
        send({ type: "error", error: message });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
