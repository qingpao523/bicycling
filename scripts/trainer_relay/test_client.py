#!/usr/bin/env python3
"""
测试客户端 - 连接到 trainer_relay 的 WebSocket 读取修改后的功率数据

用法:
  python test_client.py                    # 连接默认 ws://127.0.0.1:8765/ws
  python test_client.py -p 8080            # 自定义端口
  python test_client.py --http             # 通过 HTTP API 轮询
"""

import argparse
import asyncio
import json
import ssl
import time
import sys


async def ws_client(port: int):
    """WebSocket 客户端"""
    import aiohttp

    url = f"ws://127.0.0.1:{port}/ws"
    print(f"连接到 WebSocket: {url}")

    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(url) as ws:
            print("已连接! 等待数据...\n")
            print(f"{'时间':>10}  {'原始功率':>8}  {'修改功率':>8}  {'踏频':>6}  {'速度':>6}  {'模式':>12}")
            print("-" * 65)

            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    d = json.loads(msg.data)
                    ts = time.strftime("%H:%M:%S", time.localtime(d["timestamp"]))
                    print(
                        f"{ts:>10}  {d['raw']['power']:>6} W  {d['modified']['power']:>6} W  "
                        f"{d['modified']['cadence']:>4.0f} rpm  {d['modified']['speed']:>4.1f} km/h  "
                        f"{d['modification_mode']:>12}"
                    )
                elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    print("连接关闭")
                    break


async def http_client(port: int):
    """HTTP 轮询客户端"""
    import aiohttp

    url = f"http://127.0.0.1:{port}/api/data"
    print(f"HTTP 轮询: {url} (每 500ms)")

    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        d = await resp.json()
                        ts = time.strftime("%H:%M:%S", time.localtime(d["timestamp"]))
                        print(
                            f"{ts:>10}  raw={d['raw']['power']:>4}W  "
                            f"mod={d['modified']['power']:>4}W  cad={d['modified']['cadence']:>4.0f}  "
                            f"speed={d['modified']['speed']:>4.1f}  mode={d['modification_mode']}"
                        )
                    else:
                        print(".", end="", flush=True)
            except Exception as e:
                print(f"\n连接错误: {e}")
            await asyncio.sleep(0.5)


async def change_mode(port: int, mode: str, **kwargs):
    """通过 HTTP API 修改功率模式"""
    import aiohttp

    url = f"http://127.0.0.1:{port}/api/config"
    body = {"power_modification": {"mode": mode, **kwargs}}

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=body) as resp:
            result = await resp.json()
            print(f"模式切换结果: {json.dumps(result, indent=2, ensure_ascii=False)}")


def main():
    parser = argparse.ArgumentParser(description="Trainer Relay 测试客户端")
    parser.add_argument("-p", "--port", type=int, default=8765)
    parser.add_argument("--http", action="store_true", help="使用 HTTP 轮询而非 WebSocket")
    parser.add_argument("--set-mode", default=None, choices=["passthrough", "multiplier", "offset", "fixed"], help="设置功率修改模式后退出")
    parser.add_argument("--multiplier", type=float, default=None)
    parser.add_argument("--offset", type=int, default=None)
    parser.add_argument("--fixed", type=int, default=None)
    args = parser.parse_args()

    if args.set_mode:
        kwargs = {}
        if args.multiplier is not None:
            kwargs["multiplier"] = args.multiplier
        if args.offset is not None:
            kwargs["offset"] = args.offset
        if args.fixed is not None:
            kwargs["fixed"] = args.fixed
        asyncio.run(change_mode(args.port, args.set_mode, **kwargs))
        return

    if args.http:
        asyncio.run(http_client(args.port))
    else:
        asyncio.run(ws_client(args.port))


if __name__ == "__main__":
    main()