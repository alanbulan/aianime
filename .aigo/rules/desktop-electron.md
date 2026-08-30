# Electron 桌面层规则

## 信任边界

- Electron 主进程拥有窗口、Session、IPC、`safeStorage`、许可、更新、模型代理和 sidecar
  生命周期；Renderer 不直接获得 Node、密钥、文件系统或进程能力。
- 保持 Renderer 的 `contextIsolation`、sandbox 和正式版 CSP。新增能力必须通过最小白名单
  preload/IPC 合同暴露，并同时更新发送端、处理端、类型与合同测试。
- 商业 Gateway 的 JWT、设备身份、许可、BYOK 密文和更新制品只能停留在既有主进程
  安全边界，不写入 Renderer 状态、日志或普通配置文件。

## 生命周期与合同

- FastAPI sidecar 生命周期归 `desktop/src/backend.ts` 及其组合根；不要从 Renderer 或
  临时脚本启动第二套后端流程。
- 商业模型、认证、更新与 IPC 逻辑沿用 `commercial-*`、runtime contracts 和既有 provider
  目录的所有权，不把业务判断重新堆回 `main.ts`。
- Hermes ACP 使用 `desktop/hermes-runtime` 的独立项目和锁文件。修改其构建或运行时必须
  使用该目录已有脚本。
- 开发与测试使用 `desktop/package.json` 中的标准脚本；不要绕过 TypeScript 注册入口直接
  运行 `node --test`。

## 常用验证

```powershell
pnpm --dir desktop typecheck
pnpm --dir desktop test
```

只有涉及编译输出或资源装配时运行 `pnpm --dir desktop build`；安装包、更新和 sidecar
制品改动按 `.aigo/rules/release-security.md` 扩大验证。
