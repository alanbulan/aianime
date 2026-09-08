---
version: 1.1.64
attention: medium
---
# v1.1.64

## User-facing Highlights (zh)

- **Mac 文字编辑**: 恢复原生编辑菜单和复制、粘贴、剪切、撤销、全选快捷键，补齐输入框右键编辑菜单；开发版与安装版使用同一实现。
- **提示词拖放**: 修复视频节点把文字拖入输入框误当作文件上传、导致没有反馈的问题；保留视频文件上传行为。
- **近期修复**: 包含视频模型参数与默认时长提示、BYOK 视频参数校验、网页助手合同和媒体任务状态更新等本地更新。
- **版本同步**: Python 包、Electron 安装器、前端版本兜底、依赖锁文件和 README 已统一更新为 1.1.64。
- **更新提示**: 更新窗口将展示本版本记录；安装完成后请重新启动客户端，使本地后端、Hermes 和 Electron 主进程全部切换到新版本。

## User-facing Highlights (en)

- **Mac text editing**: Restore native editing commands and shortcuts, and add text context menus using the same implementation in development and packaged apps.
- **Prompt drag and drop**: Stop video nodes from cancelling native text drops into editors while preserving video file uploads.
- **Recent fixes**: Include local updates to video model options and default durations, BYOK video validation, web assistant contracts and media task state updates.
- **Version synchronization**: Python, Electron, frontend fallback, dependency lock, and README versions are synchronized to 1.1.64.
- **Update notice**: Restart the desktop client after installation so the local backend, Hermes, and Electron main process all use the new version.
