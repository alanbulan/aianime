from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.api.routes.creative_canvas import jobs as freezone_job_routes
from ai_anime.modules.creative_canvas.application.job_results import (
    CreativeCanvasJobResultQueries,
)
from ai_anime.modules.creative_canvas.domain.text_generation import (
    build_creative_canvas_story_script_task,
    build_creative_canvas_translation_task,
)
from ai_anime.modules.creative_canvas.infrastructure.job_results import (
    LocalCreativeCanvasJobResultReader,
)
from ai_anime.modules.creative_canvas.public import (
    generate_creative_canvas_story_script,
    translate_creative_canvas_text,
)


def _patch_project_resolution(
    monkeypatch: pytest.MonkeyPatch,
    project_dir: Path,
    task_manager: object,
    *,
    username: str = "admin",
):
    async def _fake_resolve(
        project: str,
        user: dict,
        *,
        required_role: str,
        operation: str,
    ):
        assert user == {"username": username}
        assert required_role == "viewer"
        assert operation == "access freezone project files"
        return SimpleNamespace(
            ctx=SimpleNamespace(
                project_id="proj_freezone",
                owner_username=username,
                project_name=project,
            ),
            project_dir=project_dir,
        )

    queries = CreativeCanvasJobResultQueries(
        LocalCreativeCanvasJobResultReader(task_manager_factory=lambda: task_manager)
    )
    monkeypatch.setattr(freezone_job_routes, "resolve_project_scope", _fake_resolve)
    monkeypatch.setattr(
        freezone_job_routes,
        "creative_canvas_job_result_queries",
        lambda: queries,
    )


def test_build_creative_canvas_translation_task_mentions_languages_and_node_type() -> None:
    task = build_creative_canvas_translation_task(
        text="手持镜头，雨夜街头，人物缓慢向前走。",
        node_type="video",
    )

    assert "视频节点提示词" in task
    assert "Simplified Chinese" in task
    assert "English" in task
    assert "You must decide whether the dominant natural language" in task
    assert "手持镜头" in task


@pytest.mark.asyncio
async def test_translate_creative_canvas_text_trusts_model_detected_direction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    class FakeAgent:
        async def run(self, task: str):
            captured["task"] = task

            class Response:
                output = SimpleNamespace(
                    translated_text="生成一个 AI anime 节拍的故事板草图面板。",
                    source_language="en",
                    target_language="zh",
                )

            return Response()

    monkeypatch.setattr(
        "ai_anime.modules.creative_canvas.infrastructure.text_generation."
        "_create_translation_agent",
        lambda model: captured.update(model=model) or FakeAgent(),
    )

    translated, source_language, target_language = await translate_creative_canvas_text(
        text="Generate ONE storyboard sketch panel for this AI anime beat. 颜色法则：保留 [CM_6932]",
        model="cloud-text-standard",
        node_type="image",
    )

    assert "You must decide whether the dominant natural language" in captured["task"]
    assert "[CM_6932]" in captured["task"]
    assert captured["model"] == "cloud-text-standard"
    assert translated == "生成一个 AI anime 节拍的故事板草图面板。"
    assert source_language == "en"
    assert target_language == "zh"


@pytest.mark.asyncio
async def test_translate_creative_canvas_text_flips_invalid_same_language_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAgent:
        async def run(self, _task: str):
            class Response:
                output = SimpleNamespace(
                    translated_text="雨夜街头",
                    source_language="zh",
                    target_language="zh",
                )

            return Response()

    monkeypatch.setattr(
        "ai_anime.modules.creative_canvas.infrastructure.text_generation."
        "_create_translation_agent",
        lambda model: FakeAgent(),
    )

    translated, source_language, target_language = await translate_creative_canvas_text(
        text="雨夜街头",
        model="cloud-text-standard",
        node_type="image",
    )

    assert translated == "雨夜街头"
    assert source_language == "zh"
    assert target_language == "en"

