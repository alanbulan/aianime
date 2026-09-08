# 全仓审查与修复记录（2026-09-08）

审查基线：`7e985e51`（`修复（BYOK 视频）：提供默认参数并交由上游校验模型能力`），桌面版本 `1.1.63`。审查开始时工作树干净；随后按用户“全部帮我修复好”的要求实施修复。下文的审查记录描述基线问题，当前状态以本节修复记录为准。


## 当前修复记录

| 范围 | 当前实现 | 验证重点 |
| --- | --- | --- |
| F01 桌面 WASM | CSP 精确加入 wasm-unsafe-eval；继续禁止普通 unsafe-eval | 真实 Chromium 主页面、Worker 编译 WASM 成功，页面 JavaScript eval 被拒绝 |
| F02 任务清理与查询 | 删除原子匹配任务运行身份和完成快照；返回实际删除数；单键查询直接限定项目和任务键，移除重复排序 | SQLite 中同键重启、状态变化、重复删除、跨项目查询 |
| F03/F08 视频上传 | 请求身份保存在节点状态，视口裁剪卸载后继续完成上传；只允许当前请求回填；失败在节点内展示并提供重新选择入口 | 乱序成功/失败、重试、视口卸载/重挂载、删除节点、过期转码结果丢弃及 Blob 释放 |
| F04 并发转码 | 单例 FFmpeg 的完整文件读写、执行和清理串行化 | 并发输入各自产出、失败后继续处理下一项 |
| F05 草图过期 | 候选、人工选择与工作流共用 v2/旧 hash 判定及资产依赖检查 | 旧/新 hash × 正文/依赖变更；force 显式确认 |
| F06 助手写入刷新 | 成功写入工具结果附带资源变更信息，前端按项目和资源使查询失效 | 隐藏工具事件也刷新已加载角色页面；失败和普通聊天不刷新；其他项目不受影响 |
| F07 合成错误 | 网关拒绝 HTTP 200 业务失败和缺少有效任务身份的回执；控制器显示后端原因 | 业务失败不进入任务跟踪，非法字段类型也不能通过 |
| 网页/助手默认模型 | 完整生产和单 Beat 工具统一使用 project_selection；未指定模型时继承项目选择 | 插件、工具文案、助手指令和参数测试同步；显式模型覆盖继续生效 |
| 旧式分集查询 | 不再静默转成全项目集合；返回带正确项目入口和范围说明的工具错误 | identities/scenes 两种路径均不发起扩大的查询 |
| HTTP 任务契约 | 画布音频、文本、视频复用已有 receipt.to_dict；补齐响应 schema 的任务身份、作用域等字段，防止 FastAPI 过滤有效字段；生产视频明确成功/失败响应 | 真实 FastAPI HTTP 投影保留完整身份，缺失 task_id 的成功回执无法作为正常响应返回 |
| 剪辑面板 | 静音参数进入合成；循环选项明确为重复 2 次，结果节点记录完整输出时长；“字幕”占位改为“去字幕”，连接现有字幕擦除面板 | 前端参数、结果节点连线、HTTP 解析、原生 FFmpeg 输出时长与静音音轨；浅/深色浏览器检查 |
| 初始加载 | 3D、全景查看器与视频转码库按操作加载；Vite 构建门禁检查这些重型依赖不能进入初始静态依赖图 | 初始 JS 与 gzip 总量对比；查看器开启/关闭生命周期 |
| CI 与无引用代码 | CI 改用根 uv.lock 的 Ruff/Pytest、完整前端回归与 Chromium；pnpm 版本对齐锁定版本；删除仅被自身测试引用的 useDebouncedValue 及测试 | CI 配置合同、引用检查、本地标准检查入口；没有执行云端流水线 |

资源变更协议是成功工具结果的 `resource_changes` 数组，项目资源带 `project_id`，分集资源可带 `episode`；读取和业务失败不发布变更。任务完成的异步刷新仍由任务中心负责。前端使用既有 QueryClient 和 queryKeys，没有新增全局业务状态来源或第二条请求链路。

本次没有实现画布“添加字幕”新功能；原占位已经替换为明确可操作的“去字幕”。生产合成原有的自动字幕能力保持其既定入口。项目共享仍受现有 capability 关闭，属于当前版本不提供的能力，不是已修复后开放的共享功能。

关键 HTTP 响应已补强，浏览器模式操作数仍为 299、桌面模式仍为 301。浏览器的空 200 JSON schema 从 266 降到 259；其余空 schema 不能称为已经补齐类型约束，也不能仅据此认定接口无实现。

