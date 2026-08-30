from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Mapping

import pytest
from pydantic import ValidationError

from ai_anime.api.routes.creative_canvas.video_schemas import (
    FreezoneImageToVideoRequest,
    FreezoneKeyframeVideoRequest,
    FreezoneVideoGenRequest,
)
from ai_anime.api.routes.creative_canvas import video as video_routes
from ai_anime.modules.model_usage.public import configure_model_access
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
from ai_anime.modules.creative_canvas.infrastructure.video_generation import (
    ConfiguredCreativeCanvasVideoModelPolicy,
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
    model: str = "seedance-2.0-fast",
    prompt: str = "镜头缓慢推进",
    gen_mode: str | None = None,
    scene_optimize: str | None = None,
    extra_params: Mapping[str, object] | None = None,
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
        extra_params=extra_params,
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


def test_configured_video_policy_reads_projected_catalog_duration_capabilities() -> (
    None
):
    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_capabilities=[
            {
                "modelId": "cloud/video-standard",
                "videoSceneOptimizeOptions": ["cinematic", "realistic"],
                "maxReferenceImages": 5,
                "maxReferenceVideos": 1,
                "maxReferenceAudios": 0,
                "maxReferenceTotal": 6,
                "referenceAudioMinSeconds": 2,
                "referenceAudioTotalMaxSeconds": 14,
                "referenceVideoMinSeconds": 3,
                "referenceVideoMaxSeconds": 10,
                "referenceVideoTotalMinSeconds": 5,
                "referenceVideoTotalMaxSeconds": 20,
            }
        ],
    )
    try:
        policy = ConfiguredCreativeCanvasVideoModelPolicy()
        assert policy.reference_duration_limits(
            "cloud/video-standard",
            "audio",
        ) == (2.0, None, None, 14.0)
        assert policy.reference_duration_limits(
            "cloud/video-standard",
            "video",
        ) == (3.0, 10.0, 5.0, 20.0)
        assert policy.reference_duration_limits(
            "seedance-2.0-fast",
            "audio",
        ) == (None, None, None, None)
        assert policy.reference_count_limits("cloud/video-standard") == (
            5,
            1,
            0,
            6,
        )
        assert policy.reference_count_limits("seedance-2.0-fast") == (
            9,
            3,
            3,
            12,
        )
        assert (
            policy.normalize_scene_optimize(
                "cloud/video-standard",
                "cinematic",
            )
            == "cinematic"
        )
    finally:
        configure_model_access(allows_custom_models=False, mode="mixed")


def test_configured_video_policy_uses_declared_h3_size_and_duration() -> None:
    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_capabilities=[
            {
                "modelId": "MINIMAX_H3",
                "videoRatioOptions": ["16:9", "9:16", "1:1"],
                "videoSizeOptions": ["1344x768", "768x1344", "1024x1024"],
                "videoSupportsGenerateAudio": False,
                "videoSupportsHumanReview": False,
                "videoExtraParameterNames": ["steps", "seed", "turbo"],
                "videoGenerationMinSeconds": 1,
                "videoGenerationMaxSeconds": 15,
            },
            {
                "modelId": "ENUM_VIDEO",
                "videoRatioOptions": ["16:9"],
                "videoResolutionOptions": ["720p"],
                "videoDurationOptions": [3, 5, 8],
            },
        ],
    )
    try:
        policy = ConfiguredCreativeCanvasVideoModelPolicy()
        assert policy.normalize_aspect_ratio("MINIMAX_H3", "16:9") == "16:9"
        assert policy.normalize_resolution("MINIMAX_H3", "1344x768") == "1344x768"
        assert policy.normalize_duration("MINIMAX_H3", 3) == 3
        assert policy.normalize_generate_audio("MINIMAX_H3", False) is False
        assert policy.normalize_extra_params(
            "MINIMAX_H3",
            {"steps": 20, "seed": 42, "turbo": False},
        ) == {"steps": 20, "seed": 42, "turbo": False}
        with pytest.raises(ValueError, match="不支持分辨率 720p"):
            policy.normalize_resolution("MINIMAX_H3", "720p")
        with pytest.raises(ValueError, match="不支持画面比例 4:3"):
            policy.normalize_aspect_ratio("MINIMAX_H3", "4:3")
        with pytest.raises(ValueError, match="不支持生成音频"):
            policy.normalize_generate_audio("MINIMAX_H3", True)
        with pytest.raises(ValueError, match="不支持真人素材审核"):
            policy.normalize_human_review("MINIMAX_H3", True)
        with pytest.raises(ValueError, match="is not declared: quality"):
            policy.normalize_extra_params("MINIMAX_H3", {"quality": "720p"})
        with pytest.raises(ValueError, match="are not declared"):
            policy.normalize_scene_optimize("MINIMAX_H3", "anime")
        assert policy.normalize_duration("ENUM_VIDEO", 5) == 5
        with pytest.raises(ValueError, match="must be one of: 3, 5, 8"):
            policy.normalize_duration("ENUM_VIDEO", 4)
    finally:
        configure_model_access(allows_custom_models=False, mode="mixed")


