# AI anime 助手可编辑字段参考

Agent 处理用户编辑请求时，查此文档获取具体字段名、类型和可选值。更新请求的返回边界与用户表达方式见 [update-behavior.md](update-behavior.md)。

---

## 项目配置

**API**: `PATCH /projects/{project}`

| 字段 | 类型 | 可选值 | 默认 |
|------|------|--------|------|
| `visual_style` | string | `chinese_period_drama`, `anime`, `realistic`, `post_apocalyptic` | `chinese_period_drama` |
| `narration_style` | string | `first_person`, `third_person` | `first_person` |
| `ethnicity` | string | `Chinese`, `Japanese`, `Korean`, `Western` | `Chinese` |
| `rhythm` | string | `fast`, `medium`, `slow` | `medium` |
| `grid_mode` | string | `3x3` 等 | `3x3` |
| `video_model` | string | 当前模型目录返回的视频模型选择器；前端人工生成持久化为项目选择，AI 仅在用户明确点名本次模型时作为单次覆盖 | 空时由后端按用途分配解析 |
| `video_resolution` | string | 项目画布/合成尺寸：`720p`, `1080p`, `720x1280`, `1080x1920`, `1280x720`, `1920x1080` | `720p` |
| `add_subtitles` | bool | 剧集合成时是否默认烧录字幕 | `true` |
| `add_bgm` | bool | 剧集合成时是否默认调用 `AUDIO_MUSIC` 生成并混入配乐 | `false` |

视频选择规则：智能体完整生产默认省略 `video_model`，由后端按实际视频用途和设置页中的云端/BYOK 全局角色优先级选择，不自动继承工作台下拉框；用户明确点名本次模型时可传当前目录中的 `video_model` 作为单次覆盖。单 beat 局部人工生成可传 `model`，未指定时由后端解析项目配置和用途分配。项目 `video_resolution` 是画布/合成尺寸，不等于供应商生成清晰度枚举；单次生成分辨率必须使用所选模型能力（例如 Seedance 2.0 标准版为 480p/720p/1080p，Fast 为 480p/720p）。逐步确认模式一次只启动一个 eligible beat；连续完整生产只提交一个 `production_workflow` 父任务，由后端逐 beat 调度，助手不得自行批量提交。

单 beat AI 生成使用 `ai_anime_start_single_video`，支持与网页相同的画幅 `ratio`、时长 `duration`、模式 `mode`、完整配置 `video_config_json`、最终提示词 `final_prompt` 和音频等配置字段。`video_config_json` 是 JSON 对象字符串，先与已保存配置合并，再由显式顶层字段覆盖；省略字段保留已保存配置，`false` 和空对象不能当作未传。高级参考模型必须有非空 `final_prompt`，可直接传入、放在配置中或事先保存。只有用户明确点名模型时才传 `model`，有对应路由时同时传 `model_selector`；未指定模型时 AI 工具按全局角色优先级选择。

单 Beat 视频面板的“AI 优化”使用 `ai_anime_optimize_video_prompt`。可传 `manual_prompt_reference` 和 `prompt_guidance`；工具读取 Beat 已保存的模式、时长、画幅、参考素材与文字配置，并将提示词指导及生成后的 `final_prompt` 写回同一个 `video_config_json`，工作台随后从该字段显示结果。

## 角色

**API**: `PATCH /projects/{project}/characters/{name}`

| 字段 | 类型 | 说明 | 下游影响 |
|------|------|------|----------|
| `face_prompt` | string | 面部描述（发型、眼型、肤色） | → 重做肖像 |
| `description` | string | 角色简介 | 无直接重跑 |
| `gender` | string | 性别 | 无直接重跑 |
| `is_main` | bool | 是否主角 | 影响角色分级 |
| `role` | string | 角色类型（主角/配角/反派） | 影响角色分级 |
| `body_type` | string | 体型描述（纤细高挑/健壮魁梧） | 影响画面生成 |
| `fish_voice_id` | string | Fish Audio S2 声线 ID（对白 beat 专用） | → 该角色所有对白 beat 重做配音 |
| `aliases` | string[] | 别名列表 | 影响角色识别 |

## 角色身份

