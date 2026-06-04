import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";
import { runIntervalsSync } from "@/lib/intervals-sync";

export async function POST(request: Request) {
  const user = await requireUser();
  const mode = new URL(request.url).searchParams.get("mode");

  try {
    const result = await runIntervalsSync({
      user,
      mode: mode === "full" ? "full" : "incremental",
    });
    return NextResponse.redirect(
      buildRequestUrl(
        request,
        "/settings?success=" +
          encodeURIComponent(
            `${result.oldest ? "ICU 增量同步完成" : "ICU 全量历史同步完成"}，共处理 ${result.total} 条活动，入库 ${result.inserted} 条，跳过疑似重复 ${result.skipped} 条，并已自动更新可获取的 ICU 档案参数。`,
          ),
      ),
      303,
    );
  } catch (error) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/settings?error=" + encodeURIComponent(error instanceof Error ? error.message : "同步失败。")),
      303,
    );
  }
}
