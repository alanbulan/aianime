---
version: 1.1.63
attention: medium
---
# v1.1.63

## User-facing Highlights (zh)

- **环境依赖下载**: 3D 运行环境、导演世界大型模型和图片抠图资源统一通过云端清单获取下载地址，直接下载并校验完整性。
- **下载地址续签**: 下载地址过期时重新获取清单并重试一次；Windows 安装程序与设置页使用相同的续签、大小和 SHA-256 校验规则。
- **保留已有环境**: 下载或校验失败时保留旧安装；若文件替换后的回退失败，保留备份目录。
- **平台校验**: 3D 运行环境严格匹配操作系统和架构，Mac ARM64 构件尚未发布时不会下载 Windows 包。
- **更新提示**: 安装完成后请重新启动客户端，使 Electron 主进程、本地后端和 Hermes 使用新版本。

## User-facing Highlights (en)

- **Runtime downloads**: 3D runtime, director-world models and image matting resources use cloud manifests and verified direct downloads.
- **Expired download links**: Refresh the manifest and retry once after HTTP 403. The Windows installer and settings share size and SHA-256 verification requirements.
- **Preserve installations**: Failed downloads or verification preserve the previous installation; failed rollback retains its backup directory.
- **Platform validation**: Runtime archives must match the OS and architecture. An unpublished Mac ARM64 runtime cannot be replaced with a Windows archive.
- **Update notice**: Restart after installation so Electron, the local backend and Hermes use the new version.
