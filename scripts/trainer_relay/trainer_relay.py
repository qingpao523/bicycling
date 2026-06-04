#!/usr/bin/env python3
"""
BLE Cycling Trainer Power Relay — 骑行台功率中继器
==================================================
集成测试工具：连接 ThinkRider 等 FTMS 骑行台，读取功率数据并可修改后
通过 WebSocket + HTTP API 对外暴露，供测试脚本自动化消费。

架构:
  ThinkRider 骑行台
       │  BLE (CoreBluetooth via bleak)
       ▼
  TrainerClient ──原始数据──▶ PowerModifier ──修改后数据──▶ DataServer
                                                                │
                                                  ws://127.0.0.1:8765/ws
                                                  http://127.0.0.1:8765/api/*
                                                                │
                                                        测试客户端 / 桥接程序

依赖: bleak, aiohttp
安装: pip3 install -r requirements.txt
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import signal
import struct
import sys
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

# ── BLE 常量: FTMS (Fitness Machine Service) ──────────────────────────

FMS_SERVICE_UUID = "00001826-0000-1000-8000-00805f9b34fb"

# FTMS 特征值 UUID
CHAR_INDOOR_BIKE_DATA      = "00002ad2-0000-1000-8000-00805f9b34fb"
CHAR_CYCLING_POWER_MEASURE = "00002a63-0000-1000-8000-00805f9b34fb"
CHAR_FITNESS_MACHINE_FEAT  = "00002acc-0000-1000-8000-00805f9b34fb"
CHAR_CONTROL_POINT         = "00002ad9-0000-1000-8000-00805f9b34fb"
CHAR_FITNESS_MACHINE_STATUS= "00002ada-0000-1000-8000-00805f9b34fb"
CHAR_HEART_RATE_MEASURE    = "00002a37-0000-1000-8000-00805f9b34fb"

HRS_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb"

# Indoor Bike Data 标志位 (bitfield, 2 bytes, little-endian)
IBD_FLAG_AVG_SPEED             = 0x0001
IBD_FLAG_INST_CADENCE          = 0x0002
IBD_FLAG_AVG_CADENCE           = 0x0004
IBD_FLAG_TOTAL_DISTANCE        = 0x0008
IBD_FLAG_RESISTANCE_LEVEL      = 0x0010
IBD_FLAG_INST_POWER            = 0x0020
IBD_FLAG_AVG_POWER             = 0x0040
IBD_FLAG_EXPENDED_ENERGY       = 0x0080
IBD_FLAG_HEART_RATE            = 0x0100
IBD_FLAG_METABOLIC_EQUIVALENT  = 0x0200
IBD_FLAG_ELAPSED_TIME          = 0x0400
IBD_FLAG_REMAINING_TIME        = 0x0800

# Cycling Power Measurement 标志位
CPM_FLAG_PEDAL_POWER_BALANCE   = 0x0001
CPM_FLAG_ACCUMULATED_TORQUE    = 0x0004
CPM_FLAG_WHEEL_REV_DATA        = 0x0008
CPM_FLAG_CRANK_REV_DATA        = 0x0010
CPM_FLAG_EXTREME_FORCE_MAG     = 0x0020
CPM_FLAG_EXTREME_TORQUE_MAG    = 0x0040
CPM_FLAG_EXTREME_ANGLES        = 0x0080
CPM_FLAG_TOP_DEAD_SPOT         = 0x0100
CPM_FLAG_BOTTOM_DEAD_SPOT      = 0x0200
CPM_FLAG_ACCUMULATED_ENERGY    = 0x0400

logger = logging.getLogger("trainer_relay")

# ── 降级仪表盘 (dashboard.html 找不到时使用) ──────────────────────────

_FALLBACK_DASHBOARD = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trainer Power Relay</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--red:#f85149;--cyan:#39d2c0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
header{background:var(--card);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;justify-content:space-between}
h1{font-size:1.2rem}
.dot{width:10px;height:10px;border-radius:50%;background:var(--red);display:inline-block}
.dot.on{background:var(--green)}
main{max-width:700px;margin:24px auto;padding:0 20px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:18px;text-align:center}
.card.wide{grid-column:1/-1}
.card .val{font-size:2.2rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2}
.card .unit{font-size:.8rem;color:var(--muted);margin-left:2px}
.card .lbl{font-size:.75rem;color:var(--muted);margin-top:4px}
.pv{color:var(--muted)} .pmv{color:var(--accent)} .pc{color:var(--cyan)} .ps{color:var(--green)}
.controls{grid-column:1/-1;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px}
.controls h3{font-size:.78rem;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em}
.modes{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.modes button{padding:8px 14px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer;font-size:.8rem}
.modes button:hover{border-color:var(--accent)}
.modes button.on{border-color:var(--accent);background:rgba(88,166,255,0.12);color:var(--accent);font-weight:600}
.row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.row label{font-size:.78rem;color:var(--muted);min-width:50px}
.row input[type=range]{flex:1}
.row span{font-size:.8rem;min-width:36px;text-align:right}
#apply{width:100%;margin-top:10px;padding:10px;border:none;border-radius:6px;background:var(--accent);color:#fff;font-size:.85rem;font-weight:600;cursor:pointer}
#apply:hover{filter:brightness(1.1)}
#apply:disabled{opacity:.4;cursor:not-allowed}
#status{font-size:.82rem}
</style>
</head>
<body>
<header><h1>Trainer Power Relay</h1><span id="status"><span class="dot" id="dot"></span> <span id="stxt">未连接</span></span></header>
<main>
<div class="card"><div class="lbl">原始功率</div><div class="val pv" id="rp">--<span class="unit">W</span></div></div>
<div class="card"><div class="lbl">修改后功率</div><div class="val pmv" id="mp">--<span class="unit">W</span></div></div>
<div class="card"><div class="lbl">踏频</div><div class="val pc" id="cad">--<span class="unit">rpm</span></div></div>
<div class="card"><div class="lbl">速度</div><div class="val ps" id="spd">--<span class="unit">km/h</span></div></div>
<div class="controls">
<h3>功率修改控制</h3>
<div class="modes">
<button class="on" data-m="passthrough">直通</button>
<button data-m="multiplier">乘系数</button>
<button data-m="offset">偏移</button>
<button data-m="fixed">固定</button>
</div>
<div class="row"><label>系数</label><input type="range" id="sl-mul" min="0.1" max="3" step="0.05" value="0.9"><span id="vl-mul">0.90</span></div>
<div class="row"><label>偏移</label><input type="range" id="sl-off" min="-200" max="200" step="5" value="0"><span id="vl-off">0</span></div>
<div class="row"><label>固定</label><input type="range" id="sl-fix" min="0" max="1000" step="5" value="200"><span id="vl-fix">200</span></div>
<button id="apply" onclick="applyCfg()">应用配置</button>
<p style="margin-top:8px;font-size:.7rem;color:var(--muted)">提示: 完整版控制台请打开 dashboard.html</p>
</div>
</main>
<script>
let ws,curM='passthrough',hp=location.host||'127.0.0.1:8765';
function cn(){ws=new WebSocket('ws://'+hp+'/ws');ws.onopen=()=>{document.getElementById('dot').className='dot on';document.getElementById('stxt').textContent='已连接'};ws.onclose=()=>{document.getElementById('dot').className='dot';document.getElementById('stxt').textContent='已断开';setTimeout(cn,3000)};ws.onmessage=e=>{let d=JSON.parse(e.data);document.getElementById('rp').innerHTML=d.raw.power+'<span class=unit>W</span>';document.getElementById('mp').innerHTML=d.modified.power+'<span class=unit>W</span>';document.getElementById('cad').innerHTML=(d.modified.cadence||0).toFixed(0)+'<span class=unit>rpm</span>';document.getElementById('spd').innerHTML=(d.modified.speed||0).toFixed(1)+'<span class=unit>km/h</span>'}}
function applyCfg(){let m=document.querySelector('.modes button.on').dataset.m,b={power_modification:{mode:m,multiplier:+document.getElementById('sl-mul').value,offset:+document.getElementById('sl-off').value,fixed:+document.getElementById('sl-fix').value}};fetch('http://'+hp+'/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})}
document.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.modes button').forEach(x=>x.className='');b.className='on';['sl-mul','sl-off','sl-fix'].forEach(id=>document.getElementById(id).disabled=true);if(b.dataset.m==='multiplier')document.getElementById('sl-mul').disabled=false;if(b.dataset.m==='offset')document.getElementById('sl-off').disabled=false;if(b.dataset.m==='fixed')document.getElementById('sl-fix').disabled=false});
['sl-mul','sl-off','sl-fix'].forEach(id=>document.getElementById(id).oninput=function(){let v=parseFloat(this.value);document.getElementById('vl-'+id.split('-')[1]).textContent=id==='sl-mul'?v.toFixed(2):Math.round(v)});
['sl-off','sl-fix'].forEach(id=>document.getElementById(id).disabled=true);
cn();
</script>
</body>
</html>"""

