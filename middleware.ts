import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildRequestUrl } from "@/lib/request-url";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const hasSession = request.cookies.has("ai_cycling_session");
    if (!hasSession) {
      return NextResponse.redirect(buildRequestUrl(request, "/login"));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
