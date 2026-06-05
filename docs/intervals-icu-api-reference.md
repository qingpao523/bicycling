# intervals.icu API 参考 — bicycling 系统使用手册

本文档整理 intervals.icu 公开 API 中 bicycling 系统**实际使用**和**可能使用**的接口，基于 `docs/intervals-icu-openapi-spec.json` 提取。

## 认证

所有 API 使用 HTTP Basic Auth：
- Username: `API_KEY`
- Password: 你的 intervals.icu API Key (Settings → Developer Settings)

```
Authorization: Basic <base64("API_KEY:" + apiKey)>
```

## Base URL

```
https://intervals.icu/api/v1
```

---

## 一、bicycling 当前已使用的接口

### 1. 获取运动员信息

```
GET /api/v1/athlete/{athleteId}/
```

返回运动员的完整 profile，包括 sportSettings（各运动类型的 FTP/HR zones）。

**bicycling 使用场景**：`lib/intervals.ts` `fetchIntervalsProfile()` — 同步用户 FTP/体重/心率阈值。

**关键返回字段**：
- `ftp` / `lthr` / `max_hr` / `icu_resting_hr` / `weight`
- `sportSettings[]` — 每个运动类型的独立设置

---

### 2. 列出活动

```
GET /api/v1/athlete/{athleteId}/activities?oldest={date}&newest={date}&fields={fields}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `oldest` | 起始日期 (ISO-8601, 如 `2024-01-01`) |
| `newest` | 结束日期 |
| `fields` | 返回字段白名单 (逗号分隔, 可减少响应体积) |
| `limit` | 最多返回条数 |

**bicycling 使用场景**：`lib/intervals.ts` `fetchIntervalsActivities()` — 增量/全量同步活动数据。

**⚠ 已知限制**：Strava 来源的活动 (`source=STRAVA`) 通过此 API 返回**空壳**（功率/心率/TSS 等字段为 0 或 null）。

---

### 3. 获取活动流数据 (streams)

```
GET /api/v1/activity/{activityId}/streams.json?types={types}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `types` | 逗号分隔的流类型: `time,watts,heartrate,cadence,velocity_smooth,altitude,grade_adjusted_speed` |

**bicycling 使用场景**：`lib/intervals.ts` `fetchIntervalsActivityStreams()` — 补拉秒级时间序列数据。

**⚠ 已知限制**：同样对 Strava 来源活动返回空。

---

### 4. 获取 Wellness 数据

```
GET /api/v1/athlete/{athleteId}/wellness
GET /api/v1/athlete/{athleteId}/wellness/{date}
```

**bicycling 使用场景**：`lib/intervals.ts` `fetchIntervalsProfile()` — 获取最近的静息心率、HRV、睡眠、体重等 wellness 数据。

---

## 二、新增使用的接口 (赛段系统/intervals-web)

### 5. 上传活动文件 (.fit / .tcx / .gpx)

```
POST /api/v1/athlete/{athleteId}/activities
Content-Type: multipart/form-data
```

**参数**：
| 参数 | 说明 |
|------|------|
| `file` | .fit / .tcx / .gpx 文件 (multipart) |
| `external_id` | 外部 ID (用于去重) |
| `name` | 活动名称 (可选) |

**bicycling 使用场景**：`lib/intervals-web.ts` `uploadFit()` — 将从 Web Session 下载的 .fit 文件重传给 intervals.icu，让 Strava 来源活动变为 `source=UPLOAD`，API 能正常返回数据。

**返回**：
- `201` = 新建
- `200` = 已存在 (按 external_id 去重自动替换)

---

### 6. 下载活动 FIT 文件

```
GET /api/v1/activity/{activityId}/fit-file
```

**参数**：
| 参数 | 说明 |
|------|------|
| `power` | 是否包含功率流 |
| `hr` | 是否包含心率流 |

**bicycling 使用场景**：这是**公开 API 的**下载接口。但对 Strava 来源活动，此接口可能不返回完整数据，所以我们的 `lib/intervals-web.ts` 用的是 **Web Session 链路**（非公开 API）的 `/api/activity/{id}/fit-file`。

---

### 7. 获取单个活动详情

```
GET /api/v1/activity/{activityId}?intervals=true
```

**bicycling 使用场景**：可用于获取活动的 intervals（区间/赛段分析）。目前 bicycling 的赛段数据走 Strava API，但此接口可作为补充。

---

## 三、Web Session 专用接口 (非公开 API, 需 cookie 登录)

这些接口**不在 OpenAPI spec 中**，是 intervals.icu 网站前端使用的内部接口。bicycling 通过 `lib/intervals-web.ts` 使用。

### 8. Web 登录

```
POST https://intervals.icu/api/login?deviceClass=desktop
Content-Type: multipart/form-data
Fields: email, password
```

返回 Set-Cookie，后续请求携带。

### 9. Web 获取活动元数据

```
GET https://intervals.icu/api/activity/{activityId}
Cookie: <session cookie>
```

返回活动完整元数据，包括 `type`、`analyzed` 等字段。

### 10. Web 下载 FIT 文件

```
GET https://intervals.icu/api/activity/{activityId}/fit-file
Cookie: <session cookie>
```

返回完整 .fit 文件二进制（即使活动来源是 Strava）。

---

## 四、可能未来使用的接口

| 接口 | 用途 | 优先级 |
|------|------|--------|
| `GET /athlete/{id}/sport-settings` | 获取各运动类型详细设置 (zones) | 中 |
| `PUT /activity/{id}/streams` | 上传自定义 streams (JSON) | 低 |
| `GET /activity/{id}/intervals` | 获取活动区间分析 | 中 |
| `POST /athlete/{id}/download-fit-files` | 批量下载 FIT (zip) | 低 |
| `GET /athlete/{id}/wellness` | 批量 wellness 用于恢复分析增强 | 中 |

---

## 五、API 限制

| 限制 | 值 | 说明 |
|------|-----|------|
| 频率限制 | 未公开文档 | bicycling 使用 6-8s 间隔作为保守策略 |
| Strava 来源限制 | 公开 API 返回空壳 | 需 Web Session .fit 重传绕过 |
| 认证 | Basic Auth (API_KEY) | 每用户独立 key |

---

## 六、数据来源对照

```
用户完成一次骑行
    ↓
Strava 记录 → 自动同步到 intervals.icu
    ↓
intervals.icu 分析 (功率 zones / TSS / 心率 zones)
    ↓
bicycling 通过 2 条链路获取数据:
    ├─ 链路 1: intervals.icu 公开 API (可能空壳)
    │   → fetchIntervalsActivities + fetchIntervalsActivityStreams
    │
    └─ 链路 2: intervals.icu Web Session (完整数据)
        → reloadStravaActivitiesViaWeb (.fit 重传)
        → API 变为 source=UPLOAD → 完整数据可用
```

---

## OpenAPI Spec 原始文件

完整 OpenAPI 3.0 spec 存放于 `docs/intervals-icu-openapi-spec.json`，包含 intervals.icu 全部公开接口定义。
