from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Mapping

import pytest

from ai_anime.api.routes.canvas import video as video_routes
from ai_anime.api.schemas import FreezoneVideoGenRequest
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.application.video_generation import (
    CREATIVE_CANVAS_VIDEO_GENERATION_TASK_TYPE,
    CreativeCanvasOmniVideoReference,
    CreativeCanvasVideoCharacterMissing,
    CreativeCanvasVideoGenerationOptions,
    CreativeCanvasVideoGenerationResult,
    CreativeCanvasVideoGenerationUseCases,
    InvalidCreativeCanvasVideoGenerationRequest,
    StartCreativeCanvasImageVideoCommand,
    StartCreativeCanvasKeyframeVideoCommand,
    StartCreativeCanvasOmniVideoCommand,
    StartCreativeCanvasTextVideoCommand,
    StartCreativeCanvasVideoEditCommand,
)
from ai_anime.modules.creative_canvas.infrastructure.media_sources import (
    ProjectCreativeCanvasMediaSourceResolver,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _project_context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-1",
        owner_username="alice",
        requester_user_id="user-1",
        requester_username="alice",
        requester_principals=(("user", "user-1"),),
        effective_role="owner",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def _options(
    *,
    model: str = "newapi_seedance-2.0-fast",
    prompt: str = "镜头缓慢推进",
    gen_mode: str | None = None,
    scene_optimize: str | None = None,
) -> CreativeCanvasVideoGenerationOptions:
    return CreativeCanvasVideoGenerationOptions(
        prompt=prompt,
        camera_template_id="locked_off",
        marks=({"label": "主角", "point_x": 0.5, "point_y": 0.5},),
        aspect_ratio="auto",
        resolution="720p",
        duration_seconds=5,
        generate_audio=True,
        human_review=False,
        scene_optimize=scene_optimize,
        model=model,
        canvas_id="canvas-1",
        node_id="node-1",
        gen_mode=gen_mode,
    )


def _receipt(
    job_id: str, *, task_id: str | None = "task-1"
) -> CreativeCanvasTaskReceipt:
    return CreativeCanvasTaskReceipt(
        task_type=CREATIVE_CANVAS_VIDEO_GENERATION_TASK_TYPE,
        job_id=job_id,
        task_key=f"task:{job_id}",
        task_episode=0,
        task_scope=job_id,
        backend="celery",
        queue="node.local.video",
        task_id=task_id,
    )


class _FixedJobIds:
    def __init__(self, *job_ids: str) -> None:
        self._job_ids = iter(job_ids)

    def new_id(self) -> str:
        return next(self._job_ids)


class _ModelPolicy:
    def resolve_backend(self, model: str | None) -> str:
        if model == "invalid":
            raise ValueError("unknown video model: invalid")
        return str(model or "newapi_seedance-2.0-fast")

    def is_seedance2_backend(self, backend: str | None) -> bool:
        return "seedance-2.0" in str(backend or "")

    def is_happyhorse_backend(self, backend: str | None) -> bool:
        return "happyhorse" in str(backend or "")

    def normalize_aspect_ratio(self, value: str | None) -> str:
        return "16:9" if value == "auto" else str(value)

    def normalize_resolution(self, backend: str | None, value: str | None) -> str:
        del backend
        return str(value or "720p").lower()

    def normalize_duration(self, backend: str | None, value: int | None) -> int:
        del backend
        return int(value or 5)

    def normalize_scene_optimize(self, backend: str | None, value: str | None) -> str:
        return str(value or "") if "value" in str(backend or "") else ""


class _CharacterCatalog:
    def __init__(self, *items: Mapping[str, object]) -> None:
        self._items = items

    def list_items(self, project_dir: Path) -> tuple[Mapping[str, object], ...]:
        del project_dir
        return self._items


class _CapturingScheduler:
    def __init__(self, context: ProjectContext) -> None:
        self.context = context
        self.tasks: list[CreativeCanvasTaskSubmission] = []

    async def enqueue(
        self,
        context: ProjectContext,
        task: CreativeCanvasTaskSubmission,
    ) -> CreativeCanvasTaskReceipt:
        assert context is self.context
        self.tasks.append(task)
        return _receipt(task.job_id)


def _use_cases(
    context: ProjectContext,
    scheduler: _CapturingScheduler,
    *job_ids: str,
    characters: _CharacterCatalog | None = None,
) -> CreativeCanvasVideoGenerationUseCases:
    return CreativeCanvasVideoGenerationUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        _ModelPolicy(),
        characters or _CharacterCatalog(),
        _FixedJobIds(*job_ids),
        scheduler,
    )


