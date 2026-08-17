---
version: 1.1.51
attention: medium
---
# v1.1.51

## User-facing Highlights (zh)

- 补全画布视频下载、全屏、上游图片解绑、提交和翻译按钮的可访问名称，键盘与辅助技术可准确识别这些操作。
- 修复区域选择器的受控状态切换，以及任务中心来源链接的 Base UI 元素语义。
- 清理前端测试中的 React 异步更新、MSW 请求体重复读取、Base UI、路由和 i18n 初始化警告；全量前端测试输出保持干净。
- Python 包、Electron 安装器、前端版本兜底、依赖锁文件、README 与云端交接文档已统一更新为 1.1.51。

## User-facing Highlights (en)

- Added accessible names to canvas video download, fullscreen, upstream-image detach, submit, and translate controls so keyboard and assistive technology users can identify them reliably.
- Fixed the Region Selector controlled-state transition and the Base UI element semantics of Task Center origin links.
- Removed React async-update, duplicate MSW request-body read, Base UI, router, and i18n initialization warnings from the frontend test suite.
- Python, Electron, frontend fallback, dependency lock, README, and cloud handoff versions are synchronized to 1.1.51.

---
version: 1.1.50
attention: high
---
# v1.1.50

## User-facing Highlights (zh)

- 前端“完整生成”和 AI 助手连续自动生成统一调用 `production_workflow` 父任务，由后端从持久化断点完成全部分集和生产阶段。
- 删除旧 TTS 路由、旧项目字段和视频参数映射；未声明参数现在直接拒绝，不再静默进入兼容路径。
- 单 Beat 修图、配音和视频重做入口继续保留；脚本任务仅在明确指定镜头数时传递 `target_beats`。
- Python 包、Electron 安装器、前端版本兜底、依赖锁文件和 README 已统一更新为 1.1.50。

## User-facing Highlights (en)

- The frontend Complete Generation action and continuous AI-assisted generation now submit the same `production_workflow` parent task, which resumes every persisted episode and production stage in the backend.
- Removed obsolete TTS routes, project fields, and video argument mappings; undeclared request fields are now rejected instead of silently entering a compatibility path.
- Single-Beat image, audio, and video rework remains available; script tasks include `target_beats` only when explicitly requested.
- Python, Electron, frontend fallback, dependency lock, and README versions are synchronized to 1.1.50.

---
version: 1.1.49
attention: medium
---
# v1.1.49

## User-facing Highlights (zh)

- 应用内「使用教程」统一跳转到新版 AI anime 产品使用手册；手册按当前工作台、画布、风格、任务中心和 3D 环境依赖完整重写，并配套真实产品截图。
- 前端 213 处原生 `title` 提示统一改为主题 UI 悬浮气泡，覆盖异步画布节点和编辑器动态元素，浅色与深色模式使用同一组件。
- Python 包、Electron 安装器、前端版本兜底、依赖锁文件、README 与云端交接文档统一升级到 1.1.49；独立 3D 运行时内容未变，继续沿用现有运行时版本。

## User-facing Highlights (en)

- The in-app tutorial now opens the new AI anime product manual, rewritten around the current workbench, canvas, styles, Task Center, and optional 3D runtime with real product screenshots.
- All 213 browser-native `title` hints now use the themed application tooltip, including lazy canvas nodes and editor-created elements in both light and dark modes.
- Python, Electron, frontend fallback, dependency lock, README, and cloud handoff versions are synchronized to 1.1.49. The separately versioned 3D runtime is unchanged.

---
version: 1.1.48
attention: high
---
# v1.1.48

## User-facing Highlights (zh)

- 风格参考图正式参与角色、身份、场景、道具、分镜、并发分镜、自由画布与 360 场景生图；主体素材优先，风格图固定置于最后，只控制线条、色板、光照、材质、纹理与渲染完成度。
- 自动生成的风格参考图改为单一无人物环境，禁止人脸、身体、剪影、角色板和拼贴构图，避免不同角色继承同一张脸。
- 桌面应用升级到 1.1.48；独立 3D 运行时内容未变，继续沿用现有运行时版本。

## User-facing Highlights (en)

