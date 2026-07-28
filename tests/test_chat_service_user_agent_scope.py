import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.api.routes import chat as chat_routes
from ai_anime.chat import backend_sdk
from ai_anime.chat import service as chat_service


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_chat_visible_text_redacts_local_filesystem_paths():
    content = (
        "前端目录 ~/Works/ai-anime-fe，"
        "后端目录 /Users/tao/Works/AI anime/state/admin/.hermes。"
    )

    redacted = chat_service._redact_local_filesystem_paths(content)

    assert "~/Works/ai-anime-fe" not in redacted
    assert "/Users/tao/Works/AI anime" not in redacted
    assert redacted.count("[本地路径]") == 2


def test_infer_display_tool_call_recovers_sketch_display_promise():
    inferred = chat_service._infer_display_tool_call_from_text(
        "全部显示",
        "我来为您显示全部37个beat的草图。正在为您展示第1集前12个beat的草图：",
        [],
    )

    assert inferred == ("ai_anime_get_sketches", {"episode": 1})


def test_infer_display_tool_call_uses_recent_context_for_short_reply():
    inferred = chat_service._infer_display_tool_call_from_text(
        "全部显示",
        "正在为您展示前12个。",
        ["如果您需要查看全部37个草图，我可以分页显示。"],
    )

    assert inferred == ("ai_anime_get_sketches", {"episode": 1})


def test_infer_display_tool_call_ignores_progress_status_language():
    inferred = chat_service._infer_display_tool_call_from_text(
        "进度怎样了",
        "当前进度如下：草图生成已完成，下面展示进度表。",
        ["如果您需要查看全部37个草图，我可以分页显示。"],
    )

    assert inferred is None


def test_infer_display_tool_call_requires_user_sketch_display_intent():
    inferred = chat_service._infer_display_tool_call_from_text(
        "看一下第2集草图",
        "正在为您展示第2集草图。",
        [],
    )

    assert inferred == ("ai_anime_get_sketches", {"episode": 2})


def test_infer_display_tool_call_uses_sketch_candidate_tool_for_pool_terms():
    inferred = chat_service._infer_display_tool_call_from_text(
        "看第1集 Beat 3 的草图候选池",
        "正在为您展示 Beat 3 的草图候选。",
        [],
    )

    assert inferred == ("ai_anime_get_sketch_candidates", {"episode": 1, "beat": 3})


def test_extract_display_tool_call_uses_named_tool_field():
    inferred = chat_service._extract_display_tool_call(
        {
            "sessionUpdate": "tool_call",
            "title": "tool",
            "name": "ai_anime_get_sketches",
            "content": [
                {
                    "type": "content",
                    "content": {"type": "text", "text": '{"episode": 1}'},
                }
            ],
        }
    )

    assert inferred == ("ai_anime_get_sketches", {"episode": 1})


def test_backend_api_get_default_uses_ipv4_loopback(monkeypatch):
    seen = {}

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def read(self):
            return b'{"ok":true}'

    def fake_urlopen(req, timeout):
        seen["url"] = req.full_url
        return FakeResponse()

    monkeypatch.delenv("AI_ANIME_API_URL", raising=False)
    monkeypatch.setenv("AI_ANIME_API_PORT", "8780")
    monkeypatch.setattr(chat_service, "urlopen", fake_urlopen)

    assert chat_service._backend_api_get("/api/v1/config", "token") == {"ok": True}
    assert seen["url"] == "http://127.0.0.1:8780/api/v1/config"


def test_backend_api_get_prefers_explicit_api_url(monkeypatch):
    seen = {}

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def read(self):
            return b'{"ok":true}'

    def fake_urlopen(req, timeout):
        seen["url"] = req.full_url
        return FakeResponse()

    monkeypatch.setenv("AI_ANIME_API_URL", "http://localhost:7860")
    monkeypatch.setenv("AI_ANIME_API_PORT", "8780")
    monkeypatch.setattr(chat_service, "urlopen", fake_urlopen)

    assert chat_service._backend_api_get("/api/v1/config", "token") == {"ok": True}
    assert seen["url"] == "http://localhost:7860/api/v1/config"


