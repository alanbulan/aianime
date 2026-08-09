---
version: 1.1.8
attention: low
---
# v1.1.8

## User-facing Highlights (zh)

- **本地语音转写**: 麦克风输入改用随应用打包的 Faster Whisper 本地 sidecar，在 Windows 与 macOS 上离线完成普通话转写，不再依赖浏览器或云端语音服务。
- **更新检测**: 启动后强制执行真实版本检查，避免 Bootstrap 缓存遮蔽云端新版本；账户设置新增“检查更新”入口和检查状态反馈。
- **显示修复**: 账户、设备信息不再重复显示完全相同的值与明细，自定义模型用途选中后继续显示本地化名称。
- **权限边界**: Electron 仅允许本地主窗口申请麦克风音频权限，并补充 macOS 麦克风用途声明；录音数据只提交至受桌面令牌保护的本机接口。

## User-facing Highlights (en)

- **Local speech transcription**: Replaces browser speech recognition with a bundled Faster Whisper sidecar for offline Mandarin transcription on Windows and macOS.
- **Update discovery**: Forces a real release check after Bootstrap hydration and adds a visible manual check-for-updates action with status feedback.
- **Rendering fixes**: Suppresses duplicate account and device details, while keeping selected custom-model purposes localized.
- **Permission boundary**: Grants audio-only microphone access to the trusted local main window and adds the required macOS usage description.
