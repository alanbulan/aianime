import json
from types import SimpleNamespace

import pytest

from ai_anime.api.routes import chat as chat_routes
from ai_anime.chat import service as chat_service


@pytest.fixture
def anyio_backend():
    return "asyncio"


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


@pytest.mark.anyio
async def test_reingest_confirmation_reply_bypasses_agent_backend(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setattr(
        chat_service.agent_backend,
        "name",
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
        chat_service.agent_backend,
        "name",
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


def test_project_history_keeps_text_and_media_projection(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    project_dir = tmp_path / "output" / "admin" / "show-1"
    image = project_dir / "images" / "frame.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")

    chat_service.add_assistant_message(
        "admin",
        "show-1",
        "第一段",
        project_dir=project_dir,
    )
    chat_service.add_assistant_message(
        "admin",
        "show-1",
        "第一段第二段\nimages/frame.png",
        project_dir=project_dir,
    )

    messages = chat_service.list_messages(
        "admin",
        "show-1",
        project_dir=project_dir,
    )

    assert [message["content"] for message in messages] == [
        "第一段",
        "第二段\nimages/frame.png",
    ]
    assert [item["path"] for item in messages[-1]["media"]] == ["images/frame.png"]


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