@pytest.mark.anyio
async def test_append_chat_notification_persists_project_assistant_message(
    monkeypatch, tmp_path
):
    seen = {}

    async def fake_project_context(user, scope):
        seen["scope"] = scope
        return SimpleNamespace(
            output_dir=tmp_path / "out", state_dir=tmp_path / "state"
        )

    def fake_add_assistant_message(
        username,
        project,
        content,
        media=None,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        seen.update(
            {
                "username": username,
                "project": project,
                "content": content,
                "project_dir": project_dir,
                "project_state_dir": project_state_dir,
            }
        )
        return {"id": "1", "role": "assistant", "content": content}

    monkeypatch.setattr(chat_routes, "_project_context_for_scope", fake_project_context)
    monkeypatch.setattr(
        chat_routes.chat_service,
        "add_assistant_message",
        fake_add_assistant_message,
    )

    result = await chat_routes.append_chat_notification(
        chat_routes.ChatNotificationIn(
            scope=chat_routes.ChatScopePayload(kind="project", id="demo"),
            text="  任务已完成。  ",
        ),
        user={"username": "alice"},
    )

    assert result == {
        "ok": True,
        "data": {"id": "1", "role": "assistant", "content": "任务已完成。"},
    }
    assert seen["username"] == "alice"
    assert seen["project"] == "demo"
    assert seen["content"] == "任务已完成。"
    assert seen["project_dir"] == tmp_path / "out"
    assert seen["project_state_dir"] == tmp_path / "state"


@pytest.mark.anyio
async def test_deterministic_stream_redacts_local_paths(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AI_ANIME_OUTPUT_DIR", str(tmp_path / "output"))
    events = []

    async def on_event(event):
        events.append(event)

    message = await chat_service._stream_deterministic_assistant_reply(
        "admin",
        "project-a",
        "临时路径：~/Works/ai-anime-fe/src",
        on_event,
    )

    assert "~/Works/ai-anime-fe" not in message["content"]
    assert message["content"] == "临时路径：[本地路径]"
    assert events[0]["type"] == "assistant_delta"
    assert events[0]["text"] == "临时路径：[本地路径]"


@pytest.mark.anyio
async def test_fallback_display_does_not_use_pool_sketch_as_current_sketch(
    monkeypatch,
    tmp_path,
):
    project_dir = tmp_path / "project"
    sketch_dir = project_dir / "grids" / "ep001" / "sketch"
    sketch_dir.mkdir(parents=True)
    (sketch_dir / "beat_01_t123.png").write_bytes(b"fake")

    monkeypatch.setattr(
        chat_service,
        "_backend_api_get",
        lambda path, token: {
            "ok": True,
            "beats": [
                {
                    "beat_number": 1,
                    "sketch_url": "",
                    "frame_url": "",
                }
            ],
        },
    )

    specs = await chat_service._fallback_display_tool_ui_specs(
        "admin",
        "project-a",
        "ai_anime_get_sketches",
        {"episode": 1},
        token="token",
        project_dir=project_dir,
    )

    assert specs == []


@pytest.mark.anyio
async def test_fallback_display_prefers_api_project_id(monkeypatch):
    seen_paths = []

    def fake_backend_api_get(path, token):
        seen_paths.append(path)
        return {
            "ok": True,
            "beats": [
                {
                    "beat_number": 1,
                    "sketch_url": "/static/projects/api-project/sketch.png?v=1",
                    "frame_url": "",
                }
            ],
        }

    monkeypatch.setattr(chat_service, "_backend_api_get", fake_backend_api_get)

    specs = await chat_service._fallback_display_tool_ui_specs(
        "local",
        "chat-scope",
        "ai_anime_get_sketches",
        {"episode": 1, "project_id": "api-project"},
        token="token",
    )

    assert seen_paths == ["/api/v1/projects/api-project/episodes/1/beats"]
    assert len(specs) == 1
    root = specs[0]["root"]
    first_child = specs[0]["elements"][root]["children"][0]
    assert (
        specs[0]["elements"][first_child]["props"]["src"]
        == "/static/projects/api-project/sketch.png?v=1"
    )


def test_user_agent_workspace_is_not_project_workspace(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AI_ANIME_OUTPUT_DIR", str(tmp_path / "output"))

    chat_service.ensure_user_claude_workspace("admin", "project-a")
    chat_service.ensure_user_codex_workspace("admin", "project-a")

    workspace = chat_service._user_agent_workspace("admin")
    assert workspace == tmp_path / "state" / "admin" / ".chat_agents"
    assert (workspace / ".claude" / "settings.local.json").exists()
    assert (workspace / ".claude" / "skills").is_dir()
    assert (workspace / ".codex" / "skills").is_dir()

    project_workspace = Path(tmp_path / "output" / "admin" / "project-a")
    assert not (project_workspace / ".claude").exists()
    assert not (project_workspace / ".codex").exists()


def test_ai_anime_mcp_server_config_is_agent_neutral():
    servers = chat_service._ai_anime_mcp_servers()

    assert servers["ai_anime"]["type"] == "stdio"
    assert servers["ai_anime"]["args"] == ["-m", "ai_anime.chat.ai_anime_mcp"]


def test_codex_client_carries_ai_anime_mcp_servers(tmp_path):
    overrides = chat_service._codex_mcp_config_overrides(
        chat_service._ai_anime_mcp_servers()
    )

    expected_command = json.dumps(__import__("sys").executable, ensure_ascii=False)
    assert f"mcp_servers.ai_anime.command={expected_command}" in overrides
    assert 'mcp_servers.ai_anime.args=["-m","ai_anime.chat.ai_anime_mcp"]' in overrides

    client = backend_sdk.CodexClient(
        codex_bin=Path("/usr/local/bin/codex"),
        cwd=tmp_path,
        env={"AI_ANIME_AGENT_TOKEN": "token"},
        model="gpt-5.4",
        config_overrides=overrides,
    )

    thread = client.thread_start()

    assert thread._config_overrides == overrides


def test_explicit_codex_does_not_fallback_when_unavailable(monkeypatch):
    monkeypatch.setenv("AI_ANIME_CHAT_BACKEND", "codex")
    monkeypatch.setattr(chat_service, "is_codex_backend_available", lambda: False)
    monkeypatch.setattr(chat_service, "is_hermes_backend_available", lambda: True)
    monkeypatch.setattr(chat_service, "is_claude_backend_available", lambda: True)

    with pytest.raises(RuntimeError, match="AI_ANIME_CHAT_BACKEND=codex requested"):
        chat_service._chat_backend()


def test_codex_backend_uses_sdk_runtime_by_default(monkeypatch):
    monkeypatch.delenv("CODEX_BIN", raising=False)
    monkeypatch.setattr(
        chat_service.importlib.util,
        "find_spec",
        lambda name: object() if name == "openai_codex" else None,
    )

    assert chat_service._codex_bin_path() is None
    assert chat_service.is_codex_backend_available() is True


def test_codex_backend_validates_explicit_binary(monkeypatch, tmp_path):
    missing_bin = tmp_path / "missing-codex"
    monkeypatch.setenv("CODEX_BIN", str(missing_bin))
    monkeypatch.setattr(
        chat_service.importlib.util,
        "find_spec",
        lambda name: object() if name == "openai_codex" else None,
    )

    assert chat_service._codex_bin_path() == missing_bin
    assert chat_service.is_codex_backend_available() is False


@pytest.mark.anyio
async def test_reingest_confirmation_reply_bypasses_agent_backend(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setattr(
        chat_service,
        "_chat_backend",
        lambda: pytest.fail("reingest confirmation should not call the agent backend"),
    )
    events = []

    async def on_event(event):
        events.append(event)

    result = await chat_service.stream_assistant_reply(
        "admin",
        "project-a",
        """创建视频

[AI_ANIME_REINGEST_CONFIRMATION]
stage: choose_overwrite
ai_anime_project_id: project-a
filename: novel.docx
[/AI_ANIME_REINGEST_CONFIRMATION]""",
        on_event,
    )

    assert "当前项目已有摄入内容" in result["content"]
    assert "覆盖" in result["content"]
    assert "新建项目" not in result["content"]
    assert [event["type"] for event in events] == ["assistant_delta", "done"]


@pytest.mark.anyio
async def test_reingest_final_confirmation_reply_bypasses_agent_backend(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setattr(
        chat_service,
        "_chat_backend",
        lambda: pytest.fail("reingest confirmation should not call the agent backend"),
    )

    async def on_event(event):
        pass

    result = await chat_service.stream_assistant_reply(
        "admin",
        "project-a",
        """覆盖

[AI_ANIME_REINGEST_CONFIRMATION]
stage: confirm_clear
ai_anime_project_id: project-a
filename: novel.docx
[/AI_ANIME_REINGEST_CONFIRMATION]""",
        on_event,
    )

    assert "会清空/重建当前项目已有角色" in result["content"]
    assert "确定" in result["content"]
    assert "新建项目" not in result["content"]


def test_prompt_injects_json_render_contract(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))

    prompt = chat_service._prompt_with_user_context(
        "admin",
        "project-a",
        "查看肖像图片，用 json-render 显示",
    )

    assert "[RENDERING_CONTRACT]" in prompt
    assert "才需要调用对应的 AI anime 展示工具" in prompt
    assert "不要向用户解释内部渲染格式、渲染机制、工具调用过程或工具名" in prompt
    assert "不要用文字列表、文件名列表、Beat 名称列表或 URL 列表替代媒体展示" in prompt
    assert "必须调用对应展示工具" in prompt
    assert "若没有工具返回的可展示媒体，只说明当前暂无可展示媒体" in prompt
    assert "后端会自动把工具结果渲染为 json-render" not in prompt
    assert "不要手写、复制或粘贴 <ui-spec> JSON" not in prompt
    assert "ai_anime_get_character_media" in prompt
    assert "ai_anime_get_sketches" in prompt
    assert "ai_anime_get_scene_images" in prompt
    assert "ai_anime_get_episode_media" in prompt
    assert (
        "只有在回复需要展示图片、肖像、身份图、草图、首帧、视频、音频等可视/可播放媒体时"
        in prompt
    )
    assert "media_json" in prompt
    assert "不要猜测、拼接或改写静态资源路径" in prompt
    assert "禁止自行编造 /static/projects/{project_id}/..." in prompt
    assert "portrait_url" in prompt
    assert "image_url" in prompt
    assert "video_url" in prompt
    assert "不要使用 *_path" in prompt
    assert "发送前自检" in prompt
    assert (
        "角色列表、剧集规划、项目进度、任务状态、脚本/beat 摘要、表格、长篇正文、普通结构化说明默认使用 markdown"
        in prompt
    )
    assert "不要为纯文本、进度、脚本、表格、角色/剧集清单调用媒体展示工具" in prompt
    assert prompt.rstrip().endswith("查看肖像图片，用 json-render 显示")


def test_project_media_uses_project_id_url_and_explicit_project_dir(tmp_path):
    project_dir = tmp_path / "output" / "admin" / "demo"
    image = project_dir / "frames" / "ep001" / "beat_01.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")

    media = chat_service._extract_media(
        "use frames/ep001/beat_01.png",
        "admin",
        "01KS_PROJECT_ID",
        project_dir=project_dir,
    )

    assert media == [
        {
            "kind": "image",
            "url": f"/static/projects/01KS_PROJECT_ID/frames/ep001/beat_01.png?v={image.stat().st_mtime_ns}",
            "path": "frames/ep001/beat_01.png",
            "label": "beat_01.png",
        }
    ]


def test_markdown_project_image_is_not_duplicated_as_media(tmp_path):
    project_dir = tmp_path / "output" / "admin" / "demo"
    image = project_dir / "frames" / "ep001" / "beat_01.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")

    media = chat_service._extract_media(
        "![frame](/static/projects/01KS_PROJECT_ID/frames/ep001/beat_01.png)",
        "admin",
        "01KS_PROJECT_ID",
        project_dir=project_dir,
    )

    assert media == []


def test_markdown_project_image_filters_normalized_media_item(tmp_path):
    project_dir = tmp_path / "output" / "admin" / "demo"
    image = project_dir / "frames" / "ep001" / "beat_01.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")
    url = f"/static/projects/01KS_PROJECT_ID/frames/ep001/beat_01.png?v={image.stat().st_mtime_ns}"

    media = chat_service._filter_markdown_duplicate_images(
        "![frame](/static/projects/01KS_PROJECT_ID/frames/ep001/beat_01.png)",
        [
            {
                "kind": "image",
                "url": url,
                "path": "frames/ep001/beat_01.png",
                "label": "beat_01.png",
            }
        ],
    )

    assert media == []


def test_project_chat_storage_uses_resolved_project_state_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AI_ANIME_OUTPUT_DIR", str(tmp_path / "output"))
    project_dir = tmp_path / "output" / "admin" / "demo"
    project_state_dir = tmp_path / "managed-state" / "projects" / "01KS_PROJECT_ID"
    project_dir.mkdir(parents=True)
    project_state_dir.mkdir(parents=True)

    chat_service.add_user_message(
        "admin",
        "01KS_PROJECT_ID",
        "hello",
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )

    assert (project_state_dir / "chat.db").exists()
    assert not (tmp_path / "state" / "admin" / "01KS_PROJECT_ID").exists()
    assert not (tmp_path / "output" / "admin" / "01KS_PROJECT_ID").exists()


def test_project_chat_storage_creates_missing_resolved_state_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    project_state_dir = tmp_path / "managed-state" / "missing-project"

    chat_service.add_user_message(
        "admin",
        "01KS_PROJECT_ID",
        "hello",
        project_state_dir=project_state_dir,
    )

    assert (project_state_dir / "chat.db").exists()
    assert not (tmp_path / "state" / "admin" / "01KS_PROJECT_ID").exists()


def test_project_history_hides_trace_messages(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AI_ANIME_OUTPUT_DIR", str(tmp_path / "output"))

    chat_service.add_user_message("admin", "project-a", "你好")
    chat_service.add_trace_message(
        "admin", "project-a", "→ ai_anime_pipeline_status\ncompleted"
    )
    chat_service.add_assistant_message("admin", "project-a", "你好！")

    messages = chat_service.list_messages("admin", "project-a")

    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert all(
        "ai_anime_pipeline_status" not in message["content"] for message in messages
    )


def test_project_history_defaults_to_last_50_messages(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AI_ANIME_OUTPUT_DIR", str(tmp_path / "output"))

    for index in range(60):
        chat_service.add_assistant_message("admin", "project-a", f"message-{index:02d}")

    messages = chat_service.list_messages("admin", "project-a")

    assert len(messages) == 50
    assert messages[0]["content"] == "message-10"
    assert messages[-1]["content"] == "message-59"


def test_json_render_reply_normalizer_unwraps_fenced_ui_spec():
    content = """请查看：

```json-render
<ui-spec>
{
  "type": "character_showcase",
  "root": "root",
  "elements": {
    "root": {
      "type": "Stack",
      "props": {},
      "children": ["portrait"]
    },
    "portrait": {
      "type": "Image",
      "props": {"src": "/static/projects/demo/portrait.png", "alt": "肖像"},
      "children": []
    }
  }
}
</ui-spec>
```"""

    normalized = chat_service._normalize_json_render_reply(content)

    assert "```" not in normalized
    assert '<ui-spec type="character_showcase">' in normalized
    assert '"type": "Image"' in normalized


def test_json_render_reply_normalizer_repairs_missing_trailing_brace():
    content = """<ui-spec>{"type":"character_showcase","root":"root","elements":{"root":{"type":"Stack","props":{},"children":[]}}</ui-spec>"""

    normalized = chat_service._normalize_json_render_reply(content)

    assert "格式校验失败" not in normalized
    assert '"elements": {' in normalized
    assert normalized.rstrip().endswith("</ui-spec>")


def test_json_render_reply_normalizer_repairs_legacy_component_children_props():
    content = """<ui-spec>
{
  "type": "script_overview",
  "root": "root",
  "elements": {
    "root": {
      "type": "Stack",
      "props": {"row": false, "gap": 12},
      "children": ["heading", "badge", "body"]
    },
    "heading": {
      "type": "Heading",
      "props": {"level": 3, "children": "第 1 集脚本概览"},
      "children": []
    },
    "badge": {
      "type": "Badge",
      "props": {"children": "completed", "variant": "success"},
      "children": []
    },
    "body": {
      "type": "Text",
      "props": {"children": "脚本已经生成完成。", "variant": "body"},
      "children": []
    }
  }
}
</ui-spec>"""

    normalized = chat_service._normalize_json_render_reply(content)

    assert "格式校验失败" not in normalized
    assert '"direction": "column"' in normalized
    assert '"content": "第 1 集脚本概览"' in normalized
    assert '"label": "completed"' in normalized
    assert '"content": "脚本已经生成完成。"' in normalized
    assert '"children": "脚本已经生成完成。"' not in normalized


def test_json_render_reply_normalizer_blocks_invalid_ui_spec():
    content = "<ui-spec>{not json}</ui-spec>"

    normalized = chat_service._normalize_json_render_reply(content)

    assert "<ui-spec>" not in normalized
    assert "格式校验失败" in normalized


def test_json_render_reply_normalizer_accepts_media_bundle_array():
    spec_a = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/portrait.png", "alt": "肖像"},
                "children": [],
            },
        },
    }
    spec_b = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }
    content = f'<ui-spec type="media_bundle">{json.dumps([spec_a, spec_b])}</ui-spec>'

    normalized = chat_service._normalize_json_render_reply(content)

    assert "格式校验失败" not in normalized
    assert normalized.count("<ui-spec") == 1
    assert '<ui-spec type="media_bundle">' in normalized
    assert '"type": "character_showcase"' in normalized
    assert '"type": "sketch_gallery"' in normalized


