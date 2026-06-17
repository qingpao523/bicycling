#!/bin/bash
set -euo pipefail

TOKEN="eyJhIjoiNGZiYWJlY2YwZjQ0NDQ3ZWUwOGVhY2JhYTM0NjA3ODUiLCJ0IjoiN2FmMzEwYzctNDY1My00YjgyLTljZWMtMjM1NGZhNDUxMWVjIiwicyI6IlptUXdPVEk0TWpNdE9XUTVNQzAwWWpneExUaDNPVFV0T0dJM056RXdaak00WkdRNSJ9"

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
