# 云端接入交接

客户端 `1.1.62` 固定使用 `https://aianime.mingcw.com`。Windows x86_64 NSIS `1.1.6` 已作为可选更新发布，`1.1.5` 可通过现有 Gateway 完成版本判断、YAML/EXE 下载和 SHA-512 校验；后续版本继续沿用同一更新合同，客户端支持启动检查、手动检查、真实下载进度和安装确认。

## 1. 登录首屏

两个接口都从 GET query 读取 `tenantCode`。下方 `customer-a` 是占位示例，部署方必须提供真实编码，不能把租户显示名称“默认租户”或字符串 `default` 当作编码：

```http
GET /api/v1/client/config/public?tenantCode=customer-a
GET /api/v1/auth/captcha?tenantCode=customer-a
```

公共配置只返回桌面登录所需字段：

```json
{
  "brand": {
    "siteName": "AI anime",
    "siteDescription": "AI 创作客户端"
  },
  "login": {
    "captchaEnabled": true,
    "rememberMe": true,
    "smsLoginEnabled": false
  },
  "password": {
    "minLength": 8,
    "maxLength": 128,
    "requireUppercase": true,
    "requireLowercase": true,
    "requireNumber": true,
    "requireSpecial": false
  }
}
```

桌面 Logo 固定使用客户端安装包中的 `/images/ai-anime-logo-mark.png`，不读取管理端站点 Logo，也不得调用 `/api/v1/config/logo`。Captcha 返回 JSON，`svg` 必须是完整 SVG 文本且不超过 512 KiB：

```json
{ "key": "single-use-captcha-key", "svg": "<svg>...</svg>" }
```

登录使用 `POST /api/v1/client/auth/login`。密码模式显式发送 `loginType: "PASSWORD"`；只有 `smsLoginEnabled=true` 时才可发送短信并使用 `loginType: "SMS"`，两类负载字段互斥。需要图形验证码时，`captchaKey` 与 `captchaCode` 必须匹配上述验证码。

登录页不提供公共注册。旧滑块坐标验证码不再属于客户端合同。账户资料、头像、改密和三步忘记密码均通过 Electron IPC 接入：受保护头像由主进程携带 Bearer Token 读取，校验 MIME/大小后只向渲染进程返回 `data:` URL；改密成功后清除本地 JWT 和工作区 Cookie 并回到登录页。

## 2. 离线租约

离线租约仍使用现有 Ed25519 密钥：

```text
state/commercial-signing/lease-2026-08-v1-private.pem
```

云端密钥 id 为 `lease-2026-08-v1`，签名内容是响应中 `payloadJson` 的原始 UTF-8 字节。响应必须同时返回 `payloadJson`、Base64 `signature` 和 `keyId`。

当前真实租约返回 `keyId=lease-2026-08-v1`，有效期至 `2026-08-16T12:09:16Z`；客户端已使用内置 SPKI 公钥对 `payloadJson` 原始 UTF-8 字节完成 Ed25519 验签。

## 3. 模型调用联调

模型目录、单 SKU 详情和 Bootstrap 均需携带当前激活设备的 `X-Device-Id`。客户端已统一处理，不要在云端为缺少设备头放宽授权。

2026-08-09 真实结果：

| 项目 | 结果 |
| --- | --- |
| 模型目录 | `DEMO_TEXT`、`CODEX_SMOKE_IMAGE`、`CODEX_SMOKE_VIDEO`、`CODEX_SMOKE_AUDIO` |
| 文本 | `DEMO_TEXT` 成功，助手两阶段产生两条成功 Invocation，额度 `960 -> 940` |
| 图片 | `CODEX_SMOKE_IMAGE` 请求 `/v1/images/generations`，Invocation `73c319d6-e807-4e5d-9c39-76bd15d58109` 返回 `provider returned HTTP 404` |
| 图片配额 | 预占已释放，额度保持 `940`，客户端回滚正确 |
| 视频 / 音频 | 目录可见，但本轮未调用，不视为已验收 |

云端需要修复 `CODEX_SMOKE_IMAGE` 对应供应商 Base URL、图片生成路径或模型映射，然后用同一 SKU 验证能返回真实图片字节或 URL。客户端无需改路由。

