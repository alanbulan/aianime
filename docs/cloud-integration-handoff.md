# 云端接入交接

客户端 `1.1.5` 固定使用 `https://aianime.122-193-11-199.sslip.io`。更新已改为 `electron-updater` 标准流程，云端不需要新增独立更新服务，只需在现有 Gateway 中提供版本判断、YAML 和安装包下载。

## 1. 登录首屏

三个接口都从 GET query 读取 `tenantCode`：

```http
GET /api/v1/config/public?tenantCode=platform
GET /api/v1/config/logo?tenantCode=platform
GET /api/v1/auth/captcha?tenantCode=platform
```

公共配置最小响应：

```json
{
  "system": { "siteName": "AI anime" },
  "login": {
    "captchaEnabled": true,
    "captchaType": "image",
    "rememberMe": true
  },
  "register": { "enabled": false }
}
```

Logo 返回原始图片字节，`Content-Type` 必须为 `image/*`，大小为 1 字节到 5 MiB。Captcha 返回 JSON，`svg` 必须是完整 SVG 文本且不超过 512 KiB：

```json
{ "key": "single-use-captcha-key", "svg": "<svg>...</svg>" }
```

登录继续使用 `POST /api/v1/client/auth/login`，请求中的 `captchaKey` 与 `captchaCode` 必须和上述验证码校验。

## 2. 离线租约

离线租约仍使用现有 Ed25519 密钥：

```text
state/commercial-signing/lease-2026-08-v1-private.pem
```

云端密钥 id 为 `lease-2026-08-v1`，签名内容是响应中 `payloadJson` 的原始 UTF-8 字节。响应必须同时返回 `payloadJson`、Base64 `signature` 和 `keyId`。

## 3. 版本检查

```http
GET /api/v1/client/releases/check?currentVersion=1.1.5&target=windows&arch=x86_64
Authorization: Bearer <access-token>
```

有更新时至少返回：

```json
{
  "available": true,
  "required": false,
  "reason": "NEW_VERSION",
  "version": {
    "version": "1.1.6",
    "artifacts": [
      {
        "id": 1201,
        "target": "windows",
        "arch": "x86_64",
        "installerKind": "nsis"
      },
      {
        "id": 1202,
        "target": "macos",
        "arch": "arm64",
        "installerKind": "zip"
      }
    ]
  }
}
```

Windows 更新构件使用 `nsis`，macOS 更新构件必须使用 `zip`。DMG 用于 macOS 首次安装，可以同时保存，但不能代替更新用 ZIP。

## 4. 标准更新接口

客户端会请求以下地址：

```http
# Windows
GET /api/v1/client/releases/updater/latest.yml?artifactId=1201

# macOS
GET /api/v1/client/releases/updater/latest-mac.yml?artifactId=1202

# YAML 中 files[].url 对应的安装包
GET /api/v1/client/releases/updater/AI-anime-1.1.6-x64-setup.exe?artifactId=1201
GET /api/v1/client/releases/updater/AI-anime-1.1.6-macos-arm64.zip?artifactId=1202

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
    sha512: <electron-builder 生成的值>
    size: 490381098
path: AI-anime-1.1.6-x64-setup.exe
sha512: <electron-builder 生成的值>
releaseDate: '2026-08-08T12:30:00.000Z'
```

不要手工重算或修改 `sha512`。客户端会由 `electron-updater` 自动校验。

## 5. 发布方式

Windows 打包：

```powershell
pnpm --dir desktop package:win
```

上传：

```text
desktop/release/AI-anime-<version>-x64-setup.exe
desktop/release/latest.yml
```

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

## 6. 联调验收

云端需准备隔离测试租户、普通版账号、专业版账号，以及可激活许可、设备名额和非零测试额度。更新验收覆盖：

1. `1.1.5` 查到 `1.1.6` 可选更新。
2. 客户端下载后自动退出并启动安装。
3. 安装后版本变为 `1.1.6`。
4. 强制更新时未更新前不能进入主界面。
5. 越权 `artifactId`、过期 Token 和被隐藏发布均返回 `401` 或 `403`。
