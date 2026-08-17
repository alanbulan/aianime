# 逐集生成阶段（Steps 8-21）

> API 请求细节不确定时，`Read references/pipeline-details.md`。
> 变量：`$EP` = 当前集数。
> **首步**：局部单步操作先读取必要状态；完整生成直接使用唯一完整生产入口，模型由后端按项目配置解析。

## 流水线
Steps 8-21 详见 `references/pipeline-details.md`。检查点：CP2(场景/道具后) | CP3(草图后) | CP4(音频后) | CP5(最终成片后)

CP2 判定：脚本、场景/道具上下文足够推进草图；当前后端没有 `anchor_image_url` 契约。

## 步骤要点

**整集制作入口**：
- 用户要求“完成第 N 集 / 自动生成整集 / 做成片”时，只调用一次 `ai_anime_run_production_workflow(episodes=[N])` 并等待父任务。
- 父任务会从持久化断点补齐脚本、资产、草图、检测、优化、首帧、音频、逐 beat 视频与合成；助手不得再逐阶段编排。
- 逐步确认模式只展示最近 Todo，并在每个写步骤前等待用户确认。

**Step 9（服装一致性关键）**：
1. 先读取核心+重要角色的 identity 状态；逐步确认模式只生成当前选中的一个，连续自动模式按缺失 identity 逐个生成并等待完成
   - `CHAR_NAME` 只能来自已读到的角色名列表或当前返回结果中的明确角色字段，且必须非空
   - 如果当前拿不到角色名，就跳过该角色的 identity 补读，不要探测 `/characters//identities` 或任何空名路径
   - 不得重复生成已经有正式图片的 identity
2. 身份图是后续草图/首帧中服装外观的**视觉锚点**——没有身份图，服装每帧随机
3. `appearance_details` 必须具体到颜色+款式+材质，避免"正装"、"便装"等模糊词

**单步 continuation 收口**：
- 若 resume 已明确这是“只做下一步”的单步 continuation，
  则当前 `next_step` 完成后立刻停止，不继续探测后续步骤
- 例如断点在 Step 8（身份规划）时：
  - 完成 `POST /episodes/{ep}/identities/plan`
  - 直接汇报“本集身份规划已开始/已完成当前步”
  - 不继续轮询无关任务，不继续推进到 Step 9+
  - 默认直接使用 `identities/plan` 的返回结果汇报本步产物
  - 不为“核对每个角色身份”再补读 `GET /characters/{name}/identities`
  - 若规划返回已给出角色与身份位信息，就以该返回为最终事实源收口

**Step 10 固定主线**：
- 用户先准备 `raw-content`
- 若需要解说改写，先 `POST /rewrite/generate` 并等待 completed，再调用 `script/generate`
- 身份规划与场景规划都是脚本生成前置，两者可并行；两者都完成后才启动 `script_writer`
- 助手生成脚本只调用 `ai_anime_generate_script` 或 `ai_anime_run_script_workflow`，不直接绕过图调用底层写接口
- 剧本生成完成后可继续道具与场景参考图，再进入草图
- 当前后端没有 `literal-script/generate`，也不保证 `script_mode == "literal_source"`

**Step 11-13（场景 / 道具上下文 — 草图前置）**：
- 当前后端没有 `anchor-image/*`、`scene_anchor`、`scenes/snapshot-sync` 路由，禁止调用这些旧接口
- 可用流程：
  1. `GET /projects/{project}/scenes` 列项目场景库
  2. `GET /projects/{project}/episodes/{ep}/beats` 读取本集 beats
  3. 如需补场景 → `POST /projects/{project}/scenes`，body 使用当前后端字段：`{"name":"...","description":"...","environment_prompt":"..."}`
  4. 本集道具规划 → `ai_anime_plan_props`（`POST /projects/{project}/episodes/{ep}/props/plan`）
  5. 道具列表 → `GET /projects/{project}/props`