- Style reference images now participate in character, identity, scene, prop, storyboard, concurrent storyboard, free-canvas, and 360-scene generation. Subject references remain authoritative; the style image is always last and controls only linework, palette, lighting, materials, texture, and finish.
- Automatically generated style references are now single unoccupied environments with no faces, bodies, silhouettes, character sheets, or collage layouts, preventing unrelated characters from inheriting one face.
- The desktop app is now 1.1.48; the separately versioned 3D runtime is unchanged.

---
version: 1.1.47
attention: high
---
# v1.1.47

## User-facing Highlights (zh)

- 修复上游 360 场景生成仍读取旧风格键名的问题，统一使用 `style_instructions` 与 `avoid_instructions`。
- 全量核对角色、场景、道具、分镜、自由画布和 360 场景的风格入口：运行时仅使用风格参数，风格预览图仍只用于分析和界面展示。
- 桌面应用升级到 1.1.47；独立 3D 运行时内容未变，继续沿用现有运行时版本。

## User-facing Highlights (en)

- Fixed the upstream 360-scene path that still read legacy style keys; it now consistently uses `style_instructions` and `avoid_instructions`.
- Rechecked character, scene, prop, storyboard, free-canvas, and 360-scene style entry points. Runtime generation uses style parameters only; style preview images remain analysis and UI assets.
- The desktop app is now 1.1.47; the separately versioned 3D runtime is unchanged.

---
version: 1.1.46
attention: high
---
# v1.1.46

## User-facing Highlights (zh)

- 风格创建与生成恢复上游 DramaClaw 的规则：内置 6 个模板与上游当前版本保持一致，上传参考图只用于分析风格参数和界面预览。
- 角色、场景、道具、分镜、自由画布与 360 场景生成只注入风格指令、避免指令、风格标签和风格分类，不再把风格预览图作为人物参考图，避免不同角色复用参考图中的同一张脸。
- 调用记录中的 `RESERVED` 状态恢复中文显示为“已预占”。
- 桌面应用升级到 1.1.46；独立 3D 运行时内容未变，继续沿用现有运行时版本。

## User-facing Highlights (en)

- Style creation and generation now follow the upstream DramaClaw rules again. All six built-in presets match the current upstream files, and uploaded reference images are used only for style analysis and UI previews.
- Character, scene, prop, storyboard, free-canvas, and 360-scene generation inject style instructions, avoidance instructions, style tags, and style classification only. Style preview images are no longer submitted as character references, preventing unrelated characters from inheriting the same face.
- The invocation-history `RESERVED` status is localized as `已预占` in Chinese.
- The desktop app is now 1.1.46; the separately versioned 3D runtime is unchanged.

---
version: 1.1.45
attention: high
---
# v1.1.45

## User-facing Highlights (zh)

- 脚本生产图的父任务使用独立编排通道，同一项目只运行一个父图；身份、场景与分集脚本等无冲突节点继续并行执行，不再与父任务争抢默认并发容量而卡在队列中。
- 修复身份与场景规划任务未关闭项目记忆库连接导致的 `Event loop is closed` 和后端无响应；解说场景分析对模型返回的有效空结果自动重试一次，再使用文本规则兜底。
- 全局风格参考图只控制线稿、色彩、光照、材质和渲染质感，不再参与角色五官身份锁定；角色肖像与身份图只使用角色描述、该角色身份锚点及服装参考，新生成的风格参考图不含人物或人脸。
- 桌面应用升级到 1.1.45；独立 3D 运行时内容未变化，继续沿用现有运行时版本。

## User-facing Highlights (en)

- Script-production parent jobs now use a dedicated orchestration lane with one active graph per project. Independent identity, scene, and script nodes still run concurrently without competing with their parent for default-lane capacity.
- Identity and scene planners now close their project memory stores, preventing `Event loop is closed` leaks and backend hangs. Narrated-scene analysis retries one semantically empty model result before falling back to text rules.
- Project style references now control rendering language only and no longer participate in facial identity locking. Character portraits and identity sheets use character descriptions, character-owned identity anchors, and costume references; newly generated style boards contain no people or faces.
- The desktop app is now 1.1.45; the separately versioned 3D runtime is unchanged.

---
version: 1.1.44
attention: high
---
# v1.1.44

## User-facing Highlights (zh)