class _FixedJobIds:
    def __init__(self, *job_ids: str) -> None:
        self._job_ids = iter(job_ids)

    def new_id(self) -> str:
        return next(self._job_ids)


class _ModelPolicy:
    def resolve_model(self, model: str | None) -> str:
        if model == "invalid":
            raise ValueError("unknown video model: invalid")
        return str(model or "seedance-2.0-fast")

    def normalize_aspect_ratio(self, model: str | None, value: str | None) -> str:
        del model
        return "16:9" if value == "auto" else str(value)

    def normalize_resolution(self, model: str | None, value: str | None) -> str:
        del model
        return str(value or "720p").lower()

    def normalize_duration(self, model: str | None, value: int | None) -> int:
        del model
        return int(value or 5)

    def normalize_generate_audio(self, model: str | None, value: bool) -> bool:
        del model
        return value

    def normalize_human_review(self, model: str | None, value: bool) -> bool:
        del model
        return value

    def normalize_extra_params(
        self,
        model: str | None,
        value: Mapping[str, object] | None,
    ) -> dict[str, object]:
        del model
        return dict(value or {})

    def normalize_scene_optimize(self, model: str | None, value: str | None) -> str:
        return str(value or "") if "value" in str(model or "") else ""

    def reference_duration_limits(
        self,
        model: str | None,
        media_type: str,
    ) -> tuple[float | None, float | None, float | None, float | None]:
        if media_type == "audio" and str(model or "").startswith("seedance-2.0"):
            return 1.8, 15.2, None, 15.2
        if media_type == "video" and model == "video-limited":
            return 2.0, 10.0, 4.0, 12.0
        return None, None, None, None

    def reference_count_limits(
        self,
        model: str | None,
    ) -> tuple[int | None, int | None, int | None, int | None]:
        if model == "count-limited":
            return 2, 1, 0, 6
        return 9, 3, 3, 12


