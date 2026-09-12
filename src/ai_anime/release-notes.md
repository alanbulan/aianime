---
version: 1.1.66
attention: medium
---
# v1.1.66

## User-facing Highlights (zh)

- **Windows 更新**：安装前先完整关闭本地后端和模型代理，并等待子进程树退出，避免 NSIS 旧版卸载器返回 `2`。
- **更新兼容**：更新模式增加旧客户端进程树清理；普通手动安装仍保留标准的关闭提示。
- **版本同步**: Python 包、Electron 安装器、前端版本兜底、依赖锁文件和 README 已统一更新为 1.1.66。
- **更新提示**: 更新窗口将展示本版本记录；安装完成后请重新启动客户端，使本地后端、Hermes 和 Electron 主进程全部切换到新版本。

## User-facing Highlights (en)

- **Windows updates**: Stop the local backend and model proxy completely before launching NSIS, and wait for the child process tree to exit so the legacy uninstaller does not return code `2`.
- **Update compatibility**: Updated-install mode cleans up processes from older clients while normal manual installs keep the standard close prompt.
- **Version synchronization**: Python, Electron, frontend fallback, dependency lock, and README versions are synchronized to 1.1.66.
- **Update notice**: Restart the desktop client after installation so the local backend, Hermes, and Electron main process all use the new version.
