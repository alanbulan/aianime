---
version: 1.1.62
attention: high
---
# v1.1.62

## User-facing Highlights (zh)

- **小说摄入恢复**: 请求项目类型与当前项目相同时，不再被误判为类型变更；原始 Markdown 可正常进入小说摄入任务。
- **完整生产工作流恢复**: “继续生成第一集”与直接导入共用的摄入链路已修复，后续角色、脚本、配音、画面和视频阶段不再被该误判提前阻断。
- **错误信息可诊断**: 并行节点异常为空消息时保留底层异常类型，避免任务中心只显示无上下文的 `RuntimeError`。
- **版本同步**: Python 包、Electron 安装器、前端版本兜底、依赖锁文件和 README 已统一更新为 1.1.62。
- **更新提示**: 更新窗口将展示本版本记录；安装完成后请重新启动客户端，使本地后端、Hermes 和 Electron 主进程全部切换到新版本。

## User-facing Highlights (en)

- **Story ingestion restored**: A requested project type matching the current project is no longer misclassified as a type change, so raw Markdown can enter ingestion normally.
- **Production workflow restored**: The shared ingestion path used by “continue episode 1” and direct import no longer blocks the remaining character, script, voice, image, and video stages prematurely.
- **Actionable task errors**: Parallel node failures with an empty message now retain the underlying exception type instead of surfacing only a context-free `RuntimeError`.
- **Version synchronization**: Python, Electron, frontend fallback, dependency lock, and README versions are synchronized to 1.1.62.
- **Update notice**: Restart the desktop client after installation so the local backend, Hermes, and Electron main process all use the new version.