# ── 数据结构 ──────────────────────────────────────────────────────────

@dataclass
class TrainerData:
    """骑行台原始数据包"""
    timestamp: float = 0.0
    power: int = 0            # 瞬时功率 (W)
    cadence: float = 0.0      # 踏频 (rpm)
    speed: float = 0.0        # 速度 (km/h)
    heart_rate: int = 0       # 心率 (bpm)
    distance: int = 0         # 累计距离 (m)
    resistance: int = 0       # 阻力等级 (-100 ~ 100)
    elapsed_time: int = 0     # 已用时间 (s)


@dataclass
class ModifiedData:
    """修改后的输出数据"""
    timestamp: float = 0.0
    raw: TrainerData = field(default_factory=TrainerData)
    power: int = 0
    cadence: float = 0.0
    speed: float = 0.0
    heart_rate: int = 0
    distance: int = 0
    modification_mode: str = "passthrough"


class ModificationMode(Enum):
    PASSTHROUGH = "passthrough"  # 不修改
    MULTIPLIER  = "multiplier"   # 乘以系数
    OFFSET      = "offset"       # 加减偏移
    FIXED       = "fixed"        # 固定值


# ── 功率数据解析器 ───────────────────────────────────────────────────

class FTMSDataParser:
    """解析 FTMS 蓝牙数据包"""

    @staticmethod
    def parse_indoor_bike_data(data: bytes) -> TrainerData:
        """解析 Indoor Bike Data (0x2AD2)"""
        if len(data) < 4:
            raise ValueError(f"Indoor Bike Data too short: {len(data)} bytes")

        flags = struct.unpack_from("<H", data, 0)[0]
        offset = 2
        result = TrainerData(timestamp=time.time())

        # 瞬时速度 (0.01 km/h)
        result.speed = struct.unpack_from("<H", data, offset)[0] * 0.01
        offset += 2

        if flags & IBD_FLAG_AVG_SPEED:
            offset += 2  # 平均速度, 暂不使用

        if flags & IBD_FLAG_INST_CADENCE:
            result.cadence = struct.unpack_from("<H", data, offset)[0] * 0.5
            offset += 2

        if flags & IBD_FLAG_AVG_CADENCE:
            offset += 2  # 平均踏频, 暂不使用

        if flags & IBD_FLAG_TOTAL_DISTANCE:
            raw_dist = struct.unpack_from("<H", data, offset)[0]
            extra_byte = data[offset + 2] if offset + 2 < len(data) else 0
            result.distance = raw_dist | (extra_byte << 16)
            offset += 3

        if flags & IBD_FLAG_RESISTANCE_LEVEL:
            result.resistance = struct.unpack_from("<h", data, offset)[0]
            offset += 2

        if flags & IBD_FLAG_INST_POWER:
            if offset + 2 <= len(data):
                result.power = struct.unpack_from("<h", data, offset)[0]
            offset += 2

        if flags & IBD_FLAG_AVG_POWER:
            offset += 2  # 平均功率, 暂不使用

        if flags & IBD_FLAG_HEART_RATE:
            if offset + 1 <= len(data):
                result.heart_rate = data[offset]
            offset += 1

        return result

    @staticmethod
    def parse_cycling_power_measurement(data: bytes) -> TrainerData:
        """解析 Cycling Power Measurement (0x2A63)"""
        if len(data) < 4:
            raise ValueError(f"CPM data too short: {len(data)} bytes")

        flags = struct.unpack_from("<H", data, 0)[0]
        result = TrainerData(timestamp=time.time())
        result.power = struct.unpack_from("<h", data, 2)[0]

        offset = 4
        if flags & CPM_FLAG_PEDAL_POWER_BALANCE:
            offset += 1
        if flags & CPM_FLAG_ACCUMULATED_TORQUE:
            offset += 2
        if flags & CPM_FLAG_WHEEL_REV_DATA:
            offset += 6
        if flags & CPM_FLAG_CRANK_REV_DATA:
            offset += 4
        if flags & CPM_FLAG_EXTREME_FORCE_MAG:
            offset += 4
        if flags & CPM_FLAG_EXTREME_TORQUE_MAG:
            offset += 4

        if flags & CPM_FLAG_EXTREME_ANGLES:
            offset += 3
        if flags & CPM_FLAG_TOP_DEAD_SPOT:
            offset += 2
        if flags & CPM_FLAG_BOTTOM_DEAD_SPOT:
            offset += 2
        if flags & CPM_FLAG_ACCUMULATED_ENERGY:
            offset += 2

        return result


