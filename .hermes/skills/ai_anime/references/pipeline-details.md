# AI anime 助手流水线详情

每个步骤的 API 调用必须以后端当前 FastAPI routes 为准。

变量约定：
- `$PID` = 当前 `AI_ANIME_PROJECT_ID`
- `$EP` = 集数编号
- `$CHAR_NAME` = 角色名
- `$IDENTITY_ID` = 身份 ID
- `$BEAT` = beat 编号

认证：所有请求使用 `Authorization: Bearer $AI_ANIME_AGENT_TOKEN`。

---

## 完整生产唯一入口

用户要求完整生成、自动完成整集或全部分集时，只调用：

```
ai_anime_run_production_workflow(
  episodes=[1],          # 省略表示全部已规划分集
  filename="novel.txt", # 仅尚未摄入时需要
  target_beats=18        # 用户明确指定镜头数时传
)

实际 POST /projects/$PID/workflow/production
```

该父任务内部调用与前端手动操作相同的应用用例，按断点完成脚本图、生产模型前置、世界资产、草图、AI 检测、全局优化、声线与配音模型前置、首帧、Seedance 最终提示词、音频、逐 beat 视频和合成。助手只等待父 `production_workflow` 的精确 `task_key`，不得按下文单步接口再编排一条完整流程。

---

## 脚本生产图唯一入口

助手执行摄入、角色提取、分集规划、身份规划、场景规划和分集脚本时，统一使用：

```
ai_anime_run_script_workflow(
  mode="through",
  target="script",
  episodes=[1],          # 省略表示处理全部已规划分集
  filename="novel.txt", # 仅尚未摄入时需要，必须来自上传列表
  max_parallel=4
)

实际 POST /projects/$PID/workflow/scripts
```

依赖图固定为 `摄入 → 角色 → 分集 →（身份规划 || 场景规划）→ 分集脚本`。`mode="through"` 补齐目标之前所有缺失节点；`mode="single"` 只执行目标节点，缺前置时直接返回缺项。所有节点都进入任务中心，调用方只等待父 `script_workflow` 的精确 `task_key`。

---

## 当前项目准备阶段

项目创建由前端/系统完成，AI anime 助手不会调用 `POST /projects`。以下步骤均要求
`AI_ANIME_PROJECT_ID` 已绑定到一个存在的项目。

### Step 1: 上传小说 [SYNC]

```
POST /projects/$PID/ingest/upload
Body: multipart/form-data, file=novel.txt
```

### Step 2: 摄入 [ASYNC -> ingest_fast, ep=0]

```
专用工具: ai_anime_start_ingest(filename="novel.txt", rebuild=false)
实际由 /projects/$PID/workflow/scripts 的 ingest 单节点启动摄入任务

已摄入项目覆盖重建只能在二次确认后调用:
专用工具: ai_anime_start_ingest(filename="novel.txt", rebuild=true)

GET /projects/$PID/tasks/ingest_fast/0
SSE /projects/$PID/tasks/ingest_fast/0/stream
```

启动摄入禁止使用通用 `ai_anime_post`。专用工具会读取当前云端/BYOK 用途分配并提交完整请求体；缺少 TEXT 或 EMBEDDING 分配时会明确报错且不会启动任务。

### Step 3: 配置项目 [SYNC]

```
PATCH /projects/$PID
Body: {"visual_style": "...", "narration_style": "...", "ethnicity": "...", "rhythm": "..."}
```

### Step 4: 角色提取 [ASYNC -> build_characters, ep=0]

**触发用专用工具 `ai_anime_build_characters`（不要自己拼路径）**，它内部就是
`POST /projects/$PID/characters/build`。

```
ai_anime_build_characters            # 触发提取（项目默认取 AI_ANIME_PROJECT_ID）

ai_anime_wait_task(task_key="<触发结果中的 task_key>")       # 等待精确任务
```

完成后用：

```
GET /projects/$PID/characters
```

手动添加角色 fallback：

```
POST /projects/$PID/characters
Body: {"name":"角色名","role":"主角","is_main":true,"gender":"female","age_group":"youth","description":"描述","face_prompt":"面部特征"}
```

### Step 5: 角色 face_prompt 检查/补齐 [SYNC]

肖像生成依赖角色 `face_prompt`。进入肖像生成前必须读取角色列表并补齐缺失值：

