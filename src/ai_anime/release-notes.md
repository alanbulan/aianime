---
version: 1.1.4
attention: low
---
# v1.1.4

## User-facing Highlights (zh)

- **桌面交付链路**: Windows 安装包统一内置前端、FastAPI、Hermes ACP 与 FFmpeg，并保持 macOS arm64 独立构建配置。
- **工作流稳定性**: 后端与 API 按业务上下文收敛，完善 SQLite 请求生命周期并修复迁移后的接口引用。
- **更新安全**: 更新制品增加大小、SHA-256、Ed25519 与 Windows Authenticode 校验，缺少可信密钥时拒绝安装。

## User-facing Highlights (en)

- **Desktop delivery pipeline**: Windows packages now bundle the renderer, FastAPI, Hermes ACP, and FFmpeg while retaining a dedicated macOS arm64 build.
- **Workflow stability**: Backend and API code is grouped by business context, with request-scoped SQLite lifecycle handling and corrected migrated API references.
- **Update security**: Release artifacts are checked for size, SHA-256, Ed25519, and Windows Authenticode signatures; installation fails closed without trusted keys.
