import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "../middleware";

describe("middleware redirects", () => {
  it("uses forwarded host and proto when redirecting public tunnel traffic", () => {
    const request = new NextRequest("http://localhost:3000/", {
      headers: {
        "x-forwarded-host": "bick.qingpao.fun",
        "x-forwarded-proto": "https",
      },
    });

    const response = middleware(request);

    expect(response?.headers.get("location")).toBe("https://bick.qingpao.fun/login");
  });
});
