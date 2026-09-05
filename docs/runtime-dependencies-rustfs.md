# 运行依赖的 RustFS 分发接口与云端交接

本次统一的是设置页的 `world`（3D 运行环境）、`worldModels`（SHARP/DA-2 模型）、
`matte`（MODNet/ONNX Runtime Web）三类资源。基础 FFmpeg、Whisper、Hermes 继续随主安装包发布。

客户端由 Electron 主进程请求业务清单，再使用清单中的 HTTPS 预签名 URL 直接从 RustFS
下载对象。云端 Gateway 只返回 JSON；下载内容由 RustFS 返回。客户端不保存对象存储密钥。

## 客户端接口

```http
GET /api/v1/client/runtime-dependencies/{id}/{platform}-{arch}/manifest.json
```

- `id`：`world`、`worldModels`、`matte`，区分大小写。
- `platform`：`win32`、`darwin`；`arch`：`x64`、`arm64`。
- `worldModels`、`matte` 会带 `version` 查询参数，请严格返回该版本；`+` 按 URL 编码处理。
- `world` 获取该平台最新已发布版本。依赖版本独立于主应用版本。
- 安装程序登录前也会请求此接口，因此清单属于公开的已发布资源元数据，不要求用户 JWT。
  管理、上传和发布操作仍要求平台管理员授权。
- 成功返回 HTTP 200 和下述原始 JSON，不包裹 `data`、`code` 或 `ok`。
- 不支持的平台或未发布的版本返回 HTTP 404；参数无效返回 400；签名服务异常返回 503。
  不返回 HTTP 200 的错误对象，不返回 HTML，不重定向清单。
- `Cache-Control: no-store`。每次请求新签发 URL；建议有效期 3600 秒。
- `urls` 必须是可直接 GET 的 RustFS HTTPS 预签名地址，完整保留签名查询参数；对象 GET
  必须返回 200，不能经 Gateway/Caddy 转发字节或重定向到其他地址。
- 不将预签名 URL 记录到访问日志、持久化目录或发布清单中。

### world 返回示例

以下占位值必须替换为发布目录 `catalog.json` 中实际值。

```json
{
  "schemaVersion": 1,
  "package": {
    "id": "world",
    "version": "1.1.39",
    "platform": "win32",
    "arch": "x64",
    "archive": "tar.gz",
    "sha256": "<catalog 中的 64 位 SHA-256>",
    "downloadSizeBytes": 1,
    "installedSizeBytes": 1,
    "urls": ["https://<RustFS 公网地址>/<bucket>/<objectKey>?<签名参数>"]
  }
}
```

### worldModels、matte 返回结构

```json
{
  "schemaVersion": 1,
  "package": {
    "id": "matte",
    "version": "<请求的锁定版本>",
    "platform": "win32",
    "arch": "x64",
    "files": [
      {
        "relativePath": "models/Xenova/modnet/config.json",
        "sizeBytes": 83,
        "sha256": "e144d8af9b1f09649785c77f592a76bbc69504ae02e43700663b2a9f00d9c8a2",
        "urls": ["https://<RustFS 公网地址>/<bucket>/<objectKey>?<签名参数>"]
      }
    ]
  }
}
```

返回完整文件列表：`matte` 共 6 个文件，`worldModels` 共 2 个文件；从 `catalog.json`
逐项读取，不从本示例猜测。`platform`、`arch` 使用请求目标。客户端会比对锁定版本、完整
文件集合、路径、字节数和 SHA-256，再验证实际下载文件。清单不能替换为另一个模型版本。
预签名 GET 返回 403 时，模型/抠图安装器会重新取清单并重试一次，不切换到第三方下载源。
失败保留原安装；再次安装会重新获取清单。

## 打包与发布目录

在对应平台运行：

```powershell
pnpm --dir desktop package:runtime-dependencies
```

脚本顺序构建并冒烟验证 3D 运行环境、打包运行环境、准备并校验模型资源，最后生成：

```text
desktop/runtime-release/publish-<worldVersion>-<platform>-<arch>/
  catalog.json           # 完整资源元数据及目标平台，不含临时 URL
  SHA256SUMS             # 每个交付文件的校验值
  CLOUD-HANDOFF.md       # 本文
  licenses/             # 第三方许可
  objects/
    runtime-dependencies/world/<version>/<platform>-<arch>/*.tar.gz
    runtime-dependencies/worldModels/<version>/common/models/...
    runtime-dependencies/matte/<version>/common/models/...
    runtime-dependencies/matte/<version>/common/runtime/...
publish-<worldVersion>-<platform>-<arch>.tar
publish-<worldVersion>-<platform>-<arch>.tar.sha256
```

