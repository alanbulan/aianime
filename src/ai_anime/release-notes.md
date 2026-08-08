---
version: 1.1.5
attention: low
---
# v1.1.5

## User-facing Highlights (zh)

- **可信更新**: 客户端内置可轮换的 Ed25519 制品与许可公钥，只安装本次会话已验签的更新文件。
- **发布门禁**: Windows 发布包强制 Authenticode，macOS 发布包强制 Developer ID、Hardened Runtime 与 notarization。
- **安装稳定性**: 修复更新临时目录判断，并在启动安装器前重新校验文件哈希与平台签名。

## User-facing Highlights (en)

- **Trusted updates**: The client pins rotatable Ed25519 artifact and lease keys and installs only artifacts verified in the current session.
- **Release gates**: Windows releases require Authenticode; macOS releases require Developer ID, Hardened Runtime, and notarization.
- **Install stability**: Artifact temp-path validation is corrected, and hashes plus platform signatures are checked again before launch.
