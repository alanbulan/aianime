# 运行模式（两种）

用户在配置完成后（init.md 决策树第 5 步）选择运行模式。两种模式共用同一套
后端业务用例；逐步确认模式调用单步入口，自动推进模式调用唯一的完整生产入口。

模式由用户本轮明确表达决定，并在本会话内保持：
- 用户说「每步确认 / 一步步 / 手动 / 每步问我」→ **逐步确认模式**（见下）
- 用户说「一次性 / 全自动 / 自动驾驶 / 一口气跑完 / 不用问我」→ **连续自动推进模式**
- 用户没说且目标只涉及一个局部步骤 → 默认逐步确认；用户明确要求完成整集或跨阶段目标 → 默认连续自动推进

整集目标的固定入口：

1. 调用一次 `ai_anime_run_production_workflow`；指定集传 `episodes=[...]`，全部分集省略 `episodes`。
2. 只等待返回的 `production_workflow` 父 `task_key`，不得先调脚本工作流或逐阶段工具。
3. 父任务从持久化状态恢复，调用与前端手动操作相同的业务用例，并负责依赖、并发和子任务终态。
4. 到目标完成后展示正式产物；父任务失败、人工素材缺失、覆盖确认或用户取消时停止并报告真实错误。

父任务失败或取消后，用户说“继续/重试/接着做”表示恢复同一个完整生产目标：重新提交一次 `ai_anime_run_production_workflow`，由后端读取持久化资产并只补缺失项。`pipeline/status.next_step` 此时只用于解释断点，不得改为调用单步写工具。

角色声线是独立的局部资产入口。用户只要求重新设计/覆盖角色声线时，调用 `ai_anime_design_character_voices(names=[明确角色列表], replace_existing=true)`；不得把这类局部请求解释成“继续完整生产”，也不得调用 `ai_anime_run_production_workflow`。

---

## 模式一：逐步确认模式（step-by-step）

**核心规则：一次只推进一个步骤，每步之前调用 `question`，得到确认才执行；绝不连续跳步。**

### 每一步的固定动作

1. **报下一步**（一句话，不展开）：
   - 要做什么（步骤中文名）+ 会调用的工具 + 前置是否已满足
   - 例：「下一步：分集规划（`ai_anime_plan_episodes`，目标 10 集）。原文与角色已就绪，可执行。」
2. **调用 `question`**：推荐项“执行当前步骤”，另给“跳过当前步骤”和“停止”；需要调整参数时开启 `allow_custom`。工具会暂停并等待答复，不要再输出一条普通文本问题。
3. 用户回复后：
   - 「继续 / 执行 / 好 / 下一步」→ 先查当前任务状态；若已有 queued/running，告知后台正在生成中并停止；若没有运行中任务，调对应专用工具启动当前一步 → **立即收口**。任务完成后需要决定下一步时再调用 `question`
   - 「跳过」→ 不执行，直接报「再下一步」
   - 「改成 N 集 / 用某风格 …」→ 按调整后的参数执行该步
   - 「停 / 暂停」→ 停在当前步，等用户下次指令

### 不允许的行为

- ❌ 一次确认后连跑多步（哪怕用户只说「继续」，也只推进**一步**）
- ❌ 不问就执行写操作（plan/build/generate/compose 这类触发任务的步骤）
- ❌ 把「报结果」和「执行下一步」合并——必须报完结果/启动状态后结束本轮，等用户下一条消息
- ❌ 启动异步任务后继续轮询到 completed，再自动进入下一步

### 步骤顺序（按 pipeline 主线，逐步走）

当前项目准备（init.md Steps 1-7，项目已由前端/系统创建并绑定）：
1. 上传小说 → 2. 摄入(ingest) → 3. 配置项目 →
4. 角色提取 `ai_anime_build_characters` →
5. 角色 face_prompt 检查/补齐 `ai_anime_update_character_face_prompt`（仅缺失角色） →
6. 分集规划 `ai_anime_plan_episodes` →
7. 角色肖像 `ai_anime_generate_portrait`（逐个核心角色）

> Steps 1-2 是摄入准备动作，可合并成「准备阶段」一次确认；
> 从 **Step 3 配置项目起**，每个写操作步骤都单独确认。

每集制作（episode.md，对每一集 N 重复）：
8a. 身份规划 `ai_anime_plan_identities`(ep=N) ┐
8b. 场景规划 `ai_anime_plan_scenes`(ep=N) ┘ 两者无依赖，可并行 →
9. 脚本生成 `ai_anime_generate_script`(ep=N)，必须等待 8a 与 8b →
10. 身份图生成 `ai_anime_generate_identity_image`(逐身份) →
11. 道具规划 `ai_anime_plan_props`(ep=N) →
12. 场景参考图 `ai_anime_generate_scene_master` / `ai_anime_generate_scene_reverse`(按本集场景需要逐个生成) →
13. 草图生成 `ai_anime_generate_sketches`(ep=N)；正式生产每个 Beat 独立 1x1，指定局部重做时传 `beat_indices=[...]` →
14. AI 检测 `ai_anime_detect_sketch_identities`(ep=N)，显式文本身份标记优先于检测结果 →
15. 首帧重做 `ai_anime_render_first_frames`(episode=N, beat_indices=[用户明确指定的 Beat])；只有用户明确要求整集全重做时使用 `all_beats=true` →
16. 全局视频优化 `ai_anime_optimize_video_global`(ep=N)，逐 Beat 使用正式渲染图并回退草图 →
17. 音频生成 `ai_anime_generate_audio`(ep=N) →
18. 单 beat 视频 `ai_anime_start_single_video`(逐 beat) →
19. 合成导出 `ai_anime_compose_episode`(ep=N) →
20. 最终成片展示 `ai_anime_get_final_video`(ep=N)

