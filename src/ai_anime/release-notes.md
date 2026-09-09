---
version: 1.1.65
attention: medium
---
# v1.1.65

## User-facing Highlights (zh)

- **Mac 更新**：使用官方 Sparkle 安装器和独立 Ed25519 签名验证更新包，不再依赖 Squirrel.Mac 的 Developer ID 签名连续性；Windows 更新方式保持不变。
- **安装状态**：修复点击更新后窗口立即消失的问题；安装期间持续显示状态，系统安装失败时保留错误提示并允许重试。
- **旧版迁移**：Mac 1.1.63 / 1.1.64 用户需要手动安装一次本版 DMG，才能使用新的自动更新链路。首次安装仍可能出现 macOS 的未识别开发者提示。
- **发布流程**：Mac Action 增加错误签名拒绝、原生替换与重启测试，以及更新 ZIP 签名；同步修正工程手册迁移后的版本脚本路径。

## User-facing Highlights (en)

- **Mac updates**: Use the official Sparkle installer and independent Ed25519 update signatures. Windows keeps its existing update mechanism.
- **Installation state**: Keep the update dialog visible while installing and show asynchronous failures with a retry option.
- **Migration**: Mac 1.1.63 / 1.1.64 users must manually install this DMG once to adopt the new update mechanism. Gatekeeper may still warn during the initial installation.
- **Release workflow**: Verify signature rejection, native replacement and relaunch before packaging; sign update ZIPs and fix version synchronization after the engineering manual move.
