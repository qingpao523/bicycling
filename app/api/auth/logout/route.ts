import { NextResponse } from "next/server";

import { clearSession } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";

export async function POST(request: Request) {
  await clearSession();
  return NextResponse.redirect(buildRequestUrl(request, "/login"), 303);
}
