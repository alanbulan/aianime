# AI anime 助手 API 快速参考

**HTTP Base URL**: `$AI_ANIME_API_URL/api/v1`。调用 `ai_anime_get` / `ai_anime_post` 时，`path` 必须写成完整的 `/api/v1/...`；表格中的简写路径不能直接传给工具。
**认证**: `Authorization: Bearer $AI_ANIME_AGENT_TOKEN`

---

## 项目管理

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/projects` | 列出所有项目 |
| `POST` | `/projects` | 创建项目 `{"name":"..."}`；仅前端/系统使用，AI anime 助手流程不调用 |
| `GET` | `/projects/{project}` | 获取项目配置 |
| `PATCH` | `/projects/{project}` | 更新配置 |

## 摄入

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/projects/{project}/ingest/upload` | 上传小说 (multipart) |
| `POST` | `/projects/{project}/ingest/start` | 启动摄入 `{"filename":"...", "rebuild":false}` [ASYNC]；助手必须调用 `ai_anime_start_ingest`，任务执行时使用当前 TEXT/EMBEDDING 路由；已摄入项目覆盖重建必须二次确认后传 `rebuild=true` |

摄入 API 只允许以上两个路径。助手启动摄入时禁止使用通用 `ai_anime_post`，只能调用 `ai_anime_start_ingest(filename="...")`。`ingest_fast` 是后端任务类型，不是 HTTP 路由；不要调用或推断 `/ingest/init`、`/ingest/setup`、`/ingest_script`、`/ingest_fast`、`/projects/{project}/ingest` 或其它 ingest 变体。遇到这些路径的 404 时，不要解释为摄入模块未启用，应改用上表真实路由。

## 角色

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/projects/{project}/characters` | 列出角色 |
| `POST` | `/projects/{project}/characters` | 手动添加角色 `{"name":"...","role":"...","is_main":true,"gender":"female","age_group":"youth","description":"...","face_prompt":"..."}` |
| `POST` | `/projects/{project}/characters/build` | 提取角色 [ASYNC] |
| `PATCH` | `/projects/{project}/characters/{name}` | 修改角色 |
| `POST` | `/projects/{project}/characters/{name}/portrait` | 单个肖像 |
| `POST` | `/projects/{project}/characters/{name}/portrait/upload` | 上传肖像 (multipart) |
| `GET` | `/projects/{project}/characters/{name}/identities` | 查看身份 |
| `POST` | `/projects/{project}/characters/{name}/identities` | 新增身份 |
| `PATCH` | `/projects/{project}/characters/{name}/identities/{identity_id}` | 修改身份（identity_id = `角色名_身份名`） |
| `DELETE` | `/projects/{project}/characters/{name}/identities/{identity_id}` | 删除身份 |
| `POST` | `/projects/{project}/characters/{name}/identities/{identity_name}/upload` | 上传身份图 |
| `POST` | `/projects/{project}/characters/{name}/identities/{identity_id}/generate` | 生成身份图（Identity Locking）`{"style":"...","model":"..."}` [SYNC] |

## 分集

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/projects/{project}/episodes` | 列出分集 |
| `POST` | `/projects/{project}/episodes/plan` | 分集规划 `{"target_episodes":10,"planning_mode":"chapters"}` [ASYNC] |
| `GET` | `/projects/{project}/chapters` | 检测小说章节 |
| `PATCH` | `/projects/{project}/episodes/{ep}` | 修改集信息 |
| `POST` | `/projects/{project}/episodes/{ep}/identities/plan` | 规划本集身份 |
| `POST` | `/projects/{project}/episodes/{ep}/scenes/plan` | 规划本集场景 |

## 完整生产与脚本生产入口

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/projects/{project}/workflow/production` | 前端与助手共用的唯一完整生产入口 [ASYNC → production_workflow]：从持久化断点完成脚本、资产、草图、检测、优化、首帧、音频、逐 beat 视频和合成。助手使用 `ai_anime_run_production_workflow`，一次只提交一个父任务。 |
| `POST` | `/projects/{project}/workflow/scripts` | 单节点或完整脚本生产 DAG：`摄入 → 角色 → 分集 →（身份规划 || 场景规划）→ 分集脚本` [ASYNC → script_workflow]。`mode=through` 自动补前置，`mode=single` 仅运行目标节点；助手使用 `ai_anime_run_script_workflow`，不得用通用 POST 绕过。 |

## 剧本

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/projects/{project}/episodes/{ep}/script` | 获取剧本（当前后端可能返回 script_mode，但不要依赖 literal_source 作为硬判定） |
| `PUT` | `/projects/{project}/episodes/{ep}/script` | 保存完整剧本 `{"beats":[...]}` |
| `GET` | `/projects/{project}/episodes/{ep}/beats` | 获取 beat 列表 |
| `PATCH` | `/projects/{project}/episodes/{ep}/beats/{beat}` | 编辑 beat |

