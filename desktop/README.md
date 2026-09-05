# AI anime 桌面壳（Electron）

`desktop/` 是 AI anime 的 Electron 桌面壳：负责窗口生命周期、本地 FastAPI sidecar 启停、商业云端链路（登录/许可/额度/模型目录/更新）、内置 Hermes ACP 运行时和桌面打包。

## 目录结构

```text
desktop/
├─ src/
│  ├─ main.ts                    主进程装配：窗口、IPC、后端与商业链路接线
│  ├─ backend.ts                 FastAPI sidecar 启停、令牌注入与健康检查
│  ├─ commercial.ts              商业 Gateway 客户端：登录/JWT/许可/额度/目录/公告/版本
│  ├─ commercial-device.ts       设备身份生成与持久化
│  ├─ commercial-lease.ts        离线租约验签（Ed25519）与有效性判定
│  ├─ commercial-model-access.ts 普通版 Cloud / 专业版 BYOK 访问模型
│  ├─ commercial-model-proxy.ts  云端模型请求代理（仅 Cloud 中转路径）
│  ├─ commercial-contracts.ts    商业响应 DTO 与校验
│  ├─ commercial-updater.ts      electron-updater 与商业发布的适配
│  ├─ commercial-trust.ts        内置离线租约 Ed25519 公钥
│  ├─ secure-file-store.ts       BYOK 密文等敏感数据的本地加密存储
│  ├─ hermes-runtime.ts          内置 Hermes ACP 进程管理
│  └─ preload.cts                contextBridge 白名单 IPC（不暴露 token/私钥/raw fetch）
├─ backend/                      PyInstaller sidecar 入口与 spec
├─ hermes-runtime/               独立 Hermes ACP 运行时（独立 pyproject/uv.lock）
├─ scripts/                      开发启动、图标生成、FFmpeg 拉取等脚本
├─ tests/                        Electron 主进程契约测试
├─ electron-builder.yml          NSIS、DMG、ZIP 与应用图标配置
└─ package.json
```

## 开发

直接启动 Electron 开发模式（自动拉起本地 FastAPI 与 Vite，不执行前端生产构建）：

```powershell
pnpm --dir desktop dev
```

类型检查与契约测试：

```powershell
pnpm --dir desktop typecheck
pnpm --dir desktop test
```

## 打包

```powershell
pnpm --dir desktop package:dir    # 生成 unpacked 目录
pnpm --dir desktop package:win    # 生成 NSIS 安装包
pnpm --dir desktop package:mac    # 在 Apple Silicon Mac 上生成 DMG 与 ZIP
pnpm --dir desktop package:mac:x64 # 在 Intel Mac 上生成兼容 Ventura 的 DMG 与 ZIP
```

打包链路依次执行：应用图标生成、对应平台的 LGPL 兼容 FFmpeg 准备与校验、前端 CE 构建、Electron 主进程编译、后端 PyInstaller、Hermes 运行时 PyInstaller，最后 electron-builder 出包。Windows 目标为 x64；Apple Silicon 包要求 macOS 15 及以上；Intel x64 包要求 macOS 13.4 Ventura 及以上，覆盖 13.7.8。PyInstaller sidecar 不能跨系统或跨架构生成，因此各安装包必须分别在对应宿主系统构建。

Intel 首次打包前需保证 `clang`、`make`、`python3`、`meson`、`ninja`、`perl`、`cargo` 和 `rustc` 可从 `PATH` 调用。打包链会从固定 SHA-256 的 `markus-perl/ffmpeg-build-script` 源码构建并缓存 Intel FFmpeg，随后验证 `h264_videotoolbox`、`drawtext`、`subtitles`、系统动态库链接、Mach-O 架构和最低 macOS 版本。出包后还会检查所有内置 Mach-O、运行后端/FFmpeg/Hermes 冒烟并执行严格签名校验。