**新增**: `POST /projects/{project}/characters/{name}/identities`
**修改**: `PATCH /projects/{project}/characters/{name}/identities/{identity_id}`（identity_id = `角色名_身份名`）
**删除**: `DELETE /projects/{project}/characters/{name}/identities/{identity_id}`
**生成身份图**: `POST /projects/{project}/characters/{name}/identities/{identity_id}/generate`
**上传身份图**: `POST /projects/{project}/characters/{name}/identities/{identity_name}/upload`（multipart）

| 字段 | 类型 | 说明 |
|------|------|------|
| `identity_name` | string | 身份名称（如"便装"、"朝服"、"战甲"） |
| `appearance_details` | string | 外观描述（**必须**具体到服装颜色+款式+材质，避免"正装"、"便装"、"休闲装"等模糊词）。不含面部。→ 重做身份图 → 影响草图/首帧服装一致性 |

## 剧集

**API**: `PATCH /projects/{project}/episodes/{ep}`

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 集标题 |
| `content_summary` | string | 内容摘要 |
| `character_names` | string[] | 出场角色名 |
| `key_events` | string[] | 关键事件 |
| `cliffhanger` | string | 悬念/钩子 |
| `identity_ids` | string[] | 本集使用的身份 ID |

## 剧集内容（原文 & 改写稿）

原文和改写稿不在 `PATCH /episodes/{ep}` 里，各走独立端点。

| 字段 | API | 说明 | 下游影响 |
|------|-----|------|----------|
| `raw_content` | `GET/PUT /projects/{project}/episodes/{ep}/raw-content` | 原文（剧集工作台原始文案） | 改变后：改写稿（若已存在）变旧 → 需重新改写；直接生成剧本时 → 需重新生成 beats |
| `adapted_content` | `GET/PUT/DELETE /projects/{project}/episodes/{ep}/adapted-content` | 解说改写后的工作副本 | → 重新生成剧本 → 草图/首帧/视频/合成 |

**DELETE 语义**：清空改写稿后，剧本生成会回退到原文。

**注意**：改 `raw_content` 不会自动清掉 `adapted_content`；如果希望 skill 重新改写，调用 `DELETE /adapted-content` 或显式 `PUT /adapted-content` 覆盖。

## Beat

**API**: `PATCH /projects/{project}/episodes/{ep}/beats/{beat}`

| 字段 | 类型 | 说明 | 下游影响 |
|------|------|------|----------|
| `narration_segment` | string | 旁白/台词文本 | → 重做配音 |
| `visual_description` | string | 画面描述 | → 重做草图 → 首帧 → 视频 |
| `location` | string | 场景地点 | → 可能影响草图 |
| `location_description` | string | 场景详细描述 | → 可能影响草图 |
| `time_of_day` | string | 时间（day/night/…） | → 影响光影氛围 |
| `video_prompt` | string | i2v 视频提示词 | → 重做视频 |
| `keyframe_prompt` | string | k2v 关键帧提示词 | → 重做视频 |
| `video_mode` | string | `"first_frame"` / `"keyframe"` | → 影响视频生成模式 |
| `audio_type` | string | `"narration"`（旁白）/ `"dialogue"`（角色台词） | → 重做配音 |
| `speaker` | string | 说话人身份ID（dialogue 时必填，如 `"姜裳宁_皇后"`） | → 重做配音 |

## 风格

**查看**: `GET /api/v1/styles`（列表）、`GET /api/v1/styles/{id}`（详情）；项目助手会自动携带当前项目作用域。
**创建**: 只调用 `ai_anime_create_style`；内部风格 ID 由服务端生成，不要让用户补 ID。`config` 必须一次性填写规范字段 `label`、`style_instructions`、`avoid_instructions`、`style_tag`、`style_family`、`animation_subtype`。`style_instructions` 只描述渲染媒介、线条、色板、光照、纹理、镜头感、调色和完成度；人物身份、面孔、年龄、服装、道具、场景内容和构图由具体生成任务提供，不能写进全局风格。不得自行发明配置键。用户要求同时生成参考图时，在同一次调用传 `create_preview=true` 与 `preview_prompt`；`preview_prompt` 必须描述同一张完整成片画面，并同时包含一名面部清晰的匿名成年人物和有代表性的环境，以覆盖眼睛、发丝、肤色阴影、服装、场景材质、色板与光影的画法。不得要求空镜、无人、无脸、拼贴、角色板或文字标签。参考图中的人物只作为人物画法样张，不能作为角色身份或样貌来源。用户附图时传 `[CHAT_ATTACHMENTS]` 中的 `attachment_path`，不要另起第二个写工具。自定义风格最终与内置预设保持相同资产结构：规范风格配置 + 一张参考图，并保存到账号级全局风格目录。参考图会作为所有后续生图请求的最后一张风格参考，只控制渲染媒介、线条、色板、光照、材质、纹理和完成度；人物身份、服装、场景、道具与构图必须服从排在前面的任务素材。
**补参考图**: 已有风格缺少参考图时只调用 `ai_anime_generate_style_preview`。该工具通过任务中心异步生成并只更新 `preview_path`；禁止再次调用 `ai_anime_create_style`，也禁止重写已有风格配置。
**删除**: `DELETE /api/v1/styles/{id}`（仅自定义风格）
**预览**: 创建工具或参考图任务已经返回成功时不再读取验证；只有用户明确要求查看已有风格参考图时，才读取 `/api/v1/styles/{id}/preview`。