# ── 功率修改器 ────────────────────────────────────────────────────────

class PowerModifier:
    """功率数据修改器，支持多种修改模式"""

    def __init__(self, config: dict):
        self.config = config
        self._load_config(config)

    def _load_config(self, config: dict):
        pc = config.get("power_modification", {})
        mode_str = pc.get("mode", "passthrough")
        try:
            self.mode = ModificationMode(mode_str)
        except ValueError:
            logger.warning(f"Unknown mode '{mode_str}', falling back to passthrough")
            self.mode = ModificationMode.PASSTHROUGH

        self.multiplier = pc.get("multiplier", 1.0)
        self.offset = pc.get("offset", 0)
        self.fixed = pc.get("fixed", 200)
        self.min_power = pc.get("min_power", 0)
        self.max_power = pc.get("max_power", 2000)

    def reload_config(self, config: dict):
        """热更新配置, 通过 HTTP API 调用"""
        self._load_config(config)
        logger.info(
            f"Power modifier config reloaded: mode={self.mode.value}, "
            f"multiplier={self.multiplier}, offset={self.offset}, fixed={self.fixed}"
        )

    def modify(self, raw: TrainerData) -> ModifiedData:
        """根据当前模式修改功率"""
        if self.mode == ModificationMode.PASSTHROUGH:
            new_power = raw.power
        elif self.mode == ModificationMode.MULTIPLIER:
            new_power = int(raw.power * self.multiplier)
        elif self.mode == ModificationMode.OFFSET:
            new_power = raw.power + self.offset
        elif self.mode == ModificationMode.FIXED:
            new_power = self.fixed
        else:
            new_power = raw.power

        new_power = max(self.min_power, min(self.max_power, new_power))

        return ModifiedData(
            timestamp=raw.timestamp,
            raw=raw,
            power=new_power,
            cadence=raw.cadence,
            speed=raw.speed,
            heart_rate=raw.heart_rate,
            distance=raw.distance,
            modification_mode=self.mode.value,
        )

    def get_status(self) -> dict:
        return {
            "mode": self.mode.value,
            "multiplier": self.multiplier,
            "offset": self.offset,
            "fixed": self.fixed,
            "min_power": self.min_power,
            "max_power": self.max_power,
        }


