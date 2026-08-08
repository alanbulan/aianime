---
version: 1.1.5
attention: low
---
# v1.1.5

## User-facing Highlights (zh)

- **标准更新**: 使用 electron-updater 完成版本检查、下载、SHA-512 校验和安装。
- **简化发布**: Windows 可直接生成 NSIS，macOS 使用 ad-hoc 签名，打包不再强制开发者凭据。
- **云端接入**: 更新只需现有 Gateway 托管 `latest*.yml` 和对应安装包。

## User-facing Highlights (en)

- **Standard updater**: electron-updater now handles version checks, downloads, SHA-512 verification, and installation.
- **Simplified packaging**: Windows can produce NSIS packages directly, while macOS uses ad-hoc signing without mandatory developer credentials.
- **Cloud integration**: The existing Gateway only needs to host `latest*.yml` and their matching installers.
