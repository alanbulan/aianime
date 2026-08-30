# 发布、安全与上游规则

## 发布边界

- `pyproject.toml` 与 `desktop/package.json` 版本必须一致，发布说明版本标记同步更新。
- Windows 与 macOS 制品使用 `desktop/package.json` 的目标平台脚本，不手工拼接
  electron-builder、PyInstaller 或更新器命令。
- 发布前分别完成目标平台的干净安装、启动、登录、生成、退出和更新检查，并记录制品
  文件名、字节数、平台及对应 `latest*.yml`。
- 单元测试和普通构建不能替代安装包资源冒烟、签名/更新检查或真实 Gateway 合同验证。

## 安全边界

- 不提交或输出 `secure/`、用户数据、日志、`.env`、Cookie、JWT、API Key、私钥及
  `safeStorage` 明文。
- 真实 Gateway、对象存储、模型调用、发布上传和付费资源操作必须先确认目标、账户与
  影响范围；普通代码任务不授权这些操作。
- Renderer 不持有商业密钥；本地 HTTP 服务只保持既有 loopback、会话和 CSP 边界。
- 迁移、恢复、更新和文件覆盖必须先验证绝对目标路径与可恢复性。

## 上游同步

- `origin` 是当前主仓；`upstream` 只用于拉取和评估 DramaClaw 更新。
- 从 `UPSTREAM.md` 登记的审查基线比较新提交，逐项判断业务价值后按当前 bounded context
  移植；禁止整批合并或覆盖当前架构。
- 商业配置、密钥、内部发布逻辑、当前仓专属架构和制品不得推送到上游。
- 上游移植完成后执行 `UPSTREAM.md` 规定的跨栈验证，再更新审查基线。
