---
version: 1.1.14
attention: medium
---
# v1.1.14

## User-facing Highlights (zh)

- **中文项目名称**: 新建项目不再限制为英文字母。前端与本地后端统一支持中文及其他 Unicode 文字、数字和下划线，同时继续拦截空格、路径分隔符及以下划线开头的名称。
- **项目助手会话修复**: 修复切换云端/BYOK 网关后仍恢复旧 Hermes 会话的问题。模型网关发生变化时会作废该用户各项目的旧会话 ID，避免单个旧项目连续出现“助手运行时没有返回有效内容”或旧提供方凭据错误；普通项目切换和令牌续期仍保留上下文连续性。
- **构建任务修复**: Windows 打包配置显式收集 `tiktoken_ext.openai_public`，解决“构建场景”“规划剧集”“构建角色”等任务在 1% 处因 `Unknown encoding cl100k_base` 失败的问题。本地后端启动时增加编码运行时校验，缺包会在启动阶段明确失败，不再等到任务执行后才暴露。
- **记住登录持久化**: 勾选“在这台设备上保持登录”后，续登录凭据仅保存在 Electron 的操作系统加密存储中。令牌过期或远端服务重启导致令牌失效时，客户端会自动重新认证；临时断网或 Gateway 5xx 不再删除本地会话。未勾选时，会话只保留在当前应用进程中。
- **安全边界**: 密码不会进入渲染进程、localStorage、日志或接口返回；退出登录、修改密码和永久认证失败仍会清除本机加密会话。
- **版本与验证**: Python、Electron、前端兜底版本、锁文件、README 和云端交接文档统一更新为 1.1.14。中文项目名、Hermes 会话轮换、服务重启自动重登、瞬时故障保留会话及打包后 `cl100k_base` 启动均已加入回归验证。
- **更新提示**: 安装完成后请重新启动客户端，使本地后端、Hermes 和 Electron 主进程全部切换到 1.1.14。首次使用新版“记住登录”时需正常登录一次，之后才能建立加密续登录凭据。

## User-facing Highlights (en)

- **Chinese project names**: New projects now accept Chinese and other Unicode letters, numbers, and underscores while still rejecting spaces, path separators, and leading underscores.
- **Project assistant sessions**: Hermes session IDs created under an old model gateway are discarded when the gateway changes, preventing project-specific empty replies and stale-provider credential errors while retaining normal project and token-renewal continuity.
- **Build tasks**: The Windows package now includes `tiktoken_ext.openai_public`, fixing `Unknown encoding cl100k_base` failures in scene, episode, and character build tasks. The packaged backend validates the encoding during startup.
- **Remembered login**: Opted-in credentials are stored only through Electron's operating-system encryption. Invalidated tokens automatically reauthenticate, transient network and Gateway 5xx failures no longer erase the local session, and non-remembered sessions remain process-only.
- **Security boundary**: Passwords never enter the renderer, localStorage, logs, or renderer-facing responses. Logout, password changes, and permanent authentication failures still clear the encrypted session.
- **Version and verification**: Python, Electron, frontend fallback, lockfile, README, and cloud handoff versions are synchronized to 1.1.14, with regression coverage for all fixes above.
- **Update notice**: Restart the desktop client after installation so the local backend, Hermes, and Electron main process all use version 1.1.14. Sign in once with the new build to create the encrypted remembered-login record.
