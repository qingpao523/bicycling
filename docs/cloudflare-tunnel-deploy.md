# Cloudflare Tunnel 上线步骤

适用场景：
- 需要稳定的公网域名（不会像 ngrok 那样每次重启变地址）
- 主机是你当前这台 Mac mini
- 通过 Cloudflare Dashboard 管理 tunnel

## 1. 准备生产环境变量

在项目根目录创建 `.env.production.local`：

```bash
cd /Users/flyaways/ai-cycling-mvp
cp .env.example .env.production.local
```

至少修改这些值：

```env
NODE_ENV=production
APP_SECRET=请替换成至少32位随机字符串
APP_URL=http://127.0.0.1:3000
APP_PORT=3000
MANAGER_PORT=3210
HOSTNAME=127.0.0.1

# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=你的tunnel token
CLOUDFLARE_TUNNEL_URL=https://你的域名.com
CLOUDFLARED_METRICS=127.0.0.1:20241
```

生成随机密钥：

```bash
openssl rand -hex 32
```

## 2. 安装 cloudflared

```bash
brew install cloudflared
```

## 3. 在 Cloudflare Dashboard 创建 Tunnel

1. 登录 https://one.dash.cloudflare.com/
2. Networks → Tunnels → Create a tunnel
3. 选择 Cloudflared connector
4. 复制 tunnel token，填入 `CLOUDFLARE_TUNNEL_TOKEN`
5. 配置 Public Hostname：你的域名 → `http://localhost:3000`

## 4. 启动守护

推荐安装 launchd 守护，它会用 `scripts/cloudflared-guard.sh` 启动 cloudflared，并通过固定 metrics 端口检查 HA 连接数：

```bash
bash scripts/setup-launchd.sh
```

也可以用系统管家手动操作：

- 打开系统管家 `http://127.0.0.1:3210`
- 点击"启动 CF 公网入口"

或手动：

```bash
cloudflared tunnel --protocol http2 --metrics 127.0.0.1:20241 run --token <你的token>
```

## 5. 看门狗自动恢复

系统管家的看门狗会检查 `cloudflared_tunnel_ha_connections`。如果 connector 掉线或 HA 连接数为 0，会尝试恢复 CF 公网入口。launchd guard 也会独立巡检并重启 cloudflared，避免 1033。

## 6. 重要注意事项

- Tunnel token 请妥善保管，不要提交到 git
- 公网域名固定，不会像 ngrok 那样每次变
- Mac mini 必须持续在线
- `APP_SECRET` 改变后，旧会话和已加密 key 可能失效