- AI 助手、文本任务和其它模型调用统一按“数字越小越优先”选择路由；BYOK 的密钥、权限或模型不存在错误会直接显示，不再静默切到云端并消耗额度，临时网络与网关错误仍会自动重试并记录每次选路结果。
- 新增唯一的脚本生产图任务入口，完整覆盖“摄入原文 → 提取角色 → 规划分集 → 身份与场景并行规划 → 生成分集脚本”；支持只执行单个节点、指定多集或一次处理全部已规划分集。
- 删除助手对旧身份规划别名和通用 POST 的绕过路径；脚本生成会从真实持久化状态补齐前置，只等待任务中心返回的父任务键，不再出现已创建任务却查不到对应进度的矛盾状态。
- 桌面应用升级到 1.1.44。

## User-facing Highlights (en)

- Assistant chat and all text workloads now follow lower-number-first routing. BYOK credential, permission, and missing-model errors remain visible instead of silently spending cloud credits; transient network and gateway failures still retry and every route attempt is audited locally.
- One canonical script-production graph now covers ingestion, character extraction, episode planning, parallel identity/scene planning, and episode script generation. It supports one-node execution, selected episodes, or every planned episode.
- Assistant calls no longer use the retired identity-planning alias or generic POST bypasses. Script generation fills prerequisites from persisted facts and waits on the single parent task key returned by Task Center.
- The desktop app is now 1.1.44.

---
version: 1.1.43
attention: high
---
# v1.1.43

## User-facing Highlights (zh)

- 自定义风格改为账号全局目录，新建项目可直接选择已有风格；创建接口只负责创建，重复 ID 在唯一应用用例中拒绝，不再由助手预查询或合并旧配置。
- 项目选中的全局风格会同时把正向指令、避免指令和参考图送入角色、场景、道具、分镜、草图、自由画布及 360 场景等图片生成链路，参考图不再只用于界面展示。
- 模型路由明确采用“数值越小优先级越高”，首选路由遇到临时网络或网关错误会使用同一幂等键自动重试 3 次，再按优先级切换下一条路由。
- 助手只使用创建任务返回的完整 `task_key` 查询和等待任务，消除 episode/scope 猜测造成的 `Task not found`；丢失终态事件时的历史补偿等待由 30 秒缩短到 5 秒。
- 下拉框与操作菜单统一使用主题组件和单行自适应宽度，深色主题不再露出原生白色列表；模型优先级旁增加规则气泡提示。
- 桌面应用升级到 1.1.43；3D 运行时内容未变化，继续使用独立版本 1.1.38。

## User-facing Highlights (en)

- Custom styles now live in one account-wide catalog and can be selected by newly created projects. Duplicate IDs are rejected by the single creation use case without assistant-side preflight reads or configuration merging.
- The selected project style now sends its positive guidance, avoidance guidance, and reference image through character, scene, prop, storyboard, sketch, canvas, and 360-scene image workflows.
- Lower numbers have higher routing priority. Transient network and gateway failures retry the preferred route three times with one stable idempotency key before failover.
- Assistant task polling uses the exact `task_key` returned at creation, eliminating episode/scope guesses behind `Task not found`; missed terminal-event reconciliation now runs after five seconds instead of thirty.
- Dropdowns and action menus use themed, single-line, content-width UI; priority rules are available from inline tooltip hints.
- The desktop app is now 1.1.43; the separately versioned 3D runtime remains 1.1.38 because its published contents did not change.

---
version: 1.1.42
attention: high
---
# v1.1.42

## User-facing Highlights (zh)

- 修复项目封面使用竖图时撑高整行卡片的问题，封面继续按固定比例裁切，项目卡恢复紧凑布局。
- AI 助手输入框支持直接粘贴剪贴板图片，图片复用现有附件校验、持久化和发送链路，普通文字粘贴保持不变。
- 助手创建风格只接受唯一的规范配置结构，完整保存正向指令、避免指令、风格标签与风格分类；线条、色板、光照、人物、背景、氛围和构图统一进入真实生效的风格指令，不再静默丢弃未知字段。
- 风格读取自动携带当前项目作用域，参考图任务完成后不再执行多余验证请求；只读探测失败不会把已经成功的创建流程误报为整体失败。
- 桌面应用升级到 1.1.42；3D 运行时内容未变化，继续使用独立版本 1.1.38。

## User-facing Highlights (en)