# ── BLE 骑行台客户端 ─────────────────────────────────────────────────

class TrainerClient:
    """BLE 骑行台客户端 — 扫描并连接 ThinkRider / FTMS 骑行台"""

    def __init__(self, config: dict):
        import bleak  # type: ignore
        self.bleak = bleak
        self.config = config
        tc = config.get("trainer", {})
        self.target_name = tc.get("name")
        self.target_address = tc.get("address")
        self.scan_timeout = tc.get("scan_timeout", 10)
        self.reconnect_interval = tc.get("reconnect_interval", 5)

        self._client: Optional[bleak.BleakClient] = None
        self._device = None
        self._data_callback = None
        self._connected = False
        self._running = False
        self._latest_data: Optional[TrainerData] = None
        self._device_info: dict = {}

    @property
    def connected(self) -> bool:
        return self._connected and self._client is not None and self._client.is_connected

    @property
    def latest_data(self) -> Optional[TrainerData]:
        return self._latest_data

    @property
    def device_info(self) -> dict:
        return self._device_info

    def on_data(self, callback):
        """注册数据回调: callback(TrainerData)"""
        self._data_callback = callback

    async def scan_and_connect(self) -> bool:
        """扫描 BLE 设备, 找到骑行台并连接"""
        logger.info("开始扫描 BLE 设备...")

        try:
            devices = await self.bleak.BleakScanner.discover(
                timeout=self.scan_timeout,
                return_adv=True
            )
        except Exception as e:
            err_msg = str(e)
            if "not authorized" in err_msg.lower() or "bluetooth" in err_msg.lower() or "abort" in err_msg.lower():
                logger.error(
                    "\n  ⚠️  蓝牙权限不足! macOS 需要授权才能扫描 BLE 设备。\n"
                    "  请前往: 系统设置 → 隐私与安全性 → 蓝牙\n"
                    "  确保你的终端 (Terminal.app / iTerm) 在列表中并已勾选。\n"
                    f"  原始错误: {e}"
                )
            else:
                logger.error(f"BLE 扫描失败: {e}")
            return False

        trainer = None
        for addr, (device, adv) in devices.items():
            name = device.name or adv.local_name or ""
            # 匹配目标设备
            if self.target_address and addr.upper() == self.target_address.upper():
                trainer = device
                logger.info(f"通过地址匹配到设备: {name} ({addr})")
                break
            if self.target_name and self.target_name.lower() in name.lower():
                trainer = device
                logger.info(f"通过名称匹配到设备: {name} ({addr})")
                break
            # 自动识别 ThinkRider
            if "thinkrider" in name.lower() or "think" in name.lower():
                trainer = device
                logger.info(f"自动识别到 ThinkRider 设备: {name} ({addr})")
                break
            # 检查是否广播了 FTMS 服务
            if FMS_SERVICE_UUID in (adv.service_uuids or []):
                trainer = device
                logger.info(f"发现 FTMS 设备: {name} ({addr})")
                break

        if not trainer:
            logger.warning(
                "未找到骑行台 BLE 设备。请确保:\n"
                "  1. 骑行台已通电并处于待连接状态\n"
                "  2. 没有其他设备/App 正连接骑行台\n"
                "  3. 蓝牙已开启"
            )
            return False

        self._device = trainer
        return await self._connect(trainer)

    async def _connect(self, device) -> bool:
        """连接到指定 BLE 设备并订阅 FTMS 通知"""
        addr = device.address
        name = device.name or "Unknown"
        logger.info(f"正在连接 {name} ({addr})...")

        self._client = self.bleak.BleakClient(
            addr,
            disconnected_callback=self._on_disconnect,
            timeout=30.0,
        )

        try:
            await self._client.connect()
            logger.info(f"已连接 {name}")
        except Exception as e:
            logger.error(f"连接失败: {e}")
            return False

        # 发现服务
        await asyncio.sleep(1.0)

        # 订阅 Indoor Bike Data 通知
        if FMS_SERVICE_UUID in (self._client.services.service_uuids() if hasattr(self._client.services, 'service_uuids') else []):
            pass  # service exists

        # 直接在特征值 UUID 上注册通知
        indoor_subscribed = await self._subscribe_if_available(
            CHAR_INDOOR_BIKE_DATA, self._on_indoor_bike_data
        )
        power_subscribed = await self._subscribe_if_available(
            CHAR_CYCLING_POWER_MEASURE, self._on_cycling_power
        )

        if not indoor_subscribed and not power_subscribed:
            logger.warning(
                "未找到 Indoor Bike Data 或 Cycling Power Measurement 特征值。\n"
                "骑行台可能尚未完全就绪，或使用了非标准 UUID。"
            )
        else:
            logger.info(
                "数据订阅完成 (IBD: %s, CPM: %s)",
                indoor_subscribed, power_subscribed
            )

        self._connected = True
        self._device_info = {
            "name": name,
            "address": addr,
            "indoor_bike_data": indoor_subscribed,
            "power_measurement": power_subscribed,
        }
        return True

    async def _subscribe_if_available(self, char_uuid: str, handler) -> bool:
        """如果特征值存在则订阅通知"""
        try:
            # 尝试用 bleak 的 start_notify，它会自动查找特征值
            await self._client.start_notify(char_uuid, handler)
            logger.debug(f"已订阅 {char_uuid}")
            return True
        except Exception:
            logger.debug(f"特征值不可用: {char_uuid}")
            return False

    def _on_indoor_bike_data(self, sender: int, data: bytearray):
        """Indoor Bike Data 通知回调"""
        try:
            parsed = FTMSDataParser.parse_indoor_bike_data(bytes(data))
            self._latest_data = parsed
            if self._data_callback:
                self._data_callback(parsed)
        except Exception as e:
            logger.debug(f"解析 Indoor Bike Data 失败: {e}")

    def _on_cycling_power(self, sender: int, data: bytearray):
        """Cycling Power Measurement 通知回调"""
        try:
            parsed = FTMSDataParser.parse_cycling_power_measurement(bytes(data))
            # 只在没有 IBD 数据时使用 CPM
            if self._latest_data is None:
                self._latest_data = parsed
                if self._data_callback:
                    self._data_callback(parsed)
        except Exception as e:
            logger.debug(f"解析 CPM 失败: {e}")

    def _on_disconnect(self, client):
        """断开连接回调"""
        logger.warning("骑行台 BLE 连接断开")
        self._connected = False

    async def disconnect(self):
        """断开连接"""
        self._connected = False
        if self._client and self._client.is_connected:
            try:
                await self._client.disconnect()
            except Exception:
                pass
        logger.info("已断开骑行台连接")


