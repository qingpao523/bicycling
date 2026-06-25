export async function writeJson(res, payloadPromise, statusCode = 200) {
  const payload = await payloadPromise;
  if (res.writableEnded) return;
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

export function writeJsonError(res, error) {
  if (res.writableEnded) return;

  if (res.headersSent) {
    res.end();
    return;
  }

  res.writeHead(500, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown error" }));
}
