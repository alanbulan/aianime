from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest


@pytest.fixture
def ai_anime_plugin(monkeypatch: pytest.MonkeyPatch):
    registry = ModuleType("tools.registry")
    registry.tool_result = lambda value: value
    registry.tool_error = lambda value: {"tool_error": value}
    tools = ModuleType("tools")
    tools.__path__ = []
    tools.registry = registry
    monkeypatch.setitem(sys.modules, "tools", tools)
    monkeypatch.setitem(sys.modules, "tools.registry", registry)

    plugin_path = (
        Path(__file__).resolve().parents[1]
        / ".hermes"
        / "plugins"
        / "ai_anime"
        / "__init__.py"
    )
    spec = importlib.util.spec_from_file_location(
        "test_ai_anime_hermes_plugin",
        plugin_path,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def complete_style_config(**overrides):
    config = {
        "label": "日系二次元",
        "style_instructions": "clean anime linework, soft palette, cinematic lighting",
        "avoid_instructions": "photorealistic, 3D CGI, text, watermark",
        "style_tag": "JAPANESE 2D ANIME",
        "style_family": "animation",
        "animation_subtype": "2d",
    }
    config.update(overrides)
    return config


def test_start_ingest_uses_canonical_workflow_endpoint(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "status_code": 200, "task_id": "task-1"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_start_ingest(
        {"filename": "小说.txt", "spine_template": "drama"}
    )

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/workflow/scripts",
            {
                "mode": "single",
                "target": "ingest",
                "filename": "小说.txt",
                "rebuild": False,
                "spine_template": "drama",
            },
        ),
    ]


def test_generic_post_rejects_ingest_start(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unexpected_request(*_args, **_kwargs):
        raise AssertionError("generic POST must not call ingest/start")

    monkeypatch.setattr(ai_anime_plugin, "_request", unexpected_request)

    result = ai_anime_plugin._handle_post(
        {"path": "/projects/project-1/ingest/start", "body": {}}
    )

    assert "ai_anime_start_ingest" in result["tool_error"]


def test_generate_script_runs_missing_prerequisites_through_one_graph(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_type": "script_workflow", "task_id": "graph-1"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_generate_script({"episode": 2})

    assert result["task_type"] == "script_workflow"
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/workflow/scripts",
            {
                "mode": "through",
                "target": "script",
                "episodes": [2],
            },
        )
    ]


def test_whole_script_workflow_supports_all_episodes_and_parallel_limit(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_type": "script_workflow"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_run_script_workflow(
        {"target": "script", "mode": "through", "max_parallel": 6}
    )

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/workflow/scripts",
            {"mode": "through", "target": "script", "max_parallel": 6},
        )
    ]


def test_complete_generation_uses_one_canonical_production_endpoint(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_type": "production_workflow"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_run_production_workflow(
        {
            "episodes": [1, 2],
            "rebuild": True,
            "target_beats": 12,
            "max_parallel": 4,
        }
    )

    assert result["task_type"] == "production_workflow"
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/workflow/production",
            {
                "episodes": [1, 2],
                "rebuild": True,
                "target_beats": 12,
                "max_parallel": 4,
            },
        )
    ]


def test_generic_post_cannot_bypass_production_workflow_tool(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("generic POST must not start production")
        ),
    )

    result = ai_anime_plugin._handle_post(
        {"path": "/projects/project-1/workflow/production", "body": {}}
    )

    assert "ai_anime_run_production_workflow" in result["tool_error"]


def test_media_handlers_send_current_backend_contract_fields(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "message": "started"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    ai_anime_plugin._handle_generate_sketches(
        {
            "episode": 1,
            "auto_assign_colors": False,
            "model": "image-route",
            "body": {"unsupported": True},
        }
    )
    ai_anime_plugin._handle_generate_audio(
        {"episode": 1, "model": "audio-route", "provider": "ignored"}
    )
    ai_anime_plugin._handle_start_single_video(
        {"episode": 1, "beat": 2, "model": "video-route"}
    )
    ai_anime_plugin._handle_compose_episode({"episode": 1})

    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/episodes/1/sketches/generate",
            {
                "grid_index": -1,
                "sketch_scene_grouping": True,
                "aspect_ratio": "2:3",
                "image_generation_selection": "image-route",
            },
        ),
        (
            "POST",
            "/api/v1/projects/project-1/episodes/1/audio/generate",
            {"model": "audio-route"},
        ),
        (
            "POST",
            "/api/v1/projects/project-1/episodes/1/beats/2/video",
            {"model": "video-route"},
        ),
        (
            "POST",
            "/api/v1/projects/project-1/episodes/1/videos/compose",
            {},
        ),
    ]


