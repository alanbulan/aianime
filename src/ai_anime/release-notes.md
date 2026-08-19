---
version: 1.1.53
attention: medium
---
# v1.1.53

## User-facing Highlights (zh)

- **助手更稳定**: 修复 Hermes 子进程 stderr 管道无人读取导致写满后死锁的问题——这会让助手在会话变长、日志变多后卡住不再回复。同时修正长回合被空闲回收误杀、以及回收线程持锁做慢速关闭时阻塞所有用户发消息的问题。
- **不再丢失未保存的编辑**: 上传风格封面（或任何后台数据刷新）不再清空你在风格详情里尚未保存的字段修改。
- **任务不再被"重复调用"卡死**: 任务执行器在运行器之外异常退出时，会正确落库为失败；此前会残留永不过期的 running 僵尸记录，导致同类型任务被持续拒绝，直到重启客户端才能恢复。
- **会话消息归属修正**: 切换会话时，旧会话的通知与消息不再串入新会话，也不会被错误地写进新会话的本地缓存。
- **画布保存不再卡住整个后端**: 画布保存、恢复、删除与历史查询移出事件循环，大画布或锁竞争期间不再让整个本地服务（含聊天心跳）停摆。
- **聊天连接更稳**: 切换"显示工具事件"设置不再断开并重连 WebSocket；畸形消息会返回明确错误而不是直接断开连接。
- **裁剪与上传交互修正**: 大图解码完成前不再能保存无效裁剪框，数据刷新后裁剪框不再永久失效；同一文件可重新选择，分析期间不再能重复触发。
- **模型路由与更新更可靠**: 视频任务的粘滞路由加入有效期与容量上限（并在你删除或更换 BYOK 供应商后自动失效），不再长期驻留 API 密钥；确定性的请求错误不再被反复重试放大延迟；重复点击更新按钮不再并发下载。
- **磁盘与资源占用**: 修复风格参考图生成后临时目录永不清理（每次残留 1–3MB）、数据库首次并发连接导致的连接与线程泄漏，以及子进程轮询期间每秒重建 10 个事件循环的浪费。
- **版本同步**: Python 包、Electron 安装器、前端版本兜底、依赖锁文件和 README 已统一更新为 1.1.53。
- **更新提示**: 更新窗口将展示本版本记录；安装完成后请重新启动客户端，使本地后端、Hermes 和 Electron 主进程全部切换到新版本。

## User-facing Highlights (en)

- **Assistant stability**: Fixed a deadlock where the Hermes subprocess stderr pipe had no reader — once it filled, the child blocked and the assistant stopped responding, increasingly likely as sessions and logs grew. Long turns are no longer idle-reaped, and the reaper no longer blocks every user's messages while closing workers.
- **No more lost edits**: Uploading a style cover (or any background refetch) no longer discards unsaved field edits in the style detail form.
- **Tasks no longer wedge on "duplicate call"**: When a task runner dies outside its own guard, the task is now recorded as failed. Previously a `running` zombie row with no TTL kept rejecting every later task of the same type until the client restarted.
- **Correct message ownership**: Switching conversations no longer leaks the previous conversation's notifications and messages into the new one, or persists them under the new conversation's cache key.
- **Canvas saves no longer stall the backend**: Canvas save, restore, delete and history queries moved off the event loop, so large canvases and lock contention no longer freeze the whole local service (including chat heartbeats).
- **Steadier chat connection**: Toggling "show tool events" no longer tears down and reopens the WebSocket, and malformed frames get a clear error instead of dropping the connection.
- **Crop and upload fixes**: Saving an invalid crop before the image finishes decoding is blocked, a refetch no longer leaves the crop box permanently unusable, the same file can be re-selected, and analyze can't be triggered twice concurrently.
- **More reliable model routing and updates**: Sticky video-task routes now carry a TTL and capacity bound (and are invalidated when a BYOK provider is removed or changed), so API keys no longer stay resident indefinitely; deterministic request errors are no longer retried into amplified latency; double-clicking update no longer starts concurrent downloads.
- **Disk and resource usage**: Fixed a temp directory that was never cleaned after style reference generation (1–3MB leaked per run), a connection and thread leak from concurrent first-time database connections, and wasteful rebuilding of ten event loops per second during subprocess polling.
- **Version synchronization**: Python, Electron, frontend fallback, dependency lock, and README versions are synchronized to 1.1.53.
- **Update notice**: Restart the desktop client after installation so the local backend, Hermes, and Electron main process all use the new version.
