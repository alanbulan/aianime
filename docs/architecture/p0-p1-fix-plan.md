# P0/P1 收尾修复计划

> 状态：执行中（第 998 批启动）
>
> 依据：`docs/architecture/project-assessment.md`（2026-08-07 全部门禁实测）

## 1. P0-1 SQLite 连接泄漏（方案已落地，待全量回归）

**问题**：`api/routes/` 下 7 个文件共 36 处直接调用 `make_sqlite_store_for_context` / `make_sqlite_store` 且从不 close；另有 `characters.py`/`scenes.py` 的解析 helper 把 store 返回给 50+ 个路由处理器，逐处补 `try/finally` 会产生上千行机械 diff。

**已实施**（第 998 批）：

- `shared/infrastructure/project_stores.py`：新增请求级 store 生命周期注册表（`begin/end/register_request_store`），两个 SQLite 工厂创建后自动注册。
- `api/middleware/request_store_close.py`：HTTP 中间件在响应结束后统一 close 本请求任务打开的 store。
- 注册按"请求所有者任务 id"门控：请求期间 spawn 的 inline 后台任务不会被误关；`SQLiteStore.close()` 幂等，既有手动 close 不受影响。
- `nanobanana_grid.py:5195` 裸 `except:` 收敛为 `except Exception` + 日志。
- `verification.py` 3 处 `except Exception: pass` 收敛为 `logger.debug`。
- 新增 `tests/test_request_store_lifecycle.py`（含后台任务隔离断言）；layer boundary 149 项、API 路由子集 79 项通过。

**剩余**：

- 全量 pytest 回归（建议串行跑：`uv run pytest tests -q`）。
- 长驻进程实测：连续请求后句柄数不再增长。

## 2. P0-2 吞异常（89 处 `except: pass`）

**策略**：按风险分三批，全部改为 `logger.debug/warning` + 明确 fallback，禁止裸 `except`。

- 第一批（已启动）：生成管线 + 验证 API（nanobanana_grid 裸 except、verification 3 处）——完成。
- 第二批：任务执行/取消/恢复路径（`project_task_execution.py` 4 处、`task_cancellation.py` 2 处、`stage_asset.py` 2 处）与知识图谱读写（`config.py` 6 处、`store.py` 3 处）。
- 第三批：其余 70 处（模型用量埋点、hermes、audio/video 生成、手动 beat 等），逐个按"记录原因 + 保留降级语义"处理。

**门禁**：新增静态断言——源码中不允许出现裸 `except:`；`except: pass` 数量从 89 逐步归零（可先按文件白名单推进）。

## 3. P1 技术债（按序消化）

| 项 | 内容 | 建议拆分 |
|---|---|---|
| P1-1 | `sqlite_store.py` 1803 行 + 反向导入 production/asset_world/narrative_planning | 先消除 3 处反向 import（:23/:27/:33），再按"Schema / 查询 / 图状态"拆文件；每拆一步跑 layer boundary |
| P1-2 | `stage_asset_tasks.py` 1544 行、`task_state.py` 1466 行 | 并入 `modules/task_execution`，与既有 runner/状态派生合并，避免双实现 |
| P1-3 | `desktop/src/commercial.ts` 1607 行 | 按"会话/设备/许可/公告/更新/模型访问"拆 6 个文件；IPC 注册与协议解析分离 |
| P1-4 | 前端 presentation → infrastructure 越界 10+ 处 | 收敛到 application 端口；逐步摘除 `module-boundaries.test.ts` 白名单豁免 |
| P1-5 | `module-boundaries.test.ts` 33k 行 | 拆成按模块的边界测试文件；迁移前先落"目录 → 允许依赖"清单 |

## 4. P2 快速清理（顺手项）

- 根目录 `jr_error.log`（11KB）删除；`frontend/node_modules.broken-*` 残留目录确认后清理。
- `nanobanana_grid.py` 96 处 print 调试残留改为 logger。
- i18n 中文硬编码抽到 `public/locales/zh`；同名重复实现 `browserStoryboardGenRuntime` 二选一。

## 5. 商业链路（外部依赖）

等待后端提供真实租户编码、测试账号与签名公钥；服务端补齐 `/api/v1/config/public`、`/api/v1/config/logo`。客户端侧剩余：许可服务端判定、离线验签、更新制品、云端文件与 Invocation 全量覆盖（见第二轮计划 §5）。