def test_json_render_reply_normalizer_wraps_embedded_canonical_json():
    spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }
    content = (
        f"已加载草图：\n\n{json.dumps(spec, ensure_ascii=False)}\n\n继续查看请告诉我。"
    )

    normalized = chat_service._normalize_json_render_reply(content)

    assert "已加载草图" in normalized
    assert "继续查看请告诉我" in normalized
    assert '<ui-spec type="sketch_gallery">' in normalized
    assert "/static/projects/demo/sketch.png" in normalized


def test_extract_tool_ui_specs_canonicalizes_tool_payload():
    payload = {
        "content": {
            "result": {
                "ok": True,
                "ui_spec": {
                    "type": "sketch_gallery",
                    "root": "root",
                    "elements": {
                        "root": {
                            "type": "Stack",
                            "props": {"row": True},
                            "children": ["image_1"],
                        },
                        "image_1": {
                            "type": "Image",
                            "props": {
                                "src": "/static/projects/demo/scene.png?v=1",
                                "alt": "场景",
                            },
                        },
                    },
                },
            }
        }
    }

    specs = chat_service._extract_tool_ui_specs(payload)

    assert len(specs) == 1
    assert specs[0]["type"] == "sketch_gallery"
    assert specs[0]["elements"]["root"]["props"]["direction"] == "row"
    assert specs[0]["elements"]["image_1"]["children"] == []


