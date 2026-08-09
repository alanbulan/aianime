---
version: 1.1.7
attention: low
---
# v1.1.7

## User-facing Highlights (zh)

- **账户资料**: 新增当前用户资料读取与完整编辑，支持昵称、邮箱、手机号、性别和个人简介。
- **安全头像**: 新增 JPEG、PNG、WebP 头像上传、读取和删除；受保护图片由 Electron 主进程携带 Bearer Token 获取，渲染进程不再直接访问远程相对路径。
- **密码安全**: 新增已登录用户修改密码，以及发送邮箱验证码、验证一次性票据、设置新密码的三步忘记密码流程。
- **会话收口**: 修改密码成功后立即清除 Gateway JWT、本地工作区 Cookie、权益状态和用户缓存，并返回登录页。
- **合同清理**: 删除残留的滑块验证码类型和兼容分支，只保留云端现行图形验证码合同。
- **发布状态**: 保留 `1.1.6` 可选更新和 `lease-2026-08-v1` 验签记录，新增 `1.1.7` Windows x64 NSIS 发布版本。

## User-facing Highlights (en)

- **Account profile**: Adds profile viewing and full updates for display name, email, phone, gender, and biography.
- **Protected avatar**: Adds JPEG, PNG, and WebP upload, retrieval, and deletion through the authenticated Electron main process.
- **Password security**: Adds password changes and the three-step email-code password reset contract.
- **Session revocation**: Clears Gateway, local workspace, entitlement, and user state after a successful password change.
- **Contract cleanup**: Removes the obsolete slider-captcha type and compatibility branch while retaining the current image captcha flow.
- **Release status**: Preserves the verified `1.1.6` optional-update record and introduces the `1.1.7` Windows x64 NSIS release.
