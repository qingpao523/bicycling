# Trainer Power Relay — 使用教程

骑行台功率中继器，连接 ThinkRider 等 FTMS 骑行台，实时读取并修改功率数据，通过 WebSocket + HTTP 对外暴露，用于集成测试。

---

## 1. 安装依赖

```bash
pip3 install bleak aiohttp
```

确保 Mac 的蓝牙已开启，且骑行台通电、未连接其他设备。

---

## 2. 启动中继

```bash
cd scripts/trainer_relay

# 自动扫描连接骑行台，功率不变（直通模式）
python3 trainer_relay.py

# 指定骑行台名称（ThinkRider 通常自动识别）
python3 trainer_relay.py -n ThinkRider

# 指定 BLE 地址
python3 trainer_relay.py -a AA:BB:CC:DD:EE:FF

# 仅扫描周围 BLE 设备，不连接（调试用）
python3 trainer_relay.py --scan-only
```

启动成功后终端会打印：
```
数据服务器已启动: http://127.0.0.1:8765
  WebSocket: ws://127.0.0.1:8765/ws
  API:       http://127.0.0.1:8765/api/*
```

---

## 3. 功率修改 — 四种模式

所有参数通过命令行指定，运行中可通过 Dashboard 或 API 动态切换，无需重启。

### 3.1 乘系数

```bash
# 实际功率 × 0.8（打八折）
python3 trainer_relay.py -m multiplier -x 0.8

# 实际功率 × 1.2（加两成）
python3 trainer_relay.py -m multiplier -x 1.2
```

### 3.2 偏移

```bash
# 实际功率 +30W
python3 trainer_relay.py -m offset -o 30

# 实际功率 -50W
python3 trainer_relay.py -m offset -o -50
```

### 3.3 固定值

```bash
# 无论踩多少，始终输出 200W
python3 trainer_relay.py -m fixed -f 200
```

### 3.4 直通（不修改）

```bash
# 原样转发，不改功率
python3 trainer_relay.py -m passthrough
```

---

## 4. 打开 Dashboard 控制台

启动中继后，两种方式打开：

| 方式 | 说明 |
|---|---|
| 浏览器访问 `http://127.0.0.1:8765` | 中继内置的 Web 控制台（需先启动中继） |
| 双击 `dashboard.html` | 独立页面，随时可打开 |

Dashboard 功能：

- **数据面板**：原始功率、修改后功率、踏频、速度、心率，实时刷新
- **功率折线图**：最近 60 秒的原始（灰色虚线）和修改后（蓝色实线）功率对比
- **模式切换**：直通 / 乘系数 / 偏移 / 固定，四个按钮点选
- **参数调节**：滑块拖拽，实时预览数值
- **应用配置**：点击后通过 API 发送，立即生效
- **快捷预设**：一键 0.7 折、+30W、固定 150W 等
- **连接指示**：顶栏绿灯亮表示 WebSocket 已连接

---

## 5. 测试脚本接入

### 5.1 WebSocket（推荐，实时推送）

```python
import asyncio, json
import aiohttp

async def main():
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect("ws://127.0.0.1:8765/ws") as ws:
            async for msg in ws:
                d = json.loads(msg.data)
                print(f"原始={d['raw']['power']}W → 修改={d['modified']['power']}W")

asyncio.run(main())
```

### 5.2 HTTP 轮询

```python
import requests, time

while True:
    r = requests.get("http://127.0.0.1:8765/api/data")
    if r.status_code == 200:
        d = r.json()
        print(f"修改后功率: {d['modified']['power']}W")
    time.sleep(0.5)
```

### 5.3 动态切换功率模式

```python
import requests

# 切到乘系数 0.75
requests.post("http://127.0.0.1:8765/api/config", json={
    "power_modification": {"mode": "multiplier", "multiplier": 0.75}
})

# 切到固定 250W
requests.post("http://127.0.0.1:8765/api/config", json={
    "power_modification": {"mode": "fixed", "fixed": 250}
})

# 切到 +40W 偏移
requests.post("http://127.0.0.1:8765/api/config", json={
    "power_modification": {"mode": "offset", "offset": 40}
})
```

---

## 6. WebSocket 数据格式

每条消息是一个 JSON 对象，约每 250ms 推送一次：

```json
{
  "timestamp": 1715950000.123,
  "raw": {
    "power": 185,
    "cadence": 82.5,
    "speed": 28.3,
    "heart_rate": 0,
    "distance": 0
  },
  "modified": {
    "power": 148,
    "cadence": 82.5,
    "speed": 28.3,
    "heart_rate": 0,
    "distance": 0
  },
  "modification_mode": "multiplier"
}
```

功率以外的字段（踏频、速度）不做修改，原样转发。heart_rate 为 0 表示没有心率数据。

---

## 7. API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/status` | 连接状态、客户端数 |
| `GET` | `/api/data` | 最新一条数据 |
| `GET` | `/api/config` | 当前配置 |
| `POST` | `/api/config` | 热更新配置 |

POST `/api/config` 请求体示例：

```json
{
  "power_modification": {
    "mode": "multiplier",
    "multiplier": 0.85,
    "offset": 0,
    "fixed": 200,
    "min_power": 0,
    "max_power": 2000
  }
}
```

只需传要修改的字段，未传的保持原值。

---

## 8. CSV 数据记录

```bash
# 运行时记录所有原始和修改后数据到 CSV
python3 trainer_relay.py -m multiplier -x 0.8 --csv ./test_run_20260517.csv
```

CSV 格式：`timestamp, raw_power, mod_power, cadence, speed, mode`

---

## 9. 典型测试流程

```bash
# 1. 启动中继
python3 trainer_relay.py -m passthrough

# 2. 另开终端，确认数据正常
python3 test_client.py

# 3. 浏览器打开 Dashboard
open http://127.0.0.1:8765
# 或双击 dashboard.html

# 4. 在 Dashboard 上实时切换功率模式，观察数据变化

# 5. 自动化测试脚本连 WebSocket 读取数据
#    (参考第 5 节示例代码)

# 6. 记录测试数据
python3 trainer_relay.py -m multiplier -x 0.85 --csv ./results.csv
```

---

## 10. 常见问题

**Q: 启动后提示"未找到骑行台 BLE 设备"**

确认：骑行台通电且指示灯闪烁（表示等待连接），电脑蓝牙已开，没有其他设备（手机 App、另一台电脑）正连接骑行台。可以用 `--scan-only` 参数扫描周围 BLE 设备确认。

**Q: WebSocket 连不上 / Dashboard 显示"未连接"**

确认中继进程在运行（终端里有日志输出）。检查端口是否被占用：`lsof -i :8765`。

**Q: 功率数据不更新**

可能是骑行台没有发送数据。确认骑行台处于可骑行状态（非待机），踏几圈看数据是否变化。ThinkRider 某些型号需要转动飞轮才会开始广播数据。

**Q: 想改端口**

```bash
python3 trainer_relay.py -p 8080
```

Dashboard 里修改地址栏也能连其他端口。

---

## 文件结构

```
scripts/trainer_relay/
├── trainer_relay.py    # 主程序：BLE 客户端 + 功率修改 + HTTP/WS 服务
├── dashboard.html      # 独立 Web 控制台（双击打开）
├── test_client.py      # 命令行测试客户端
├── config.json         # JSON 配置文件
└── requirements.txt    # Python 依赖
```