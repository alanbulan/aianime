# 云端接入与安全更新交接

客户端 `1.1.5` 已固定使用 `https://aianime.122-193-11-199.sslip.io`。云端完成以下合同后，登录、许可和自动更新才算真正闭环。

## 1. 登录首屏接口

三个接口都必须从 GET query 读取 `tenantCode`：

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

## 2. 两套 Ed25519 密钥

两把 PKCS#8 PEM 私钥已生成在本机忽略目录，不能提交 Git：

```text
state/commercial-signing/artifact-2026-08-v1-private.pem
state/commercial-signing/lease-2026-08-v1-private.pem
```

将它们通过安全通道导入云端密钥管理或 Secret，分别绑定以下 key id：

| 用途 | key id | 签名内容 |
| --- | --- | --- |
| 更新制品 | `artifact-2026-08-v1` | 完成平台签名后的安装包原始字节 |
| 离线租约 | `lease-2026-08-v1` | 响应中 `payloadJson` 的原始 UTF-8 字节 |

私钥不得写入数据库明文字段、日志、接口响应、镜像或仓库。对应 SPKI 公钥已经固定在 `desktop/src/commercial-trust.ts`。签名后不得重新压缩、重签、staple 或修改制品，否则客户端验签必然失败。

离线租约响应必须同时返回 `payloadJson`、Base64 `signature` 和 `keyId: "lease-2026-08-v1"`。云端不能在签名后重新序列化 `payloadJson`。

## 3. 版本检查与制品下载

版本检查：

```http
GET /api/v1/client/releases/check?currentVersion=1.1.4&target=windows&arch=x86_64
Authorization: Bearer <access-token>
```

有更新时至少返回：

```json
{
  "available": true,
  "required": false,
  "reason": "NEW_VERSION",
  "version": {
    "version": "1.1.5",
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
        "installerKind": "dmg"
      }
    ]
  }
}
```

`target`、`arch` 和 `installerKind` 必须使用上例精确值。客户端下载授权接口：

```http
GET /api/v1/client/releases/artifacts/1201/download
Authorization: Bearer <access-token>
```

响应合同：

```json
{
  "url": "https://object-storage.example/signed-download-url",
  "fileName": "AI-anime-1.1.5-x64-setup.exe",
  "contentType": "application/vnd.microsoft.portable-executable",
  "sha256": "64-char-lowercase-hex",
  "sizeBytes": 490381098,
  "signatureKeyId": "artifact-2026-08-v1",
  "signature": "base64-ed25519-signature",
  "expiresAt": "2026-08-08T12:30:00Z"
}
```

下载地址必须使用 HTTPS、在 `expiresAt` 前有效，并返回与 `sizeBytes` 一致的 `Content-Length` 和完全相同的最终字节。SHA-256 必须是小写十六进制。`id` 由云端发布记录分配，客户端不接受用文件名代替 artifact id。

## 4. 平台签名与发布顺序

Windows 构建环境配置受信任代码签名证书：

```text
CSC_LINK=<PFX 文件或受支持的证书地址>
CSC_KEY_PASSWORD=<PFX 密码>
```

macOS 构建环境配置 Developer ID Application 证书及 Apple notarization 凭据。仓库启用了 `forceCodeSigning`、Hardened Runtime 和 notarization，缺失凭据时发布构建会失败。

严格按以下顺序发布：

1. 在目标系统执行 `pnpm --dir desktop package:win` 或 `pnpm --dir desktop package:mac`。
2. Windows 确认 Authenticode 为 `Valid`；macOS 确认 `codesign` 与 `spctl` 均通过。
3. 使用制品私钥生成元数据。Windows 示例：

```powershell
$env:AI_ANIME_ARTIFACT_SIGNING_PRIVATE_KEY_FILE="..\state\commercial-signing\artifact-2026-08-v1-private.pem"
$env:AI_ANIME_ARTIFACT_SIGNATURE_KEY_ID="artifact-2026-08-v1"
pnpm --dir desktop release:metadata -- release/AI-anime-1.1.5-x64-setup.exe windows x86_64 nsis
```

4. 上传最终制品，导入生成的 `.release.json`，由云端补充 artifact id、短效下载 URL 和 `expiresAt`。
5. 创建 `1.1.5` 发布记录，最后再将其置为可见；不得先发布记录后补文件。

## 5. 联调验收数据

云端还需准备隔离测试租户、普通版账号、专业版账号，以及可激活许可、设备名额和非零测试额度。验收必须覆盖登录、验证码、Token 刷新、设备激活、租约刷新、普通版 Cloud 调用、专业版 BYOK、额度扣减、可选更新和强制更新。测试凭据单独传递，不写入仓库。
