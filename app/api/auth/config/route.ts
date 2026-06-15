import { NextResponse } from "next/server";

import { getAppConfig } from "@/lib/storage";

export async function GET() {
  const config = await getAppConfig();
  return NextResponse.json(
    { authMode: config.authMode },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