# ── WebSocket + HTTP 数据服务器 ──────────────────────────────────────

class DataServer:
    """WebSocket + HTTP API 服务器, 对外暴露修改后的功率数据"""

    def __init__(self, config: dict):
        self.config = config
        sc = config.get("server", {})
        self.host = sc.get("host", "127.0.0.1")
        self.port = sc.get("port", 8765)
        self.data_interval = sc.get("data_interval_ms", 250) / 1000.0

        self._app = None
        self._runner = None
        self._ws_clients: set = set()
        self._latest_modified: Optional[ModifiedData] = None
        self._config_callback = None

        # 启动时读取 dashboard.html 缓存起来, 避免请求时路径解析问题
        self._dashboard_html = self._load_dashboard()

    @staticmethod
    def _load_dashboard() -> str:
        """读取同目录下的 dashboard.html, 失败返回降级页面"""
        # 用脚本所在目录做基准, 兼容各种运行方式
        try:
            script_dir = os.path.dirname(os.path.abspath(__file__))
        except NameError:
            script_dir = os.getcwd()
        dash_path = os.path.join(script_dir, "dashboard.html")
        if os.path.exists(dash_path):
            try:
                with open(dash_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                logger.warning(f"读取 dashboard.html 失败: {e}")
        return _FALLBACK_DASHBOARD

    @property
    def latest_data(self) -> Optional[ModifiedData]:
        return self._latest_modified

    def on_config_update(self, callback):
        """注册配置更新回调"""
        self._config_callback = callback

    def push_data(self, data: ModifiedData):
        """推送修改后的数据给所有 WebSocket 客户端"""
        self._latest_modified = data
        msg = json.dumps(self._format_message(data))
        # 使用 asyncio 安全地广播
        dead = set()
        for ws in self._ws_clients:
            try:
                asyncio.ensure_future(ws.send_str(msg))
            except Exception:
                dead.add(ws)
        self._ws_clients -= dead

    def _format_message(self, data: ModifiedData) -> dict:
        return {
            "timestamp": data.timestamp,
            "raw": {
                "power": data.raw.power,
                "cadence": data.raw.cadence,
                "speed": data.raw.speed,
                "heart_rate": data.raw.heart_rate,
                "distance": data.raw.distance,
            },
            "modified": {
                "power": data.power,
                "cadence": data.cadence,
                "speed": data.speed,
                "heart_rate": data.heart_rate,
                "distance": data.distance,
            },
            "modification_mode": data.modification_mode,
        }

    async def start(self):
        """启动 HTTP/WebSocket 服务器"""
        from aiohttp import web

        # 启动前检查端口, 占用则清理旧进程
        if not await self._port_is_free(self.host, self.port):
            logger.warning(f"端口 {self.port} 被占用, 清理旧进程...")
            await self._kill_port_process(self.port)
            await asyncio.sleep(0.8)
            if not await self._port_is_free(self.host, self.port):
                raise OSError(f"端口 {self.port} 仍被占用, 清理失败, 请用 -p 指定其他端口")

        self._app = web.Application()
        self._app.router.add_get("/ws", self._ws_handler)
        self._app.router.add_get("/api/status", self._handle_status)
        self._app.router.add_get("/api/config", self._handle_get_config)
        self._app.router.add_post("/api/config", self._handle_set_config)
        self._app.router.add_get("/api/data", self._handle_get_data)
        self._app.router.add_get("/", self._handle_index)

        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, self.host, self.port, reuse_address=True)
        await site.start()

        logger.info(f"数据服务器已启动: http://{self.host}:{self.port}")
        logger.info(f"  WebSocket: ws://{self.host}:{self.port}/ws")
        logger.info(f"  API:       http://{self.host}:{self.port}/api/*")

    @staticmethod
    async def _port_is_free(host: str, port: int) -> bool:
        """检查端口是否空闲"""
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            s.close()
            return True
        except OSError:
            return False

    @staticmethod
    async def _kill_port_process(port: int):
        """杀掉占用指定端口的进程 (macOS / Linux)"""
        import subprocess
        try:
            result = subprocess.run(
                ["lsof", "-ti", f"tcp:{port}"],
                capture_output=True, text=True, timeout=5
            )
            pids = result.stdout.strip().split()
            if pids:
                for pid in pids:
                    logger.info(f"终止旧进程 PID={pid} (占用端口 {port})")
                    subprocess.run(["kill", "-9", pid], capture_output=True, timeout=5)
            else:
                logger.info("未找到占用端口的进程")
        except Exception as e:
            logger.warning(f"清理端口进程失败: {e}")

    async def stop(self):
        """停止服务器"""
        if self._runner:
            await self._runner.cleanup()


    async def _ws_handler(self, request):
        """WebSocket 连接处理"""
        from aiohttp import web, WSCloseCode

        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self._ws_clients.add(ws)
        logger.info(f"WebSocket 客户端已连接 (当前 {len(self._ws_clients)} 个)")

        # 立即发送最新数据
        if self._latest_modified:
            await ws.send_str(json.dumps(self._format_message(self._latest_modified)))

        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    # 客户端可通过 WebSocket 发送控制命令
                    try:
                        cmd = json.loads(msg.data)
                        await self._handle_ws_command(ws, cmd)
                    except json.JSONDecodeError:
                        pass
                elif msg.type == web.WSMsgType.ERROR:
                    logger.error(f"WebSocket 错误: {ws.exception()}")
        finally:
            self._ws_clients.discard(ws)
            logger.info(f"WebSocket 客户端已断开 (剩余 {len(self._ws_clients)} 个)")

        return ws

    async def _handle_ws_command(self, ws, cmd: dict):
        """处理 WebSocket 控制命令"""
        action = cmd.get("action")
        if action == "set_config" and self._config_callback:
            new_config = cmd.get("config", {})
            self._config_callback(new_config)
            await ws.send_str(json.dumps({"status": "ok", "action": "set_config"}))

    async def _handle_status(self, request):
        """GET /api/status — 返回连接状态"""
        from aiohttp import web
        return web.json_response({
            "ws_clients": len(self._ws_clients),
            "has_data": self._latest_modified is not None,
            "latest": self._format_message(self._latest_modified) if self._latest_modified else None,
        })

    async def _handle_get_config(self, request):
        """GET /api/config — 返回当前配置"""
        from aiohttp import web
        return web.json_response(self.config)

    async def _handle_set_config(self, request):
        """POST /api/config — 更新配置 (热更新功率修改模式)"""
        from aiohttp import web
        try:
            body = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        # 合并配置
        if "power_modification" in body:
            self.config["power_modification"].update(body["power_modification"])
        if "server" in body:
            self.config["server"].update(body["server"])

        # 通知控制器
        if self._config_callback:
            self._config_callback(self.config)

        logger.info(f"配置已更新: {body}")
        return web.json_response({"status": "ok", "config": self.config})

    async def _handle_get_data(self, request):
        """GET /api/data — 返回最新数据"""
        from aiohttp import web
        if self._latest_modified is None:
            return web.json_response({"error": "No data yet"}, status=404)
        return web.json_response(self._format_message(self._latest_modified))

    async def _handle_index(self, request):
        """GET / — 控制台 (启动时已缓存 dashboard.html 内容)"""
        from aiohttp import web
        try:
            return web.Response(text=self._dashboard_html, content_type="text/html")
        except Exception as e:
            logger.exception("_handle_index 异常")
            return web.Response(text=f"<h2>500: {e}</h2>", content_type="text/html")