构建对比：初始 JavaScript（入口及 HTML 预载的构建脚本之和）由约 7.79 MB 降到 **4,468,963 字节（约 4.47 MB）**，降低约 43%；最终脚本逐个 gzip（level 9）后合计 **1,267,241 字节（约 1.27 MB）**，修复前约 2.10 MB。此处不含独立的 theme-init.js、CSS、字体及按需加载资源，是构建体积测量，不是启动耗时测量；部分块仍超过 500 kB，未提高警告阈值。

## 修复后验证

下表记录修复阶段的实际检查。全量套件先暴露失败，修复后仅重跑受影响范围；定向复测不是第二次全量运行，通过数不能重复相加。

| 检查 | 实际结果 |
| --- | --- |
| `uv run pytest tests -q --tb=short` | 3,412 passed、3 failed。失败来自新增任务回执 schema 触发的过宽架构断言，以及两个仍使用 SimpleNamespace 的回执测试替身 |
| 后端失败项复测：视频模型架构合同及 `tests/test_freezone_video_story_backend.py` | 修正断言范围、改用真实回执类型后 **8 passed**，覆盖上述全部 3 个失败项；本轮后端全量范围的 3,415 项均已有通过证据 |
| `pnpm --dir frontend test`：unit | **451 文件、2,281 passed** |
| 同一标准入口：component | 456 文件、2,100 passed、2 failed；失败均是查看器改为懒加载后，消费者测试仍立即断言弹窗存在 |
| 同一标准入口：browser | **7 文件、18 passed**，包括新增剪辑面板浅色/深色浏览器交互 |
| 前端组件定向复测：视频控制器、RenderSection、历史素材查看器适配器、画布生成恢复组合 | **4 文件、24 passed**；覆盖上述 2 个失败项，并包含视口卸载、重挂载和过期转码的 3 个新增用例。前端全量范围加新增用例共 4,404 项均已有通过证据 |
| `pnpm --dir frontend test:architecture` | 最终 **9 文件、410 passed**；把历史上对 uuidGenerator 名称的全面禁止收窄为禁止节点工厂重新装配到旧组合根，继续保护工厂所有权和应用层依赖边界 |
| `pnpm --dir frontend typecheck`、`pnpm --dir desktop typecheck` | 均通过；前端新测试替身缺少节点 type 的问题已修正并复测 |
| `pnpm --dir desktop test` | **236 passed、1 skipped**；跳过项依赖真实 macOS 工具 |
| `pnpm --dir frontend build:ce` | 通过，包含新的重型依赖构建门禁；仍有大于 500 kB 的包体警告 |
| 构建产物 Chromium 启动检查 | 本地静态服务器提供实际 dist，模拟运行配置和未登录认证响应；根路由进入登录页、用户名和密码输入可见，0 页面运行错误、0 未声明请求，未预载 3D/全景/转码库 |
| 本地原生 FFmpeg 视频合成回归 | **2 passed**；新增用例验证重复片段输出时长及静音音轨，本机未跳过 |
| `uv run ruff check src tests .hermes/plugins/ai_anime` | 通过 |
| 文档检查：`uv run pytest tests/architecture/test_agent_guidance.py -q`、`git diff --check` | 2 passed；差异格式检查通过 |

剪辑面板的两主题截图已实际查看，静音、循环、提交及上传重试入口没有观察到重叠或溢出。截图保存在本地忽略目录 `frontend/acceptance-logs/`。后端、前端和构建日志保存在本地忽略目录 `.codex-tmp/`；构建启动检查使用临时隔离脚本，没有增加项目依赖。

上述验证不覆盖真实 Gateway/付费模型、Cloud/BYOK 供应商响应、安装包和自动更新、可选环境安装、全部页面人工验收或完整“原文到成片”生产。已修复的是本次审查确认的问题及其相关契约、性能和验证缺口；不能据此宣称所有分支绝无缺陷或所有前端操作都已完成人工验收。

## 审查基线记录

以下内容保留修复前的复现、位置及判断，不能作为当前仍未修复的清单。

## 结论

有明确优化空间，且已经发现影响运行、数据正确性和操作闭环的问题。现有证据不能支持“所有代码都有实际用途”“所有前端操作全部打通”或“网页与助手工具完全等价”。

基础结构已较完整：前后端采用对应的业务上下文，跨上下文有 `public` 边界门禁，完整生产共用一个后端编排入口，任务中心已有状态同步与资源刷新机制。本次架构、合同、前端和桌面回归大部分通过。当前最值得投入的是消除并发错误、补齐成功/失败/刷新契约，以及修正质量门禁覆盖；没有证据表明需要再做一轮全面 DDD 拆分。

