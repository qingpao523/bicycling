#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$PROJECT_DIR/data/manager"
LABEL="com.flyaways.ai-cycling-cloudflared-proxy"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
CLOUDFLARED_GUARD="$PROJECT_DIR/scripts/cloudflared-guard.sh"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-/opt/homebrew/bin/cloudflared}"
CLOUDFLARED_METRICS="${CLOUDFLARED_METRICS:-127.0.0.1:20242}"
CLOUDFLARED_PROXY_URL="${CLOUDFLARED_PROXY_URL:-http://127.0.0.1:7897}"
CLOUDFLARE_PUBLIC_URL="${CLOUDFLARE_PUBLIC_URL:-https://bick.qingpao.fun/}"

mkdir -p "$DATA_DIR" "$HOME/Library/LaunchAgents"

if [[ ! -x "$CLOUDFLARED_BIN" ]]; then
  echo "cloudflared not executable: $CLOUDFLARED_BIN" >&2
  exit 1
fi

if [[ ! -f "$DATA_DIR/cloudflared-token.txt" && -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  echo "missing tunnel token: $DATA_DIR/cloudflared-token.txt" >&2
  exit 1
fi

cat > "$PLIST_PATH" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$CLOUDFLARED_GUARD</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>StandardOutPath</key>
    <string>$DATA_DIR/cloudflared-proxy-supervisor.log</string>
    <key>StandardErrorPath</key>
    <string>$DATA_DIR/cloudflared-proxy-supervisor-err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
        <key>PROJECT_DIR</key>
        <string>$PROJECT_DIR</string>
        <key>DATA_DIR</key>
        <string>$DATA_DIR</string>
        <key>CLOUDFLARED_BIN</key>
        <string>$CLOUDFLARED_BIN</string>
        <key>CLOUDFLARED_METRICS</key>
        <string>$CLOUDFLARED_METRICS</string>
        <key>CLOUDFLARED_PROXY_URL</key>
        <string>$CLOUDFLARED_PROXY_URL</string>
        <key>CLOUDFLARE_PUBLIC_URL</key>
        <string>$CLOUDFLARE_PUBLIC_URL</string>
        <key>CLOUDFLARED_PID_FILE</key>
        <string>$DATA_DIR/cloudflared-proxy.pid</string>
        <key>CLOUDFLARED_LOG</key>
        <string>$DATA_DIR/cloudflared-proxy.log</string>
        <key>CLOUDFLARED_ERR</key>
        <string>$DATA_DIR/cloudflared-proxy-err.log</string>
        <key>SUPERVISOR_LOG</key>
        <string>$DATA_DIR/cloudflared-proxy-supervisor.log</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "installed $LABEL"
echo "metrics: http://$CLOUDFLARED_METRICS/metrics"