```
GET /projects/$PID/characters
PATCH /projects/$PID/characters/$CHAR_NAME
Body: {"face_prompt": "具体面部特征描述"}
```

缺失时优先用专用工具：

```
ai_anime_update_character_face_prompt(name="$CHAR_NAME", face_prompt="...")
```

`face_prompt` 只描述脸部，不写服装、场景、身份图。

### Step 6: 分集规划 [ASYNC -> build_episodes, ep=0]

```
POST /projects/$PID/episodes/plan
Body: {"target_episodes": 10, "planning_mode": "chapters"}

GET /projects/$PID/tasks/build_episodes/0
SSE /projects/$PID/tasks/build_episodes/0/stream
```

完成后用：

```
GET /projects/$PID/episodes
```

### Step 7: 肖像生成 [SYNC]

```
POST /projects/$PID/characters/$CHAR_NAME/portrait
Body: {"style": "...", "ethnicity": "...", "model": "nanobanana"}
```

---

## 逐集生成阶段

### Step 8a: 身份规划 [ASYNC -> identity_planner]

```
ai_anime_plan_identities(episode=$EP)
实际由 /projects/$PID/workflow/scripts 的 identities 单节点启动
```

### Step 8b: 场景规划 [ASYNC -> episode_scene_planner]

```
ai_anime_plan_scenes(episode=$EP)
实际由 /projects/$PID/workflow/scripts 的 scenes 单节点启动
```

Step 8a 与 Step 8b 只依赖分集规划，允许并行；分集脚本必须等待两者都完成。

### Step 9: 身份图生成 [SYNC]

```
GET /projects/$PID/characters/$CHAR_NAME/identities

POST /projects/$PID/characters/$CHAR_NAME/identities/$IDENTITY_ID/generate
Body: {"style": "...", "model": "nanobanana"}
```

`$CHAR_NAME` 必须来自已读取的角色列表或身份规划结果，且非空。禁止探测 `/characters//identities`。

### Step 10a: 解说改写 [ASYNC -> content_rewriter]

```
GET /projects/$PID/episodes/$EP/raw-content

POST /projects/$PID/episodes/$EP/rewrite/generate
Body: {"target_beats": 18, "beat_chars_min": 14, "beat_chars_max": 20}

GET /projects/$PID/tasks/content_rewriter/$EP
SSE /projects/$PID/tasks/content_rewriter/$EP/stream
```

完成后可用：

```
GET /projects/$PID/episodes/$EP/adapted-content
```

### Step 10b: 剧本生成 [ASYNC -> script_writer]

助手使用前置感知的图入口，不直接调用底层脚本写接口：

```
ai_anime_generate_script(episode=$EP)
实际 POST /projects/$PID/workflow/scripts
Body: {"mode":"through","target":"script","episodes":[$EP]}
```

完成后验证：

```
GET /projects/$PID/episodes/$EP/script
GET /projects/$PID/episodes/$EP/beats
```

不要要求 `script_mode == "literal_source"`；当前后端不保证该字段。

### Step 11: 场景参考资产 / 道具上下文 [SYNC/ASYNC]

当前后端没有 `anchor-image/*`、`scene_anchor` task，也没有 `/episodes/$EP/scenes/snapshot-sync`。不要调用这些路径。

本集 `scene_menu` 已在 Step 8b 生成。后续可用场景资产 API：

```
GET /projects/$PID/scenes

POST /projects/$PID/scenes
Body: {"name":"场景名","description":"...","environment_prompt":"..."}

PATCH /projects/$PID/scenes/$SCENE_NAME
Body: {"description":"...","environment_prompt":"..."}

POST /projects/$PID/scenes/$SCENE_NAME/delete
```

可用道具 API：

```
POST /projects/$PID/episodes/$EP/props/plan
GET /projects/$PID/props
POST /projects/$PID/props
PATCH /projects/$PID/props/$PROP_NAME
POST /projects/$PID/props/$PROP_NAME/delete
```

### Step 12: 草图生成 [ASYNC -> sketch_generation]

