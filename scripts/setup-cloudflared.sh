#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$PROJECT_DIR/data/manager/cloudflared-token.txt"

if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  TOKEN="$CLOUDFLARE_TUNNEL_TOKEN"
elif [ -r "$TOKEN_FILE" ]; then
  TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
else
  echo "缺少 Cloudflare tunnel token。请设置 CLOUDFLARE_TUNNEL_TOKEN，或写入 $TOKEN_FILE"
  exit 1
fi

echo "=== 1/4 卸载旧服务 ==="
sudo cloudflared service uninstall 2>/dev/null || true

echo "=== 2/4 创建配置目录 ==="
sudo mkdir -p /etc/cloudflared

echo "=== 3/4 写入配置 (protocol: http2) ==="
echo 'protocol: http2' | sudo tee /etc/cloudflared/config.yml

echo "=== 4/4 安装服务 ==="
sudo cloudflared service install "$TOKEN"

echo ""
echo "=== 完成 ==="
echo "验证: sudo launchctl list | grep cloudflare"
sudo launchctl list | grep cloudflare || echo "(未找到，请检查)"
