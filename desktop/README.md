# AI anime 桌面壳（Electron）

`desktop/` 是 AI anime 的 Electron 桌面壳：负责窗口生命周期、本地 FastAPI sidecar 启停、商业云端链路（登录/许可/额度/模型目录/更新）、内置 Hermes ACP 运行时和 Windows 打包。

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
│  ├─ commercial-artifact.ts     更新制品下载与校验
│  ├─ secure-file-store.ts       BYOK 密文等敏感数据的本地加密存储
│  ├─ hermes-runtime.ts          内置 Hermes ACP 进程管理
│  └─ preload.cts                contextBridge 白名单 IPC（不暴露 token/私钥/raw fetch）
├─ backend/                      PyInstaller sidecar 入口与 spec
├─ hermes-runtime/               独立 Hermes ACP 运行时（独立 pyproject/uv.lock）
├─ scripts/                      开发启动、图标生成、FFmpeg 拉取等脚本
├─ tests/                        Electron 主进程契约测试
├─ electron-builder.yml          NSIS 与应用图标配置
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
```

打包链路依次执行：应用图标生成、FFmpeg 拉取、前端 CE 构建、Electron 主进程编译、后端 PyInstaller、Hermes 运行时 PyInstaller，最后 electron-builder 出包。

## 安全边界

- JWT、设备私钥、离线租约、BYOK 持久化密文和更新制品只存在于 Electron 主进程；渲染进程只拿到可展示的会话摘要和业务 DTO。
- `preload.cts` 只暴露白名单 IPC，不提供任意 URL 请求能力。
- 本地 FastAPI sidecar 只绑定 loopback 随机端口，桌面进程令牌用于阻止本机其他进程直接调用。

## 商业链路

- 固定 Gateway：`https://aianime.122-193-11-199.sslip.io`。
- 模型调用只有两条入口：普通版 Cloud 由云端中转；专业版 BYOK 由用户自填标准模型接口，客户端只做请求不中转。
- 对象存储统一走平台云端，不提供用户 BYOK 存储入口。
- Agent 执行使用内置 Hermes ACP，模型仍只走 Cloud / BYOK 两条入口。