本报告区分三类证据：

- **已复现**：执行真实代码得到错误结果；会进一步注明使用真实 SQLite、真实 Chromium，还是模拟网络/FFmpeg 适配器。
- **静态确认**：调用链和条件分支明确支持结论，未执行对应完整产品操作。
- **待验收**：需要真实模型、Gateway、安装包或人工操作才能确定，不能由单元测试替代。

## 优先处理的问题

| 编号 | 优先级 | 问题 | 证据 |
| --- | --- | --- | --- |
| F01 | P1 | 桌面 CSP 阻止 WASM 编译，阻断依赖该能力的抠图与视频转码路径 | 真实策略在 Chromium 主页面、Worker 中复现 |
| F02 | P1 | 清理已完成任务可能误删同业务键的新运行任务 | 真实 SQLite 与任务用例复现 |
| F03 | P1 | 视频节点较早上传的迟到响应覆盖最新文件 | 真实上传回调、模拟网络时序复现 |
| F04 | P1 | 并发 FFmpeg 转码共用内存文件名，输入/输出相互覆盖 | 真实转码函数、模拟 FFmpeg 文件系统复现 |
| F05 | P2 | 旧格式草图 hash 过期校验失效，人工选择与工作流判断不一致 | 原有测试稳定失败，合法旧 hash 再验证 |
| F06 | P2 | 助手同步修改角色后，当前业务页面缓存没有刷新链路 | 静态确认 |
| F07 | P2 | 合成页面将 HTTP 200 的业务失败响应当作任务回执 | 静态确认 |
| F08 | P2 | 视频上传失败仅写控制台，缺少可见错误反馈 | 静态确认 |

P1 表示应优先修复的功能阻断或数据正确性问题；P2 表示需随后处理的业务语义、状态或体验缺口。编号不是发生频率排序，未测量这些条件在真实用户项目中的发生率。

### F01：桌面 CSP 与 WASM 功能冲突

**位置**：`desktop/src/desktop-session-security.ts:25`、`:28`；`desktop/src/main.ts:297`；`frontend/src/modules/creative_canvas/infrastructure/matteWorker.ts:64`；`frontend/src/modules/creative_canvas/infrastructure/videoTranscodeFfmpeg.ts:21`。

桌面策略默认只有 `script-src 'self'`，正式启动没有追加 WASM 编译许可。开发入口追加的是脚本 hash，也不提供该能力。抠图在没有可用 GPU 时选择 `wasm` 后端，视频兼容转换的 FFmpeg 路径也需要编译 WASM。`worker-src` 允许创建 Worker，并不等于允许 Worker 编译 WASM。

复现从真实 `installDesktopSessionSecurity()` 捕获响应策略，再通过临时 loopback HTTP 服务在 Chromium 页面与 Worker 内执行最小 WASM 模块。两者均报 `CompileError`，错误指出违反 `script-src 'self'`。仅增加 `'wasm-unsafe-eval'` 的对照中，两者均成功。

**影响**：相应功能即使资源已安装，仍可能在运行时被安全策略阻止。`matteWorker.ts:90` 将加载异常提示为“运行环境未安装或不完整”，也可能误导用户反复安装。

**最小改进**：精确允许 WASM 编译，保留现有普通 JavaScript 执行限制；增加带真实 CSP 的浏览器回归。还需在桌面成品中验收实际抠图和不兼容视频转码。本次未运行真实抠图模型，也未做安装包验收。

### F02：清理历史任务与同键新任务之间存在竞态

**位置**：`src/ai_anime/modules/task_execution/application/project_tasks.py:52`；`src/ai_anime/modules/task_execution/infrastructure/project_tasks.py:43`；`src/ai_anime/modules/task_execution/infrastructure/task_state.py:500`、`:1305`；`src/ai_anime/api/routes/task_execution/tasks.py:112`。

`clear_completed()` 先读取任务快照，再按 `task_type/episode/beat_num/scope` 删除。底层 SQL 只限制 `task_key` 与 `project_id`，没有限制快照里的运行实例 `task_id` 和终态。已完成业务键可以被重新预留为新的运行任务；清理接口在线程中执行，读快照与逐项删除不构成原子操作。

复现使用临时 SQLite、真实 `TaskStateManager`、`LocalProjectTaskGateway` 和用例，在旧 completed 快照读取与删除之间预留同键新任务，得到：

```json
{"snapshot_status":"completed","new_reserved":true,"new_status":"running","run_id_changed":true,"deleted_count":1,"new_task_survived":false}
```

