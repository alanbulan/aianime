# AI 漫剧项目评估报告

> 状态：已复核更新（2026-08-08）
>
> 验证基线：`master`，`e4c06ed3` 之后的本轮 DDD 收敛工作区
>
> 门禁结论：后端架构 193 项、前端架构 398 项和知识图谱扩大回归均通过；全量发布门禁按串行方式执行

## 一、项目概况

| 维度 | 数据 |
|---|---|
| 形态 | Windows 桌面客户端（Electron + React 19 + FastAPI sidecar + SQLite + FFmpeg） |
| 架构 | DDD 模块化单体，前后端各 12~18 个有界上下文，跨上下文仅经 `public.py`/`public.ts` |
| 规模 | Python 1097 文件 / 25.9 万行；前端 TS/TSX 2211 文件 / 37.7 万行；桌面壳 16 文件 |
| 测试 | pytest 2565 项、vitest 3992 项、桌面壳 55 项，共约 6600 项 |
| 开发节奏 | 1175 次提交全部集中于近 6 周，按"批次"纪律提交（最新第 995 批） |

## 二、门禁实测结果

六项门禁**全部通过**，与 README 声明一致：

- 后端 pytest 全量：2551 通过 / 14 跳过（3 分钟）
- 后端架构门禁（依赖边界 + OpenAPI 快照）：187 通过
- 前端架构门禁（33k 行边界测试 + 颜色 + 对比度）：398 通过
- 前端 typecheck：通过；vitest 全量：3992 通过（73 分钟）
- 桌面壳测试：55 通过

⚠️ **重要运维发现**：门禁并行执行会导致严重资源争抢——typecheck 与 pytest/vitest 并行时 36 分钟未完成，串行仅 41 秒；pytest 也从 35 分钟+ 降到 3 分钟。README"必须串行运行"的警告是硬性要求，CI 流水线务必遵守。

## 三、主要优势（值得保持）

1. **架构纪律极强**：分层清晰，`creative_canvas`/`task_execution` 等模块拆分彻底（旧 `freezone`、`task_backend` 全部清零并有反回流门禁）；`tests/architecture/test_layer_boundaries.py` 等自动化门禁兜底。
2. **文档驱动重构**：`docs/architecture/ddd-round-2-closeout-plan.md` 记录到批次级（第 548~995 批），每个切片有精确测试计数与证据链，同类项目中罕见。
3. **安全基线好**：全库无硬编码密钥（sk- 扫描干净）；JWT/Ed25519 私钥/BYOK 密文只留 Electron 主进程（`desktop/src/secure-file-store.ts`）；桌面进程令牌与用户会话双机制分离；HttpOnly Cookie。
4. **测试质量高**：多为行为断言，覆盖 domain/application/infrastructure 各层。

## 四、问题与风险

### P0（本轮已处理）

1. SQLite 请求生命周期：已增加请求任务级 store 注册表和响应结束统一关闭；后台任务按 owner task id 隔离，异常路径和重复关闭有测试覆盖。
2. 高风险吞异常：生成管线裸 `except:` 与 Verification 路由的静默异常已改为带上下文日志。其余精确异常捕获中仍有 best-effort `pass`，属于可维护性清理，不再与这两处高风险问题混为一项发布阻塞。

### P1（本轮架构债处理结果）

3. `sqlite_store.py` 已降为 33 行组合根，业务仓储回归 Asset World 和 Narrative Planning；shared 只保留通用 SQLite 核心、schema 和图状态，不再反向依赖业务 public。
4. `stage_asset_tasks.py` 已删除并按资产任务类型拆入 Asset World；`task_state.py` 已迁入 Task Execution infrastructure，恢复判定规则位于 domain。
5. `commercial.ts` 已降为 35 行显式公共入口，API client、IPC、设备、租约、制品、合同投影、模型访问和代理已拆分。
6. 原平铺的 Agents、Director World、Generators、Seedance2 已退役或归并；Backup、Knowledge Graph、Verification 已建立适用分层。
7. 前端 presentation 不再直接导入 infrastructure，398 项前端架构门禁通过。`module-boundaries.test.ts` 仍约 3.3 万行，是测试维护成本，不是运行时分层越界；本轮不做无行为收益的机械拆文件。

### P2（优化项，摘要）

- 4 个 600+ 行巨型组件（`KnowledgeGraphVisualization.tsx:668` 等）；全项目无 ErrorBoundary，存在 fire-and-forget（`main.tsx:9` `void bootstrapApplication()`）
- `nanobanana_grid.py` 96 处 print 调试残留；6 处同步 `sqlite3.connect` 散落顶层文件未走统一工厂
- i18n 仅 71 行单文件、少量硬编码中文；`features/` 与 `modules/` 存在同名重复实现（`browserStoryboardGenRuntime`）
- 依赖风险：`litellm>=1.85.0.dev1` 使用 dev 版本；world 可选依赖 `sharp/da2` 走 git+https 引用
- 仓库卫生：根目录 `jr_error.log` 与 `frontend/node_modules.broken-*` 已移出工作区

## 五、商业联调状态（README 明示的阻塞项）

2026-08-08 无凭据只读探测确认 Gateway 在线且 TLS 正常；`bootstrap`、`releases/check` 无令牌返回 401。云端仍缺失 `/api/v1/config/public`、`/api/v1/config/logo`，Captcha 也没有按 GET query 读取 `tenantCode`。客户端已删除无产品消费者的 Invocation 和通用文件 helper，不再把“云端可能提供”写成“当前客户端必须覆盖”。线上闭环仍需测试租户、普通版/专业版账号、许可与额度、公钥和双平台签名制品。

## 六、总体结论

本轮登记的后端所有权、顶层组合根和 Electron 商业入口债务已经收敛，并由架构门禁防回流。当前发布阻塞不再是这些 DDD 迁移，而是云端登录前置接口、测试资源和签名材料尚未闭环。代码调用链存在不等于真实环境验收通过，发布说明必须继续区分这两种状态。
