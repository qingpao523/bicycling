export function buildRequestUrl(request: Request, target: string) {
  const fallback = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || fallback.host;
  const proto = forwardedProto || fallback.protocol.replace(/:$/, "");

  return new URL(target, `${proto}://${host}`);
}