**影响**：已证明新运行任务记录会被删除；由此可能破坏进度、取消、任务恢复和防重复提交判断。这里删除的是任务状态记录，不能据此声称产出文件也被删除。

**最小改进**：删除必须原子地匹配旧运行实例和允许清理的终态，返回实际删除行数。回归应覆盖“读取旧记录后同键重启”和正常清理两种情况。

### F03：视频节点缺少上传序号保护

**位置**：`frontend/src/modules/creative_canvas/presentation/useVideoNodeController.ts:938`、`:992`；`frontend/src/modules/creative_canvas/presentation/VideoNodeView.tsx:231`。

`processFile()` 在转码和上传两个异步步骤之后直接覆盖节点数据，没有确认返回结果是否仍属于当前文件。节点持续绑定拖放入口，`handleDrop()` 也没有上传中或请求序号检查。

执行真实上传回调并控制响应顺序：同一节点先上传 A，再上传 B；B 先完成，节点显示 B；随后 A 完成，节点又变成 A，`sourceFileName` 与 `videoUrl` 均被旧请求覆盖。

**影响**：用户最后选择的文件与最终保存的节点内容不一致。旧请求的失败清理也缺少归属检查。

**最小改进**：沿用图片上传已有的序号模式，在异步返回后的状态提交与清理前验证归属。现成参照是 `useUploadNodeController.ts:200`、`:267`、`:305`，无需创建另一套通用上传框架。验证慢 A/快 B，以及 A 后续失败均不能影响 B。

### F04：单例 FFmpeg 的并发操作共享文件名

**位置**：`frontend/src/modules/creative_canvas/infrastructure/videoTranscodeFfmpeg.ts:15`、`:38`、`:39`、`:72`；`frontend/src/modules/creative_canvas/presentation/useCanvasMediaDropController.ts:92`。

所有任务复用一个 FFmpeg 实例，输入名只有 `input${ext}`，输出恒为 `output.mp4`，完成后删除同一组文件。多文件拖放会分别创建节点；上传节点转为视频节点后，各自启动处理，没有全局转码串行约束。

复现执行真实 `transcodeWithFfmpeg()`，使用模拟 FFmpeg 内存文件系统并发处理 A.mov、B.mov，两个结果都是 B。该验证说明当前函数允许文件交叉覆盖，不等于已经用真实 HEVC 文件完成编码复现。不同扩展名也仍会共用输出名和进度源。

**影响**：转码产物可能关联到错误输入，也可能因相互清理失败。桌面当前还受 F01 阻断；浏览器环境或修复 CSP 后，本问题仍然存在。

**最小改进**：优先串行执行单实例的完整写入、执行、读取、清理流程；若业务确实需要并行，再设计任务级文件和执行隔离。只修改输出名不能完整解决单实例并发语义。

### F05：旧草图的过期判断存在两套行为

**位置**：`src/ai_anime/modules/production/infrastructure/grid_pool.py:334`；`src/ai_anime/modules/production/infrastructure/media_generation/pool_indexer.py:106`、`:214`；`tests/test_api_beat_image_upload.py:261`。

人工选择草图时，代码按当前项目生成 `v2:` hash，然后调用 `is_pool_image_stale(..., None)`。当存量图片持有旧格式 hash，该函数只回退到 `script_mt`；这里传入 `None`，因此不会判为过期。自动工作流的 `stale_canonical_sketch_numbers()` 却会重新计算旧格式 hash 对比正文，并检查资产更新时间。

原有 `test_select_stale_sketch_pool_image_marks_response_stale` 期望 `ok=false, stale=true`，实际 `ok=true`，孤立重跑仍失败。进一步使用合法旧 hash 修改正文后验证：旧正文 hash 已变化、当前 hash 为 v2，但人工选择的 stale 判断仍为 false。因此不能仅归因为测试数据陈旧。

**影响**：修改正文后，人工选择旧草图可能绕过应有的过期确认；同一资产在人类入口和自动生产中的判定不一致。

**最小改进**：收敛现有过期规则，保留旧 hash 的正文比对和资产依赖判断；明确 `force` 才能绕过过期确认。回归覆盖旧 hash、新 hash、正文变更和依赖资产变更。

### F06：助手修改成功没有形成页面可见闭环

**位置**：`.hermes/plugins/ai_anime/__init__.py:2261`；`src/ai_anime/modules/asset_world/application/character_catalog.py:122`、`:164`；`frontend/src/modules/ai_assistant/application/useFrameController.ts:392`、`:411`；`frontend/src/modules/ai_assistant/application/useChatSessionController.ts:375`。

