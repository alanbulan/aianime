from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.api.routes.canvas import jobs as freezone_job_routes
from ai_anime.api.routes.canvas import video as freezone_video_routes
from ai_anime.api.schemas import (
    FreezoneAnalyzeShotsRequest,
    FreezoneAnalyzeVideoStoryRequest,
)
from ai_anime.freezone import vision_gateway
from ai_anime.freezone.jobs import build_video_story_analysis_prompt
from ai_anime.freezone.jobs import run_freezone_analyze_shots
from ai_anime.modules.creative_canvas.application.job_results import (
    CreativeCanvasJobResultQueries,
    public_creative_canvas_video_story_result,
)
from ai_anime.modules.creative_canvas.infrastructure.job_results import (
    LocalCreativeCanvasJobResultReader,
)


def _patch_project_resolution(
    monkeypatch: pytest.MonkeyPatch,
    project_dir: Path,
    *,
    username: str = "admin",
):
    context = object()

    async def _fake_resolve(
        project: str,
        user: dict,
        *,
        required_role: str,
        operation: str,
    ):
        assert user == {"username": username}
        assert required_role == "editor"
        assert operation == "access freezone project files"
        return SimpleNamespace(ctx=context, project_dir=project_dir)

    async def _fake_job_resolve(
        project: str,
        user: dict,
        *,
        required_role: str,
        operation: str,
    ):
        assert user == {"username": username}
        assert required_role == "viewer"
        assert operation == "access freezone project files"
        return SimpleNamespace(ctx=context, project_dir=project_dir)

    monkeypatch.setattr(freezone_video_routes, "resolve_project_scope", _fake_resolve)
    monkeypatch.setattr(freezone_job_routes, "resolve_project_scope", _fake_job_resolve)
    return context


def _patch_job_result_queries(
    monkeypatch: pytest.MonkeyPatch,
    task_manager: object,
) -> None:
    queries = CreativeCanvasJobResultQueries(
        LocalCreativeCanvasJobResultReader(task_manager_factory=lambda: task_manager)
    )
    monkeypatch.setattr(
        freezone_job_routes,
        "creative_canvas_job_result_queries",
        lambda: queries,
    )


def _receipt(task_type: str, job_id: str):
    return SimpleNamespace(
        task_type=task_type,
        job_id=job_id,
        task_key=f"{task_type}:{job_id}",
        task_episode=0,
        task_scope=job_id,
        backend="celery",
        queue="default",
        task_id="task-1",
    )


def test_video_story_prompt_requests_libtv_story_table() -> None:
    prompt = build_video_story_analysis_prompt(frame_count=5, duration_sec=15.0)

    assert "libtv 风格的“视频故事”表" in prompt
    assert "3-12 个叙事镜头/动作段落" in prompt
    assert "视频总时长约 15.00 秒" in prompt
    assert '"visual_description"' in prompt
    assert '"narrative"' in prompt
    assert '"image_prompt"' in prompt
    assert '"motion_prompt"' in prompt
    assert "严格输出 JSON 对象" in prompt


def test_freezone_analyze_request_defaults_to_shots_mode() -> None:
    body = FreezoneAnalyzeShotsRequest(frame_urls=["/static/f1.png"])

    assert body.analysis_mode == "shots"
    assert body.duration_sec is None