```
POST /projects/$PID/episodes/$EP/sketches/assign-colors

POST /projects/$PID/episodes/$EP/sketches/generate
Body: {"style": "...", "grid_index": 0, "sketch_scene_grouping": true, "aspect_ratio": "2:3", "image_generation_selection": "..."}

GET /projects/$PID/tasks/sketch_generation/$EP?scope=grid_0
SSE /projects/$PID/tasks/sketch_generation/$EP/stream?scope=grid_0
```

按 `grid_index` 串行生成每张 grid。每个 grid 对应 task scope `grid_N`。

状态/结果查看：

```
GET /projects/$PID/episodes/$EP/grids
```

### Step 12.3: AI 身份检测 [ASYNC -> ai_identity_detection]

```
POST /projects/$PID/episodes/$EP/sketches/detect-identities

GET /projects/$PID/tasks/ai_identity_detection/$EP
SSE /projects/$PID/tasks/ai_identity_detection/$EP/stream
```

### Step 12.5: 全局视频优化 [ASYNC -> global_optimize_video]

```
POST /projects/$PID/episodes/$EP/optimize/video-global
Body: {"language":"en"}

GET /projects/$PID/tasks/global_optimize_video/$EP
SSE /projects/$PID/tasks/global_optimize_video/$EP/stream
```

### Step 13: 首帧生成 [ASYNC -> selected_regen]

```
POST /projects/$PID/episodes/$EP/beats/regenerate
Body: {"beat_indices": [1,2,3], "style": "...", "model": "nanobanana"}

GET /projects/$PID/tasks/selected_regen/$EP
SSE /projects/$PID/tasks/selected_regen/$EP/stream
```

### Step 14: 音频生成 [ASYNC -> audio_generation_indextts2]

音频生成统一使用 `audio/generate`。

```
POST /projects/$PID/episodes/$EP/audio/generate
Body: {"mode": "sync_changed"}  # 可省略，后端默认 sync_changed

GET /projects/$PID/tasks/audio_generation_indextts2/$EP
SSE /projects/$PID/tasks/audio_generation_indextts2/$EP/stream
```

单 beat 音频重做：

```
POST /projects/$PID/episodes/$EP/beats/$BEAT/audio
```

### Step 15: 视频生成 [ASYNC -> single_video]

当前后端没有 `/projects/$PID/episodes/$EP/videos/generate` 整集批量视频路由。

**执行规则**：逐步确认模式一次启动 1 个 beat 的 `single_video` 任务。连续自动模式由 `production_workflow` 父任务找出缺失 beat、服从队列准入并等待各子任务终态，助手不得批量提交。全部成功后才进入 compose。

生成单个 beat 视频：

```
POST /projects/$PID/episodes/$EP/beats/$BEAT/video
Body: {"resolution": "720x1280", "model": "<当前可用视频模型 ID>"}

GET /projects/$PID/tasks/single_video/$EP?beat_num=$BEAT
SSE /projects/$PID/tasks/single_video/$EP/stream?beat_num=$BEAT
```

启动接口返回 `ok:false` 或 HTTP 错误时，直接向用户反馈接口错误。启动成功后如果任务状态为 `failed` / `cancelled`，直接向用户反馈 `task.error`、`error_code` 或最近日志中的失败原因；不要把失败收口成“已重做完成”。

如果用户要求完整生成整集，调用 `ai_anime_run_production_workflow(episodes=[$EP])`。只有明确的局部逐 beat 操作才先读取 beats 并提交当前 beat。不要调用不存在的 `/videos/generate`。

### Step 16: 合成 [ASYNC -> compose_episode]

合成只能在本集所有 beat 视频都已完成后启动。逐步确认模式启动后收口；连续自动模式等待 compose 完成后继续展示正式成片。

```
POST /projects/$PID/episodes/$EP/videos/compose
Body: {"add_subtitles": true, "add_bgm": false}

GET /projects/$PID/tasks/compose_episode/$EP
SSE /projects/$PID/tasks/compose_episode/$EP/stream
```

compose 完成后，读取正式成片状态：

```
GET /projects/$PID/episodes/$EP/final
```

若返回 `data.exists=true` 且有 `data.video_url`，用 `ai_anime_get_final_video` 展示成片。不要自己拼 host、下载地址或 `/files` 路径。

用户明确要导出文件时，可结合：

```
GET /projects/$PID/episodes/$EP/export/srt
POST /projects/$PID/episodes/$EP/export/zip
```