具体例子是助手更新角色 `face_prompt`：工具调用真实角色 PATCH，后端直接写仓库并返回，未创建任务或发布相应业务变更事件。前端收到 `tool.result`、`chat.done` 时只更新聊天状态，没有使角色查询失效。

网页自己修改角色时，`asset_world/application/character-query-hooks.ts:73` 的成功回调会刷新角色查询；助手没有经过该回调。`TaskCenterProvider.tsx:61` 的资产刷新依赖任务完成，不能覆盖这种同步 PATCH。全局 `query-client.ts:8` 禁用了窗口聚焦刷新，`staleTime: 30_000` 也不等于每 30 秒自动请求。

**影响**：停留在已加载角色数据的页面时，助手提示成功，页面仍可能显示旧值，直到其他动作触发重新请求。该结论来自静态调用链，未做完整聊天与角色页面的浏览器联动复现。

**最小改进**：让同步变更具有明确的项目、资源类型和资源标识，接到所属模块公开的缓存失效入口；可使用业务事件或工具结果的变更信息。无需每条聊天都刷新全项目。验证标准应包括“助手成功后现有页面自动呈现新值”。

### F07：合成失败响应被当作成功任务回执

**位置**：`src/ai_anime/api/routes/production/video.py:282`；`frontend/src/modules/production/infrastructure/http-production-video-gateway.ts:892`；`frontend/src/modules/production/application/episode-compose-query-hooks.ts:11`；`frontend/src/modules/production/application/use-episode-compose-page-controller.ts:187`。

后端遇到 `EpisodeBeatsMissing` 返回 HTTP 200 的 `{ok:false,error:...}`。前端却把返回值声明为 `ProductionTaskResponse`，mutation 原样返回，控制器不检查 `ok` 就调用 `task.start({scope,taskId})`。

**触发条件**：页面缓存认为可合成，而后端分集内容已删除或重建。正常 UI 的 `canCompose` 能减少触发，但不能代替服务端响应校验。

**影响**：没有真正提交任务，却进入任务跟踪分支；业务失败不会进入现有 catch 提示。最终界面持续时间和表现未单独执行验证，不据此断言必然永久 loading。

**最小改进**：在现有 gateway/用例边界把业务失败转换为错误，成功回执字段齐全才开始跟踪。类型中的 `.json<T>()` 不执行运行时数据校验。

### F08：视频上传失败缺少可见反馈

**位置**：`frontend/src/modules/creative_canvas/presentation/useVideoNodeController.ts:974`；`frontend/src/shared/api/transport.ts:51`。

上传失败分支只 `console.error`、关闭上传状态并清理预览，没有节点错误字段或 toast。底层 transport 处理 401 和特定 `no_region`，不为普通上传错误统一显示提示。

**影响**：用户无法从节点判断上传失败原因；首次上传时可能只看到预览消失。图片节点已有 `uploadError` 投影，可作为本项目现成模式。

**最小改进**：补齐视频节点的失败信息与重试入口反馈，并与 F03 一起保证旧请求错误不会清掉新请求状态。

## 网页与助手工具的契约对照

“调用了同一个 URL”只说明路由一致，还需要比较请求字段、默认值、业务错误、任务身份、结果可见性和查询范围。

| 行为 | 网页入口 | 助手工具 | 判断 |
| --- | --- | --- | --- |
| 完整生产 | `runProductionWorkflow` 调用 `/workflow/production` | `ai_anime_run_production_workflow` 经 `_start_production_workflow` 调用同一路由 | 共用父任务编排入口，已有架构回归保护 |
| 完整生产默认视频策略 | 显式 `project_selection` | 未指定模型用 `role_priority`；显式模型才用 `project_selection` | 存在明确设计差异，不能认为默认等价 |
| 单 Beat 视频 | 请求同一 Beat 视频接口，策略为 `project_selection` | 专用单视频工具调用同一接口；未指定模型保留 `role_priority` | URL 一致；模型默认行为不同 |
| 角色同步修改 | 本地 mutation 成功后刷新角色查询 | PATCH 写入后只更新聊天结果 | 数据写入共用，页面刷新不闭环，见 F06 |
| 旧草图选择/自动生产 | 人工候选选择走 `is_pool_image_stale` | 自动生产的资产过期检查走另一兼容分支 | 旧 hash 判定不一致，见 F05 |
| 按任务键等候 | 任务中心/任务控制器跟踪状态 | `ai_anime_wait_task` 轮询 `/tasks/status` | 有公共查询入口，但单键查询仍扫描全项目任务 |
| 分集场景/身份读取 | 正式集合接口以项目为范围 | 通用 GET 将旧式分集路径重定向到项目集合 | 分集参数被丢弃，兼容语义需要明确 |
| HTTP 200 业务失败 | 部分入口检查 `ok`，合成入口未检查 | 工具有自己的结果封装 | 未形成足以保证全体消费者一致的响应约束 |