def test_create_style_tool_saves_account_style_with_canonical_config(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "status_code": 200, "data": {"id": "custom_abc"}}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_create_style(
        {
            "name": "Japanese 2D Anime",
            "config": complete_style_config(),
        }
    )

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/styles",
            {
                "name": "Japanese 2D Anime",
                "config": complete_style_config(),
            },
        )
    ]


def test_create_style_tool_refuses_to_overwrite_existing_style(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, query, body))
        return {
            "ok": False,
            "status_code": 200,
            "error": "style_already_exists",
            "message": "Style 'custom_existing' already exists",
        }

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_create_style(
        {
            "id": "custom_existing",
            "name": "已有风格",
            "config": complete_style_config(),
            "create_preview": True,
        }
    )

    assert result["ok"] is False
    assert result["error"] == "style_already_exists"
    assert "ai_anime_generate_style_preview" in result["chat_error"]
    assert calls == [
        (
            "POST",
            "/api/v1/styles",
            None,
            {
                "id": "custom_existing",
                "name": "已有风格",
                "config": complete_style_config(),
            },
        )
    ]


def test_generic_style_post_uses_same_canonical_handler(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    captured: list[dict] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        captured.append(body)
        return {"ok": True, "status_code": 200, "data": {"id": "custom_abc"}}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_post(
        {
            "path": "/api/v1/styles",
            "body": {
                "name": "日系二次元",
                "config": complete_style_config(),
            },
        }
    )

    assert result["ok"] is True
    assert captured == [
        {
            "name": "日系二次元",
            "config": complete_style_config(),
        }
    ]


def test_generic_style_preview_post_uses_canonical_task_endpoint(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, query, body))
        return {"ok": True, "task_id": "task-1"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_post(
        {
            "path": "/api/v1/styles/custom_existing/preview",
            "body": {"project": "project-1"},
        }
    )

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/styles/custom_existing/preview",
            None,
            {"project": "project-1"},
        )
    ]


def test_create_style_can_generate_reference_through_canonical_task_route(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        if path == "/api/v1/styles":
            return {"ok": True, "data": {"id": "custom_abc"}}
        return {
            "ok": True,
            "data": {
                "style_id": "custom_abc",
                "preview_path": "assets/styles/custom_abc/reference.png",
            },
        }

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_create_style(
        {
            "name": "日系二次元",
            "config": complete_style_config(),
            "create_preview": True,
            "preview_prompt": "清新校园日系二次元风格参考图",
        }
    )

    assert result["ok"] is True
    assert result["data"]["style"]["id"] == "custom_abc"
    assert calls[-1:] == [
        (
            "POST",
            "/api/v1/styles/custom_abc/preview",
            {
                "project": "project-1",
                "prompt": "清新校园日系二次元风格参考图",
            },
        ),
    ]


def test_generate_style_preview_default_matches_upstream_preset_subject(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_id": "task-1"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_generate_style_preview(
        {"style_id": "custom_abc"}
    )

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/styles/custom_abc/preview",
            {
                "project": "project-1",
                "prompt": "A beautiful woman standing in a garden",
            },
        )
    ]