> 上述逐项工具用于单步确认。用户要求补齐脚本全部前置、指定多集或整章时，不逐项调用 8a/8b/9，统一使用 `ai_anime_run_script_workflow`。

每完成一集，调用 `question` 询问是否继续做第 N+1 集，再进入下一集。

### 状态回执（每步执行后）

- 触发后只把创建结果返回的精确 `task_key` 交给 `ai_anime_get_task` 或 `ai_anime_wait_task`
- 若状态为 queued/running：告诉用户后台正在生成中，等待完成后再继续；不要轮询到 completed
- 成功：按下表读取或展示完成数据；不要只说“完成”
- 失败：报 `task.error` / `error_code`，**停在该步**，不要自动重试或跳过

### 完成数据展示规则

每个步骤完成后，必须展示或汇总该步骤的真实产物。媒体类必须调用对应展示工具；文本/列表类用 markdown 表格或简短列表。没有可展示数据时，如实说明“已完成，但当前接口未返回可展示产物”，不要拼 URL、猜路径或拿旧数据充数。

| 步骤 | 完成后读取 / 展示 |
|------|-------------------|
| 摄入 | `ai_anime_pipeline_status` 汇总 ingested/configured 状态；不要展示原文全文 |
| 配置项目 | `ai_anime_get(path="/projects/{project}")` 汇总视觉风格、叙事方式、节奏、音频/视频配置 |
| 角色提取 | `ai_anime_get(path="/projects/{project}/characters")` 展示角色列表 |
| 角色 face_prompt 检查/补齐 | `ai_anime_get(path="/projects/{project}/characters")` 检查核心角色 `face_prompt`；缺失时先补齐并展示已补角色 |
| 分集规划 | `ai_anime_get(path="/projects/{project}/episodes")` 展示分集列表 |
| 角色肖像 | `ai_anime_get_character_media(media_kind="portrait")` 展示肖像 |
| 身份规划 | `ai_anime_get_character_media(media_kind="identity")` 或角色 identities 接口汇总身份列表；没有身份图时只列身份 |
| 身份图生成 | `ai_anime_get_character_media(media_kind="identity")` 展示身份图 |
| 脚本生成 | `ai_anime_get_episode_script(episode=N)` 展示 beat 摘要 |
| 场景规划 | `ai_anime_get(path="/projects/{project}/scenes")` 展示场景列表 |
| 道具规划 | `ai_anime_get(path="/projects/{project}/props")` 展示道具列表 |
| 场景参考图 | `ai_anime_get_scene_images()` 展示场景图 |
| 草图生成 | `ai_anime_get_sketches(episode=N)` 展示草图 |
| AI 检测 | `ai_anime_get_episode_script(episode=N)` 或 beats 接口汇总每个 beat 检测到的身份/道具；不要重复调用检测 |
| 全局视频优化 | `ai_anime_get_episode_script(episode=N)` 或 beats 接口汇总 video_mode / video_prompt 就绪情况 |
| 首帧生成 | `ai_anime_get_first_frames(episode=N)` 展示首帧 |
| 音频生成 | `ai_anime_get_episode_media(episode=N, media_type="audio")` 展示音频 |
| 单 beat 视频 | `ai_anime_get_episode_media(episode=N, media_type="video")` 展示视频片段 |
| 合成导出 | `ai_anime_get_final_video(episode=N)` 展示最终成片 |
| 最终成片展示 | `ai_anime_get_final_video(episode=N)`，若不存在则只说明暂无成片 |

---

## 模式二：连续自动推进模式（continuous auto）

连续自动推进只提交并等待一个父任务：

- 启动前先按 SKILL.md 的结构化决策协议补齐所有仍缺失的用户决策；用户已明确委托推荐方案时，显式传入推荐值后直接推进。
- 只调用一次 `ai_anime_run_production_workflow`，只对返回的父 `task_key` 使用 `ai_anime_wait_task`。
- 等待超时后读取同一父任务；仍在 queued/running 则继续等待，绝不重复提交。
- 后端父任务是前端与助手共用的唯一编排器，负责状态恢复、依赖、并发、子任务等待和最终合成。
- 禁止根据 `pipeline/status.next_step` 在助手侧循环调用草图、检测、优化、首帧、音频、视频和合成工具。
- 任何 failed/cancelled、HTTP 4xx/5xx、无法自动补齐的素材或配置前置都停止后续写操作；仅当存在多个明确、安全的恢复方向时调用 `question`，否则显示已完成 Todo、失败步骤和真实错误。
- 到整集 compose 完成后调用正式媒体展示工具交付成片，不要求用户再发“继续”。