默认模型策略差异的证据是 `http-production-video-gateway.ts:149`、`:505` 与插件 `__init__.py:2118`、`:3372`。插件 `:3355` 的注释明确说明这一设计，测试也保护它。因此它不是偶然漏传字段；需要明确产品语义：助手究竟应继承项目选择，还是使用独立的角色优先级。如果保留现有设计，用户可见的实际策略/模型信息应足以解释差异。

旧式分集读取的证据是插件 `__init__.py:907`：解析出 `project, _episode, collection` 后忽略 `_episode`，场景转为 `/projects/{project}/scenes`，身份转为项目角色媒体查询。`tests/test_hermes_ai_anime_plugin.py:1524`、`:1578` 固定了这种行为。当前工具说明已经引导使用项目集合，因此这是兼容映射的范围语义问题，不应误报成助手必然访问不存在的路由。

### 响应 schema 与门禁仍有明显缺口

实际检查默认 `create_app().openapi()`：299 个 HTTP 操作，201 个 components schemas；其中 266 个操作的 HTTP 200 JSON 响应 schema 为 `{}`。桌面模式为 301 个操作，多出两个认证操作。统计不包含 WebSocket，空 schema 也不表示没有业务实现或没有请求校验。

这意味着大量成功响应字段没有受到 OpenAPI 契约约束。`tests/architecture/test_hermes_tool_routes.py:46` 等门禁主要验证 method/path 是否存在；它们通过，不能证明 `ok`、`data`、`task_id`、`task_key`、`scope` 和默认模型政策在客户端消费时一致。F07 是这种缺口的具体表现。

优先为任务回执、业务失败、模型选择和资源变更结果补强现有响应定义与跨入口合同测试。先收敛关键合同，无需一次性为全部接口增加新的 DTO 框架。

## 前端操作闭环判断

本次用“入口可触达 → 输入/权限 → 提交 → 成功或失败 → 状态与产物呈现”审查重点链路。前端已有路由、组件、任务中心及浏览器回归；这些证据仍不足以证明所有按钮、组合条件和真实外部调用均已验收。

| 操作/功能 | 已有证据 | 当前缺口或边界 |
| --- | --- | --- |
| 完整生产、逐步重做 | 共同后端编排入口和相关合同/回归通过 | 真实付费模型到最终成片未执行；模型默认策略有差异 |
| 角色网页编辑 | mutation 成功后使角色查询失效 | 助手同步写入无法获得同等即时刷新 |
| 图片上传 | 已有序号、错误字段与预览清理模式 | 不能由此推断其他媒体节点也受保护 |
| 视频拖放/替换 | 入口与上传链路存在，受控时序已执行 | F03、F08；涉及不兼容格式时还有 F01、F04 |
| 画布抠图 | Worker、GPU/WASM 选择和错误处理存在 | WASM 编译被桌面策略阻止；实际模型未运行 |
| 草图候选选择 | 真实 API 回归覆盖 stale 返回 | 旧 hash 分支失败，见 F05 |
| 分集合成 | 提交、任务控制器、最终视频查询、导出接口链路存在 | 业务失败误入任务跟踪；真实完整成片未验收 |
| 已完成任务清理 | 前后端任务操作存在，SQLite 用例复现 | 并发同键重启时可能删错记录 |
| 画布视频剪辑的字幕、静音、循环 | `VideoClipPanel.tsx:180`、`:259`、`:267` 明确标记“待实现”且 disabled | 是未完成的功能入口，不是已打通能力；不代表生产合成字幕也未实现 |
| 项目共享 | capability 探测、UI 开关和查询禁用链路存在 | 当前缺少 grants/users/search 后端操作，功能关闭，不能算当前桌面可用能力 |
| 登录、许可、Cloud/BYOK、更新、可选环境安装 | 相关代码、合同和桌面自动化检查纳入审查 | 本次未执行真实服务、安装包、更新或目标平台人工验收 |
| 其余页面及复杂组合操作 | 全量前端类型检查和现有测试通过 | 未逐一人工操作，不作“全部闭环”的承诺 |