def test_extract_tool_ui_specs_parses_json_string_tool_result():
    payload = {
        "sessionUpdate": "tool_call_update",
        "content": json.dumps(
            {
                "ok": True,
                "ui_spec": {
                    "type": "sketch_gallery",
                    "root": "root",
                    "elements": {
                        "root": {
                            "type": "Stack",
                            "props": {"direction": "column"},
                            "children": ["image_1"],
                        },
                        "image_1": {
                            "type": "Image",
                            "props": {
                                "src": "/static/projects/demo/sketch.png?v=1",
                                "alt": "草图",
                            },
                        },
                    },
                },
            },
            ensure_ascii=False,
        ),
    }

    specs = chat_service._extract_tool_ui_specs(payload)

    assert len(specs) == 1
    assert specs[0]["type"] == "sketch_gallery"
    assert (
        specs[0]["elements"]["image_1"]["props"]["src"]
        == "/static/projects/demo/sketch.png?v=1"
    )


def test_extract_tool_chat_error_from_nested_tool_result_string():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": json.dumps(
            {
                "ok": True,
                "data": [
                    {
                        "status": "failed",
                        "error": "Content filter triggered. Finish reason: 'content_filter'",
                        "chat_error": "模型内容安全过滤拦截了本次文本生成，请调整原文后重试。",
                    }
                ],
            },
            ensure_ascii=False,
        ),
    }

    assert (
        chat_service._extract_tool_chat_error(payload)
        == "模型内容安全过滤拦截了本次文本生成，请调整原文后重试。"
    )


