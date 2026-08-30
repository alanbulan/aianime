# Electron 桌面层局部指南

本目录规则补充仓库根入口。非简单改动先读取 `.aigo/AI_CODING_CONTEXT.md`、
`.aigo/rules/code-governance.md`、`.aigo/rules/desktop-electron.md` 和
`.aigo/rules/testing.md`；打包、更新或安全改动再读 `.aigo/rules/release-security.md`。

- `src/main.ts` 是组合根，不承载可独立测试的商业规则。
- `src/backend.ts` 管理 FastAPI sidecar；`hermes-runtime/` 保持独立运行时与锁文件。
- preload/IPC 变更必须保持最小白名单、双端类型对称，并覆盖 `tests/*.test.mjs` 合同。
- 商业模型、许可、认证和更新能力沿用现有 `commercial-*` 与 provider 所有权。
- 开发、测试、构建和打包只使用 `package.json` 中的脚本。

最小验证：

```powershell
pnpm --dir desktop typecheck
pnpm --dir desktop test
```
