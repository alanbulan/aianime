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


def test_question_tool_blocks_on_canonical_decision_endpoint(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(
        method: str,
        path: str,
        *,
        query=None,
        body=None,
        timeout_seconds=None,
    ):
        calls.append((method, path, body, timeout_seconds))
        return {
            "ok": True,
            "data": {
                "decision_id": "decision-1",
                "status": "resolved",
                "answers": [
                    {
                        "question_id": "resolution",
                        "option_id": "1080p",
                        "value": "1080p",
                    }
                ],
            },
        }

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_question(
        {
            "title": "生成前确认",
            "source": "workflow_preflight",
            "questions": [
                {
                    "id": "resolution",
                    "header": "分辨率",
                    "question": "本次视频使用哪种分辨率？",
                    "options": [
                        {
                            "id": "1080p",
                            "label": "1080p",
                            "description": "画质优先，耗时和成本更高。",
                        },
                        {
                            "id": "720p",
                            "label": "720p",
                            "description": "速度与画质更均衡。",
                        },
                    ],
                    "recommended_option_id": "1080p",
                }
            ],
        }
    )

    assert result["data"]["answers"][0]["value"] == "1080p"
    assert calls == [
        (
            "POST",
            "/api/v1/chat/decisions",
            {
                "title": "生成前确认",
                "source": "workflow_preflight",
                "questions": [
                    {
                        "id": "resolution",
                        "header": "分辨率",
                        "question": "本次视频使用哪种分辨率？",
                        "options": [
                            {
                                "id": "1080p",
                                "label": "1080p",
                                "description": "画质优先，耗时和成本更高。",
                            },
                            {
                                "id": "720p",
                                "label": "720p",
                                "description": "速度与画质更均衡。",
                            },
                        ],
                        "recommended_option_id": "1080p",
                        "allow_custom": False,
                    }
                ],
                "project_id": "project-1",
            },
            ai_anime_plugin.DECISION_TIMEOUT_SECONDS,
        )
    ]


def test_question_tool_keeps_bound_project_authoritative(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-bound")
    bodies: list[dict] = []

    def fake_request(method: str, path: str, *, body=None, **_kwargs):
        assert (method, path) == ("POST", "/api/v1/chat/decisions")
        bodies.append(body)
        return {"ok": True}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_question(
        {
            "project_id": "project-other",
            "questions": [
                {
                    "header": "范围",
                    "question": "使用当前项目吗？",
                    "options": [
                        {"label": "当前项目", "description": "使用已绑定项目。"},
                        {"label": "取消", "description": "停止当前操作。"},
                    ],
                }
            ],
        }
    )

    assert result["ok"] is True
    assert bodies[0]["project_id"] == "project-bound"


def test_question_tool_rejects_ambiguous_or_unstructured_input(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *_args, **_kwargs: pytest.fail("invalid question must not reach API"),
    )

    missing_options = ai_anime_plugin._handle_question(
        {
            "questions": [
                {
                    "header": "模式",
                    "question": "请选择生成模式",
                    "options": [{"label": "多参", "description": "使用参考素材。"}],
                }
            ]
        }
    )
    long_header = ai_anime_plugin._handle_question(
        {
            "questions": [
                {
                    "header": "这是一个超过十二个字符的标题",
                    "question": "请选择生成模式",
                    "options": [
                        {"label": "多参", "description": "使用参考素材。"},
                        {"label": "首尾帧", "description": "约束运动起止。"},
                    ],
                }
            ]
        }
    )

    assert "2 to 3 options" in missing_options["tool_error"]
    assert "1 to 12 characters" in long_header["tool_error"]


def test_question_tool_is_registered_in_hermes_acp(ai_anime_plugin) -> None:
    schemas = {
        name: schema
        for name, schema, _handler in ai_anime_plugin.TOOLS
        if name == "question"
    }

    assert ai_anime_plugin.REGISTER_TOOLSETS == ("hermes-acp",)
    assert schemas["question"]["parameters"]["required"] == ["questions"]
    assert (
        "maxItems"
        not in schemas["question"]["parameters"]["properties"]["questions"]
    )


def test_question_tool_accepts_more_than_three_questions(ai_anime_plugin) -> None:
    questions = [
        {
            "id": f"choice_{index}",
            "header": f"参数{index}",
            "question": f"请选择参数 {index}",
            "options": [
                {"id": "recommended", "label": "推荐值", "description": "采用推荐值。"},
                {"id": "alternative", "label": "备选值", "description": "采用备选值。"},
            ],
        }
        for index in range(1, 6)
    ]

    assert len(ai_anime_plugin._normalize_decision_questions(questions)) == 5


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
        {
            "filename": "小说.txt",
            "spine_template": "drama",
            "visual_style": "anime",
            "ethnicity": "Japanese",
        }
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
                "visual_style": "anime",
                "ethnicity": "Japanese",
            },
        ),
    ]


def test_start_ingest_schema_only_requires_filename(ai_anime_plugin) -> None:
    parameters = next(
        schema["parameters"]
        for name, schema, _handler in ai_anime_plugin.TOOLS
        if name == "ai_anime_start_ingest"
    )

    assert parameters["required"] == ["filename"]


def test_build_characters_uses_same_endpoint_as_character_panel(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_type": "build_characters", "task_id": "task-1"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_build_characters({})

    assert result["ok"] is True
    assert calls == [
        ("POST", "/api/v1/projects/project-1/characters/build", None),
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


@pytest.mark.parametrize("options", [{}, {"script_mode": "duration", "target_duration_total": 60, "target_beats": 12}])
def test_generate_script_runs_missing_prerequisites_through_one_graph(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
    options,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_type": "script_workflow", "task_id": "graph-1"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    schema = next(schema for name, schema, _ in ai_anime_plugin.TOOLS if name == "ai_anime_generate_script")
    assert options.keys() <= schema["parameters"]["properties"].keys()
    result = ai_anime_plugin._handle_generate_script({"episode": 2, **options})

    assert result["task_type"] == "script_workflow"
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/workflow/scripts",
            {
                "mode": "through",
                "target": "script",
                "episodes": [2],
                **options,
            },
        )
    ]


def test_generate_portrait_forwards_only_explicit_model_overrides(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_type": "character_portrait"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_generate_portrait(
        {"name": "白石夏音", "model": "byok:provider-1:image-model-lite"}
    )

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/characters/%E7%99%BD%E7%9F%B3%E5%A4%8F%E9%9F%B3/portrait-async",
            {"model": "byok:provider-1:image-model-lite"},
        )
    ]