macOS 视频编码使用 `h264_videotoolbox -allow_sw 1`：优先使用硬件编码，在硬件会话不可用时允许系统软件编码，避免无硬件编码器的 Actions Runner 直接失败；软件编码可能更慢，不改变 Windows 的 `libopenh264` 参数。该选项的默认值和行为见 [FFmpeg 9.0.1 VideoToolbox 实现](https://github.com/FFmpeg/FFmpeg/blob/n9.0.1/libavcodec/videotoolboxenc.c)。成品冒烟使用同一设置生成带中文字幕的 H.264 MP4，校验分辨率和解码帧数，再实际解码；不会跳过编码失败。后端冒烟的 Cognee 数据目录定向到临时目录，避免写入已签名应用。

Intel Python 准备脚本会先构建面向 Ventura 的静态 OpenSSL 4.0.2，再安装锁定版本的 cryptography，避免链接构建机的 Homebrew 库；不降低加密库版本。Ladybug 仅在 Intel Mac 使用 0.17.1，Windows 仍为 0.19.0，其他平台保持原选择。该旧版的存储缺陷与跨版本图数据库兼容性风险见根目录 README 的 Intel 打包说明，不自动改写用户数据。两个 Python 环境会在 FFmpeg 编译前完成原生库预检；这些步骤不进入 Windows 或 arm64 的打包命令。

仓库的 `.github/workflows/build-macos-intel.yml` 可在 GitHub Actions 中手动运行，也会在推送与 `desktop/package.json` 版本一致的 `v*` 标签时自动运行。它使用 `macos-15-intel` 生成 DMG、ZIP、`latest-mac.yml` 和 SHA-256 清单；手动构建保留 1 天 Actions 制品，标签构建保存到不会直接发布的草稿 Release。该托管 Runner 运行 macOS 15；Intel 打包会先按 Ventura 目标同步两个 Python 环境，后续构建不再按宿主系统重选轮子。它能验证 x86_64 架构、13.4 最低版本与内置运行时，但不能代替 Intel macOS 13.7.8 上的最终安装和业务冒烟。

可选的“导演世界 3D 运行环境”当前只支持 Windows x64 和 macOS arm64，不随轻量主安装包分发；Intel x64 客户端会明确显示该可选运行环境不受支持。

Intel Actions 还生成 `release-<version>-macos-x64.json`，与 Windows 发布记录共用 `version`、`platform`、`arch`、`file`、`size`、`sha256`、`sha512`、`releaseDate`、`updaterManifest`、`updaterManifestVerified` 字段。macOS 的顶层 `file` 指向更新器使用的 ZIP，`installer` 记录手动安装用的 DMG 及其大小和哈希；平台为 `darwin`、架构为 `x64`，不套用 Windows Authenticode 字段。`pnpm --dir desktop release:manifest:mac:x64` 从实际包计算摘要，并核对 `latest-mac.yml` 的版本、两个文件及 SHA-512 后才写入 JSON。JSON 随 DMG、ZIP、YAML 和 SHA-256 清单一起上传，不代表 Developer ID 签名、公证或目标机安装已经验收。

Intel 打包命令单独加载 `electron-builder.macos-intel.yml`，在根级 `files` 白名单内排除仅供该可选 3D 环境使用的 `@playcanvas/splat-transform` 和 `webgpu`，避免将要求 macOS 15 的 Dawn 原生库带入 Ventura 主包；不要改成仅含排除规则的 `mac.files`，该配置会触发默认全目录收集并带入 Hermes 开发虚拟环境。Windows 与 Apple Silicon 仍使用原配置和依赖。Mach-O 检查使用 Apple `otool -m` 按完整文件名读取带括号的 Electron Helper，并继续严格校验目标架构和最低系统版本。Actions 会在耗时编译前使用打包器归一化后的配置验证主应用文件收集；最终还会启动成品 Electron 的 Node 模式，检查 ASAR 根目录仅包含 `dist`、`node_modules`、`package.json`，并验证主入口、更新器依赖和 3D 模块排除结果，不触发联网更新或登录。

打包不强制开发者证书：Windows 可直接生成无证书 NSIS，macOS 使用 ad-hoc 签名。对外分发的 macOS 包仍需 Developer ID 签名和 Apple 公证。`electron-builder` 同时生成 `latest.yml` / `latest-mac.yml`，客户端由 `electron-updater` 完成下载、SHA-512 校验和安装。

## 安全边界

- JWT、设备私钥、离线租约、BYOK 持久化密文和更新 feed 请求头只存在于 Electron 主进程；渲染进程只拿到可展示的会话摘要和业务 DTO。
- `preload.cts` 只暴露白名单 IPC，不提供任意 URL 请求能力。
- 本地 FastAPI sidecar 只绑定 loopback 随机端口，桌面进程令牌用于阻止本机其他进程直接调用。

## 商业链路

- 固定 Gateway：`https://aianime.mingcw.com`。
- 模型调用只有两条入口：普通版 Cloud 由云端中转；专业版 BYOK 由用户自填标准模型接口，客户端只做请求不中转。
- 对象存储统一走平台云端，不提供用户 BYOK 存储入口。
- Agent 执行使用内置 Hermes ACP，模型仍只走 Cloud / BYOK 两条入口。
