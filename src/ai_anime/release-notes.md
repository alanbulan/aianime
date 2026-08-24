---
version: 1.1.58
attention: medium
---
# v1.1.58

## User-facing Highlights (zh)

- **完整生产工作流**: 自动检查图片与配音模型、声线和 Seedance 最终提示词；前置失败后不再继续提交依赖任务。
- **模型路由**: 图片生成与参考图编辑按能力走同一套云端/BYOK 路由，避免将仅文生图模型用于 `IMAGE_EDIT`。
- **任务可靠性**: 首帧与草图任务超时调整为两小时，并校验正式产物的新鲜度与实际更新范围。
- **版本同步**: Python 包、Electron 安装器、前端版本兜底、依赖锁文件和 README 已统一更新为 1.1.58。
- **更新提示**: 更新窗口将展示本版本记录；安装完成后请重新启动客户端，使本地后端、Hermes 和 Electron 主进程全部切换到新版本。

## User-facing Highlights (en)

- **Production workflow**: Automatically checks image/audio models, voice references, and Seedance final prompts; dependent writes stop after a prerequisite failure.
- **Model routing**: Image generation and reference editing use the same cloud/BYOK capability routing and generation-only models are rejected for `IMAGE_EDIT`.
- **Task reliability**: Frame and sketch timeouts are extended to two hours, with freshness and output-update verification.
- **Version synchronization**: Python, Electron, frontend fallback, dependency lock, and README versions are synchronized to 1.1.58.
- **Update notice**: Restart the desktop client after installation so the local backend, Hermes, and Electron main process all use the new version.