# ── 中继控制器 ────────────────────────────────────────────────────────

class RelayController:
    """中继控制器 — 协调 BLE 客户端、功率修改器与数据服务器"""

    def __init__(self, config: dict):
        self.config = config
        self.trainer = TrainerClient(config)
        self.modifier = PowerModifier(config)
        self.server = DataServer(config)
        self._csv_file = None
        self._running = False
        self._mock_mode = False

        # 数据流: trainer -> modifier -> server
        self.trainer.on_data(self._on_trainer_data)
        self.server.on_config_update(self._on_config_update)

        # CSV 日志
        lc = config.get("logging", {})
        if lc.get("csv_output") and lc.get("csv_path"):
            csv_path = lc["csv_path"]
            self._csv_file = open(csv_path, "a")
            self._csv_file.write("timestamp,raw_power,mod_power,cadence,speed,mode\n")
            logger.info(f"CSV 日志写入: {csv_path}")

    def _on_trainer_data(self, data: TrainerData):
        """骑行台数据到达时调用"""
        modified = self.modifier.modify(data)
        self.server.push_data(modified)

        if self._csv_file:
            line = (
                f"{data.timestamp:.3f},{data.power},{modified.power},"
                f"{data.cadence:.1f},{data.speed:.1f},{self.modifier.mode.value}\n"
            )
            self._csv_file.write(line)
            self._csv_file.flush()

    def _on_config_update(self, new_config: dict):
        """配置更新回调 (来自 HTTP API)"""
        self.modifier.reload_config(new_config)
        self.config.update(new_config)

    def enable_mock(self):
        """启用模拟数据模式 — 无需 BLE 硬件即可测试"""
        self._mock_mode = True
        logger.info("模拟数据模式已启用 (无需蓝牙)")

    async def _mock_data_loop(self):
        """生成模拟骑行数据, 模拟真实骑行台"""
        import random, math
        base_power = 180
        base_cadence = 85
        t = 0
        while self._running and self._mock_mode:
            # 模拟骑行者踩踏的功率波动
            wave = math.sin(t * 0.3) * 20 + math.sin(t * 1.7) * 8
            power = max(0, int(base_power + wave + random.gauss(0, 3)))
            cadence = max(20, base_cadence + math.sin(t * 0.5) * 5 + random.gauss(0, 1))
            speed = power * 0.15 + random.gauss(0, 0.3)

            data = TrainerData(
                timestamp=time.time(),
                power=power,
                cadence=round(cadence, 1),
                speed=round(speed, 1),
                heart_rate=int(130 + power * 0.15 + random.gauss(0, 2)),
            )
            self._on_trainer_data(data)
            t += 0.25
            await asyncio.sleep(0.25)

    async def run(self):
        """启动中继"""
        self._running = True

        # 启动 HTTP/WebSocket 服务器
        await self.server.start()

        if self._mock_mode:
            # 模拟数据模式: 生成假数据, 不连 BLE
            await self._mock_data_loop()
            return

        # 尝试连接骑行台
        while self._running:
            if not self.trainer.connected:
                connected = await self.trainer.scan_and_connect()
                if not connected:
                    logger.info(
                        f"将在 {self.trainer.reconnect_interval}s 后重试扫描..."
                    )
                    await asyncio.sleep(self.trainer.reconnect_interval)
                    continue

            # 保持连接, 等待断开
            while self.trainer.connected and self._running:
                await asyncio.sleep(1)

            if self._running:
                logger.info("连接丢失, 准备重连...")
                await asyncio.sleep(self.trainer.reconnect_interval)

    async def shutdown(self):
        """关闭中继"""
        logger.info("正在关闭...")
        self._running = False
        await self.trainer.disconnect()
        await self.server.stop()
        if self._csv_file:
            self._csv_file.close()
        logger.info("已关闭")


