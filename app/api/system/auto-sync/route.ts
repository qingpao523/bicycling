import { NextResponse } from "next/server";

import { updateAppConfig } from "@/lib/storage";
import { isAuthorizedInternalSyncRequest, processPendingSyncJobs, runScheduledAutoSync } from "@/lib/system-sync";

export async function POST(request: Request) {
  if (!isAuthorizedInternalSyncRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobs = await processPendingSyncJobs(12);
    const scheduled = await runScheduledAutoSync();
    return NextResponse.json({
      ok: true,
      processedJobs: jobs.length,
      jobs,
      scheduled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "自动同步失败";
    await updateAppConfig({
      autoSyncLastStatus: `失败：${message}`,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
