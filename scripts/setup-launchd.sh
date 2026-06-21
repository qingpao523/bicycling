#!/bin/bash
# ============================================================
# setup-launchd.sh — system-manager + cloudflared guard
#
# 管理两个独立守护：
#   1. cloudflared guard (LaunchDaemon, 系统级)
#   2. system-manager (LaunchAgent, 用户级)
#
# 用法:
#   1) 直接运行（会弹出系统密码对话框）:
#      bash scripts/setup-launchd.sh
#   2) 或者手动执行:
#      sudo cp /tmp/com.flyaways.ai-cycling-cloudflared.plist /Library/LaunchDaemons/
#      sudo launchctl bootstrap system /Library/LaunchDaemons/com.flyaways.ai-cycling-cloudflared.plist
#      launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.flyaways.ai-cycling-manager.plist
# ============================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

DATA_DIR="$PROJECT_DIR/data/manager"
mkdir -p "$DATA_DIR"

TOKEN_FILE="$DATA_DIR/cloudflared-token.txt"
if [ ! -f "$TOKEN_FILE" ]; then
  echo "✗ 找不到 token 文件: $TOKEN_FILE"
  exit 1
fi

CLOUDFLARED_BIN="/opt/homebrew/bin/cloudflared"
NODE_BIN="/opt/homebrew/bin/node"
CLOUDFLARED_GUARD="$PROJECT_DIR/scripts/cloudflared-guard.sh"
CLOUDFLARED_LABEL="com.flyaways.ai-cycling-cloudflared"
MANAGER_LABEL="com.flyaways.ai-cycling-manager"
CLOUDFLARED_METRICS="${CLOUDFLARED_METRICS:-127.0.0.1:20241}"

if [ ! -x "$CLOUDFLARED_BIN" ]; then
  echo "✗ cloudflared 未安装: $CLOUDFLARED_BIN"
  exit 1
fi

if [ ! -x "$NODE_BIN" ]; then
  echo "✗ node 未安装: $NODE_BIN"
  exit 1
fi

if [ ! -f "$CLOUDFLARED_GUARD" ]; then
  echo "✗ 找不到 cloudflared guard: $CLOUDFLARED_GUARD"
  exit 1
fi

echo "================================================"
echo "🔧 安装 launchd 守护进程"
echo "================================================"

# ---- 1. cloudflared guard LaunchDaemon (系统级, root) ----
echo ""
echo "▶ [1/3] 安装 cloudflared guard 系统守护..."

cat > /tmp/$CLOUDFLARED_LABEL.plist <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$CLOUDFLARED_LABEL</string>
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
    <string>$DATA_DIR/cloudflared-supervisor.log</string>
    <key>StandardErrorPath</key>
    <string>$DATA_DIR/cloudflared-supervisor-err.log</string>
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
        <key>CLOUDFLARE_TUNNEL_TOKEN_FILE</key>
        <string>$TOKEN_FILE</string>
        <key>CLOUDFLARED_METRICS</key>
        <string>$CLOUDFLARED_METRICS</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>SoftResourceLimits</key>
    <integer>65536</integer>
</dict>
</plist>
PLIST_EOF

# 尝试用 osascript 提权写入系统文件
echo "  ⚠ 请确认系统密码对话框..."
sudo -k  # 清除 cached credentials，强制弹出密码框

sudo cp /tmp/$CLOUDFLARED_LABEL.plist /Library/LaunchDaemons/$CLOUDFLARED_LABEL.plist
sudo chmod 644 /Library/LaunchDaemons/$CLOUDFLARED_LABEL.plist
sudo launchctl bootout system/$CLOUDFLARED_LABEL 2>/dev/null || true
sudo launchctl bootout system/com.qingpao.cloudflared 2>/dev/null || true
sudo launchctl bootout system/com.cloudflare.cloudflared 2>/dev/null || true
sudo rm -f /Library/LaunchDaemons/com.qingpao.cloudflared.plist
sudo rm -f /Library/LaunchDaemons/com.cloudflare.cloudflared.plist

if sudo launchctl bootstrap system /Library/LaunchDaemons/$CLOUDFLARED_LABEL.plist && \
  sudo launchctl kickstart -k system/$CLOUDFLARED_LABEL; then
  echo "  ✓ cloudflared guard LaunchDaemon 安装成功"
else
  echo "  ✗ 安装失败，请手动执行："
  echo "    sudo cp /tmp/$CLOUDFLARED_LABEL.plist /Library/LaunchDaemons/"
  echo "    sudo launchctl bootstrap system /Library/LaunchDaemons/$CLOUDFLARED_LABEL.plist"
fi

# ---- 2. system-manager LaunchAgent (用户级) ----
echo ""
echo "▶ [2/3] 安装 system-manager 用户守护..."

cat > ~/Library/LaunchAgents/$MANAGER_LABEL.plist <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$MANAGER_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$PROJECT_DIR/scripts/system-manager.mjs</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>$DATA_DIR/manager.log</string>
    <key>StandardErrorPath</key>
    <string>$DATA_DIR/manager.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>SoftResourceLimits</key>
    <integer>65536</integer>
</dict>
</plist>
PLIST_EOF

launchctl bootout gui/$(id -u)/$MANAGER_LABEL 2>/dev/null || true
launchctl bootout gui/$(id -u)/com.qingpao.system-manager 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/$MANAGER_LABEL.plist
echo "  ✓ system-manager LaunchAgent 安装成功"

# ---- 3. 启动/重启 Next.js app ----
echo ""
echo "▶ [3/3] 启动 Next.js 应用..."
sleep 5

# 让 system-manager 接管 Next.js 管理（通过 API）
if curl -sf http://127.0.0.1:3210/ >/dev/null 2>&1; then
  curl -s -X POST http://127.0.0.1:3210/api/restart 2>/dev/null && \
    echo "  ✓ Next.js app 已重启" || echo "  ⚠ 无法重启 app，请手动操作"
else
  echo "  ⚠ system-manager 尚未就绪 (等待中)，稍后重试..."
  sleep 5
  if curl -sf http://127.0.0.1:3210/ >/dev/null 2>&1; then
    curl -s -X POST http://127.0.0.1:3210/api/restart 2>/dev/null && \
      echo "  ✓ Next.js app 已重启" || echo "  ⚠ 无法重启 app，请手动操作"
  else
    echo "  ⚠ system-manager 仍未就绪，请手动访问 http://127.0.0.1:3210 启动"
  fi
fi

echo ""
echo "================================================"
echo "✅ 安装完成！"
echo ""
echo "  cloudflared   → LaunchDaemon guard (系统级, 自动拉起 + HA 检查)"
echo "  system-manager→ LaunchAgent (用户级, 自动拉起)"
echo "  next.js app   → 由 system-manager watchdog 管理"
echo ""
echo "  日志: $DATA_DIR/cloudflared-err.log"
echo "  守护日志: $DATA_DIR/cloudflared-supervisor.log"
echo "  Metrics: http://$CLOUDFLARED_METRICS/metrics"
echo "  状态: http://127.0.0.1:3210"
echo ""
echo "  🔑 如果 cloudflared 仍然报 1033/530，请检查："
echo "     1. cloudflared token 是否有效 (在 Cloudflare Dashboard 验证)"
echo "     2. 网络是否有代理/防火墙拦截 TLS"
echo "================================================"
