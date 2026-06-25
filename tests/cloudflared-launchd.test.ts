import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectDir = path.resolve(__dirname, "..");

describe("cloudflared launchd guard", () => {
  it("injects the local proxy and public URL probes into the LaunchDaemon", () => {
    const setupScript = readFileSync(path.join(projectDir, "scripts", "setup-launchd.sh"), "utf8");

    expect(setupScript).toContain("CLOUDFLARED_PROXY_URL");
    expect(setupScript).toContain("http://127.0.0.1:7897");
    expect(setupScript).toContain("CLOUDFLARE_PUBLIC_URL");
    expect(setupScript).toContain("https://bick.qingpao.fun/");
  });

  it("uses the proxy and public 1033 probe inside the guard loop", () => {
    const guardScript = readFileSync(path.join(projectDir, "scripts", "cloudflared-guard.sh"), "utf8");

    expect(guardScript).toContain("HTTP_PROXY");
    expect(guardScript).toContain('CLOUDFLARED_PID_FILE="${CLOUDFLARED_PID_FILE');
    expect(guardScript).toContain("public_status_code");
    expect(guardScript).toContain("1033");
  });

  it("provides a user LaunchAgent fallback for proxy-only tunnel connectivity", () => {
    const setupScript = readFileSync(path.join(projectDir, "scripts", "setup-user-cloudflared-proxy.sh"), "utf8");

    expect(setupScript).toContain("com.flyaways.ai-cycling-cloudflared-proxy");
    expect(setupScript).toContain("CLOUDFLARED_METRICS");
    expect(setupScript).toContain("127.0.0.1:20242");
    expect(setupScript).toContain("CLOUDFLARED_PROXY_URL");
    expect(setupScript).toContain("http://127.0.0.1:7897");
    expect(setupScript).toContain("CLOUDFLARED_PID_FILE");
    expect(setupScript).toContain("cloudflared-proxy.pid");
  });

  it("lets the system manager prefer the proxy tunnel metrics and public health probe", () => {
    const managerScript = readFileSync(path.join(projectDir, "scripts", "system-manager.mjs"), "utf8");

    expect(managerScript).toContain('cloudflaredProxyMetricsAddress');
    expect(managerScript).toContain('"127.0.0.1:20242"');
    expect(managerScript).toContain('readCloudflaredMetrics(cloudflaredProxyMetricsAddress)');
    expect(managerScript).toContain('buildCloudflaredArgs(token, { metricsAddress: cloudflaredProxyMetricsAddress })');
    expect(managerScript).toContain('checkCloudflarePublicUrl()');
    expect(managerScript).toContain('proxyUrl: cloudflaredProxyUrl');
  });

  it("provides a root LaunchDaemon cleanup script that targets the old direct tunnel", () => {
    const cleanupScript = readFileSync(path.join(projectDir, "scripts", "disable-root-cloudflared.sh"), "utf8");

    expect(cleanupScript).toContain("com.flyaways.ai-cycling-cloudflared");
    expect(cleanupScript).toContain("/Library/LaunchDaemons/$LABEL.plist");
    expect(cleanupScript).toContain("127.0.0.1:20241");
    expect(cleanupScript).toContain('launchctl bootout "system/$LABEL"');
  });
});