- Project cards no longer stretch when a portrait cover is used; cover media remains cropped to the fixed card ratio.
- Clipboard images can be pasted directly into the assistant composer through the existing attachment validation, persistence, and send path, while normal text paste is unchanged.
- Assistant-created styles now use one strict canonical configuration and preserve all effective instructions, exclusions, tags, and classification fields instead of silently dropping invented keys.
- Style reads inherit the active project scope, completed preview jobs no longer trigger redundant verification calls, and recovered read probes cannot mark a successful creation flow as failed.
- The desktop app is now 1.1.42; the separately versioned 3D runtime remains 1.1.38 because its published contents did not change.

---
version: 1.1.41
attention: high
---
# v1.1.41

## User-facing Highlights (zh)

- 模型调用统一由桌面任务路由器按设置中的优先级选择，文本、图片、音频、视频和知识图谱链路不再接受任务内模型名绕过路由；BYOK 优先时不会被云端模型抢占。
- 风格参考图统一通过任务中心生成，只更新参考图字段，不清空既有风格配置；重复风格 ID 仍明确拒绝覆盖。
- 项目封面增加分页和缓存，修正运行环境容量单位，并优化长列表、任务中心和生成等待状态，使用 Motion 过渡降低界面卡顿感。
- AI 助手工具名称与状态完成汉化，整集工作流状态持久化并可在应用恢复后继续，不再依赖易丢失的页面内临时状态。
- Windows Setup 会复用本机已完整安装的 3D 运行环境；升级主程序时直接跳过依赖安装页，不比较独立运行时版本，也不重复下载大型组件。
- 桌面应用升级到 1.1.41；3D 运行时内容未变化，继续使用独立版本 1.1.38。

## User-facing Highlights (en)

- Model calls now use one desktop task router and honor the configured priority across text, image, audio, video, and knowledge-graph workloads; task payloads can no longer bypass BYOK priority.
- Style preview generation runs through Task Center and updates only the preview field, preserving existing style configuration while duplicate style IDs remain rejected.
- Project covers are paginated and cached, runtime size units are corrected, and Motion transitions improve long-list and generation-wait responsiveness.
- Assistant tool labels and states are localized, while full-episode workflow progress is persisted and resumes after the app is restored.
- Windows Setup reuses a complete existing 3D runtime, skipping the dependency page and large download during application upgrades without comparing the independent runtime version.
- The desktop app is now 1.1.41; the separately versioned 3D runtime remains 1.1.38 because its published contents did not change.

---
version: 1.1.40
attention: high
---
# v1.1.40

## 详细更新记录

### Windows 安装器兼容性

- 修复 3D 运行环境安装脚本使用 UTF-8 无 BOM 编码，导致 Windows PowerShell 5.1 按系统 ANSI 编码读取中文并在解析阶段直接退出的问题。
- 安装脚本现在明确使用 UTF-8 BOM，并增加文件编码回归检查；日志能够在脚本启动后写入 `%APPDATA%\@ai-anime\desktop\logs\runtime-dependency-install.log`。
- 桌面应用升级到 1.1.40；已发布的 3D 运行时内容未变化，继续使用独立版本 1.1.38。

---
version: 1.1.39
attention: high
---
# v1.1.39

## 详细更新记录

### 3D 可选运行环境安装

- 修复 Windows Setup 在 3D 运行时自检成功时仍报退出码 1 的问题。Windows PowerShell 5.1 不再把 `xFormers not available` 等原生标准错误警告当作脚本失败，安装结果以进程退出码和完整性标记为准。
- Setup 安装过程写入 `%APPDATA%\@ai-anime\desktop\logs\runtime-dependency-install.log`，后续失败弹窗会显示日志位置，不再只暴露无上下文的退出码。
- 应用版本与 3D 运行时版本彻底解耦：桌面应用提升到 1.1.39，已经发布并通过验证的 Windows 3D 运行时继续使用独立版本 1.1.38。

### 风格参考图任务

- 参考图生成接口收敛为唯一的 `POST /styles/{id}/preview`，该接口只负责提交任务中心任务。
- 删除旧同步生成实现、`/preview/generate` 别名和 Hermes 绕过拦截，参考图生成完成后仍只原子更新 `preview_path`，不覆盖风格配置。

### 验证范围

- 风格接口、任务调度、Hermes 工具与契约测试共 54 项通过。
- 国内清单、Windows 3D 运行时和 SHARP 模型公网地址均已验证可访问；运行时支持 HTTP Range，文件长度与发布清单一致。

---
version: 1.1.38
attention: high
---
# v1.1.38

## 详细更新记录

### AI 助手创建风格参考图