- 上述流程必须按依赖执行；连续自动模式由完整生产父任务补齐，局部单步模式不得重复创建同名资产。
- 完成判定：脚本、场景/道具上下文足够推进草图；不要要求 `anchor_image_url`

**Step 12（草图生成前置）**：先调 `assign-colors`（幂等），再生成草图
- 完整生产父任务统一生成全部缺失 grid；逐步确认模式每次只处理当前 grid。

**Step 12.3**：先配色再检测。无身份图时检测无效

**Step 12.5**：`{"language":"en"}` 默认英文 SuperPower 模式，决定 video_mode + motion prompt

**Step 18 音频生成**：使用 `ai_anime_generate_audio`，即 `audio/generate` [ASYNC: `audio_generation_indextts2`]。

**局部音频更新**：
- 当用户修改 beat 的 `audio_type`、`speaker`、`fish_speech_prompt` 或对白文本时，
  必须按固定顺序执行：
  1. 先 `PATCH /episodes/{ep}/beats/{beat}`
  2. 再重做该 beat 音频（`POST /episodes/{ep}/beats/{beat}/audio` 或对应音频生成路径）
  3. 最后才允许 `POST /episodes/{ep}/videos/compose`
- 这个顺序不可颠倒。明确的局部音频重做可按 PATCH → 等待音频完成 → compose 执行；若用户目标是继续完整生成，则 PATCH 后只启动一个 `production_workflow` 父任务，不在助手侧串接后续阶段。
- 即使 beat 当前对白文本已经等于目标文本，只要 `audio_type`、`speaker`
  或其他音频相关字段还需要调整，也必须先完成这次 `PATCH`，
  不要先重做音频再补 `PATCH`
- `compose` 不能预启动、不能抢跑、不能为了省时间先发起再回头补音频。
  必须等该 beat 的音频重做请求已经发出并返回成功后，才允许进入 `compose`。
- 不要在该 beat 的音频重做之前先发起 `compose`

**Step 19 视频模型**：当前后端没有整集 `/videos/generate` 路由。完整生产父任务调用单 beat 视频业务用例并等待全部终态；未指定模型时由后端按项目配置解析，单步工具使用字段 `model`。

**Step 19-21**：分别为 `single_video`（逐 beat）、`compose_episode`、`ai_anime_get_final_video`，**必须顺序执行**

## 检查点规则（仅手动模式）

到达检查点时停止工具调用，展示成果，等用户回复。

| CP | 展示 | 用户可改 |
|----|------|----------|
| CP2 | Beat 摘要（序号+场景+画面，≤3行/beat） | 画面描述、对白、增删 |
| CP3 | 3-5 张代表首帧 | 重渲染、改 visual_description |
| CP4 | 音频播放器 + 对白声线列表 | 换声线、调语速 |
| CP5 | 成片视频 + 时长 + beat 数 | 重做 beat、重新合成 |

连续自动模式不在检查点暂停，由完整生产父任务持续执行；只有父任务失败、人工决策或素材前置缺失时停止。

用户回复：
- "继续" / "ok" → 只推进当前 `next_step` 的一个任务；若已有任务运行中，只反馈当前状态
- "看第X张" / "看全部" → 补充展示，仍在同一检查点
- 具体修改指令 → 执行修改，再展示，仍等确认
- "自动跑" → 切到连续自动推进模式

## 渐进式生成策略

```
阶段一：当前项目准备（Step 1-6，项目已创建并绑定） → 手动模式在 CP1 暂停
阶段二：逐集生成（Step 8-21，per EP） → 手动模式在 CP2-CP5 暂停
阶段三：多集推进 → 用户可选逐集/指定某几集；连续自动模式一次把目标集交给完整生产父任务
```

模式贯穿所有阶段。**手动模式**在检查点暂停；**连续自动推进**只提交并等待完整生产父任务，直到目标完成或出现需要用户处理的阻塞。