def test_generate_portrait_forwards_explicit_ethnicity_override(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[object] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append(body)
        return {"ok": True}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    assert ai_anime_plugin._handle_generate_portrait(
        {"name": "白石夏音", "ethnicity": "Japanese"}
    )["ok"]
    assert calls == [{"ethnicity": "Japanese"}]


def test_generate_portrait_omits_body_to_use_global_priority(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[object] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append(body)
        return {"ok": True}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    assert ai_anime_plugin._handle_generate_portrait({"name": "白石夏音"})["ok"]
    assert calls == [None]


@pytest.mark.parametrize(
    ("handler_name", "path"),
    [
        ("_handle_generate_scene_master", "master/generate-async"),
        ("_handle_generate_scene_reverse", "reverse/generate-async"),
    ],
)
def test_scene_tools_omit_model_to_use_global_role_route(
    ai_anime_plugin, monkeypatch: pytest.MonkeyPatch, handler_name: str, path: str,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(method: str, endpoint: str, *, query=None, body=None):
        calls.append((method, endpoint, body))
        return {"ok": True, "task_id": "scene-run", "task_type": "scene_reference_asset"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)
    result = getattr(ai_anime_plugin, handler_name)({"name": "Hall"})
    assert result["ok"] is True
    assert calls == [("POST", f"/api/v1/projects/project-1/scenes/Hall/{path}", None)]


def test_design_character_voices_uses_dedicated_priority_route(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {
            "ok": True,
            "data": {
                "generated": ["佐仓美咲", "神谷莲"],
                "skipped_existing": ["藤原悠真"],
            },
        }

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_design_character_voices(
        {"names": ["神谷莲", "佐仓美咲"]}
    )

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/characters/voices/design-missing",
            {"character_names": ["佐仓美咲", "神谷莲"]},
        )
    ]
    assert any(
        name == "ai_anime_design_character_voices"
        for name, _schema, _handler in ai_anime_plugin.TOOLS
    )
    schema = next(
        schema
        for name, schema, _handler in ai_anime_plugin.TOOLS
        if name == "ai_anime_design_character_voices"
    )
    assert "shorter than 1.8 seconds" in schema["description"]
    assert "Usable existing voices are preserved" in schema["description"]
    assert "must never call ai_anime_run_production_workflow" in schema["description"]
    assert schema["parameters"]["properties"]["replace_existing"] == {
        "type": "boolean",
        "description": (
            "Set true only when the user explicitly asks to redesign/replace the "
            "named characters' existing voices. Requires name or names."
        ),
    }


def test_design_character_voices_replacement_requires_explicit_names(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("unscoped replacement must not reach the API")
        ),
    )

    result = ai_anime_plugin._handle_design_character_voices(
        {"replace_existing": True}
    )

    assert "names is required" in result["tool_error"]


def test_design_character_voices_replaces_only_explicit_names(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "data": {"generated": ["佐仓美咲"]}}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_design_character_voices(
        {"names": ["佐仓美咲"], "replace_existing": True}
    )

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/characters/voices/design-missing",
            {"character_names": ["佐仓美咲"], "replace_existing": True},
        )
    ]


def test_portrait_tools_expose_optional_model_override_contract(
    ai_anime_plugin,
) -> None:
    schemas = {
        name: schema["parameters"]
        for name, schema, _handler in ai_anime_plugin.TOOLS
        if name in {"ai_anime_generate_portrait", "ai_anime_generate_identity_image"}
    }

    assert set(schemas) == {
        "ai_anime_generate_portrait",
        "ai_anime_generate_identity_image",
    }
    assert "model" in schemas["ai_anime_generate_portrait"]["properties"]
    assert "model" not in schemas["ai_anime_generate_portrait"]["required"]
    assert "ethnicity" in schemas["ai_anime_generate_portrait"]["properties"]
    assert (
        "IMAGE_GENERATION"
        in schemas["ai_anime_generate_portrait"]["properties"]["model"]["description"]
    )
    assert (
        "IMAGE_EDIT"
        in schemas["ai_anime_generate_identity_image"]["properties"]["model"][
            "description"
        ]
    )


def test_upload_style_preview_schema_has_no_project_parameter(
    ai_anime_plugin,
) -> None:
    parameters = next(
        schema["parameters"]
        for name, schema, _handler in ai_anime_plugin.TOOLS
        if name == "ai_anime_upload_style_preview"
    )

    assert set(parameters["properties"]) == {"style_id", "attachment_path"}


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
            "video_resolution": "720p",
            "add_subtitles": True,
            "add_bgm": False,
        }
    )

    assert result["task_type"] == "production_workflow"
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/workflow/production",
            {
                "video_routing_policy": "role_priority",
                "episodes": [1, 2],
                "rebuild": True,
                "target_beats": 12,
                "max_parallel": 4,
                "video_resolution": "720p",
                "add_subtitles": True,
                "add_bgm": False,
            },
        )
    ]


def test_complete_generation_allows_an_explicit_user_model_override(
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
            "episodes": [1],
            "rebuild": False,
            "video_model": "byok:provider-a:video-model-reference",
            "video_resolution": "720p",
            "add_subtitles": True,
            "add_bgm": False,
        }
    )

    assert result["task_type"] == "production_workflow"
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/workflow/production",
            {
                "video_routing_policy": "project_selection",
                "video_model": "byok:provider-a:video-model-reference",
                "episodes": [1],
                "rebuild": False,
                "video_resolution": "720p",
                "add_subtitles": True,
                "add_bgm": False,
            },
        )
    ]


def test_complete_generation_uses_bound_project_instead_of_model_supplied_id(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-bound")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_type": "production_workflow"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_run_production_workflow(
        {
            "project_id": "project-typo",
            "episodes": [1],
            "rebuild": False,
            "video_resolution": "720p",
            "add_subtitles": True,
            "add_bgm": False,
        }
    )

    assert result["task_type"] == "production_workflow"
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-bound/workflow/production",
            {
                "video_routing_policy": "role_priority",
                "episodes": [1],
                "rebuild": False,
                "video_resolution": "720p",
                "add_subtitles": True,
                "add_bgm": False,
            },
        )
    ]