- 修复自定义风格已经创建成功，但 AI 助手生成封面参考图仍返回 `No preview image generated` 的问题。
- 根因是参考图生成器错误地在临时输出目录中查找自定义风格，导致尚未调用云端图片模型就判定风格不存在；现在项目目录由应用层完整传递到生成器，自定义风格能够读取真实项目配置。
- 风格参考图调用继续使用项目已分配的图片生成模型，不增加本地兜底或伪造结果；模型权限、远程请求等真实错误会原样进入任务日志，便于区分客户端配置与远端故障。
- 预览生成成功后仍写回原有风格记录与参考图文件，保持风格管理页面、AI 助手工具调用和后续项目应用使用同一份数据。

### 验证范围

- 风格用例、参考图生成、风格接口与 Hermes 工具插件共 42 项回归通过。
- Python 静态检查与补丁格式检查通过；Windows 安装包由完整生产构建链重新生成，包含本次前端、Electron、Python 后端、导演世界运行时和 Hermes 修改。

---
version: 1.1.37
attention: high
---
# v1.1.37

## 详细更新记录

### SHARP 下载与 GPU 运行

- 明确区分 SHARP 首次下载与本地推理：首次使用会从 Apple 上游下载约 2.81 GB 模型权重并保存到 Torch 公共缓存，后续任务直接复用缓存，不再把持续满速网络误报为模型推理卡死。
- 任务中心在权重不存在时显示“首次下载 SHARP 模型（约 2.81 GB）”，缓存存在时显示“加载已缓存的 SHARP 模型”，并同时展示 GPU 优先、无 CUDA 时回退 CPU 的设备策略。
- Windows 世界运行时切换为 PyTorch 2.12.1 CUDA 12.6 构建；`auto` 模式依次选择 CUDA、MPS、CPU，具备 NVIDIA CUDA 的设备不再使用 CPU 执行 SHARP 神经网络推理。
- 打包烟测新增 CUDA 编译信息、CUDA 可用状态和设备名称检查；Windows 构建若再次混入 CPU-only PyTorch 将直接失败，不再生成错误安装包。

### PLY / SOG 转换器完整打包

- 修复 Electron 打包器过滤嵌套 `node_modules`，导致安装目录只有 `node.exe`、缺少 `splat-transform` CLI 的问题。
- 安装包显式包含 `@playcanvas/splat-transform` 与 `webgpu`，并在 Electron 打包完成后使用安装目录中的 Node 和 CLI 执行真实启动检查；缺少任一文件或 CLI 无法运行时构建立即失败。
- SHARP 推理完成后增加实际设备与点云整理阶段，随后再进入 PLY → SOG 压缩，避免任务进度长期停留在 20% 且无法判断内部状态。

### 验证范围

- RTX 3060 Laptop GPU 上以 1536 内部分辨率完成单面 SHARP 实际推理，运行日志确认 `device=cuda`，成功生成 1,179,648 个高斯点。
- 使用打包目录中的 `splat-transform` 将 63 MB PLY 实际转换为 9.9 MB SOG；CUDA 世界运行时独立 EXE 烟测通过。
- SHARP 定向回归 11 项、桌面端回归 84 项、Electron TypeScript 类型检查均通过。

---
version: 1.1.36
attention: high
---
# v1.1.36

## 详细更新记录

### 任务进度统一

- 画布节点与任务中心统一读取同一个任务记录的真实 `progress`，不再根据启动时间、预计耗时或固定动画推算百分比。
- 音频、图片生成、图片节点、脚本、文本、视频和导演世界等全部任务型节点均透传真实任务进度；任务刚提交但尚未取得服务端记录时只显示不确定进度动画，不再显示伪造数值。
- 任务中心底栏、任务列表、任务详情和独立任务页统一使用同一套进度归一化与取整规则；完成状态固定显示 100%，异常范围会安全限制在 0%～100%。
- 增加逐任务类型回归断言，确保画布上方进度、底部状态栏和任务详情不会再次出现同一任务显示不同百分比的问题。

### 导演世界、下拉框与国际化