## 4. 版本检查

```http
GET /api/v1/client/releases/check?currentVersion=1.1.5&target=windows&arch=x86_64
Authorization: Bearer <access-token>
```

响应必须满足 Gateway `ReleaseCheckResp` 的精确字段合同，版本与构件 ID 均为 UUID。
有更新时客户端从 `version.artifacts` 中选择匹配 `target` 和 `arch` 的构件；没有更新时
`version` 仍是完整空对象，不能返回 `null`：

```json
{
  "available": false,
  "required": false,
  "version": {
    "id": "",
    "version": "",
    "notes": "",
    "pubDate": "",
    "minimumSupportedVersion": "",
    "status": "",
    "createdAt": "",
    "publishedAt": "",
    "artifacts": []
  },
  "reason": "already up to date"
}
```

Windows 更新构件使用 `nsis`，macOS 更新构件必须使用 `zip`。DMG 用于 macOS 首次安装，可以同时保存，但不能代替更新用 ZIP。

Windows `1.1.6` 已发布为可选更新：`versionId=a56d3729-734e-4327-b212-2b543789b6da`，`artifactId=4909537b-deb7-4a29-9b08-5040627489f9`，`required=false`。EXE 大小为 `498536378`，SHA-256 为 `3ED7EEE0887334BF83B84C07C16155DBB098A3930FD7A22D28FF5F5362D21612`。

## 5. 标准更新接口

客户端会请求以下地址：

```http
# Windows
GET /api/v1/client/releases/updater/latest.yml?artifactId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa

# macOS
GET /api/v1/client/releases/updater/latest-mac.yml?artifactId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb

# YAML 中 files[].url 对应的安装包
GET /api/v1/client/releases/updater/AI-anime-1.1.6-x64-setup.exe?artifactId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
GET /api/v1/client/releases/updater/AI-anime-1.1.6-macos-arm64.zip?artifactId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb

Authorization: Bearer <access-token>
```

云端处理规则：

1. 校验 Bearer Token、租户、发布可见性和 `artifactId` 归属。
2. `latest.yml` 只能对应 Windows NSIS，`latest-mac.yml` 只能对应 macOS arm64 ZIP。
3. YAML 直接返回 `electron-builder` 生成的原文，使用 `Content-Type: text/yaml; charset=utf-8` 和 `Cache-Control: no-store`。
4. YAML 中 `files[].url` 使用同目录的相对文件名，不要写第三方存储域名。
5. 安装包接口返回原始文件字节和正确 `Content-Length`，不返回 JSON、HTML 或下载页。
6. Gateway 直接代理对象存储文件，不跳转到其他域名，避免将账户 Token 带到外部存储。

`latest.yml` 示例：

```yaml
version: 1.1.6
files:
  - url: AI-anime-1.1.6-x64-setup.exe
    sha512: we5t3fiW5vWwffLMCD7vqR2YPHZ3MUdw+IltAYpwsrWe8iJpZ30myJxSWLq2Gw2VyiQlOIvuXt9c6tChvqYTZw==
    size: 498536378
path: AI-anime-1.1.6-x64-setup.exe
sha512: we5t3fiW5vWwffLMCD7vqR2YPHZ3MUdw+IltAYpwsrWe8iJpZ30myJxSWLq2Gw2VyiQlOIvuXt9c6tChvqYTZw==
releaseDate: '2026-08-09T09:37:42.433Z'
```

不要手工重算或修改 `sha512`。客户端会由 `electron-updater` 自动校验。

## 6. 发布方式

Windows 打包：

```powershell
pnpm --dir desktop package:win
```

上传：

```text
desktop/release/AI-anime-<version>-x64-setup.exe
desktop/release/latest.yml
```

2026-08-09 已生成待发布的 Windows `1.1.7`：

```text
AI-anime-1.1.7-x64-setup.exe
size: 501616156
sha256: 1210B78A45B37DAA001D33874A57CEB0228FC0F773CEA5B9FB4BEE62A730940D
sha512: poWQjS4I2nSQCxjGkqoiVJdVgDXkNa5CyZozjK2hH18T0kLKoe4IBe6qeA0vIZsQa5q5zlJkX/g3MsRlUS4fnQ==
```