@pytest.mark.asyncio
async def test_video_story_analysis_uses_shared_freezone_vision_model(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    frame = tmp_path / "frame.png"
    frame.write_bytes(b"png")
    captured: dict[str, object] = {}

    async def fake_call_freezone_vision_model(**kwargs):
        captured.update(kwargs)
        return "ai-anime-freezone-vision-LLM", '{"shots":[]}'

    monkeypatch.setattr(
        vision_gateway,
        "call_freezone_vision_model",
        fake_call_freezone_vision_model,
    )

    result = await run_freezone_analyze_shots(
        project_dir=tmp_path,
        job_id="vision-job",
        frame_paths=[str(frame)],
        analysis_mode="video_story",
    )

    assert result["provider"] == "newapi"
    assert result["model"] == "ai-anime-freezone-vision-LLM"
    assert result["video_story"] == {"shots": []}
    assert len(captured["images"]) == 1


@pytest.mark.asyncio
async def test_freezone_analyze_route_passes_video_story_options(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    username = "admin"
    project = "59"
    captured: dict[str, object] = {}

    context = _patch_project_resolution(monkeypatch, tmp_path, username=username)

    class CapturingUseCases:
        async def start_shot_analysis(self, command):
            captured["command"] = command
            return _receipt("freezone_analyze", "story_job")

    monkeypatch.setattr(
        freezone_video_routes,
        "creative_canvas_video_processing_use_cases",
        lambda: CapturingUseCases(),
    )

    result = await freezone_video_routes.freezone_analyze_shots(
        project=project,
        body=FreezoneAnalyzeShotsRequest(
            frame_urls=["/static/admin/59/frame.png"],
            analysis_mode="video_story",
            duration_sec=15.0,
            provider="openrouter",
            model="gemini-3.5-flash",
        ),
        user={"username": username},
    )

    assert result["ok"] is True
    assert result["data"]["task_type"] == "freezone_analyze"
    command = captured["command"]
    assert command.context is context
    assert command.project_dir == tmp_path
    assert command.frame_urls == ("/static/admin/59/frame.png",)
    assert command.analysis_mode == "video_story"
    assert command.duration_sec == 15.0
    assert not hasattr(command, "provider")
    assert not hasattr(command, "model")


@pytest.mark.asyncio
async def test_freezone_analyze_video_story_route_starts_single_video_task(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    username = "admin"
    project = "59"
    captured: dict[str, object] = {}

    context = _patch_project_resolution(monkeypatch, tmp_path, username=username)

    class CapturingUseCases:
        async def start_video_story_analysis(self, command):
            captured["command"] = command
            return _receipt("freezone_video_story", "video_story_job")

    monkeypatch.setattr(
        freezone_video_routes,
        "creative_canvas_video_processing_use_cases",
        lambda: CapturingUseCases(),
    )

    result = await freezone_video_routes.freezone_analyze_video_story(
        project=project,
        body=FreezoneAnalyzeVideoStoryRequest(
            video_url="/static/admin/59/freezone/_uploads/clip.mp4",
            max_frames=12,
            scene_threshold=0.25,
            duration_sec=15.0,
        ),
        user={"username": username},
    )

    assert result["ok"] is True
    assert result["data"]["task_type"] == "freezone_video_story"
    assert result["data"]["job_id"] == "video_story_job"
    assert "freezone_video_story" in result["data"]["task_key"]
    command = captured["command"]
    assert command.context is context
    assert command.project_dir == tmp_path
    assert command.video_url == "/static/admin/59/freezone/_uploads/clip.mp4"
    assert command.max_frames == 12
    assert command.scene_threshold == 0.25
    assert command.duration_sec == 15.0


def test_public_video_story_result_excludes_local_paths() -> None:
    result = {
        "job_id": "story_job",
        "output_path": "/tmp/private/analysis.json",
        "output_url": "/static/admin/59/freezone/_outputs/freezone_analyze/story_job/analysis.json",
        "model": "gemini-3.5-flash",
        "analysis_mode": "video_story",
        "frame_count": 2,
        "frame_urls": ["/static/admin/59/freezone/_outputs/freezone_extract/story_job/even_001.png"],
        "frame_paths": ["/tmp/private/even_001.png"],
        "analyses": [],
        "video_story": {"shots": []},
    }

    public = public_creative_canvas_video_story_result(result)

    assert "output_path" not in public
    assert "frame_paths" not in public
    assert public["output_url"] == result["output_url"]
    assert public["frame_urls"] == result["frame_urls"]


@pytest.mark.asyncio
async def test_video_story_job_result_waits_until_task_completed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    username = "admin"
    project = "58"
    job_id = "running_story"

    class FakeTask:
        status = "running"
        error = None
        logs = []
        current_task = "Vision 解析 12 帧为视频故事..."
        result = {"task_metadata": {"job_id": job_id}}

    class FakeManager:
        def get_task_for_project(self, _ctx, task_type, episode, scope=None):
            assert task_type == "freezone_video_story"
            assert episode == 0
            assert scope == job_id
            return FakeTask()

    _patch_project_resolution(monkeypatch, tmp_path, username=username)
    _patch_job_result_queries(monkeypatch, FakeManager())

    result = await freezone_job_routes.freezone_job_result(
        project=project,
        task_type="freezone_video_story",
        job_id=job_id,
        user={"username": username},
    )

    assert result["ok"] is False
    assert result["status"] == "running"
    assert result["info"] == "job result not yet available"
    assert result["current_task"] == "Vision 解析 12 帧为视频故事..."
    assert "data" not in result