- 导演世界节点的图片来源与参考图选择改为应用统一下拉组件；修复原生下拉框样式不一致、选中值显示原始英文枚举及点击传播导致菜单无法打开的问题。
- 清理创建身份、姿势预设、图片编辑、重绘参数、视频导出、助手模型选择等界面的可见原生下拉框；保留的隐藏 `<select>` 仅用于自定义组件的表单兼容，不参与界面显示。
- 补齐导演世界生成状态、来源类型、参考图、身份创建与重绘面板的中英文文案，移除 `nodeToolbar.generatingDirectorWorld` 等直接暴露给用户的翻译键。

### AI 助手与模型设置

- 项目会话继续使用单一 `chat.db`，历史会话通过侧边抽屉创建、切换、重命名和删除；输入区操作入口收纳到输入框内部，修复抽屉顶部越界。
- 工具调用、待办、Markdown、附件和多轮连续执行使用结构化消息展示；会话接近上下文限制时由 Hermes 自动压缩并保留未完成任务信息。
- 设置页保持“云端模型 / BYOK 模型”双标签；实际路由支持云端与多个 BYOK 服务商按用途、模型优先级混用和失败回退，BYOK 继续支持直接获取服务商模型列表。

### 验证范围

- 本次相关前端回归 69 项全部通过，前端 TypeScript 类型检查通过。
- 前端架构边界共 398 项完成校验；桌面主进程、授权、更新、BYOK、多服务商路由和打包合同 84 项全部通过。

---

# v1.1.35

## 详细更新记录

### AI 助手与连续编排

- AI 助手会话统一保存到单一 `chat.db`，项目内多条会话通过 `conversation_id` 隔离，不再创建平行数据库或维护两套读写逻辑；代码只维护当前数据库结构，不包含旧结构迁移或自动清表分支。
- 新增项目会话侧边抽屉，可创建、切换、重命名和删除历史会话；消息、附件、工具调用、待办与运行状态均归属于对应会话。
- 支持上传文本类文件并纳入当前会话上下文；Markdown、代码块、列表、错误信息、工具参数与工具结果使用对应的结构化组件显示，不再把工具事件拼成难读的转义文本。
- 工具调用按真实 `toolCallId` 关联名称、参数、状态和结果；待办列表、进行中、成功、失败与取消状态可视化展示，避免多个工具并行时串名、串结果。
- 完整剧集编排改为连续工作模式：完成一个步骤后读取真实任务状态并继续后续步骤，不再要求用户逐段发送提示；一次性操作仍在目标完成后正常结束。
- Hermes 在上下文接近模型窗口上限时自动压缩会话，保留最近消息、开场约束和未完成任务；压缩失败会停止本轮整理并保留原始上下文，避免静默丢失指令。

### 云端模型与多 BYOK 路由

- 设置页保持“云端模型 / BYOK 模型”双标签展示，说明收纳到信息图标；界面分区不限制实际路由，云端模型与多个 BYOK 服务商可以按用途混用。
- BYOK 支持配置多家服务商、多个模型和独立优先级；文本、图片、图片编辑、视频、向量和语音用途分别选择模型，当前路径失败时按优先级尝试下一条已启用路由。
- BYOK 请求由桌面端直接发送给第三方服务商，不经过业务云中转；已适配 OpenAI 兼容、Anthropic 和 Gemini 的模型目录、鉴权、请求与响应格式，并保留手动模型 ID。
- 模型目录可通过服务商的 `list models` 接口获取，目录失败会明确展示服务商返回的错误，不再把云端授权模型混入 BYOK 编辑区。

### 视频预览与媒体控制

- Beat 视频预览恢复为应用自有的单一控制层和单一 `<video>` 实例，不使用浏览器原生控制条，也不再在外层叠加第二套播放器。
- 同一外框内提供播放/暂停、点击播放、拖动进度、时间、音量/静音、倍速、画中画和全屏；候选切换、下载与播放状态使用同一媒体实例，避免控件点击无反应或两层状态不同步。
- 保留视频原始音轨，不再由前端强制静音；若源文件本身没有音轨，会按真实媒体状态播放，不伪造声音。

### 导演世界、草图与背景

- 导演世界入口在打开前主动刷新真实场景清单；只有取得有效 3D/全景资源后才打开编辑器，读取失败时直接显示后端原因，不用空白默认世界掩盖错误。
- 对齐上游“身份颜色草图—姿势调整—保存草图—生成渲染成品”流程，草图姿势编辑继续使用项目身份色合同，不向任意成图叠加自制骨骼模型。
- 导演世界截图提交后同时刷新控制帧状态与 Beat 背景锚点，草图、渲染和背景选择立即读取最新结果；修复截图已保存但入口仍显示旧状态的问题。
- 姿势、裁剪、详情与背景选择弹窗统一使用应用 UI，扩大有效宽度并避开顶部标题栏和底部状态栏；删除确认不再调用系统原生弹窗。