传输 tar 用于交给云端解包。云端上传 `objects/` 下的实际文件，S3 对象 key 相对于
`objects/`，准确对应 `catalog.json` 的 `objectKey`。不要把传输 tar 当成客户端下载对象。
不要把构建产物、用户数据、缓存或凭据提交到 Git。

已有本机最新 3D 构件时可执行 `pnpm --dir desktop package:runtime-assets` 重新整理发布包。
`prepare:dependency-files` 只预取和校验公共模型文件，不表示完整发布包已生成。
所有可复用文件都先检查大小和 SHA-256；缺失文件从源码锁定的上游版本获取。

Windows 主机只产出 Windows x64 3D 二进制。Apple Silicon 在 Mac 上执行同一个完整命令。
云端合并两端 catalog 时按 `id/version/target` 登记，复用 `common` 对象；只有已实际上传且
校验成功的 `world` 平台构件才能发布。Intel Mac 仅提供抠图资源，不声明支持本地 3D。

## 云端实现依据与验收

参考本地 `aigo-cloud` 的 `backend/apps/gateway/api/release/release.api`、
`backend/apps/gateway/api/internal/domain/release/service.go` 和
`backend/apps/file/rpc/internal/domain/file/object_storage.go`：Release 管理发布元数据，
File RPC 管理对象、租户归属和 S3 签名，Gateway 保持薄层。

现有 File RPC 主要面向私网代理，签名使用 `config.Endpoint`。本次必须用客户端可达的 RustFS
HTTPS endpoint 签名；不能先对内网地址签名，再用字符串替换主机名。RustFS 支持原生 TLS
和 S3 SigV4 预签名地址，endpoint、端口、bucket 路径和 region 必须与实际请求一致。

云端需核验：

1. 核验传输包与 `SHA256SUMS`，通过 File 的既有受管存储能力上传大文件，登记字节数和
   SHA-256；S3 ETag 不代替 SHA-256。不要绕过现有租户/平台发布归属。
2. 将 catalog 的 `objectKey` 映射到实际受管对象，发布前检查每个对象都已完整上传；禁止
   原版本 key 覆盖不同内容。保留旧模型锁定版本以支持已安装客户端。
3. 通过对应真实客户端请求三个清单，验证直接下载、签名超时续签、大小/哈希失败拒绝安装、
   安装失败保留旧版本，以及 Windows 3D 运行环境冒烟检查。
4. 管理员发布接口与云端数据迁移按服务端现有约束设计；不改动普通媒体文件和主应用 updater
   的下载合同。本次对象直连授权只针对这三类依赖分发。

## 第三方许可

Apple SHARP 模型权重的许可限制为非商业研究，并明确排除商业产品或产品开发。交付包包含
其完整 `LICENSE_MODEL`；商业分发或用于商业产品前必须取得额外授权。必须保留声明：

> Apple Machine Learning Research Model is licensed under the Apple Machine Learning Research Model License Agreement.

DA-2、MODNet 与 ONNX Runtime 的许可也随包保留。打包完成不代表获得额外的商业许可。

依据：[RustFS S3 文档](https://docs.rustfs.com/en/administration/protocols/s3)、
[SHARP 模型许可](https://github.com/apple/ml-sharp/blob/main/LICENSE_MODEL)、
[DA-2 模型说明](https://huggingface.co/haodongli/DA-2)。

## 可交给云端的提示词

请实现 AI Anime 三类运行依赖（world/worldModels/matte）的 RustFS 分发，客户端代码已按本文
接口适配。先核验交付 tar 的 SHA-256，解包并核验 SHA256SUMS，把 objects/ 下资源按
catalog.json 的 objectKey 上传到 RustFS 私有桶，通过现有 Release/File 领域登记并发布。
新增公开 GET /api/v1/client/runtime-dependencies/{id}/{platform}-{arch}/manifest.json，原样
返回本文 schemaVersion=1 的 JSON；模型和抠图严格匹配 version 查询参数，world 返回目标
平台最新已发布包。实时生成 3600 秒有效的 RustFS HTTPS 预签名 urls，Cache-Control 为
no-store，下载数据由客户端直连 RustFS，不能由 Gateway/Caddy 代理或重定向；不得向客户端
提供存储密钥。签名必须使用客户端可访问的公网 endpoint，不得签名后改写主机名。未发布
平台/版本返回 404，禁止占位文件和错误内容伪装成功。按客户端锁定的完整文件表、大小和
SHA-256 验证，测试三类安装、403 后续签、损坏拒绝和旧安装保留。Windows 包已由 Windows
构建，Mac ARM64 使用相同命令在 Mac 构建后登记；不要声称已有未上传的 Mac 二进制。
保留包内许可，SHARP 权重仅限研究用途，商业分发前需额外授权。只实施云端对应发布/存储
接口和必要管理能力，客户端无需另起一套下载协议。完成后反馈公网清单地址、登记版本、
对象校验结果和真实客户端联调结果。
