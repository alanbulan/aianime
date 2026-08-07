# AI 漫剧项目评估报告

> 状态：已归档（2026-08-07，全部门禁实测后落盘）
>
> 验证基线：`refactor/ddd-modular-monolith`，第 995 批提交附近
>
> 门禁结论：六项全绿，与 README 声明一致；并行执行会触发严重资源争抢

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

### P0（建议尽快修复）

1. SQLite 连接泄漏：`src/ai_anime/api/routes/verification.py` 等 7 个路由文件共 36 处直接调用 `make_sqlite_store_for_context` 且从不 close——桌面是长驻进程，长时间运行会累积句柄泄漏。应统一走依赖注入并强制关闭（对照 `assets.py` 的正确写法）。
2. 吞异常：全库 89 处 `except: pass`，其中 `modules/generators/nanobanana_grid.py:5195` 还是裸 `except:`——AI 生成管线出错会被静默吞掉，线上排查困难。

### P1（本轮重构未覆盖的技术债）

3. 顶层大文件：`sqlite_store.py`（1803 行）**反向导入** production/asset_world/narrative_planning 的 public（:23/:27/:33），违反基础设施→业务的分层方向；`stage_asset_tasks.py`（1544 行）、`task_state.py`（1466 行）同样混职责。README 已登记为"收敛项"。
4. 巨型文件：`desktop/src/commercial.ts` 1607 行，单文件承载登录/许可/设备/公告/更新/文件全部商业逻辑（49 个 async 方法）。
5. 前端分层越界：`modules/creative_canvas/presentation` 直接 import `../infrastructure/` 10+ 处（`CoverEditor.tsx:27`、`filmstrip.ts:3` 等），靠边界测试白名单豁免而非架构收敛。
6. 前端 `module-boundaries.test.ts` 达 33,383 行 / 353 断言，任何模块迁移都会产生超大 diff，维护负担重。

### P2（优化项，摘要）

- 4 个 600+ 行巨型组件（`KnowledgeGraphVisualization.tsx:668` 等）；全项目无 ErrorBoundary，存在 fire-and-forget（`main.tsx:9` `void bootstrapApplication()`）
- `nanobanana_grid.py` 96 处 print 调试残留；6 处同步 `sqlite3.connect` 散落顶层文件未走统一工厂
- i18n 仅 71 行单文件、少量硬编码中文；`features/` 与 `modules/` 存在同名重复实现（`browserStoryboardGenRuntime`）
- 依赖风险：`litellm>=1.85.0.dev1` 使用 dev 版本；world 可选依赖 `sharp/da2` 走 git+https 引用
- 仓库卫生：根目录 `jr_error.log`（11KB）与 `frontend/node_modules.broken-*` 残留目录可清理

## 五、商业联调状态（README 明示的阻塞项）

等待后端提供真实租户编码、测试账号与签名公钥；服务端缺失 `/api/v1/config/public`、`/api/v1/config/logo`。商业能力收尾剩余：许可服务端判定、离线验签、更新制品、云端文件与 Invocation 全量覆盖。

## 六、总体结论

**工程治理水平属于上游**：架构纪律、测试体系、文档化程度、安全边界四项都很扎实，门禁声明与实际一致（这在国内团队项目中不多见）。当前主要矛盾不在架构，而在**运行稳定性（连接泄漏/吞异常）与商业链路未闭环**。建议按 P0 → P1 顺序推进：先修 SQLite 连接生命周期与吞异常，再逐步消化顶层单文件技术债；商业联调依赖后端侧资源，建议作为并行线推进。