def test_extract_tool_chat_error_ignores_raw_provider_error_without_hint():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {
            "error": "Content filter triggered. Finish reason: 'content_filter'",
            "provider_response_id": "resp_123",
        },
    }

    assert chat_service._extract_tool_chat_error(payload) is None


def test_extract_tool_chat_error_maps_render_prereq_task_error():
    raw_error = (
        "Render 重生未生成可用图片（mode=1x1_2-3, beats=[1, 2, 3]）："
        "Render 模式需要草图但未找到覆盖 beat 1-1 的草图"
    )
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {
            "status": "failed",
            "error": raw_error,
        },
    }

    chat_error = chat_service._extract_tool_chat_error(payload)

    assert chat_error is not None
    assert "Render 任务没有生成可用图片" in chat_error
    assert "资产库" in chat_error
    assert raw_error in chat_error


def test_extract_tool_chat_error_maps_generic_failed_task_error():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {
            "status": "failed",
            "error": "上游下载失败 token=secret-token provider_response_id=resp_123",
        },
    }

    chat_error = chat_service._extract_tool_chat_error(payload)

    assert chat_error is not None
    assert chat_error.startswith("任务执行失败：")
    assert "上游下载失败" in chat_error
    assert "secret-token" not in chat_error
    assert "resp_123" not in chat_error