闭环补强应集中到有证据的边界：助手写入后的业务页面刷新、HTTP 200 失败、多次上传响应乱序、带真实 CSP 的媒体运行，以及任务清理与重新启动并发。测试应观察用户可见结果和持久化状态，避免只断言“发出了请求”。

## 冗余、无效代码与性能

### 哪些代码可以认定无用

本次静态扫描解析了 848 个 Python 文件和 1,380 个前端非测试 TS/TSX 文件，未发现解析错误。前端引用图考虑应用入口、动态 import、Worker URL 和 Vite alias，将 re-export、类型引用也算作可达。

在此口径下发现一个没有业务调用、仅测试使用的文件：`frontend/src/shared/hooks/use-debounced-value.ts:13`。`useDebouncedValue` 的实际引用只在 `frontend/src/__tests__/hooks/use-debounced-value.test.tsx`。可作为低优先级清理候选。

这一结果不能证明其余文件里的每个导出、分支、参数或样式都有效：公共导出和类型引用会让文件在图上可达，运行时注册、条件编译和功能开关也需要单独判断。后端动态注册和工具发现同样不能靠“没找到 import”就决定删除。

项目共享尤其不能直接归为“可点击的 404”或删除候选。`project_workspace/infrastructure/http-project-workspace-gateway.ts:183` 起保留 grants/users/search 请求，但 `project_workspace/composition.ts:115`、`frontend/src/lib/runtime-config.ts:56` 与 `src/ai_anime/api/routes/platform_release/runtime_config.py:15` 联合关闭不具备后端能力的入口及查询。它是休眠功能面，保留还是移除需要明确版本范围；不应为了证明闭环而直接打开开关。

### 应优先收敛的重复

| 重复/分散点 | 具体证据 | 处理价值 |
| --- | --- | --- |
| 媒体上传生命周期 | 图片有序号与错误投影，视频缺少同等保护 | 先对齐行为，修复 F03/F08；不必先抽通用组件 |
| 草图过期兼容规则 | `is_pool_image_stale` 与 `stale_canonical_sketch_numbers` 产生不同结果 | 领域判断应收敛，修复 F05 |
| 默认模型策略 | 网页 gateway 与插件分别构造策略 | 明确差异属于设计还是应当统一，并用合同保护 |
| 画布任务回执投影 | `api/routes/creative_canvas/audio.py:295`、`text.py:129`、`video.py:631` 构造相同字段 | 可在该 HTTP 上下文内局部共用序列化，避免未来字段漂移 |
| 任务排序 | SQL 排序、TaskStateManager 排序、用例再次排序 | 减少同一请求内重复工作 |

Python 完全相同函数体扫描中，很多重复是 Protocol、省略号或适配器方法；这种文本相同不构成跨业务抽象的理由。治理重点应是“同一业务规则出现两种结果”，不能仅按重复行数或文件长度改造。

### 前端入口预载过大的公共块

`pnpm --dir frontend build:ce` 成功，但输出 `public-M6wQ0htI.js` 为 **6,322.63 kB**，gzip **1,703.46 kB**；入口 `index` 块为 **809.31 kB**。生成的 `frontend/dist/index.html:16` 对该 public 块设置了 `modulepreload`，因此它参与初始加载，不是等打开画布才加载。

`frontend/src/app/bootstrap.tsx:15` 通过画布 `public` 入口安装存储回收器；`creative_canvas/public.ts` 约 3,500 行，包含较多装配和导出。它是需要检查的依赖入口之一，但本次没有做 bundle 模块贡献分析，不能把整个 6.3 MB 块全部归因于这一条 import。

**优化方向**：保持既有公开边界，检查全局初始化实际需要的依赖，推迟页面专属装配和重型功能的加载。以真实启动加载量和耗时验证效果，不通过提高警告阈值掩盖问题。本地 Electron 可减少网络传输成本，但并不消除解析、编译和内存成本；本次未测这些耗时。

### 单键任务状态查询扫描整个项目

`src/ai_anime/api/routes/task_execution/tasks.py:103` 在按 `task_key` 查询时，先列出项目全部任务，再逐项序列化比较。`task_state.py:1326` 的 SQL 已 `ORDER BY`，`:1349` 又做 Python 排序，`application/project_tasks.py:30` 再排序。助手 `__init__.py:1293` 默认每秒轮询一次，会重复这条路径。

**优化方向**：复用现有任务键/索引查询能力，在任务上下文内部提供直接查询，并保留项目归属校验；去掉没有语义贡献的重复排序。没有真实大项目压测，不能给出具体加速倍数或认定其已成为主要瓶颈。

## 测试与工程质量

### 实际执行结果