### 调用记录、额度与更新

- 调用记录显示可读模型名称和中文状态，并展示 `reservedUnits`、`chargedUnits`、`refundedUnits`、`balanceBefore`、`balanceAfter`；已释放调用的实际扣减为零，暂扣与待复核不会误报为已结算。
- 顶部积分在模型调用结算、窗口重新聚焦和手动刷新后重新拉取，避免余额长期停留在旧值。
- 应用更新页显示版本、平台、Electron 运行时、渠道和更新说明；下载安装显示真实百分比、已下载大小、总大小与速度。

### 验证范围

- 前端完整回归共 285 个测试文件、1971 项测试全部通过。
- 前端和 Electron TypeScript 类型检查通过；AI 助手/Hermes 后端定向测试、桌面端完整测试与 Windows 打包前运行时检查通过。

---

# v1.1.34

## 详细更新记录

### AI 助手与工具调用

- 修复内部技能发现失败被直接投影成用户可见错误的问题。Hermes 在后续已经恢复并成功调用项目工具时，不再先插入一条误导性的“任务执行失败”。
- 工具调用状态改为按 `toolCallId` 关联真实工具名称，多个只读工具并行执行时不再互相串名、串状态或把后一个工具的结果记到前一个工具上。
- 修复项目任务列表中历史任务的 `failed` 状态被误判成本轮 Agent 失败的问题。只读查询本身成功时，历史业务数据只作为查询结果展示，不再覆盖当前对话状态。
- 写操作防重继续保持“一轮最多一次变更”，但重复写入时会正常取消并结束当前 Agent 回合，返回明确的防重复提示，不再留下持续等待或空回复状态。
- 精简 AI anime 技能发现描述，避免模型把“技能名称与说明”整体误当成技能 ID，减少无效 `skill_view` 请求；项目读取、任务查询和写入仍严格使用真实工具合同。

### 视频预览

- 将 Beat 视频预览统一为单一媒体外框和单一 `<video>` 实例，移除外层重复的放大预览组件，避免播放状态、时间轴和音量在两套播放器之间不一致。
- 播放、暂停、进度、音量、画中画、倍速和全屏统一交由同一个原生媒体控制层处理；不再额外覆盖第二套全屏按钮或重复创建视频元素。
- 保留下载入口与候选视频切换，不改变已生成视频地址、模型选择或任务数据合同。

### 验证范围

- 新增 Agent 隐藏工具恢复、并行工具名称关联、历史失败状态隔离和单视频实例回归测试。
- 通过 AI 助手定向测试、视频组件测试、Python 静态检查、前端与 Electron 类型检查，以及桌面端完整测试。

---

# v1.1.33

## 详细更新记录

### 360 全景与打包态任务修复

- 修复 Windows 安装包内“场景资产 · Master 生成全景”启动后立即失败的问题。原实现把冻结后的 `ai-anime-backend.exe` 当作 Python 解释器执行 `-m`，子进程因此误入 API 服务启动入口并报缺少 `--data-root`。
- 为 360 全景生成、Master/Reverse 重叠分析、空间合同分析和 voxel 导演世界生成增加统一的白名单工作进程入口；源码开发环境继续使用 Python 模块，安装包则使用受控的内部任务调度。
- 内部任务入口仅允许四类已登记的导演世界工作进程，不开放任意模块执行，避免修复子进程问题时扩大本地执行面。
- 后端打包烟测新增四类工作进程逐项启动校验，并明确检查输出不得回落到 API 服务的 `--data-root` 参数解析器；不完整或路由错误的后端 EXE 将直接导致构建失败。
- 360 全景主任务仍使用当前已选择的云端图片模型、图片尺寸和质量参数，修复只调整本地任务调度，不改变模型路由、额度结算或生成合同。

### 模型与额度

