---
version: 1.1.6
attention: low
---
# v1.1.6

## User-facing Highlights (zh)

- **商业账户**: 补齐注册、许可设备管理、模型详情和云端调用记录页面。
- **模型权限**: 修复会话恢复后模型角色丢失，并为模型目录、详情和 Bootstrap 携带激活设备 ID。
- **中文展示**: 许可、设备、调用状态、模型类型和额度状态不再直接显示英文枚举。
- **接口清理**: 删除没有本地或云端合同支撑的旧头像上传请求，已有账户头像仍按登录会话字段展示。

## User-facing Highlights (en)

- **Commercial account**: Adds registration, license and device management, model details, and cloud invocation history.
- **Model authorization**: Keeps model roles after session restore and sends the activated device ID for model catalog, detail, and Bootstrap requests.
- **Localized display**: License, device, invocation, model operation, and quota states now use localized labels instead of raw enums.
- **Contract cleanup**: Removes the legacy avatar upload request that had no local or cloud contract while continuing to display avatars returned by the login session.