Python 解释器已确认指向仓库 `.venv/Scripts/python.exe`。大型检查在 Windows 上串行执行；后端两批文件范围不重叠，定向重跑不重复计入总数。

| 命令/检查 | 结果 |
| --- | --- |
| `uv run pytest tests/architecture tests/contract tests/test_hermes_ai_anime_plugin.py tests/test_parameter_contracts.py -q` | 477 passed |
| `uv run pytest tests -q --ignore=tests/architecture --ignore=tests/contract --ignore=tests/test_hermes_ai_anime_plugin.py --ignore=tests/test_parameter_contracts.py` | 2,918 passed，2 failed |
| 后端合计 | **3,395 passed，2 failed** |
| 两个失败测试孤立重跑 | 均仍失败，见下文 |
| `pnpm --dir frontend test`：unit | 450 个文件，2,278 passed |
| 同一前端标准入口：component | 455 个文件，2,090 passed |
| 同一前端标准入口：browser | 6 个文件，16 passed |
| 前端合计 | **4,384 passed** |
| `pnpm --dir frontend typecheck` | 通过 |
| `pnpm --dir desktop test` | 原有套件 **235 passed，1 skipped**；另有 3 条临时诊断通过 |
| `pnpm --dir desktop typecheck` | 通过 |
| `pnpm --dir frontend build:ce` | 通过，存在上述包体警告 |
| `uv run ruff check src tests .hermes/plugins/ai_anime` | 通过 |
| 报告交付检查：`uv run pytest tests/architecture/test_agent_guidance.py -q`、`git diff --check` | 2 passed；无差异格式错误，新增报告另做内容和源码引用自检 |

桌面命令当时共执行 239 项：238 passed、1 skipped，包含本轮 3 条临时诊断。它们断言的是“当前错误可以复现”，不能当作功能修复成功；交付前移除了诊断文件。跳过项依赖真实 macOS 工具，不计为验收通过。

两个后端失败分别为：

1. `tests/test_api_beat_image_upload.py::test_select_stale_sketch_pool_image_marks_response_stale`：真实旧草图兼容缺口，见 F05。
2. `tests/test_hermes_sdk_session_load.py::test_available_commands_notification_is_exposed_to_chat_clients`：`:361` 期待 `help/model/tools`，实际为 `model/tools`。`infrastructure/hermes/skill_catalog.py:20` 明确只公开后两项，`tests/test_hermes_skill_catalog.py:52` 又明确要求菜单中不出现 help，SDK 仍处理 `/help`。这是测试预期冲突，不能据此宣称助手整体不可用。应以当前约定对齐测试，不能为了全绿盲目恢复旧菜单。

### CI 通过与完整回归通过不是同一结论

`.workflow/流水线-202608101609.yml:48` 前端仅跑 `test:architecture`，加类型检查和 CE 构建，没有运行完整 unit/component/browser。`:53` 的 Python 命令使用 `uv run --isolated --no-project --with ...` 手工拼依赖，绕过根 `uv.lock`；`:65` 起只跑五个测试文件，不包含本次失败的两项。

因此 CI 版本流水线通过并不能阻止本次发现的回归进入版本。最小改进是先让 Python 质量门禁使用项目锁定环境，把关键合同、并发和失败分支纳入标准门禁，再按 CI 资源安排完整回归。它比单纯继续增加静态目录边界规则更能提升行为可信度。

## 建议执行顺序及完成标准

1. **先修运行与数据正确性（F01–F04）**：真实 CSP 下 WASM 可编译；清理不能删除新 task_id；连续上传以最新文件为准；并发转码产物与各自输入对应。
2. **补齐跨入口语义和状态闭环（F05–F08）**：人工与自动生产对同一草图得出相同过期结论；助手成功写入在业务页面可见；业务失败不启动任务跟踪；上传错误可见。
3. **补强合同与持续验证**：对齐 `/help` 测试约定、锁定 CI 环境，并覆盖任务回执、业务失败和资源变更。模型策略若保留差异，应明确呈现与测试其差异。
4. **再优化体积、重复查询和低价值代码**：先定位入口包贡献、去除单键查询中的全量工作，再评估无业务引用 Hook 和局部回执重复。每项以加载量、查询工作量或行为一致性衡量，避免大规模抽象改造。

真实 Gateway/付费模型调用、Cloud/BYOK 的实际供应商响应、安装包启动与更新、可选环境安装、完整“原文到成片”生产以及全部页面人工验收均不在本次已验证范围。上述问题的存在已足以否定“全部闭环”，剩余未发现问题的功能仍需按实际支持平台和能力逐项验收。
