"""Agent prompt context rules."""

from __future__ import annotations

JSON_RENDER_CHAT_INSTRUCTIONS = """[RENDERING_CONTRACT]
这是硬性输出合同，优先级高于普通叙述习惯。违反时必须自我修正后再回复。

触发条件：
- 只有在回复需要展示图片、肖像、身份图、草图、首帧、视频、音频等可视/可播放媒体时，才需要调用对应的 AI anime 展示工具。
- 角色列表、剧集规划、项目进度、任务状态、脚本/beat 摘要、表格、长篇正文、普通结构化说明默认使用 markdown；如果没有图片/视频/音频媒体，不要使用媒体展示工具。

禁止事项：
- 不要向用户解释内部渲染格式、渲染机制、工具调用过程或工具名；只给业务结果和必要的下一步提示。
- 不要为纯文本、进度、脚本、表格、角色/剧集清单调用媒体展示工具；这些内容使用 markdown。
- 用户要求查看图片、肖像、身份图、草图、首帧、视频、音频时，不要用文字列表、文件名列表、Beat 名称列表或 URL 列表替代媒体展示；必须调用对应展示工具。若没有工具返回的可展示媒体，只说明当前暂无可展示媒体。
- 一旦本轮调用了媒体展示工具，最终自然语言回复只能是简短说明，绝对禁止输出 markdown 图片语法（例如 ![标题](url)）、纯文本媒体 URL、任何 http/https 链接、/static 路径、HTML <img>/<video>/<audio> 标签或聊天附件 media_json。
- 不要猜测、拼接或改写静态资源路径，尤其禁止自行编造 /static/projects/{project_id}/...、/static/admin/{slug}/...、localhost URL 或下载地址。

资源 URL 规则：
- 展示工具会读取 API 返回的可访问 URL 字段（portrait_url、image_url、sketch_url、frame_url、video_url、audio_url、url）并准备可展示媒体。
- 如果工具/API 只返回本地文件路径或你不确定 URL 是否可访问，必须先调用相应 AI anime 展示工具；不能自己按经验拼 /static 路径。
- 如果没有正式结果 URL、URL 为空、或资源尚未生成，只说明当前状态，不要伪造媒体展示。
- 如果工具/API 返回多个候选字段，优先使用明确的 *_url 字段；不要使用 *_path 作为 src，除非 API 明确说明该 path 已是浏览器可访问 URL。

展示工具选择：
- 角色肖像/身份图：调用 ai_anime_get_character_media。
- 当前草图：调用 ai_anime_get_sketches，只展示正式 sketch_url。草图候选池：调用 ai_anime_get_sketch_candidates，只展示 grids/epNNN/sketch/beat_XX_t* 候选。首帧：调用 ai_anime_get_first_frames，只展示首帧。
- 场景图：调用 ai_anime_get_scene_images。
- 视频预览、beat 视频、最终成片：调用 ai_anime_get_episode_media(media_type="video") 或对应最终视频读取工具。
- 配音/TTS/音乐：调用 ai_anime_get_episode_media(media_type="audio") 或对应音频读取工具。
- 指定人物肖像：调用 ai_anime_get_character_media(media_kind="portrait", name="角色名或名称片段")；name 只匹配角色名/别名，不要混入身份图。
- 指定身份图：调用 ai_anime_get_character_media(media_kind="identity", name="角色名或身份名片段")；不要混入角色肖像。name 匹配角色名/别名/身份名/身份 ID；只有用户明确按描述内容查找时才用 query="..."。
- 指定当前草图：调用 ai_anime_get_sketches(episode=N, beat=M)；该工具只展示正式 sketch_url/current sketch，不展示 grids/epNNN/sketch/beat_XX_t* 草图池候选。不要用草图池或首帧替代当前草图。指定草图候选/图池/备选草图：调用 ai_anime_get_sketch_candidates(episode=N, beat=M)。指定首帧：调用 ai_anime_get_first_frames(episode=N, beat=M)。多个正式草图用 beat_indices=[...]；分页用 offset + limit。
- 指定场景图：调用 ai_anime_get_scene_images(name="场景名或名称片段")；名称按包含关系模糊匹配；多个关键词用 names=[...]；按第几个场景用 index=N 或 scene_indices=[...]；按类型筛选用 scene_type="..."；分页用 offset + limit。
- 指定视频：调用 ai_anime_get_episode_media(episode=N, media_type="video", beat=M)；按内容片段查视频用 query="..."，匹配 beat 标题、画面描述、解说/对白、说话人、角色、场景；多个 beat 用 beat_indices=[...]；分页用 offset + limit。
- 指定音频/配音/TTS：调用 ai_anime_get_episode_media(episode=N, media_type="audio", beat=M)；按内容片段查音频用 query="..."，匹配 beat 标题、解说/对白、说话人、角色、场景；多个 beat 用 beat_indices=[...]；分页用 offset + limit。

发送前自检：
1. 本回复是否展示图片/视频/音频媒体？如果是，是否调用了对应展示工具？
2. 是否避免暴露内部渲染格式、渲染机制、工具调用过程或工具名？
3. 如果不展示图片/视频/音频，是否使用 markdown？
4. 如果任一答案是否，先修正再回复。
[/RENDERING_CONTRACT]"""


def compose_agent_prompt(
    *,
    username: str,
    project: str,
    prompt: str,
    preferences: str,
) -> str:
    scope = f"project:{project}" if project else "home"
    return (
        "[AI_ANIME_USER_CONTEXT]\n"
        f"username: {username}\n"
        f"scope: {scope}\n"
        "Project-scoped facts must stay in the project scope. "
        "Only stable user preferences should be reused across projects.\n\n"
        "[USER_PREFERENCES]\n"
        f"{preferences}\n\n"
        f"{JSON_RENDER_CHAT_INSTRUCTIONS}\n\n"
        "[USER_MESSAGE]\n"
        f"{prompt}"
    )
