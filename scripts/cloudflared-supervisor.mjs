export const DEFAULT_CLOUDFLARED_METRICS = "127.0.0.1:20241";
export const DEFAULT_CLOUDFLARED_PROTOCOL = "http2";

export function isProcessRunning(pid, kill = process.kill) {
  if (!Number.isFinite(pid) || pid <= 0) return false;

  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function parseCloudflaredPids(output) {
  if (!output) return [];

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("cloudflared"))
    .map((line) => {
      const match = line.match(/^(\d+)/);
      return match ? Number(match[1]) : null;
    })
    .filter((pid) => Number.isFinite(pid));
}

export function parseHaConnections(metricsBody) {
  if (!metricsBody) return 0;

  const match = metricsBody.match(/^cloudflared_tunnel_ha_connections(?:\{[^}]*\})?\s+([0-9.]+)/m);
  return match ? Number(match[1]) : 0;
}

export function buildCloudflaredArgs(
  token,
  {
    protocol = DEFAULT_CLOUDFLARED_PROTOCOL,
    metricsAddress = DEFAULT_CLOUDFLARED_METRICS,
  } = {},
) {
  const trimmedToken = String(token || "").trim();
  return [
    "tunnel",
    "--protocol",
    protocol,
    "--metrics",
    metricsAddress,
    "run",
    "--token",
    trimmedToken,
  ];
}

export function chooseWritableLogPath(primaryPath, fallbackPath, canWrite) {
  return canWrite(primaryPath) ? primaryPath : fallbackPath;
}
