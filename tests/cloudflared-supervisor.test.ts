import { describe, expect, it } from "vitest";

import {
  buildCloudflaredEnv,
  buildCloudflaredArgs,
  chooseWritableLogPath,
  isProcessRunning,
  parseCloudflaredPids,
  parseHaConnections,
  removePidFileIfPossible,
  persistPidIfWritable,
} from "../scripts/cloudflared-supervisor.mjs";

describe("cloudflared supervisor helpers", () => {
  it("treats EPERM from kill(0) as an existing root-owned process", () => {
    const running = isProcessRunning(18008, () => {
      const error = new Error("kill EPERM") as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    });

    expect(running).toBe(true);
  });

  it("parses cloudflared pids from pgrep output", () => {
    expect(parseCloudflaredPids("18008 cloudflared\n2221 ngrok\n")).toEqual([18008]);
    expect(parseCloudflaredPids("")).toEqual([]);
  });

  it("parses HA connection count from cloudflared metrics", () => {
    const metrics = [
      "# HELP cloudflared_tunnel_ha_connections Number of HA connections",
      "cloudflared_tunnel_ha_connections 4",
    ].join("\n");

    expect(parseHaConnections(metrics)).toBe(4);
  });

  it("builds cloudflared args with http2 and a stable metrics endpoint", () => {
    expect(buildCloudflaredArgs("token-value")).toEqual([
      "tunnel",
      "--protocol",
      "http2",
      "--metrics",
      "127.0.0.1:20241",
      "run",
      "--token",
      "token-value",
    ]);
  });

  it("builds a proxy-aware environment for fake-ip DNS networks", () => {
    expect(
      buildCloudflaredEnv({
        baseEnv: {
          NODE_ENV: "test",
          PATH: "/usr/bin",
        },
        proxyUrl: "http://127.0.0.1:7897",
      }),
    ).toMatchObject({
      PATH: "/usr/bin",
      HTTP_PROXY: "http://127.0.0.1:7897",
      HTTPS_PROXY: "http://127.0.0.1:7897",
      ALL_PROXY: "http://127.0.0.1:7897",
      NO_PROXY: "127.0.0.1,localhost,::1",
    });
  });

  it("uses a fallback log path when the primary log is not writable", () => {
    const canWrite = (filePath: string) => !filePath.endsWith("root-owned.log");

    expect(chooseWritableLogPath("/tmp/root-owned.log", "/tmp/user.log", canWrite)).toBe("/tmp/user.log");
    expect(chooseWritableLogPath("/tmp/user.log", "/tmp/fallback.log", canWrite)).toBe("/tmp/user.log");
  });

  it("does not throw when the observed pid file is root-owned", () => {
    const writes: Array<[string, string, string]> = [];
    const ok = persistPidIfWritable("/tmp/cloudflared.pid", 47197, {
      writeFileSync: (filePath: string, value: string, encoding: string) => {
        writes.push([filePath, value, encoding]);
        const error = new Error("permission denied") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      },
    });

    expect(ok).toBe(false);
    expect(writes).toHaveLength(1);
  });

  it("does not throw when removing a root-owned pid file", () => {
    const ok = removePidFileIfPossible("/tmp/cloudflared.pid", {
      existsSync: () => true,
      unlinkSync: () => {
        const error = new Error("permission denied") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      },
    });

    expect(ok).toBe(false);
  });
});
