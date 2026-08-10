---
version: 1.1.10
attention: low
---
# v1.1.10

## User-facing Highlights (zh)

- **助手会话修复**: Hermes 业务工具同时携带桌面令牌和用户 Agent 令牌，已登录账号不再被误判为“桌面会话校验失败”。
- **本地语音修复**: 录音数据改为内存解码后提交至随应用打包的 Faster Whisper sidecar，避免被 Electron CSP 拦截；Windows 与 macOS 继续使用本地离线转写。
- **通知与操作反馈**: 通知中心按账号持久化已读状态，查看后红点立即消失，新公告仍会提醒；复制文本与 JSON 改走可信 Electron 剪贴板并显示成功或失败结果。
- **工具事件入口**: 右上角工具事件按钮增加明确的开启/关闭状态与提示，解决点击后无可见反馈的问题。
- **账户与更新界面**: 点击头像框即可更换头像；账户资料与修改密码合并展示，许可设备和应用更新独立分类；更新页展示应用、平台、运行时、渠道和检查方式等详细信息。
- **本地化与布局**: 下拉筛选的已选值保持中文显示，修复账户/许可信息重复渲染，并放宽资料保存与密码操作区的布局间距。

## User-facing Highlights (en)

- **Assistant session fix**: Hermes business tools now send both the desktop token and user Agent token, preventing authenticated users from being rejected by desktop-session validation.
- **Local speech fix**: Recorded audio is decoded in memory before being sent to the bundled Faster Whisper sidecar, avoiding Electron CSP blocking while keeping transcription offline on Windows and macOS.
- **Notification and action feedback**: Read state is persisted per account, the unread dot clears after viewing, and new announcements still alert; text and JSON copy now use the trusted Electron clipboard with success or failure feedback.
- **Tool activity control**: The header tool-events control now has clear enabled/disabled styling and confirmation feedback.
- **Account and update UI**: Avatar replacement is integrated into the avatar frame, profile and password settings are grouped together, and the update page provides detailed app, platform, runtime, channel, and check information.
- **Localization and layout**: Selected filter values remain localized, duplicate account/license rendering is removed, and profile/password action spacing is improved.