def test_build_creative_canvas_story_script_task_mentions_required_columns() -> None:
    task = build_creative_canvas_story_script_task(
        source_text="沈昭昭在深夜办公室醒来。",
        prompt="节奏要快，压迫感强",
    )

    assert "镜号" in task
    assert "画面描述" in task
    assert "视频运动提示词" in task
    assert "角色图1" in task
    assert "沈昭昭" in task
    assert "节奏要快" in task
    assert "括号分段" in task
    assert "分镜提示词必须像高质量图像生成提示词" in task
    assert "最好严格按 8 段写" in task
    assert "最好严格按 6 段写" in task
    assert "第二段尽量直接使用或轻改角色描述1" in task
    assert "技术参数段尽量保留" in task


@pytest.mark.asyncio
async def test_generate_creative_canvas_story_script_returns_plain_dict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected = {
        "title": "我在盛唐写天下",
        "rows": [
            {
                "shot_no": 1,
                "duration": 4,
                "visual_description": "沈昭昭在办公室醒来。",
            }
        ],
    }

    class FakeOutput:
        def model_dump(self) -> dict:
            return expected

    class FakeAgent:
        async def run(self, task: str):
            assert "沈昭昭" in task
            return SimpleNamespace(output=FakeOutput())

    monkeypatch.setattr(
        "ai_anime.modules.creative_canvas.infrastructure.text_generation."
        "_create_story_script_agent",
        lambda model: FakeAgent(),
    )

    result = await generate_creative_canvas_story_script(
        source_text="沈昭昭在深夜办公室醒来。",
        model="cloud-text-standard",
    )

    assert result == expected
    assert isinstance(result, dict)


@pytest.mark.asyncio
async def test_freezone_story_script_job_result_returns_json_payload(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    job_id = "storyjob1"
    out = project_dir / "freezone" / "_outputs" / "freezone_story_script" / f"{job_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "title": "我在盛唐写天下",
        "rows": [
            {
                "shot_no": 1,
                "duration": 4,
                "visual_description": "现代深夜，沈昭昭在办公室过度劳累加班。",
                "character_1": "",
                "character_description_1": "",
                "character_image_1": "",
                "reference": "",
                "shot": "",
                "character_action": "",
                "emotion": "",
                "scene_tags": "",
                "lighting_mood": "",
                "sound": "",
                "dialogue": "",
                "shot_prompt": "近景特写",
                "video_motion_prompt": "缓慢推进",
            }
        ],
    }
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    class FakeManager:
        def get_task_for_project(self, *args, **kwargs):
            return None

    _patch_project_resolution(monkeypatch, project_dir, FakeManager())

    result = await freezone_job_routes.freezone_job_result(
        project="58",
        task_type="freezone_story_script",
        job_id=job_id,
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["title"] == "我在盛唐写天下"
    assert result["data"]["rows"][0]["shot_no"] == 1


@pytest.mark.asyncio
async def test_freezone_text_translate_job_result_returns_json_payload(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    job_id = "translatejob1"
    out = project_dir / "freezone" / "_outputs" / "freezone_text_translate" / f"{job_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "translated_text": "Today is Monday",
        "source_language": "zh",
        "target_language": "en",
        "node_type": "generic",
    }
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    class FakeManager:
        def get_task_for_project(self, *args, **kwargs):
            return None

    _patch_project_resolution(monkeypatch, project_dir, FakeManager())

    result = await freezone_job_routes.freezone_job_result(
        project="58",
        task_type="freezone_text_translate",
        job_id=job_id,
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["translated_text"] == "Today is Monday"
    assert result["data"]["target_language"] == "en"


@pytest.mark.asyncio
async def test_freezone_image_reverse_prompt_job_result_returns_json_payload(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    job_id = "reverseprompt1"
    out = project_dir / "freezone" / "_outputs" / "freezone_image_reverse_prompt" / f"{job_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "prompt": "雨夜街头，电影感近景特写，人物侧脸被霓虹照亮",
    }
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    class FakeManager:
        def get_task_for_project(self, *args, **kwargs):
            return None

    _patch_project_resolution(monkeypatch, project_dir, FakeManager())

    result = await freezone_job_routes.freezone_job_result(
        project="58",
        task_type="freezone_image_reverse_prompt",
        job_id=job_id,
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["prompt"].startswith("雨夜街头")
