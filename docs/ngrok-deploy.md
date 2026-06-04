# ngrok 上线步骤

适用场景：
- 你没有域名
- 需要把这套系统临时给外部 1-10 个用户访问
- 主机是你当前这台 Mac mini

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
```

生成随机密钥的一个简单方式：

```bash
openssl rand -hex 32
```

把输出填进 `APP_SECRET=`。

## 2. 重新构建并重启应用

用桌面上的系统管家：

- 打开 `/Users/flyaways/Desktop/AI骑行助手系统管家.app`
- 点击 `重新构建并重启`

或者手动启动：

```bash
cd /Users/flyaways/ai-cycling-mvp
./scripts/start-production.sh
```

## 3. 安装 ngrok

如果你用 Homebrew：

```bash
brew install ngrok/ngrok/ngrok
```

然后登录你的 ngrok 账号，把 authtoken 配进去：

```bash
ngrok config add-authtoken <你的_ngrok_authtoken>
```

## 4. 暴露本地服务

主应用是 3000 端口，运行：

```bash
ngrok http 3000
```

如果你还想把系统管家一起暴露出去，不建议给外部用户直接用；它应该只给你自己内网访问。

## 5. 获取公网地址

ngrok 启动后会输出类似：

```text
Forwarding  https://xxxx.ngrok-free.app -> http://localhost:3000
```

把这个 `https://xxxx.ngrok-free.app` 发给用户即可。

## 6. 登录策略建议

外部用户开始访问前，建议在管理端设置：

- `登录模式` 先用 `仅管理员发号`
- 不要先开放注册

这样你可以先手动创建账号，避免陌生人误进。

## 7. 重要注意事项

- 免费 ngrok 地址可能变化，重启 ngrok 后链接可能会变
- 你的 Mac mini 必须持续在线
- `APP_SECRET` 改变后，旧会话和已加密 key 可能失效
- 如果你把系统公开给别人访问，建议立即更换任何已经在聊天里泄露过的 API key

## 8. 推荐你的最小上线顺序

1. 配 `.env.production.local`
2. 系统管家里点 `重新构建并重启`
3. 本机确认 `http://127.0.0.1:3000` 可用
4. 运行 `ngrok http 3000`
5. 把 `https://xxxx.ngrok-free.app` 发给测试用户