@pytest.mark.asyncio
async def test_video_generation_modes_build_exact_task_inputs(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    project_dir = context.output_dir
    scheduler = _CapturingScheduler(context)
    use_cases = _use_cases(
        context,
        scheduler,
        "job-text",
        "job-image",
        "job-keyframe",
        "job-omni",
        "job-edit",
        characters=_CharacterCatalog(
            {
                "id": "character-1",
                "name": "林小满",
                "image_urls": ["freezone/_uploads/character.png"],
            }
        ),
    )

    text_result = await use_cases.start_text_video(
        StartCreativeCanvasTextVideoCommand(
            context=context,
            project_dir=project_dir,
            options=_options(
                model="newapi_seedance-2.0-fast-value",
                scene_optimize="realistic",
            ),
            character_ids=("character-1",),
        )
    )
    image_result = await use_cases.start_image_video(
        StartCreativeCanvasImageVideoCommand(
            context=context,
            project_dir=project_dir,
            options=_options(
                model="newapi_happyhorse-1.0",
                gen_mode="imageReference",
            ),
            image_urls=(
                "freezone/_uploads/reference-a.png",
                "freezone/_uploads/reference-b.png",
            ),
        )
    )
    keyframe_result = await use_cases.start_keyframe_video(
        StartCreativeCanvasKeyframeVideoCommand(
            context=context,
            project_dir=project_dir,
            options=_options(),
            first_frame_url="freezone/_uploads/first.png",
            last_frame_url="freezone/_uploads/last.png",
        )
    )
    omni_result = await use_cases.start_omni_video(
        StartCreativeCanvasOmniVideoCommand(
            context=context,
            project_dir=project_dir,
            options=_options(),
            theme="纪实",
            references=(
                CreativeCanvasOmniVideoReference(
                    media_type="image",
                    url="freezone/_uploads/reference.png",
                    role="角色参考",
                ),
                CreativeCanvasOmniVideoReference(
                    media_type="video",
                    url="freezone/_uploads/action.mp4",
                    role="动作参考",
                ),
            ),
        )
    )
    edit_result = await use_cases.start_video_edit(
        StartCreativeCanvasVideoEditCommand(
            context=context,
            project_dir=project_dir,
            options=_options(model="newapi_happyhorse-1.0"),
            video_url="freezone/_uploads/source.mp4",
            image_urls=("freezone/_uploads/style.png",),
            audio_setting="origin",
        )
    )

    assert [
        result.receipt.job_id
        for result in (
            text_result,
            image_result,
            keyframe_result,
            omni_result,
            edit_result,
        )
    ] == ["job-text", "job-image", "job-keyframe", "job-omni", "job-edit"]
    assert all(
        task.task_type == CREATIVE_CANVAS_VIDEO_GENERATION_TASK_TYPE
        for task in scheduler.tasks
    )
    assert all(task.queue_kind == "video" for task in scheduler.tasks)
    assert all(task.project_dir == project_dir for task in scheduler.tasks)

    text_payload = scheduler.tasks[0].payload
    assert "林小满" in str(text_payload["prompt"])
    assert text_payload["reference_items"] == [
        {
            "type": "image",
            "path": (
                project_dir / "freezone" / "_uploads" / "character.png"
            ).as_posix(),
            "role": "角色参考",
        }
    ]
    assert text_payload["scene_optimize"] == "realistic"
    assert text_payload["canvas_id"] == "canvas-1"
    assert text_payload["node_id"] == "node-1"

    image_references = scheduler.tasks[1].payload["reference_items"]
    assert [item["role"] for item in image_references] == ["图片参考", "图片参考"]
    keyframe_payload = scheduler.tasks[2].payload
    assert [item["role"] for item in keyframe_payload["reference_items"]] == [
        "首帧",
        "尾帧",
    ]
    assert (
        keyframe_payload["last_frame_path"]
        == (project_dir / "freezone" / "_uploads" / "last.png").as_posix()
    )
    assert omni_result.meta == {
        "image_count": 1,
        "video_count": 1,
        "audio_count": 0,
        "total_count": 2,
    }
    edit_payload = scheduler.tasks[4].payload
    assert [item["type"] for item in edit_payload["reference_items"]] == [
        "video",
        "image",
    ]
    assert edit_payload["audio_setting"] == "origin"


@pytest.mark.asyncio
async def test_video_generation_preserves_validation_contracts(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    scheduler = _CapturingScheduler(context)
    use_cases = _use_cases(
        context,
        scheduler,
        "unused",
        characters=_CharacterCatalog(),
    )

    with pytest.raises(
        CreativeCanvasVideoCharacterMissing,
        match="video character library item not found: missing",
    ):
        await use_cases.start_text_video(
            StartCreativeCanvasTextVideoCommand(
                context=context,
                project_dir=context.output_dir,
                options=_options(),
                character_ids=("missing",),
            )
        )

    with pytest.raises(
        InvalidCreativeCanvasVideoGenerationRequest,
        match="url resolves outside project",
    ):
        await use_cases.start_image_video(
            StartCreativeCanvasImageVideoCommand(
                context=context,
                project_dir=context.output_dir,
                options=_options(),
                image_urls=("../outside.png",),
            )
        )

    with pytest.raises(
        InvalidCreativeCanvasVideoGenerationRequest,
        match="first_frame_url or last_frame_url is required",
    ):
        await use_cases.start_keyframe_video(
            StartCreativeCanvasKeyframeVideoCommand(
                context=context,
                project_dir=context.output_dir,
                options=_options(),
            )
        )

    too_many_images = tuple(
        CreativeCanvasOmniVideoReference(
            media_type="image",
            url=f"freezone/_uploads/{index}.png",
        )
        for index in range(10)
    )
    with pytest.raises(
        InvalidCreativeCanvasVideoGenerationRequest,
        match="image references count must be <= 9",
    ):
        await use_cases.start_omni_video(
            StartCreativeCanvasOmniVideoCommand(
                context=context,
                project_dir=context.output_dir,
                options=_options(),
                theme="",
                references=too_many_images,
            )
        )

    with pytest.raises(
        InvalidCreativeCanvasVideoGenerationRequest,
        match="video edit currently only supports HappyHorse models",
    ):
        await use_cases.start_video_edit(
            StartCreativeCanvasVideoEditCommand(
                context=context,
                project_dir=context.output_dir,
                options=_options(),
                video_url="freezone/_uploads/source.mp4",
                image_urls=(),
                audio_setting="auto",
            )
        )
    assert scheduler.tasks == []


@pytest.mark.asyncio
async def test_video_generation_route_maps_command_and_response(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)
    captured: dict[str, object] = {}

    async def fake_resolve_project_scope(*_args, **_kwargs):
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class CapturingUseCases:
        async def start_text_video(self, command):
            captured["command"] = command
            return CreativeCanvasVideoGenerationResult(
                receipt=_receipt("job-route", task_id=None)
            )

    monkeypatch.setattr(
        video_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        video_routes,
        "creative_canvas_video_generation_use_cases",
        lambda: CapturingUseCases(),
    )

    response = await video_routes.freezone_video_gen(
        project="project-1",
        body=FreezoneVideoGenRequest(
            prompt="雨夜街头",
            character_ids=["character-1"],
            canvas_id="canvas-1",
            node_id="node-1",
        ),
        user={"username": "alice"},
    )

    command = captured["command"]
    assert command.context is context
    assert command.project_dir == context.output_dir
    assert command.character_ids == ("character-1",)
    assert command.options.prompt == "雨夜街头"
    assert command.options.canvas_id == "canvas-1"
    assert command.options.node_id == "node-1"
    assert response == {
        "ok": True,
        "data": {
            "task_type": "freezone_video_gen",
            "job_id": "job-route",
            "task_id": None,
            "task_key": "task:job-route",
            "backend": "celery",
            "queue": "node.local.video",
        },
    }