def test_complete_generation_preflight_resolves_every_missing_user_choice(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(
        method: str,
        path: str,
        *,
        query=None,
        body=None,
        timeout_seconds=None,
    ):
        calls.append((method, path, body, timeout_seconds))
        if path == "/api/v1/chat/decisions":
            answers = {
                "episodes": "all_planned",
                "rebuild": "preserve",
                "video_resolution": "provider_default",
                "add_subtitles": "yes",
                "add_bgm": "yes",
            }
            return {
                "ok": True,
                "data": {
                    "answers": [
                        {
                            "question_id": question["id"],
                            "value": answers[question["id"]],
                        }
                        for question in body["questions"]
                    ]
                },
            }
        return {"ok": True, "task_type": "production_workflow"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_run_production_workflow({})

    assert result["task_type"] == "production_workflow"
    decision_calls = [call for call in calls if call[1] == "/api/v1/chat/decisions"]
    assert [
        [question["id"] for question in call[2]["questions"]]
        for call in decision_calls
    ] == [
        ["episodes", "rebuild", "video_resolution", "add_subtitles", "add_bgm"],
    ]
    assert all(
        call[3] == ai_anime_plugin.DECISION_TIMEOUT_SECONDS
        for call in decision_calls
    )
    assert calls[-1] == (
        "POST",
        "/api/v1/projects/project-1/workflow/production",
        {
            "video_routing_policy": "role_priority",
            "rebuild": False,
            "add_subtitles": True,
            "add_bgm": True,
        },
        None,
    )


def test_complete_generation_uses_recommended_defaults_without_duplicate_questions(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(
        method: str,
        path: str,
        *,
        query=None,
        body=None,
        timeout_seconds=None,
    ):
        calls.append((method, path, body, timeout_seconds))
        assert path != "/api/v1/chat/decisions"
        return {"ok": True, "task_type": "production_workflow"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_run_production_workflow(
        {"use_recommended_defaults": True}
    )

    assert result["task_type"] == "production_workflow"
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/workflow/production",
            {
                "video_routing_policy": "role_priority",
                "rebuild": False,
                "add_subtitles": True,
                "add_bgm": True,
            },
            None,
        )
    ]


def test_new_story_production_preflight_collects_creative_parameters(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    decision_batches = []
    production_bodies = []
    selected = {
        "spine_template": "narrated",
        "visual_style": "realistic",
        "ethnicity": "Japanese",
        "target_episodes": "2",
        "planning_mode": "ai_events",
        "script_mode": "duration",
        "narration_style": "third_person",
        "target_duration_total": "90",
    }

    def fake_request(
        method: str,
        path: str,
        *,
        query=None,
        body=None,
        timeout_seconds=None,
    ):
        if path == "/api/v1/chat/decisions":
            ids = [question["id"] for question in body["questions"]]
            decision_batches.append(ids)
            return {
                "ok": True,
                "data": {
                    "answers": [
                        {"question_id": question_id, "value": selected[question_id]}
                        for question_id in ids
                    ]
                },
            }
        production_bodies.append(body)
        return {"ok": True, "task_type": "production_workflow"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_run_production_workflow(
        {
            "filename": "story.txt",
            "episodes": [1],
            "rebuild": False,
            "video_resolution": "720p",
            "add_subtitles": True,
            "add_bgm": False,
        }
    )

    assert result["task_type"] == "production_workflow"
    assert decision_batches == [
        [
            "spine_template",
            "visual_style",
            "ethnicity",
            "target_episodes",
            "planning_mode",
            "script_mode",
        ],
        ["narration_style", "target_duration_total"],
    ]
    assert production_bodies == [
        {
            "video_routing_policy": "role_priority",
            "episodes": [1],
            "filename": "story.txt",
            "rebuild": False,
            "spine_template": "narrated",
            "visual_style": "realistic",
            "narration_style": "third_person",
            "ethnicity": "Japanese",
            "target_episodes": 2,
            "planning_mode": "ai_events",
            "script_mode": "duration",
            "target_duration_total": 90,
            "video_resolution": "720p",
            "add_subtitles": True,
            "add_bgm": False,
        }
    ]


def test_first_frame_regeneration_requires_explicit_scope(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("missing scope must not submit a regeneration task")
        ),
    )

    result = ai_anime_plugin._handle_render_first_frames({"episode": 1})

    assert "beat_indices is required" in result["tool_error"]
    assert "ai_anime_run_production_workflow" in result["tool_error"]


def test_first_frame_regeneration_uses_explicit_beats(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_type": "selected_regen"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_render_first_frames(
        {"episode": 1, "beat_indices": [5, 2, 5]}
    )

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/episodes/1/beats/regenerate",
            {"beat_indices": [2, 5]},
        )
    ]


def test_first_frame_regeneration_requires_explicit_all_beats_opt_in(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str, object]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        if method == "GET":
            return {"data": [{"beat_number": 1}, {"beat_number": 3}]}
        return {"ok": True, "task_type": "selected_regen"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_render_first_frames(
        {"episode": 1, "all_beats": True}
    )

    assert result["ok"] is True
    assert calls == [
        ("GET", "/api/v1/projects/project-1/episodes/1/beats", None),
        (
            "POST",
            "/api/v1/projects/project-1/episodes/1/beats/regenerate",
            {"beat_indices": [1, 3]},
        ),
    ]
    schema = next(
        schema
        for name, schema, _handler in ai_anime_plugin.TOOLS
        if name == "ai_anime_render_first_frames"
    )
    assert schema["parameters"]["properties"]["all_beats"]["type"] == "boolean"


@pytest.mark.parametrize("mode_key", ["1x1_16-9", "1x1_9-16"])
@pytest.mark.parametrize("padding", [False, True])
def test_first_frame_regeneration_preserves_model_selection(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
    mode_key,
    padding,
) -> None:
    from ai_anime.api.routes.production.render_schemas import BeatsRegenerateRequest

    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    requests = []

    def fake_request(method: str, path: str, *, body=None):
        assert method == "POST"
        assert path == "/api/v1/projects/project-1/episodes/1/beats/regenerate"
        requests.append(BeatsRegenerateRequest.model_validate(body))
        return {"ok": True}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_render_first_frames(
        {
            "episode": 1,
            "beat_indices": [2],
            "image_generation_selection": "image-route",
            "mode_key": mode_key,
            "sketch_aspect_padding": padding,
        }
    )

    assert result["ok"] is True
    assert requests[0].image_generation_selection == "image-route"
    assert requests[0].mode_key == mode_key
    assert requests[0].sketch_aspect_padding is padding
    schema = next(schema for name, schema, _ in ai_anime_plugin.TOOLS if name == "ai_anime_render_first_frames")
    assert {"mode_key", "sketch_aspect_padding"} <= schema["parameters"]["properties"].keys()


@pytest.mark.parametrize("tool_name, suffix", [
    ("ai_anime_generate_sketches", "sketches/regenerate"),
    ("ai_anime_render_first_frames", "beats/regenerate"),
])
@pytest.mark.parametrize("selectors, expected", [
    ({"beat": 3}, [3]),
    ({"beat": 3, "beat_indices": [5, 5]}, [3, 5]),
])
def test_regeneration_tools_accept_single_beats_without_expanding_scope(
    ai_anime_plugin, monkeypatch, tool_name, suffix, selectors, expected
):
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(method, path, **kwargs):
        calls.append((method, path, kwargs.get("body")))
        return {"ok": True}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)
    schema, handler = next((schema, handler) for name, schema, handler in ai_anime_plugin.TOOLS if name == tool_name)
    result = handler({"episode": 1, **selectors})

    assert result["ok"] is True
    assert calls[-1][1] == f"/api/v1/projects/project-1/episodes/1/{suffix}"
    assert calls[-1][2]["beat_indices"] == expected
    assert "beat" in schema["parameters"]["properties"]


@pytest.mark.parametrize("add_subtitles", [False, True])
@pytest.mark.parametrize("add_bgm", [False, True])
def test_compose_episode_preserves_export_settings(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
    add_subtitles: bool,
    add_bgm: bool,
) -> None:
    from ai_anime.api.routes.production.video_schemas import VideoComposeRequest

    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    requests = []

    def fake_request(method: str, path: str, *, body=None):
        assert method == "POST"
        assert path == "/api/v1/projects/project-1/episodes/1/videos/compose"
        requests.append(VideoComposeRequest.model_validate(body))
        return {"ok": True}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_compose_episode(
        {
            "episode": 1,
            "add_subtitles": add_subtitles,
            "add_bgm": add_bgm,
            "resolution": "1920x1080",
        }
    )

    assert result["ok"] is True
    assert requests[0].add_subtitles is add_subtitles
    assert requests[0].add_bgm is add_bgm
    assert requests[0].resolution == "1920x1080"
    assert requests[0].model_fields_set == {
        "add_subtitles",
        "add_bgm",
        "resolution",
    }


@pytest.mark.parametrize("language", [None, "zh", "en"])
def test_global_video_optimization_preserves_language_and_backend_default(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
    language: str | None,
) -> None:
    from ai_anime.api.routes.production.video_schemas import GlobalOptimizeRequest

    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    requests = []

    def fake_request(method: str, path: str, *, body=None):
        assert method == "POST"
        assert path == "/api/v1/projects/project-1/episodes/1/optimize/video-global"
        requests.append(GlobalOptimizeRequest.model_validate(body or {}))
        return {"ok": True}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_optimize_video_global(
        {"episode": 1, **({"language": language} if language is not None else {})}
    )

    assert result["ok"] is True
    assert requests[0].language == (language or GlobalOptimizeRequest().language)
    assert requests[0].model_fields_set == ({"language"} if language else set())


def test_video_prompt_optimization_tool_forwards_panel_text_contract(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.api.routes.narrative_planning.scripts_schemas import (
        VideoPromptGenerateRequest,
    )

    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    requests: list[dict] = []

    def fake_request(method: str, path: str, *, body=None):
        assert method == "POST"
        assert path == (
            "/api/v1/projects/project-1/episodes/1/beats/2/"
            "video-prompt/optimize"
        )
        VideoPromptGenerateRequest.model_validate(body)
        requests.append(body)
        return {"ok": True, "task_key": "task:video_prompt_optimization:2"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_optimize_video_prompt(
        {
            "episode": 1,
            "beat": 2,
            "manual_prompt_reference": "",
            "prompt_guidance": "保持主体动作连贯",
        }
    )
    omitted_result = ai_anime_plugin._handle_optimize_video_prompt(
        {"episode": 1, "beat": 2}
    )

    assert result["ok"] is True
    assert omitted_result["ok"] is True
    assert requests == [
        {
            "manual_prompt_reference": "",
            "prompt_guidance": "保持主体动作连贯",
        },
        {},
    ]


def test_media_tool_options_match_backend_schema(ai_anime_plugin) -> None:
    from ai_anime.api.routes.narrative_planning.scripts_schemas import (
        VideoPromptGenerateRequest,
    )
    from ai_anime.api.routes.production.render_schemas import BeatsRegenerateRequest
    from ai_anime.api.routes.production.video_schemas import (
        GlobalOptimizeRequest,
        SingleVideoRequest,
        VideoComposeRequest,
    )

    tool_schemas = {
        name: schema["parameters"]["properties"]
        for name, schema, _handler in ai_anime_plugin.TOOLS
    }
    options = [
        (
            "ai_anime_render_first_frames",
            BeatsRegenerateRequest,
            "image_generation_selection",
        ),
        ("ai_anime_compose_episode", VideoComposeRequest, "add_subtitles"),
        ("ai_anime_compose_episode", VideoComposeRequest, "add_bgm"),
        ("ai_anime_compose_episode", VideoComposeRequest, "resolution"),
        ("ai_anime_optimize_video_global", GlobalOptimizeRequest, "language"),
        (
            "ai_anime_optimize_video_prompt",
            VideoPromptGenerateRequest,
            "prompt_guidance",
        ),
        ("ai_anime_start_single_video", SingleVideoRequest, "duration"),
    ]
    for tool_name, request_model, field in options:
        backend_field = request_model.model_json_schema()["properties"][field]
        backend_types = {
            item["type"] for item in backend_field.get("anyOf", [backend_field])
        } - {"null"}
        assert tool_schemas[tool_name][field]["type"] in backend_types


def test_single_video_tool_exposes_all_backend_generation_parameters(ai_anime_plugin) -> None:
    from ai_anime.api.routes.production.video_schemas import SingleVideoRequest

    schema = next(
        schema for name, schema, _handler in ai_anime_plugin.TOOLS
        if name == "ai_anime_start_single_video"
    )
    fields = {
        key: value for key, value in schema["parameters"]["properties"].items()
        if key not in {"project_id", "episode", "beat"}
    }
    backend_fields = SingleVideoRequest.model_json_schema()["properties"]
    assert set(fields) == set(backend_fields) - {"video_routing_policy"}
    for field, declaration in fields.items():
        backend = backend_fields[field]
        assert declaration["type"] in {
            option["type"] for option in backend.get("anyOf", [backend])
        }


def test_hermes_tools_only_expose_canonical_parameter_names(
    ai_anime_plugin,
) -> None:
    properties = {
        name: set(schema["parameters"]["properties"])
        for name, schema, _handler in ai_anime_plugin.TOOLS
    }

    assert "body" not in properties["ai_anime_generate_sketches"]
    assert "character" not in properties["ai_anime_update_character_face_prompt"]
    assert "scene_name" not in properties["ai_anime_generate_scene_master"]
    assert "scene_name" not in properties["ai_anime_generate_scene_reverse"]
    assert "scene_name" not in properties["ai_anime_get_scene_images"]
    assert "identity_name" not in properties["ai_anime_get_character_media"]
    assert "search" not in properties["ai_anime_get_episode_media"]
    assert "beat_number" not in properties["ai_anime_optimize_video_prompt"]
    assert "beat_number" not in properties["ai_anime_start_single_video"]


def test_hermes_parameter_helpers_do_not_accept_hidden_aliases(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AI_ANIME_PROJECT_ID", raising=False)

    assert ai_anime_plugin._requested_beats(
        {"beats": [1], "beat_num": 2, "beat_number": 3, "index": 4}
    ) is None
    assert ai_anime_plugin._requested_names({"character": "Ada"}) is None
    assert ai_anime_plugin._requested_queries(
        {"queries": ["Ada"], "search": "pilot", "identity_name": "uniform"}
    ) is None
    assert ai_anime_plugin._requested_scene_names(
        {"scene_names": ["Hall"], "scene_name": "Street"}
    ) is None
    assert ai_anime_plugin._requested_scene_indices({"indices": [1]}) is None
    with pytest.raises(ValueError, match="project_id is required"):
        ai_anime_plugin._project_from_args({"project": "legacy-project"})


def test_bound_project_remains_authoritative_for_dedicated_tools(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-bound")

    assert (
        ai_anime_plugin._project_from_args({"project_id": "other-project"})
        == "project-bound"
    )


def test_single_video_tool_forwards_full_config_and_false_values(
    ai_anime_plugin, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.api.routes.production.video_schemas import SingleVideoRequest

    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    requests = []

    def request(method, path, *, body):
        assert method == "POST"
        assert path == "/api/v1/projects/project-1/episodes/1/beats/2/video"
        requests.append(SingleVideoRequest.model_validate(body))
        return {"ok": True}

    monkeypatch.setattr(ai_anime_plugin, "_request", request)
    overrides = {
        "duration": 9,
        "resolution": "1080p",
        "mode": "multimodal_reference",
        "ratio": "9:16",
        "use_director_render": False,
        "video_config_json": '{"final_prompt":"原提示词","generate_audio":true}',
        "final_prompt": "本次最终提示词",
        "generate_audio": False,
        "return_last_frame": False,
        "human_review": False,
        "scene_optimize": "",
        "audio_setting": "",
        "prompt_guidance": "保持人物和画面居中",
        "text_overlay": {},
    }
    result = ai_anime_plugin._handle_start_single_video(
        {"episode": 1, "beat": 2, **overrides}
    )

    assert result == {"ok": True}
    assert requests[0].model_dump(exclude_unset=True) == {
        **overrides, "video_routing_policy": "role_priority",
    }


def test_single_video_tool_does_not_override_saved_config_with_omitted_values(
    ai_anime_plugin, monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = []
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(
        ai_anime_plugin, "_request",
        lambda method, path, *, body: calls.append(body) or {"ok": True},
    )
    ai_anime_plugin._handle_start_single_video(
        {"episode": 1, "beat": 2, "ratio": None, "final_prompt": None, "generate_audio": None}
    )
    assert calls == [{"video_routing_policy": "role_priority"}]


def test_single_video_tool_rejects_a_selector_without_its_model(
    ai_anime_plugin, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(
        ai_anime_plugin, "_request",
        lambda *_args, **_kwargs: pytest.fail("incomplete selection must not start generation"),
    )
    result = ai_anime_plugin._handle_start_single_video(
        {"episode": 1, "beat": 2, "model_selector": "cloud:video-route"}
    )
    assert result == {"tool_error": "model is required when model_selector is provided"}


def test_web_and_tool_single_video_requests_reach_the_same_application_command(
    ai_anime_plugin, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from ai_anime.api.routes.production import video as production_video
    from ai_anime.modules.production.application.single_video import ScheduledSingleVideo

    commands = []
    context = object()

    async def resolve(*_args, **_kwargs):
        return type("Resolution", (), {"ctx": context})()

    class UseCases:
        async def generate(self, resolved_context, command):
            assert resolved_context is context
            commands.append(command)
            return ScheduledSingleVideo(
                task_id="task-1",
                task_key="task:single_video:project:project-1:1:2",
                backend="celery",
                queue="node.local.video",
                episode_num=1,
                beat_num=2,
            )

    monkeypatch.setattr(production_video, "resolve_project_scope", resolve)
    monkeypatch.setattr(production_video, "single_video_use_cases", lambda: UseCases())
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    app = FastAPI()
    app.include_router(production_video.router, prefix="/api/v1")
    app.dependency_overrides[production_video.get_api_user] = lambda: {"username": "alice"}
    parameters = {
        "model": "selected-video-model",
        "model_selector": "cloud:selected-video-route",
        "use_director_render": False,
        "duration": 8,
        "resolution": "720p",
        "mode": "multimodal_reference",
        "ratio": "9:16",
        "video_config_json": '{"final_prompt":"同一最终提示词","generate_audio":false}',
        "audio_setting": "",
    }
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/projects/project-1/episodes/1/beats/2/video",
            json={**parameters, "video_routing_policy": "project_selection"},
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True

        def request(method, path, *, body):
            result = client.request(method, path, json=body)
            assert result.status_code == 200
            return result.json()

        monkeypatch.setattr(ai_anime_plugin, "_request", request)
        result = ai_anime_plugin._handle_start_single_video(
            {"episode": 1, "beat": 2, **parameters}
        )

    assert result["ok"] is True
    assert len(commands) == 2
    assert commands[1] == commands[0]


def test_bound_project_rewrites_generic_paths_and_hides_project_schema_field(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-bound")

    assert (
        ai_anime_plugin._normalize_api_path("/projects/project-typo/pipeline/status")
        == "/api/v1/projects/project-bound/pipeline/status"
    )
    schema = ai_anime_plugin._schema(
        "bound_tool",
        "Bound project tool",
        {
            "project_id": {"type": "string"},
            "episode": {"type": "integer"},
        },
        ["project_id", "episode"],
    )
    assert schema["parameters"] == {
        "type": "object",
        "properties": {"episode": {"type": "integer"}},
        "required": ["episode"],
        "additionalProperties": False,
    }


def test_bound_project_rejects_global_project_summaries_collection(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-bound")

    with pytest.raises(ValueError, match="project-bound assistant session"):
        ai_anime_plugin._normalize_api_path("/projects/summaries")


def test_normalize_api_path_encodes_unicode_segments_without_double_encoding(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-bound")

    expected = (
        "/api/v1/projects/project-bound/characters/"
        "%E7%99%BD%E7%9F%B3%E5%A4%8F%E9%9F%B3"
    )
    assert (
        ai_anime_plugin._normalize_api_path(
            "/projects/project-typo/characters/白石夏音"
        )
        == expected
    )
    assert ai_anime_plugin._normalize_api_path(expected) == expected


def test_generic_get_canonicalizes_episode_identity_collection(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[str] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        assert method == "GET"
        calls.append(path)
        if path.endswith("/characters"):
            return {
                "ok": True,
                "status_code": 200,
                "data": [{"name": "白石夏音", "role": "主角"}],
            }
        return {
            "ok": True,
            "status_code": 200,
            "data": [
                {
                    "identity_id": "白石夏音_学生时期",
                    "identity_name": "学生时期",
                    "appearance_details": "校服",
                    "age_group": "youth",
                    "image_url": "",
                }
            ],
        }

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_get(
        {"path": "/projects/project-1/episodes/1/identities"}
    )

    assert result["ok"] is True
    assert result["media_count"] == 0
    assert result["characters"][0]["identities"] == [
        {
            "title": "学生时期",
            "identity_id": "白石夏音_学生时期",
            "identity_name": "学生时期",
            "appearance_details": "校服",
            "age_group": "youth",
            "image_url": "",
        }
    ]
    assert calls == [
        "/api/v1/projects/project-1/characters",
        "/api/v1/projects/project-1/characters/%E7%99%BD%E7%9F%B3%E5%A4%8F%E9%9F%B3/identities",
    ]


def test_generic_get_canonicalizes_episode_scene_collection(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[tuple[str, str]] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path))
        return {"ok": True, "status_code": 200, "data": []}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_get(
        {"path": "/projects/project-1/episodes/1/scenes"}
    )

    assert result["ok"] is True
    assert calls == [("GET", "/api/v1/projects/project-1/scenes")]


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


def test_generic_post_cannot_bypass_role_priority_single_video_tool(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("generic POST must not start single-video generation")
        ),
    )

    result = ai_anime_plugin._handle_post(
        {
            "path": "/projects/project-1/episodes/1/beats/2/video",
            "body": {"model": "cloud:stale-video"},
        }
    )

    assert "ai_anime_start_single_video" in result["tool_error"]
    assert "role-priority" in result["tool_error"]


@pytest.mark.parametrize(
    "path",
    [
        "/projects/project-1/episodes/1/beats/2/video-prompt/optimize",
        "/projects/project-1/episodes/1/beats/2/video-prompt/%6fptimize",
    ],
)
def test_generic_post_cannot_bypass_video_prompt_optimization_tool(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
    path: str,
) -> None:
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *args, **kwargs: pytest.fail(
            "generic POST must not optimize a beat video prompt"
        ),
    )

    result = ai_anime_plugin._handle_post({"path": path, "body": {}})

    assert "ai_anime_optimize_video_prompt" in result["tool_error"]


@pytest.mark.parametrize(
    "path",
    [
        "/projects/project-1/episodes/1/beats/2/vide%6f",
        "/projects/project-1/episodes/1/beats/2/%76ideo",
        "/projects/project-1/inges%74/start",
        "/projects/project-1/episodes/1/beats/2/%2e%2e/video",
    ],
)
def test_generic_post_cannot_bypass_path_guards_with_percent_encoding(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
    path: str,
) -> None:
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *args, **kwargs: pytest.fail(
            "percent-encoded protected path must not reach the API"
        ),
    )

    result = ai_anime_plugin._handle_post({"path": path, "body": {}})

    assert result["tool_error"]


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
            "image_generation_selection": "image-route",
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
            {},
        ),
        (
            "POST",
            "/api/v1/projects/project-1/episodes/1/beats/2/video",
            {"model": "video-route", "video_routing_policy": "project_selection"},
        ),
        (
            "POST",
            "/api/v1/projects/project-1/episodes/1/videos/compose",
            {},
        ),
    ]


def test_sketch_tool_replaces_only_when_explicitly_requested(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls: list[dict] = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append(body)
        return {"ok": True, "message": "started"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    ai_anime_plugin._handle_generate_sketches(
        {
            "episode": 1,
            "auto_assign_colors": False,
            "grid_index": 4,
            "replace_existing": True,
        }
    )

    assert calls == [
        {
            "grid_index": 4,
            "sketch_scene_grouping": True,
            "aspect_ratio": "2:3",
            "replace_existing": True,
        }
    ]


def test_sketch_tool_uses_frontend_selected_regeneration_contract(
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
            "beat_indices": [6, 2, 6],
            "aspect_ratio": "16:9",
            "image_generation_selection": "image-route",
        }
    )

    assert calls == [
        (
            "POST",
            "/api/v1/projects/project-1/episodes/1/sketches/regenerate",
            {
                "beat_indices": [2, 6],
                "mode_key": "1x1_16-9_sketch",
                "image_generation_selection": "image-route",
            },
        )
    ]


def test_sketch_tool_rejects_unscoped_full_overwrite(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("unscoped overwrite must not call the backend")
        ),
    )

    result = ai_anime_plugin._handle_generate_sketches(
        {
            "episode": 1,
            "auto_assign_colors": False,
            "replace_existing": True,
        }
    )

    assert "requires beat_indices" in result["tool_error"]


@pytest.mark.parametrize("scope", [{"beat_indices": [2]}, {"all_beats": True}])
@pytest.mark.parametrize(
    ("options", "error_field"),
    [
        ({"grid_index": -1}, "grid_index"),
        ({"sketch_scene_grouping": False}, "sketch_scene_grouping"),
        ({"replace_existing": False}, "replace_existing"),
        ({"mode_key": "1x1_2-3_sketch", "aspect_ratio": "16:9"}, "aspect_ratio"),
    ],
)
def test_sketch_tool_rejects_incompatible_branch_options_before_requests(
    ai_anime_plugin, monkeypatch, scope, options, error_field
):
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(*args, **kwargs):
        calls.append((args, kwargs))
        return {"ok": True, "data": [{"beat_number": 2}]}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_generate_sketches(
        {"episode": 1, **scope, **options}
    )

    assert error_field in result["tool_error"]
    assert calls == []


@pytest.mark.parametrize("mode_key", ["1x1_2-3_sketch", "1x1_16-9_sketch", "1x1_9-16_sketch", "1x1_1-1_sketch"])
def test_sketch_tool_preserves_explicit_regeneration_mode_and_replacement(
    ai_anime_plugin, monkeypatch, mode_key
):
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []
    monkeypatch.setattr(
        ai_anime_plugin, "_request", lambda method, path, **kwargs: calls.append((path, kwargs.get("body"))) or {"ok": True}
    )

    result = ai_anime_plugin._handle_generate_sketches({
        "episode": 1, "beat_indices": [2], "mode_key": mode_key,
        "replace_existing": True, "auto_assign_colors": False,
    })

    assert result["ok"] is True
    assert calls == [(
        "/api/v1/projects/project-1/episodes/1/sketches/regenerate",
        {"beat_indices": [2], "mode_key": mode_key},
    )]


def test_sketch_tool_rejects_regeneration_mode_without_regeneration_scope(
    ai_anime_plugin, monkeypatch
):
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []
    monkeypatch.setattr(
        ai_anime_plugin, "_request", lambda *args, **kwargs: calls.append((args, kwargs)) or {"ok": True}
    )

    result = ai_anime_plugin._handle_generate_sketches(
        {"episode": 1, "mode_key": "1x1_16-9_sketch"}
    )

    assert "mode_key" in result["tool_error"]
    assert calls == []


@pytest.mark.parametrize("handler", ["_handle_generate_sketches", "_handle_render_first_frames"])
@pytest.mark.parametrize("selectors", [{"beat_indices": [2]}, {"beat": 2}])
def test_regeneration_rejects_conflicting_scopes_without_backend_calls(
    ai_anime_plugin, monkeypatch, handler, selectors
):
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []
    monkeypatch.setattr(
        ai_anime_plugin, "_request", lambda *args, **kwargs: calls.append((args, kwargs)) or {"ok": True}
    )

    result = getattr(ai_anime_plugin, handler)(
        {"episode": 1, **selectors, "all_beats": True}
    )

    assert "not both" in result["tool_error"]
    assert calls == []


@pytest.mark.parametrize(
    ("handler", "result_key"),
    [
        ("_handle_get_sketches", "sketches"),
        ("_handle_get_first_frames", "frames"),
        ("_handle_get_episode_media", "beats"),
    ],
)
@pytest.mark.parametrize(
    ("selectors", "expected"),
    [
        ({"beat": 2}, [2]),
        ({"beat_indices": [3, 1, 3]}, [1, 3]),
        ({"beat": 2, "beat_indices": [3, 2]}, [2, 3]),
    ],
)
def test_media_tools_merge_single_and_multiple_beat_selectors(
    ai_anime_plugin, monkeypatch, handler, result_key, selectors, expected
):
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(ai_anime_plugin, "_request", lambda *args, **kwargs: {
        "data": [{"beat_number": number} for number in range(1, 5)]
    })

    result = getattr(ai_anime_plugin, handler)({"episode": 1, **selectors})

    assert [item["beat_number"] for item in result[result_key]] == expected


def test_scene_media_combines_name_and_index_filters(ai_anime_plugin, monkeypatch):
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(ai_anime_plugin, "_request", lambda *args, **kwargs: {
        "data": [{"name": name} for name in ["Hall", "Street", "Hall upstairs", "Garden"]]
    })

    result = ai_anime_plugin._handle_get_scene_images({
        "name": "Hall", "names": ["Street", "Hall"],
        "index": 2, "scene_indices": [1, 2, 4],
    })

    assert [item["name"] for item in result["scenes"]] == ["Hall", "Street"]


@pytest.mark.parametrize(
    ("selectors", "expected"),
    [
        ({"name": "Ada", "names": ["Bob", "Ada"]}, ["Ada", "Bob"]),
        ({"query": "pilot"}, ["Ada"]),
        ({"name": "pilot"}, []),
        ({"names": ["Ada", "Bob"], "query": "pilot"}, ["Ada"]),
    ],
)
def test_character_media_distinguishes_names_from_description_search(
    ai_anime_plugin, monkeypatch, selectors, expected
):
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(ai_anime_plugin, "_request", lambda *args, **kwargs: {
        "data": [{"name": "Ada", "role": "pilot"}, {"name": "Bob", "role": "doctor"}]
    })

    result = ai_anime_plugin._handle_get_character_media({"media_kind": "portrait", **selectors})

    assert [item["name"] for item in result["characters"]] == expected


def test_voice_design_merges_explicit_name_selectors(ai_anime_plugin, monkeypatch):
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []
    monkeypatch.setattr(
        ai_anime_plugin, "_request", lambda *args, **kwargs: calls.append(kwargs["body"]) or {"ok": True}
    )

    result = ai_anime_plugin._handle_design_character_voices({
        "name": "Ada", "names": ["Bob", "Ada"], "replace_existing": True,
    })

    assert result["ok"] is True
    assert calls == [{"character_names": ["Ada", "Bob"], "replace_existing": True}]


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


def test_generate_style_preview_default_covers_character_and_environment(
    ai_anime_plugin,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(method: str, path: str, *, query=None, body=None):
        calls.append((method, path, body))
        return {"ok": True, "task_id": "task-1"}

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_generate_style_preview({"style_id": "custom_abc"})

    assert result["ok"] is True
    assert calls == [
        (
            "POST",
            "/api/v1/styles/custom_abc/preview",
            {
                "project": "project-1",
                "prompt": "An anonymous adult character in a representative everyday environment",
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

    result = ai_anime_plugin._handle_get({"path": "/api/v1/styles/custom_abc"})

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
            raise AssertionError(
                "binary response body must not be decoded into tool text"
            )

    monkeypatch.setattr(
        ai_anime_plugin, "urlopen", lambda *_args, **_kwargs: Response()
    )

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
    monkeypatch.setattr(
        ai_anime_plugin, "_request", lambda *_args, **_kwargs: next(responses)
    )
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


def test_wait_task_timeout_reports_non_terminal_without_resubmission(
    ai_anime_plugin,
    monkeypatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *_args, **_kwargs: {
            "ok": True,
            "status_code": 200,
            "data": {"status": "running"},
        },
    )
    original_monotonic = ai_anime_plugin.time.monotonic
    monotonic_calls = 0

    def advanced_monotonic() -> float:
        nonlocal monotonic_calls
        monotonic_calls += 1
        return original_monotonic() + (2.0 if monotonic_calls > 1 else 0.0)

    monkeypatch.setattr(
        ai_anime_plugin.time,
        "monotonic",
        advanced_monotonic,
    )

    result = ai_anime_plugin._handle_wait_task(
        {
            "task_key": "task:script_workflow:project:project-1:0",
            "timeout_seconds": 1,
        }
    )

    assert result["wait"] == {
        "terminal": False,
        "status": "running",
        "attempts": 1,
        "elapsed_seconds": pytest.approx(2.0, abs=0.1),
        "timed_out": True,
    }
    assert "不是任务失败" in result["agent_instruction"]
    assert "同一个 task_key" in result["agent_instruction"]


def test_wait_task_stops_after_three_missing_snapshots(
    ai_anime_plugin,
    monkeypatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    requests = []

    def missing_request(*args, **kwargs):
        requests.append((args, kwargs))
        return {"ok": True, "status_code": 200, "data": None}

    monkeypatch.setattr(ai_anime_plugin, "_request", missing_request)
    monkeypatch.setattr(ai_anime_plugin.time, "sleep", lambda _seconds: None)

    result = ai_anime_plugin._handle_wait_task(
        {"task_key": "task:missing", "timeout_seconds": 240}
    )

    assert len(requests) == 3
    assert result["ok"] is False
    assert result["wait"]["terminal"] is True
    assert result["wait"]["status"] == "not_found"
    assert result["wait"]["timed_out"] is False


@pytest.mark.parametrize(
    ("args", "query"),
    [
        (
            {"episode": 1, "task_type": "single_video", "status": "running"},
            {"episode": 1, "task_type": "single_video", "status": "running"},
        ),
        ({"episode": 0, "status": " RUNNING "}, {"episode": 0, "status": " RUNNING "}),
        ({"episode": None, "task_type": None, "status": None}, {}),
        ({}, {}),
    ],
)
def test_list_tasks_forwards_filters_to_backend(
    ai_anime_plugin,
    monkeypatch,
    args,
    query,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    calls = []

    def fake_request(method, path, *, query=None, body=None):
        calls.append((method, path, query, body))
        return {
            "ok": True,
            "status_code": 200,
            "data": [
                {"episode": 1, "task_type": "single_video", "status": "running"},
            ],
        }

    monkeypatch.setattr(ai_anime_plugin, "_request", fake_request)

    result = ai_anime_plugin._handle_list_tasks(args)

    assert calls == [("GET", "/api/v1/projects/project-1/tasks", query, None)]
    assert result["data"] == [
        {"episode": 1, "task_type": "single_video", "status": "running"}
    ]


def test_hermes_production_tools_match_openapi_request_fields(
    ai_anime_plugin,
    monkeypatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_DESKTOP_MODE", raising=False)
    monkeypatch.delenv("AI_ANIME_DESKTOP_TOKEN", raising=False)

    from ai_anime.api.app import create_app

    openapi = create_app().openapi()
    components = openapi["components"]["schemas"]

    def request_properties(path: str) -> set[str]:
        schema = openapi["paths"][path]["post"]["requestBody"]["content"][
            "application/json"
        ]["schema"]
        reference = schema["$ref"].rsplit("/", 1)[-1]
        return set(components[reference].get("properties", {}))

    tool_schemas = {
        name: schema["parameters"]["properties"]
        for name, schema, _handler in ai_anime_plugin.TOOLS
    }
    production_fields = request_properties(
        "/api/v1/projects/{project}/workflow/production"
    )
    audio_fields = request_properties(
        "/api/v1/projects/{project}/episodes/{episode_num}/audio/generate"
    )

    assert (
        set(tool_schemas["ai_anime_run_production_workflow"])
        - {"project_id", "use_recommended_defaults"}
        <= production_fields
    )
    assert (
        set(tool_schemas["ai_anime_generate_audio"]) - {"project_id", "episode"}
        <= audio_fields
    )
    assert "audio_model" not in tool_schemas["ai_anime_run_production_workflow"]
    assert "video_model" in tool_schemas["ai_anime_run_production_workflow"]
    assert "model" not in tool_schemas["ai_anime_generate_audio"]
    assert "model" in tool_schemas["ai_anime_start_single_video"]
    assert "model_selector" in tool_schemas["ai_anime_start_single_video"]


def test_generate_audio_treats_no_required_audio_as_successful_skip(
    ai_anime_plugin,
    monkeypatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_PROJECT_ID", "project-1")
    monkeypatch.setattr(
        ai_anime_plugin,
        "_request",
        lambda *args, **kwargs: {
            "ok": False,
            "code": "audio_generation_not_required",
            "error": "没有需要生成的音频",
        },
    )

    result = ai_anime_plugin._handle_generate_audio({"episode": 1})

    assert result["ok"] is True
    assert result["skipped"] is True
    assert result["code"] == "audio_generation_not_required"


def test_voice_design_failure_reports_automatic_route_without_manual_only_claim(
    ai_anime_plugin,
) -> None:
    result = ai_anime_plugin._with_chat_error_hints(
        {
            "ok": False,
            "code": "voice_design_failed",
            "error": "夏栀·青年时期自动文字声线生成失败：上游服务暂不可用",
        }
    )

    assert "云端/BYOK 优先级" in result["chat_error"]
    assert "上游服务暂不可用" in result["chat_error"]
    assert "Do not claim upload or recording is the only solution" in result[
        "agent_instruction"
    ]