```json
// 创建
{
  "name": "My Style",
  "config": {
    "label": "自定义",
    "style_instructions": "完整描述渲染媒介、线条、色板、光照、纹理、镜头感、调色和完成度，并服从具体人物与场景描述",
    "avoid_instructions": "完整描述需要避免的视觉特征和瑕疵",
    "style_tag": "CUSTOM STYLE",
    "style_family": "animation",
    "animation_subtype": "2d"
  }
}
```

## 场景

**列出**: `GET /projects/{project}/scenes`
**新增**: `POST /projects/{project}/scenes`  body `{"name":"...","description":"...","environment_prompt":"..."}`
**修改**: `PATCH /projects/{project}/scenes/{name}`
**删除**: `POST /projects/{project}/scenes/{name}/delete`

| 字段 | 类型 | 说明 | 下游影响 |
|------|------|------|----------|
| `name` | string | 场景名 | 影响场景库匹配 |
| `description` | string | 场景描述 | 影响后续生成提示 |
| `environment_prompt` | string | 环境提示词 | 影响后续生成提示 |

当前后端没有 `anchor-image/*`、`snapshot-sync`、`scene_anchor` task；不要调用这些旧路由。

## 道具

| 操作 | API |
|------|-----|
| 列表 | `GET /projects/{project}/props` |
| 规划本集道具 | `POST /projects/{project}/episodes/{ep}/props/plan` |
| 新增 | `POST /projects/{project}/props` |
| 修改 | `PATCH /projects/{project}/props/{name}` |
| 删除 | `POST /projects/{project}/props/{name}/delete` |

## 文件上传

| 操作 | API | 格式 |
|------|-----|------|
| 上传小说 | `POST /projects/{project}/ingest/upload` | multipart `file=novel.txt` |
| 上传肖像 | `POST /projects/{project}/characters/{name}/portrait/upload` | multipart `file=portrait.png` |
| 上传身份图 | `POST /projects/{project}/characters/{name}/identities/{identity_name}/upload` | multipart `file=identity.png` |

## 图池选择

**工作流**：浏览图池 → 选图 → 更新 beat 首帧

```
1. GET /projects/{project}/episodes/{ep}/grids → 获取图池数据（含 cell_url、stale 字段）
2. 向用户展示图池时，交付边界见 delivery-boundaries.md；默认读取摘要策略见 read-behavior.md
3. 用户选定图片后，先检查该图的 stale 字段：
   - stale=false → 正常选图：POST pool-select {"pool_id": "..."}
   - stale=true → 通过 `question` 警告旧批次颜色不兼容，用户确认后传 {"pool_id": "...", "force": true}
   - 禁止 try→fail→force 模式（先不带 force → 被拒 → 再加 force 重试）
```

## 音频操作

| 操作 | API | 说明 |
|------|-----|------|
| 整集音频 | `POST /projects/{project}/episodes/{ep}/audio/generate` | [ASYNC: audio_generation_indextts2] |
| 重做单 beat | `POST /projects/{project}/episodes/{ep}/beats/{beat}/audio` | 同步，直接返回 |

## 导出

| 操作 | API | 说明 |
|------|-----|------|
| 导出 ZIP | `POST /projects/{project}/episodes/{ep}/export/zip` | 全集素材打包 |
| 导出 SRT 字幕 | `GET /projects/{project}/episodes/{ep}/export/srt` | SubRip 格式 |
| 下载文件 | `GET /projects/{project}/files/{path}` | 路径相对于 `output/{username}/{project}/` |