def test_extract_tool_chat_error_maps_ok_false_without_error_text():
    payload = {
        "sessionUpdate": "tool_call_update",
        "status": "completed",
        "result": {"ok": False},
    }

    assert (
        chat_service._extract_tool_chat_error(payload)
        == "任务执行失败：接口返回 ok=false，但没有提供具体错误原因。"
    )


def test_append_tool_ui_specs_adds_block_when_model_did_not_write_one():
    spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/portrait.png?v=1",
                    "alt": "肖像",
                },
                "children": [],
            },
        },
    }

    content = chat_service._append_tool_ui_specs("已展示肖像。", [spec])

    assert content.startswith("已展示肖像。")
    assert '<ui-spec type="character_showcase">' in content
    assert "/static/projects/demo/portrait.png?v=1" in content


def test_append_tool_ui_specs_ignores_placeholder_ui_spec_chatter():
    spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/portrait.png?v=1",
                    "alt": "肖像",
                },
                "children": [],
            },
        },
    }

    content = chat_service._append_tool_ui_specs(
        "\n".join(
            [
                "首先，调用ai_anime_get_character_media工具获取角色肖像信息：",
                "<ui-spec> JSON has been generated and will be automatically rendered by the backend.",
                "所有图片都已按规范渲染为UI画廊，您可以直接查看。",
                "如需查看其他内容，请告诉我。",
            ]
        ),
        [spec],
    )

    assert "ai_anime_get_character_media" not in content
    assert "automatically rendered" not in content
    assert "UI画廊" not in content
    assert "如需查看其他内容" in content
    assert '<ui-spec type="character_showcase">' in content
    assert "/static/projects/demo/portrait.png?v=1" in content