class _ReferenceDurations:
    def __init__(self, values: Mapping[str, float | None] | None = None) -> None:
        self._values = dict(values or {})

    async def probe_seconds(self, path: str, media_type: str) -> float | None:
        del media_type
        return self._values.get(Path(path).name)


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
    reference_durations: _ReferenceDurations | None = None,
) -> CreativeCanvasVideoGenerationUseCases:
    return CreativeCanvasVideoGenerationUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        _ModelPolicy(),
        reference_durations or _ReferenceDurations(),
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
                model="seedance-2.0-fast-value",
                scene_optimize="cinematic",
                extra_params={"steps": 24, "seed": 42, "turbo": False},
            ),
            character_ids=("character-1",),
        )
    )
    image_result = await use_cases.start_image_video(
        StartCreativeCanvasImageVideoCommand(
            context=context,
            project_dir=project_dir,
            options=_options(
                model="happyhorse-1.0",
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
            options=_options(model="happyhorse-1.0"),
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
    assert [task.payload["model_role"] for task in scheduler.tasks] == [
        "VIDEO_TEXT_TO_VIDEO",
        "VIDEO_IMAGE_REFERENCE",
        "VIDEO_FIRST_LAST_FRAME",
        "VIDEO_ALL_REFERENCE",
        "VIDEO_EDIT",
    ]
    assert [task.payload["gen_mode"] for task in scheduler.tasks] == [
        "text_to_video",
        "image_reference",
        "first_last_frame",
        "all_reference",
        "video_edit",
    ]
    assert [task.payload["requested_gen_mode"] for task in scheduler.tasks] == [
        "textToVideo",
        "imageReference",
        "firstLastFrame",
        "allReference",
        "videoEdit",
    ]

    text_payload = scheduler.tasks[0].payload
    assert "林小满" in str(text_payload["prompt"])
    assert text_payload["reference_items"] == [
        {
            "type": "image",
            "path": (
                project_dir / "freezone" / "_uploads" / "character.png"
            ).as_posix(),
            "role": "角色参考",
            "field": "reference_images",
        }
    ]
    assert text_payload["scene_optimize"] == "cinematic"
    assert text_payload["extra_params"] == {
        "steps": 24,
        "seed": 42,
        "turbo": False,
    }
    assert text_payload["canvas_id"] == "canvas-1"
    assert text_payload["node_id"] == "node-1"

    image_references = scheduler.tasks[1].payload["reference_items"]
    assert [item["role"] for item in image_references] == ["首帧", "图片参考"]
    assert [item["field"] for item in image_references] == [
        "input_reference",
        "reference_images",
    ]
    keyframe_payload = scheduler.tasks[2].payload
    assert [item["role"] for item in keyframe_payload["reference_items"]] == [
        "首帧",
        "尾帧",
    ]
    assert [item["field"] for item in keyframe_payload["reference_items"]] == [
        "input_reference",
        "last_frame",
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
        match="firstLastFrame requires at least one keyframe",
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

    catalog_limited_images = tuple(
        CreativeCanvasOmniVideoReference(
            media_type="image",
            url=f"freezone/_uploads/{index}.png",
        )
        for index in range(3)
    )
    with pytest.raises(
        InvalidCreativeCanvasVideoGenerationRequest,
        match="image references count must be <= 2",
    ):
        await use_cases.start_omni_video(
            StartCreativeCanvasOmniVideoCommand(
                context=context,
                project_dir=context.output_dir,
                options=_options(model="count-limited"),
                theme="",
                references=catalog_limited_images,
            )
        )

    with pytest.raises(
        InvalidCreativeCanvasVideoGenerationRequest,
        match="video_url is required",
    ):
        await use_cases.start_video_edit(
            StartCreativeCanvasVideoEditCommand(
                context=context,
                project_dir=context.output_dir,
                options=_options(),
                video_url="",
                image_urls=(),
                audio_setting="auto",
            )
        )
    assert scheduler.tasks == []


@pytest.mark.asyncio
async def test_first_frame_keeps_requested_mode_and_uses_first_frame_protocol(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    scheduler = _CapturingScheduler(context)
    use_cases = _use_cases(context, scheduler, "job-first-frame")

    await use_cases.start_keyframe_video(
        StartCreativeCanvasKeyframeVideoCommand(
            context=context,
            project_dir=context.output_dir,
            options=_options(gen_mode="firstFrame"),
            first_frame_url="freezone/_uploads/first.png",
        )
    )

    payload = scheduler.tasks[0].payload
    assert payload["requested_gen_mode"] == "firstFrame"
    assert payload["gen_mode"] == "first_frame"
    assert payload["model_role"] == "VIDEO_IMAGE_TO_VIDEO"
    assert payload["last_frame_path"] is None


def test_reference_video_requests_require_an_explicit_business_mode() -> None:
    with pytest.raises(ValidationError, match="gen_mode"):
        FreezoneImageToVideoRequest(
            image_urls=["one.png"],
            model="video-model",
            resolution="720p",
            aspect_ratio="16:9",
            duration_seconds=5,
            generate_audio=False,
        )
    with pytest.raises(ValidationError, match="gen_mode"):
        FreezoneKeyframeVideoRequest(
            first_frame_url="first.png",
            model="video-model",
            resolution="720p",
            aspect_ratio="16:9",
            duration_seconds=5,
            generate_audio=False,
        )


@pytest.mark.asyncio
async def test_omni_video_rejects_reference_audio_over_total_limit(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    scheduler = _CapturingScheduler(context)
    use_cases = _use_cases(
        context,
        scheduler,
        "unused",
        reference_durations=_ReferenceDurations(
            {
                "voice-a.mp3": 8.0,
                "voice-b.mp3": 7.201,
            }
        ),
    )

    with pytest.raises(
        InvalidCreativeCanvasVideoGenerationRequest,
        match=r"audio references total duration must be <= 15\.2s, got 15\.201s",
    ):
        await use_cases.start_omni_video(
            StartCreativeCanvasOmniVideoCommand(
                context=context,
                project_dir=context.output_dir,
                options=_options(),
                theme="",
                references=(
                    CreativeCanvasOmniVideoReference(
                        media_type="audio",
                        url="freezone/_uploads/voice-a.mp3",
                    ),
                    CreativeCanvasOmniVideoReference(
                        media_type="audio",
                        url="freezone/_uploads/voice-b.mp3",
                    ),
                ),
            )
        )

    assert scheduler.tasks == []


@pytest.mark.asyncio
async def test_omni_video_rejects_catalog_limited_reference_video_duration(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    scheduler = _CapturingScheduler(context)
    use_cases = _use_cases(
        context,
        scheduler,
        "unused",
        reference_durations=_ReferenceDurations({"clip.mp4": 10.001}),
    )

    with pytest.raises(
        InvalidCreativeCanvasVideoGenerationRequest,
        match=r"video reference duration must be <= 10s: clip\.mp4 \(10\.001s\)",
    ):
        await use_cases.start_omni_video(
            StartCreativeCanvasOmniVideoCommand(
                context=context,
                project_dir=context.output_dir,
                options=_options(model="video-limited"),
                theme="",
                references=(
                    CreativeCanvasOmniVideoReference(
                        media_type="video",
                        url="freezone/_uploads/clip.mp4",
                    ),
                ),
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
            model="cloud-video-standard",
            size="1344x768",
            aspect_ratio="16:9",
            duration_seconds=3,
            generate_audio=False,
            extra_params={"steps": 20, "seed": 42, "turbo": False},
            scene_optimize="cinematic",
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
    assert command.options.resolution == "1344x768"
    assert command.options.extra_params == {
        "steps": 20,
        "seed": 42,
        "turbo": False,
    }
    assert command.options.scene_optimize == "cinematic"
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