## 原文 & 改写稿（新流程输入）

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/projects/{project}/episodes/{ep}/raw-content` | 读原文 |
| `PUT` | `/projects/{project}/episodes/{ep}/raw-content` | 保存原文 `{"content":"..."}`（UPSERT） |
| `GET` | `/projects/{project}/episodes/{ep}/adapted-content` | 读改写稿（未保存返回空串） |
| `PUT` | `/projects/{project}/episodes/{ep}/adapted-content` | 保存改写稿 `{"content":"..."}` |
| `DELETE` | `/projects/{project}/episodes/{ep}/adapted-content` | 清空改写稿，回退到原文 |

## 解说改写 & 剧本生成（Step 10）

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/projects/{project}/episodes/{ep}/rewrite/generate` | 解说改写：原文 → 改写稿 `{"target_beats":18,"beat_chars_min":14,"beat_chars_max":20,"narration_style":"first_person"}` [ASYNC → content_rewriter] |
| `POST` | `/projects/{project}/episodes/{ep}/script/generate` | 底层脚本任务 [ASYNC → script_writer]；要求身份与场景均已规划，仅供图执行器内部调度，助手不得直接调用 |

## 画面生成

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/projects/{project}/episodes/{ep}/sketches/generate` | 局部草图 `{"style":"...","grid_index":0,"sketch_scene_grouping":true,"aspect_ratio":"2:3","image_generation_selection":"..."}` [ASYNC]。完整生产使用 `grid_index=-1` 由父任务生成全部网格；不得发送不存在的 `model` 或 `sketch_location_grouping` 字段。 |
| `POST` | `/projects/{project}/episodes/{ep}/grids/generate` | 九宫格 [ASYNC] |
| `POST` | `/projects/{project}/episodes/{ep}/grids/{idx}/regenerate` | 重新生成单个网格 [ASYNC] |
| `POST` | `/projects/{project}/episodes/{ep}/grids/{idx}/cut` | 切割入池 |
| `GET` | `/projects/{project}/episodes/{ep}/grids` | 查看九宫格与图池（返回 `images[].stale` 布尔字段，true=旧版脚本生成） |
| `POST` | `/projects/{project}/episodes/{ep}/beats/{beat}/pool-select` | 从图池选图 `{"pool_id":"...","force":false}` 旧批次需 `force:true` |
| `POST` | `/projects/{project}/episodes/{ep}/sketches/assign-colors` | 草图配色（为身份分配唯一颜色）[SYNC] |
| `POST` | `/projects/{project}/episodes/{ep}/sketches/detect-identities` | AI 身份检测（识别草图中出场角色）[ASYNC → ai_identity_detection] |

## TTS & 音频

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/projects/{project}/episodes/{ep}/audio/generate` | 批量语音生成 [ASYNC: audio_generation_indextts2] |
| `POST` | `/projects/{project}/episodes/{ep}/beats/{beat}/audio` | 重做单beat音频 (SYNC) |

## 视频

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/projects/{project}/episodes/{ep}/optimize/video-global` | 全局视频优化(SuperPower⚡️) `{"language":"en"}` en=英文(默认), zh=中文 [ASYNC] |
| `POST` | `/projects/{project}/episodes/{ep}/beats/{beat}/video` | 单 beat 局部生成 [ASYNC: single_video]，请求字段为 `model`、`resolution`、`duration`、`mode` 等；未指定 `model` 时由后端按项目配置解析。同一用户请求里同一 beat 只 POST 一次；失败必须反馈任务真实错误，不得因查询暂未出现而重复 POST。完整整集目标使用 `/workflow/production`。 |
| `POST` | `/projects/{project}/episodes/{ep}/videos/compose` | 合成 `{"add_subtitles":true,"add_bgm":false}` [ASYNC] |

## 导出 & 文件

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/projects/{project}/episodes/{ep}/export/zip` | 导出 ZIP |
| `GET` | `/projects/{project}/episodes/{ep}/export/srt` | 导出 SRT 字幕 |
| `GET` | `/projects/{project}/episodes/{ep}/final` | 读取最终成片状态和可展示 `video_url` |
| `GET` | `/projects/{project}/files/{path}` | 下载文件 |