`latest.yml` 中的版本、文件名、大小和 electron-builder SHA-512 已与 `1.1.7` 安装包复核一致，`releaseDate` 为 `2026-08-09T15:21:34.739Z`。该构件未使用 Authenticode 证书，云端可直接用于测试分发，但 Windows 会显示未知发布者。`1.1.6` 已发布记录及其 `versionId`、`artifactId` 和校验值保留在第 4 节，不能复用于 `1.1.7`。

2026-08-10 已生成待发布的 Windows `1.1.8`：

```text
AI-anime-1.1.8-x64-setup.exe
size: 674178720
sha256: CA62EB8F7E9D70582F97D7876B8E3D64A7537E7FDFCD368160509503E14E6347
sha512: fcNOF4UWbUyNUhqrGymDRWM63G5Po6WAyFvddnqng03MP9iWMTdudNkSkOUlRLmLRjf4/RzPogYi2aC9vulknw==
```

`latest.yml` 中的版本、文件名、大小和 electron-builder SHA-512 已与 `1.1.8` 安装包复核一致，`releaseDate` 为 `2026-08-09T16:39:00.152Z`。本版本随包携带 Faster Whisper base 模型和 CPU 本地推理运行库，因此安装包体积较 `1.1.7` 增加；发布时必须同时上传新的 EXE 与 `latest.yml`，不能复用旧版本清单。

2026-08-10 已生成待发布的 Windows `1.1.10`：

```text
AI-anime-1.1.10-x64-setup.exe
size: 680418776
sha256: 12EB0E8AECBCA1D5627D828A4AF0DEE939BF4D37DA3C5DEF2D002C6996003BEC
sha512: FhPVvBqHQegmo6O1ZOzRitmM6JQqlt/Yh470sDxY/gffNNrynn8f7Vx5ENFGyOmZ4iRp1zSsPElbix80q9UFiw==
```

`latest.yml` 中的版本、文件名、大小和 electron-builder SHA-512 已与 `1.1.10` 安装包复核一致，`releaseDate` 为 `2026-08-10T04:53:45.853Z`。本版本继续随包携带 Faster Whisper base 模型、FFmpeg、本地后端和 Hermes 运行时；发布时必须同时上传新的 EXE、`.blockmap` 与 `latest.yml`。该构件未使用 Authenticode 证书，Windows 会显示未知发布者。

2026-08-22 已重新生成待发布的 Windows `1.1.55`（源码提交 `d08a0615`）：

```text
AI-anime-1.1.55-x64-setup.exe
size: 675650079
sha256: CEC8163A932FC7F2B88F9B44FC6CA82C6AA69B3B9C1408A3A2EF280A38B8BD2F
sha512: 1YdsqlGBhYRhBOCRN8ESqEZ/6OM0HtyK/XywPJRVjlqbaUWPUZ2cpN7lYxz00nzPIalBlQ478saHYAe3fNtjzA==
```

`latest.yml` 中的版本、文件名、大小和 electron-builder SHA-512 已与 `1.1.55` 安装包复核一致，`releaseDate` 为 `2026-08-22T15:00:37.011Z`。出包前已清理 `desktop/release` 中的旧构件；前端 CE、Electron 主进程、本地后端、Hermes ACP 与 NSIS 安装器均构建成功，打包链路内置的后端运行时和最终资源校验通过。当前差分下载关闭，发布时上传新的 EXE 与 `latest.yml`。

2026-08-23 已从当前工作树生成待发布的 Windows `1.1.56`：

```text
AI-anime-1.1.56-x64-setup.exe
size: 675967579
sha256: 4F434EBFBCECD261EDA5F55A6D89C0E093955D884B51D1B0FA9935A5285B5609
sha512: o+GDwK7FrTuW2u0ERn3Fd9KXrHhCc3TdRrynlKrggc6e6fDnbnWCJ0naqECDbg+++wLp3qj5GZ7CZkuChgeoew==
```