def test_append_tool_ui_specs_replaces_truncated_embedded_media_json():
    spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }
    truncated_json = (
        '{"type": "sketch_gallery", "root": "root", "elements": '
        '{"root": {"type": "Stack", "props": {}, "children": ["sketch"]}}'
    )

    content = chat_service._append_tool_ui_specs(
        f"已为您展示草图：\n\n{truncated_json}\n\n继续查看请告诉我。",
        [spec],
    )

    assert "已为您展示草图" in content
    assert "继续查看请告诉我" in content
    assert truncated_json not in content
    assert '<ui-spec type="sketch_gallery">' in content
    assert "/static/projects/demo/sketch.png" in content


def test_ui_spec_json_is_generated_before_wrapping_tags():
    spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/portrait.png?v=1",
                    "alt": "肖像",
                },
                "children": [],
            },
        },
    }

    spec_type, json_text = chat_service._ui_spec_json(spec)
    wrapped = chat_service._wrap_ui_spec_json(spec_type, json_text)

    assert spec_type == "character_showcase"
    assert "<ui-spec" not in json_text
    assert "</ui-spec>" not in json_text
    assert wrapped.startswith('<ui-spec type="character_showcase">')
    assert wrapped.endswith("</ui-spec>")


def test_append_tool_ui_specs_keeps_image_specs_separate_and_ordered():
    portrait_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/portrait.png?v=1",
                    "alt": "肖像",
                    "overlayTitle": "江念",
                },
                "children": [],
            },
        },
    }
    sketch_spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/sketch.png?v=1",
                    "alt": "草图",
                    "overlayTitle": "Beat 1 草图",
                },
                "children": [],
            },
        },
    }

    content = chat_service._append_tool_ui_specs(
        "已展示媒体。", [portrait_spec, sketch_spec]
    )

    assert content.count("<ui-spec") == 2
    assert '<ui-spec type="character_showcase">' in content
    assert '<ui-spec type="sketch_gallery">' in content
    assert '"type": "character_showcase"' in content
    assert '"type": "sketch_gallery"' in content
    assert content.index('<ui-spec type="character_showcase">') < content.index(
        '<ui-spec type="sketch_gallery">'
    )
    assert content.index("/static/projects/demo/portrait.png?v=1") < content.index(
        "/static/projects/demo/sketch.png?v=1"
    )


def test_append_tool_ui_specs_merges_adjacent_character_showcase_specs():
    first_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/jiang-nian.png?v=1",
                    "alt": "江念",
                    "overlayTitle": "江念",
                },
                "children": [],
            },
        },
    }
    second_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {
                    "src": "/static/projects/demo/luo-xi.png?v=1",
                    "alt": "洛曦",
                    "overlayTitle": "洛曦",
                },
                "children": [],
            },
        },
    }

    content = chat_service._append_tool_ui_specs(
        "已展示角色。", [first_spec, second_spec]
    )

    assert content.count('<ui-spec type="character_showcase">') == 1
    assert "/static/projects/demo/jiang-nian.png?v=1" in content
    assert "/static/projects/demo/luo-xi.png?v=1" in content
    assert '"portrait_2"' in content
    assert content.index("/static/projects/demo/jiang-nian.png?v=1") < content.index(
        "/static/projects/demo/luo-xi.png?v=1"
    )