## 再生成

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/projects/{project}/episodes/{ep}/sketches/regenerate` | 重做指定草图 `{"beat_indices":[...],"style":"..."}` [ASYNC: sketch_regen] |
| `POST` | `/projects/{project}/episodes/{ep}/beats/regenerate` | 重做指定首帧 `{"beat_indices":[...],"style":"..."}` [ASYNC: selected_regen] |
| `POST` | `/projects/{project}/episodes/{ep}/grids/{idx}/regenerate` | 重做单个网格 `{"style":"...","model":"nanobanana"}` [ASYNC: grid_regenerate] |

## 场景与锚图

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/projects/{project}/scenes` | 列项目场景库；展示场景图时取 `master_url` / `reverse_master_url` / `pano_url` / `custom_scene_url`，不要用本地 `*_path` |
| `POST` | `/projects/{project}/scenes` | 新增场景 `{"name":"...","description":"...","environment_prompt":"..."}`；已存在会返回错误 |
| `PATCH` | `/projects/{project}/scenes/{name}` | 修改场景；当前后端支持改名与更新描述/提示词字段 |
| `POST` | `/projects/{project}/scenes/{name}/delete` | 删除场景 |
| `POST` | `/projects/{project}/scenes/{name}/master/generate-async` | 生成场景 master 图 [ASYNC: scene_reference_asset] |
| `POST` | `/projects/{project}/scenes/{name}/reverse/generate-async` | 生成场景 reverse master 图 [ASYNC: scene_reference_asset] |

## 道具（只读）

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/projects/{project}/props` | 列项目道具 |
| `POST` | `/projects/{project}/episodes/{ep}/props/plan` | 规划本集道具 |

当前后端还提供项目级道具写接口：`POST /projects/{project}/props`、`PATCH /projects/{project}/props/{name}`、`POST /projects/{project}/props/{name}/delete`。

## 风格

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/api/v1/styles` | 列出风格；项目助手会自动携带当前项目作用域 |
| `GET` | `/api/v1/styles/{id}` | 风格详情；项目助手会自动携带当前项目作用域 |
| `POST` | `/api/v1/styles` | 创建自定义风格；助手只使用 `ai_anime_create_style`，无需提供内部 ID |
| `DELETE` | `/api/v1/styles/{id}` | 删除自定义风格 |
| `POST` | `/api/v1/styles/{id}/preview` | 为已有自定义风格提交参考图任务到任务中心；助手必须使用 `ai_anime_generate_style_preview`，不得重新创建风格或提交任何配置字段 |
| `GET` | `/api/v1/styles/{id}/preview` | 风格预览图（返回图片文件）。创建工具或参考图任务已返回成功时禁止再调用该接口验证 |
| `POST` | `/projects/{project}/styles/analyze` | 风格分析（上传参考图提取风格参数）multipart/form-data [SYNC] |
| `POST` | `/projects/{project}/styles/preview-upload` | 直接保存自定义风格参考图；助手使用 `ai_anime_upload_style_preview`，路径必须来自当前消息的 `[CHAT_ATTACHMENTS]` |

## 流水线状态

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/projects/{project}/pipeline/status` | 聚合流水线进度（支持 `?episode=N`）|

## 任务管理

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/projects/{project}/tasks` | 列出项目任务 |
| `GET` | `/projects/{project}/tasks/status?task_key={task_key}` | 按创建结果中的精确任务键查询；助手工具唯一使用此入口 |
| `GET` | `/projects/{project}/tasks/{task_type}/{episode}` | 任务中心按页面维度查询，单 beat 任务带 `?beat_num=N` |
| `GET` | `/projects/{project}/tasks/{task_type}/{episode}/stream` | 项目任务 SSE，单 beat 任务带 `?beat_num=N` |
| `GET` | `/projects/{project}/tasks/stream` | 项目任务聚合 SSE |
| `DELETE` | `/projects/{project}/tasks/{task_type}/{episode}` | 取消项目任务 |
| `DELETE` | `/projects/{project}/tasks/completed` | 清理项目已完成任务 |