- 模型设置恢复为清晰的“云端模型 / BYOK”双标签布局，说明文字收纳到信息图标悬浮层，避免设置页堆叠大段说明。
- 云端与 BYOK 仅在界面上分类展示，实际路由继续支持混用；文本、向量、图片、图片编辑、视频与语音等用途可分别设置优先级，并在当前路由失败后依次回退。
- BYOK 支持配置多家服务商，每家服务商独立保存接口地址、密钥、模型目录和用途分配；兼容服务商的 `list models` 接口可直接获取模型列表，同时保留手动填写模型 ID 的能力。
- 调用记录优先显示可读模型名称，并展示预占、实际扣减、退还、扣减前余额和扣减后余额；已结算、已释放、暂扣和待复核状态统一使用中文。
- 右上角积分在调用结算、窗口重新聚焦及手动刷新时重新拉取，避免余额长期停留在旧值。

### 导演世界与资产流程

- 对齐上游导演世界的作用域：场景资产保存可复用的场景模板，Beat 工作台保存当前镜头控制，自由画布保存节点草稿；三类数据不再互相冒充。
- 场景、草图和渲染入口在打开导演世界前会先读取最新场景清单；后端返回“无可用 3D/全景资产”时直接显示真实原因，不再打开一个看似可用但内容全空的默认世界。
- 保留自由画布主动创建空导演世界的原始能力；该空白状态只用于创作新世界，不再作为场景资产读取失败的兜底画面。
- 恢复上游“身份颜色控制草图 → 编辑姿势 → 保存草图 → 生成渲染成品”的工作流，移除对最终成图强行叠加任意开源骨架的方案。
- 扩大姿势、裁剪、详情和背景选择弹窗的有效宽度，修复文字截断、状态栏遮挡、加载不结束及背景来源无法选择的问题。
- 图片与视频支持应用内放大查看；视频播放器不再被前端强制静音。

### 本地 3D 运行环境

- Windows 安装包随附 SHARP/3DGS 所需的 `torch`、`torchvision`、`sharp`、`plyfile`、DA2 及其运行资源，启动自检会逐项确认模块和模型结构可加载。
- 随安装包提供独立 Node.js 与 `@playcanvas/splat-transform`/WebGPU 运行环境，SOG、PLY 和 splat 转换不再借用 Electron 进程执行。
- 后端打包后会执行真实运行时冒烟检查，并单独校验全景 SHARP worker 与 splat CLI；缺少关键组件时构建直接失败，不再把不完整安装包交付给用户。
- 模型权重仍按上游正式实现于首次使用时下载，代码依赖和执行环境则全部包含在安装包中。

### AI 助手与工具调用

- Hermes 在上下文达到模型窗口 75% 前自动压缩，保留最近 20 条与开场 3 条关键信息；压缩后继续当前任务，原始会话仍保存在本地会话数据库。
- 压缩会在模型请求前和工具调用循环后双重检查，单轮最多连续整理三次；摘要失败时停止本次压缩且不丢弃原始对话。
- 修复工具请求体被当成文本、风格创建缺少 ID、桌面会话校验失配、任务已启动却回复“没有执行”以及工具失败后返回空消息等问题。
- 风格支持创建、生成参考图、上传外部参考图、预览、应用和删除；删除确认统一使用应用内弹窗。

### 桌面体验与可靠性

- “复制资产链接”统一通过 Electron 安全剪贴板通道执行，并保留浏览器环境降级路径，修复点击后只显示“出错了”的问题。
- 修复模型用途下拉框选中后回显内部英文值、通知红点不消失、Toast 偏左、弹窗边界重叠及部分状态未国际化的问题。
- 更新下载展示真实百分比、已传输大小、总大小和下载速度；设置页同时显示应用、平台、Electron 运行时、版本和发布渠道。
- 统一 Python、Electron、前端兜底版本、锁文件、README 与集成文档版本为 `1.1.33`，避免旧前端版本被再次打入新安装包。

## Update highlights (English)

- Restored separate Cloud and BYOK tabs while retaining mixed, prioritized routing across multiple BYOK providers.
- Bundled and smoke-tested the Windows SHARP/3DGS, DA2, PyTorch, PlayCanvas splat and standalone Node runtimes.
- Prevented invalid Director World entry points from opening an empty default stage while preserving intentional blank creative worlds.
- Added automatic Hermes context compression and a reliable Electron clipboard path for asset links.
- Fixed packaged panorama and DirectorWorld worker dispatch so the frozen backend no longer falls through to the API server `--data-root` parser.
- Added packaged smoke coverage for all four allowlisted DirectorWorld workers.
- Synchronized every product version source to `1.1.33`.