def test_create_style_can_upload_current_chat_image(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setenv("AI_ANIME_PROJECT_OUTPUT_DIR", str(tmp_path))
    image = tmp_path / "uploads" / "assistant" / "reference.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")
    multipart_calls = []

    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *args, **kwargs: {"ok": True, "data": {"id": "custom_abc"}},
    )

    def fake_multipart(method, path, *, fields, file_path, file_field="file"):
        multipart_calls.append((method, path, fields, file_path, file_field))
        return {
            "ok": True,
            "data": {"preview_path": "assets/styles/custom_abc/reference.png"},
        }

    monkeypatch.setattr(ai_anime_plugin, "_request_multipart_file", fake_multipart)

    result = ai_anime_plugin._handle_create_style(
        {
            "name": "上传参考图风格",
            "config": complete_style_config(),
            "attachment_path": "uploads/assistant/reference.png",
        }
    )

    assert result["ok"] is True
    assert multipart_calls == [
        (
            "PUT",
            "/api/v1/styles/custom_abc/preview",
            {},
            image,
            "file",
        )
    ]


def test_upload_style_preview_rejects_paths_outside_chat_attachments(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setenv("AI_ANIME_PROJECT_OUTPUT_DIR", str(tmp_path))

    result = ai_anime_plugin._handle_upload_style_preview(
        {"style_id": "custom_abc", "attachment_path": "../secret.png"}
    )

    assert "project-relative" in result["tool_error"]


def test_style_preview_tools_are_registered(ai_anime_plugin) -> None:
    names = {name for name, _schema, _handler in ai_anime_plugin.TOOLS}

    assert "ai_anime_generate_style_preview" in names
    assert "ai_anime_upload_style_preview" in names
    assert "ai_anime_wait_task" in names


def test_create_style_rejects_unknown_or_incomplete_config_without_writing(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *_args, **_kwargs: pytest.fail("invalid config must not reach the API"),
    )

    unknown = ai_anime_plugin._handle_create_style(
        {
            "name": "错误字段",
            "config": {
                **complete_style_config(),
                "line_art": "clean",
            },
        }
    )
    incomplete = ai_anime_plugin._handle_create_style(
        {"name": "缺少字段", "config": {"style_family": "animation"}}
    )

    assert "line_art" in unknown["tool_error"]
    assert "style_instructions" in incomplete["tool_error"]


def test_generic_style_get_uses_account_scope(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, query, body))
        return {"ok": True, "status_code": 200, "data": {"id": "custom_abc"}}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_get(
        {"path": "/api/v1/styles/custom_abc"}
    )

    assert result["ok"] is True
    assert calls == [
        (
            "GET",
            "/api/v1/styles/custom_abc",
            None,
            None,
        )
    ]


def test_binary_style_preview_get_returns_metadata_without_decoding_image(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_API_URL", "http://127.0.0.1:8000")
    monkeypatch.setenv("AI_ANIME_AGENT_TOKEN", "token")

    class Headers:
        @staticmethod
        def get_content_type():
            return "image/png"

        @staticmethod
        def get(name):
            return "2048" if name == "Content-Length" else None

    class Response:
        status = 200
        headers = Headers()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        @staticmethod
        def read():
            raise AssertionError("binary response body must not be decoded into tool text")

    monkeypatch.setattr(ai_anime_plugin, "urlopen", lambda *_args, **_kwargs: Response())

    result = ai_anime_plugin._request(
        "GET",
        "/api/v1/styles/custom_abc/preview",
        query={"project": "project-1"},
    )

    assert result == {
        "ok": True,
        "status_code": 200,
        "data": {"media_type": "image/png", "content_length": 2048},
    }


def test_wait_task_polls_until_completed(ai_anime_plugin, monkeypatch) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    responses = iter(
        [
            {"ok": True, "status_code": 200, "data": {"status": "running"}},
            {"ok": True, "status_code": 200, "data": {"status": "completed"}},
        ]
    )
    monkeypatch.setattr(ai_anime_plugin, "_request", lambda *_args, **_kwargs: next(responses))
    monkeypatch.setattr(ai_anime_plugin.time, "sleep", lambda _seconds: None)

    result = ai_anime_plugin._handle_wait_task(
        {
            "task_key": "task:character_portrait:project:project-1:0",
            "timeout_seconds": 10,
        }
    )

    assert result["data"]["status"] == "completed"
    assert result["wait"]["terminal"] is True
    assert result["wait"]["attempts"] == 2
