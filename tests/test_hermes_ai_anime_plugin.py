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


def test_start_ingest_uses_active_text_and_embedding_assignments(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        if method == "GET":
            return {
                "ok": True,
                "status_code": 200,
                "data": {
                    "roleDefaults": {
                        "TEXT": "cloud-text",
                        "EMBEDDING": "cloud-embedding",
                    }
                },
            }
        return {"ok": True, "status_code": 200, "task_id": "task-1"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_start_ingest(
        {"filename": "小说.txt", "spine_template": "drama"}
    )

    assert result["ok"] is True
    assert calls == [
        ("GET", "/api/v1/model-gateway/config", None),
        (
            "POST",
            "/api/v1/projects/project-1/ingest/start",
            {
                "filename": "小说.txt",
                "textModel": "cloud-text",
                "embeddingModel": "cloud-embedding",
                "rebuild": False,
                "spine_template": "drama",
            },
        ),
    ]


def test_start_ingest_stops_before_post_when_a_model_role_is_missing(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[str] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append(method)
        return {
            "ok": True,
            "status_code": 200,
            "data": {"roleDefaults": {"TEXT": "cloud-text"}},
        }

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_start_ingest({"filename": "小说.txt"})

    assert result["ok"] is False
    assert result["error"] == "ingest_model_assignment_missing"
    assert "向量嵌入" in result["chat_error"]
    assert calls == ["GET"]


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
