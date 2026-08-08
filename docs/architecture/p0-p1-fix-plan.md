# P0/P1 收尾修复计划

> 状态：架构项已完成，发布回归执行中（2026-08-08）
>
> 依据：`docs/architecture/project-assessment.md`（2026-08-07 全部门禁实测）

## 1. P0-1 SQLite 连接泄漏（已完成）

**问题**：`api/routes/` 下 7 个文件共 36 处直接调用 `make_sqlite_store_for_context` / `make_sqlite_store` 且从不 close；另有 `characters.py`/`scenes.py` 的解析 helper 把 store 返回给 50+ 个路由处理器，逐处补 `try/finally` 会产生上千行机械 diff。

**已实施**（第 998 批）：

- `shared/infrastructure/project_stores.py`：新增请求级 store 生命周期注册表（`begin/end/register_request_store`），两个 SQLite 工厂创建后自动注册。
- `api/middleware/request_store_close.py`：HTTP 中间件在响应结束后统一 close 本请求任务打开的 store。
- 注册按"请求所有者任务 id"门控：请求期间 spawn 的 inline 后台任务不会被误关；`SQLiteStore.close()` 幂等，既有手动 close 不受影响。
- `nanobanana_grid.py:5195` 裸 `except:` 收敛为 `except Exception` + 日志。
- `verification.py` 3 处 `except Exception: pass` 收敛为 `logger.debug`。
- 新增 `tests/test_request_store_lifecycle.py`（含后台任务隔离断言）；layer boundary 149 项、API 路由子集 79 项通过。

架构与生命周期定点测试已通过。全量 pytest 纳入发布回归；真实长驻进程句柄观测属于安装包冒烟，不由单元测试结果替代。

## 2. P0-2 吞异常（高风险项已完成）

**策略**：按风险分三批，全部改为 `logger.debug/warning` + 明确 fallback，禁止裸 `except`。

- 第一批（已启动）：生成管线 + 验证 API（nanobanana_grid 裸 except、verification 3 处）——完成。
- 任务执行、取消和恢复路径已经随 Task Execution 迁移复核；不得吞掉会改变任务终态的异常。
- 其余精确异常捕获多为兼容解析、清理和 best-effort 观测。后续按具体行为修改，不做会改变 fallback 语义的全仓机械替换。

**门禁**：新增静态断言——源码中不允许出现裸 `except:`；`except: pass` 数量从 89 逐步归零（可先按文件白名单推进）。

## 3. P1 技术债（按序消化）

| 项 | 状态 | 结果 |
|---|---|---|
| P1-1 | 完成 | `sqlite_store.py` 为 33 行组合根；仓储和通用 SQLite 能力按所有权拆分，反向 import 门禁通过 |
| P1-2 | 完成 | `stage_asset_tasks.py` 删除；任务适配归 Asset World，状态持久化和恢复规则归 Task Execution 对应层 |
| P1-3 | 完成 | `commercial.ts` 为 35 行公共入口；API、IPC、设备、许可、制品和模型访问已拆分 |
| P1-4 | 完成 | presentation 不直接导入 infrastructure，前端架构门禁 398 项通过 |
| P1-5 | 保留 | 33k 行测试文件仍有维护成本，但不构成产品分层错误；没有行为收益前不做机械拆分 |

## 4. P2 快速清理（顺手项）

- 根目录 `jr_error.log` 与 `frontend/node_modules.broken-*` 已移出工作区。
- `nanobanana_grid.py` 96 处 print 调试残留改为 logger。
- i18n 中文硬编码抽到 `public/locales/zh`；同名重复实现 `browserStoryboardGenRuntime` 二选一。

## 5. 商业链路（外部依赖）

2026-08-08 实测 Gateway 在线，但 `/api/v1/config/public`、`/api/v1/config/logo` 返回 404，Captcha 未按 GET query 读取 `tenantCode`。客户端已删除无消费者的 Invocation/通用文件方法；剩余工作在云端：修正三个登录前置接口，提供测试租户、普通版/专业版账号、许可与额度、离线租约和更新制品公钥，以及 Windows x64、macOS arm64 签名制品。