`latest.yml` 中的版本、文件名、大小和 SHA-512 已与安装包重新计算的结果一致，`releaseDate` 为 `2026-08-23T04:43:51.243Z`。本次出包前已重新清空 `desktop/release`，删除上一份过期的 `1.1.56` 构件；更早的 `1.1.55` 构件已在首次出包时删除。前端 CE、Electron 主进程、包含全部应用迁移包的本地后端、Hermes ACP、Cognee 25 个内置迁移资源与 NSIS 安装器均构建成功，打包链内置的后端运行时和最终资源校验通过。该构件未使用 Authenticode 证书，Windows 会显示未知发布者；当前差分下载关闭，发布时上传新的 EXE 与 `latest.yml`。

2026-08-23 已从源码提交 `a05e6db2` 生成待发布的 Windows `1.1.57`：

```text
AI-anime-1.1.57-x64-setup.exe
size: 686239627
sha256: E59D8E85740C86AF8B65953117A04B9D7F7035AF9767D2A9C1D953FA1DBCF417
sha512: HwaMjBJu5wLowY1AMEW6R35XYIezPSpi1sRyKLDPDUu+m08x0YzSOi3TYl/WKJLLYOlF/HwL2KC49QnAG4xAwQ==
```

`latest.yml` 中的版本、文件名、大小和 SHA-512 已与安装包重新计算的结果一致，`releaseDate` 为 `2026-08-23T13:09:54.885Z`。前端 CE、Electron 主进程、本地后端、Hermes ACP 与 NSIS 安装器均构建成功；后端运行时校验确认 52 个提示词、25 个迁移资源和 4 个 worker 已随包收集，最终资源校验通过。旧 `1.1.56` 安装包已移入 Windows 回收站，`desktop/release` 仅保留本次 EXE 与更新元数据。该构件未使用 Authenticode 证书，Windows 会显示未知发布者；当前差分下载关闭，发布时上传新的 EXE 与 `latest.yml`。

2026-08-24 已从当前生产工作流修复工作树生成待发布的 Windows `1.1.58`：

```text
AI-anime-1.1.58-x64-setup.exe
size: 686275082
sha256: 773DBDE2EAD30EAE1DD90DC33BC97B43A1A23AC0341535B04BD7DFAB513F6242
sha512: 0Soo+g6HeWW/nKvAMBP30veqFYtYSzR6H/6N4Xytk2Sormxh5Bfm27WBy7RFNyQij7G27Q61ofoE8w0vBLugLg==
```

`latest.yml` 中的版本、文件名和 SHA-512 已与 `1.1.58` 安装包重新计算的结果一致，`releaseDate` 为 `2026-08-24T00:09:54.368Z`。出包前已将旧 `1.1.57` 安装包及构建目录移入 Windows 回收站；前端 CE、Electron 主进程、本地后端、Hermes ACP 与 NSIS 安装器均构建成功，后端运行时校验确认 52 个提示词、25 个迁移资源和 4 个 worker 已随包收集，最终资源校验通过。该构件未使用 Authenticode 证书，Windows 会显示未知发布者；当前差分下载关闭，发布时上传新的 EXE 与 `latest.yml`。

macOS 打包：

```bash
pnpm --dir desktop package:mac
```

上传：

```text
desktop/release/AI-anime-<version>-macos-arm64.dmg
desktop/release/AI-anime-<version>-macos-arm64.zip
desktop/release/latest-mac.yml
```

客户端已关闭差分下载，因此云端暂时不需要提供 blockmap。发布时先上传文件和 YAML，再创建发布记录，最后设为可见。

## 7. 联调验收

云端需准备隔离测试租户、普通版账号、专业版账号，以及可激活许可、设备名额和非零测试额度。Windows 更新已完成第 1、2 项协议验收；完整产品验收仍覆盖：

1. `1.1.5` 查到 `1.1.6` 可选更新。
2. 客户端下载后自动退出并启动安装。
3. 安装后版本变为 `1.1.6`。
4. 强制更新时未更新前不能进入主界面。
5. 越权 `artifactId`、过期 Token 和被隐藏发布均返回 `401` 或 `403`。