# ── 命令行入口 ────────────────────────────────────────────────────────

def load_config(config_path: str) -> dict:
    """加载 JSON 配置文件"""
    if not os.path.exists(config_path):
        logger.warning(f"配置文件不存在: {config_path}, 使用默认配置")
        return {
            "trainer": {"name": None, "address": None, "scan_timeout": 10, "reconnect_interval": 5},
            "power_modification": {"mode": "passthrough", "multiplier": 1.0, "offset": 0, "fixed": 200, "min_power": 0, "max_power": 2000},
            "server": {"host": "127.0.0.1", "port": 8765, "data_interval_ms": 250},
            "logging": {"level": "INFO", "csv_output": False, "csv_path": "./data_log.csv"},
        }
    with open(config_path, "r") as f:
        return json.load(f)


def setup_logging(level: str = "INFO"):
    """配置日志"""
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    datefmt = "%H:%M:%S"
    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO), format=fmt, datefmt=datefmt)


def main():
    parser = argparse.ArgumentParser(
        description="BLE Cycling Trainer Power Relay - 骑行台功率中继器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例:
  python trainer_relay.py                                    # 自动扫描并连接骑行台
  python trainer_relay.py -n ThinkRider                      # 按名称匹配
  python trainer_relay.py -a AA:BB:CC:DD:EE:FF              # 按地址连接
  python trainer_relay.py -m multiplier -x 0.8               # 功率乘 0.8
  python trainer_relay.py -m fixed -f 200                    # 固定 200W
  python trainer_relay.py -m offset -o 50                    # 功率 +50W
  python trainer_relay.py -c my_config.json                  # 使用指定配置文件
  python trainer_relay.py -p 8080                            # 使用 8080 端口
  python trainer_relay.py --csv ./test_data.csv              # 记录 CSV 日志
        """,
    )
    parser.add_argument("-c", "--config", default=None, help="JSON 配置文件路径")
    parser.add_argument("-n", "--name", default=None, help="骑行台名称 (模糊匹配)")
    parser.add_argument("-a", "--address", default=None, help="骑行台 BLE MAC 地址")
    parser.add_argument("-m", "--mode", default=None, choices=["passthrough", "multiplier", "offset", "fixed"], help="功率修改模式")
    parser.add_argument("-x", "--multiplier", type=float, default=None, help="乘系数 (配合 -m multiplier)")
    parser.add_argument("-o", "--offset", type=int, default=None, help="偏移量 (配合 -m offset)")
    parser.add_argument("-f", "--fixed", type=int, default=None, help="固定值 (配合 -m fixed)")
    parser.add_argument("-p", "--port", type=int, default=None, help="HTTP/WS 服务端口")
    parser.add_argument("--csv", default=None, help="CSV 日志输出路径")
    parser.add_argument("--scan-only", action="store_true", help="仅扫描 BLE 设备, 不连接")
    parser.add_argument("--mock", action="store_true", help="模拟数据模式, 无需蓝牙硬件即可测试服务器和 API")
    parser.add_argument("--verbose", "-v", action="store_true", help="详细日志 (DEBUG 级别)")

    args = parser.parse_args()

    # 加载配置
    config_path = args.config or os.path.join(os.path.dirname(__file__), "config.json")
    config = load_config(config_path)

    # 命令行参数覆盖配置文件
    if args.name:
        config["trainer"]["name"] = args.name
    if args.address:
        config["trainer"]["address"] = args.address
    if args.mode:
        config["power_modification"]["mode"] = args.mode
    if args.multiplier is not None:
        config["power_modification"]["multiplier"] = args.multiplier
    if args.offset is not None:
        config["power_modification"]["offset"] = args.offset
    if args.fixed is not None:
        config["power_modification"]["fixed"] = args.fixed
    if args.port:
        config["server"]["port"] = args.port
    if args.csv:
        config["logging"]["csv_output"] = True
        config["logging"]["csv_path"] = args.csv
    if args.verbose:
        config["logging"]["level"] = "DEBUG"

    setup_logging(config["logging"]["level"])

    logger.info("=" * 60)
    logger.info("  BLE Cycling Trainer Power Relay")
    logger.info("  骑行台功率中继器 - 集成测试工具")
    logger.info("=" * 60)

    if args.scan_only:
        import asyncio as aio
        async def scan():
            import bleak
            logger.info("扫描 BLE 设备...")
            devices = await bleak.BleakScanner.discover(timeout=10, return_adv=True)
            logger.info(f"\n找到 {len(devices)} 个设备:\n")
            for addr, (dev, adv) in devices.items():
                name = dev.name or adv.local_name or "(unknown)"
                services = ",".join(adv.service_uuids or [])[:80]
                rssi = adv.rssi
                logger.info(f"  {name:<30} {addr:<20} RSSI={rssi:>4} services={services}")
        aio.run(scan())
        return

    # 显示当前配置
    pc = config["power_modification"]
    logger.info(f"功率修改: mode={pc['mode']}, multiplier={pc.get('multiplier',1)}, offset={pc.get('offset',0)}, fixed={pc.get('fixed',200)}")
    logger.info(f"服务器:   http://{config['server']['host']}:{config['server']['port']}")

    controller = RelayController(config)

    if args.mock:
        controller.enable_mock()

    # Python 3.12+: 用 new_event_loop 替代已弃用的 get_event_loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def shutdown_handler():
        await controller.shutdown()
        tasks = [t for t in asyncio.all_tasks(loop) if t is not asyncio.current_task(loop)]
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        loop.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda: asyncio.ensure_future(shutdown_handler(), loop=loop))
        except NotImplementedError:
            signal.signal(sig, lambda s, f: asyncio.ensure_future(shutdown_handler(), loop=loop))

    try:
        loop.run_until_complete(controller.run())
    except KeyboardInterrupt:
        pass
    finally:
        loop.run_until_complete(shutdown_handler())
        loop.close()


if __name__ == "__main__":
    main()