def test_append_tool_ui_specs_merges_same_category_video_and_audio_specs():
    video_a = {
        "type": "keyframe_video",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["video"]},
            "video": {
                "type": "Video",
                "props": {"src": "/static/projects/demo/beat-1.mp4", "title": "Beat 1"},
                "children": [],
            },
        },
    }
    video_b = {
        "type": "keyframe_video",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["video"]},
            "video": {
                "type": "Video",
                "props": {"src": "/static/projects/demo/beat-2.mp4", "title": "Beat 2"},
                "children": [],
            },
        },
    }
    audio_a = {
        "type": "audio_list",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["audio"]},
            "audio": {
                "type": "Audio",
                "props": {"src": "/static/projects/demo/beat-1.mp3", "title": "Beat 1"},
                "children": [],
            },
        },
    }
    audio_b = {
        "type": "audio_list",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["audio"]},
            "audio": {
                "type": "Audio",
                "props": {"src": "/static/projects/demo/beat-2.mp3", "title": "Beat 2"},
                "children": [],
            },
        },
    }

    content = chat_service._append_tool_ui_specs(
        "已展示媒体。", [video_a, video_b, audio_a, audio_b]
    )

    assert content.count('<ui-spec type="keyframe_video">') == 1
    assert content.count('<ui-spec type="audio_list">') == 1
    assert content.index("/static/projects/demo/beat-1.mp4") < content.index(
        "/static/projects/demo/beat-2.mp4"
    )
    assert content.index("/static/projects/demo/beat-2.mp4") < content.index(
        "/static/projects/demo/beat-1.mp3"
    )
    assert content.index("/static/projects/demo/beat-1.mp3") < content.index(
        "/static/projects/demo/beat-2.mp3"
    )


def test_append_tool_ui_specs_keeps_same_src_across_different_categories():
    shared_src = "/static/projects/demo/shared.png?v=1"
    portrait_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {"src": shared_src, "alt": "肖像", "overlayTitle": "角色肖像"},
                "children": [],
            },
        },
    }
    sketch_spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": shared_src, "alt": "草图", "overlayTitle": "草图候选"},
                "children": [],
            },
        },
    }

    content = chat_service._append_tool_ui_specs(
        "已展示媒体。", [portrait_spec, sketch_spec]
    )

    assert content.count("<ui-spec") == 2
    assert content.count(shared_src) == 2
    assert "角色肖像" in content
    assert "草图候选" in content


def test_split_ui_specs_from_text_extracts_model_written_blocks():
    spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["image"]},
            "image": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }
    content = (
        "以下是草图：\n\n"
        f"<ui-spec>{json.dumps(spec, ensure_ascii=False)}</ui-spec>\n\n"
        "展示完成。"
    )

    text, specs = chat_service._split_ui_specs_from_text(content)

    assert "<ui-spec" not in text
    assert text == "以下是草图：\n\n展示完成。"
    assert len(specs) == 1
    assert specs[0]["type"] == "sketch_gallery"
    assert specs[0]["elements"]["image"]["children"] == []


def test_append_tool_ui_specs_does_not_duplicate_existing_ui_spec():
    existing_spec = {
        "type": "character_showcase",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["portrait"]},
            "portrait": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/portrait.png", "alt": "肖像"},
                "children": [],
            },
        },
    }
    tool_spec = {
        "type": "sketch_gallery",
        "root": "root",
        "elements": {
            "root": {"type": "Stack", "props": {}, "children": ["sketch"]},
            "sketch": {
                "type": "Image",
                "props": {"src": "/static/projects/demo/sketch.png", "alt": "草图"},
                "children": [],
            },
        },
    }

    content = chat_service._append_tool_ui_specs(
        f"已有展示\n<ui-spec>{json.dumps(existing_spec, ensure_ascii=False)}</ui-spec>",
        [tool_spec],
    )

    assert content.count("<ui-spec") == 1
    assert "已有展示" in content
    assert "/static/projects/demo/portrait.png" in content
    assert "/static/projects/demo/sketch.png" not in content
