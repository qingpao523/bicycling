import { NextResponse } from "next/server";

import { isAuthorizedInternalSyncRequest, pollAllUsersForNewActivities } from "@/lib/system-sync";

export async function POST(request: Request) {
  if (!isAuthorizedInternalSyncRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pollAllUsersForNewActivities();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "轮询失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
