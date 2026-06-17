#!/bin/bash
set -euo pipefail

echo "=== 1/5 查找网络接口 ==="
IFACE=$(networksetup -listallnetworkservices | grep -v '^\*' | head -1)
echo "使用接口: $IFACE"

echo "=== 2/5 切换 DNS 到 1.1.1.1 / 8.8.8.8 ==="
sudo networksetup -setdnsservers "$IFACE" 1.1.1.1 8.8.8.8
echo "DNS 已切换"

echo "=== 3/5 刷新 DNS 缓存 ==="
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder 2>/dev/null || true

echo "=== 4/5 更新 cloudflared 配置 ==="
sudo mkdir -p /etc/cloudflared
printf 'protocol: http2\nedge-ip-version: auto\n' | sudo tee /etc/cloudflared/config.yml

echo "=== 5/5 重启 cloudflared ==="
sudo launchctl kickstart -k system/com.cloudflare.cloudflared

echo ""
echo "=== 验证 DNS ==="
nslookup region1.v2.argotunnel.com 1.1.1.1

echo ""
echo "=== 等 5 秒后检查日志 ==="
sleep 5
sudo tail -10 /Library/Logs/com.cloudflare.cloudflared.err.log
