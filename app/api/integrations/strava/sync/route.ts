import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";
import { runStravaSync } from "@/lib/strava-sync";

export async function POST(request: Request) {
  const user = await requireUser();
  const mode = new URL(request.url).searchParams.get("mode");

  try {
    const result = await runStravaSync({
      user,
      mode: mode === "full" ? "full" : "incremental",
      reason: "manual",
    });

    return NextResponse.redirect(
      buildRequestUrl(
        request,
        "/settings?success=" +
          encodeURIComponent(
            `${result.after ? "Strava 增量同步完成" : "Strava 全量历史同步完成"}，共处理 ${result.total} 条活动，入库 ${result.inserted} 条，跳过疑似重复 ${result.skipped} 条。`,
          ),
      ),
      303,
    );
  } catch (caughtError) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/settings?error=" + encodeURIComponent(caughtError instanceof Error ? caughtError.message : "Strava 同步失败。")),
      303,
    );
  }
}
