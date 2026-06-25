import { describe, expect, it } from "vitest";

import { writeJson, writeJsonError } from "../scripts/system-manager-http.mjs";

describe("system manager error responses", () => {
  it("waits for the JSON payload before sending headers", async () => {
    const calls: string[] = [];
    const res = {
      headersSent: false,
      writableEnded: false,
      writeHead: () => {
        calls.push("writeHead");
      },
      end: () => {
        calls.push("end");
      },
    };

    await expect(writeJson(res, Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(calls).toEqual([]);
  });

  it("does not try to write headers twice after a handler already started the response", () => {
    const calls: string[] = [];
    const res = {
      headersSent: true,
      writableEnded: false,
      writeHead: () => {
        calls.push("writeHead");
        throw new Error("should not write headers twice");
      },
      end: () => {
        calls.push("end");
      },
    };

    writeJsonError(res, new Error("boom"));

    expect(calls).toEqual(["end"]);
  });
});
