from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from PIL import Image

from ai_anime.api.routes.creative_canvas.image_schemas import (
    FreezoneOutpaintRequest,
    FreezoneRedrawRequest,
    FreezoneUpscaleRequest,
)
from ai_anime.api.routes.creative_canvas import image as image_editing_routes
from ai_anime.modules.creative_canvas.application.image_editing import (
    CREATIVE_CANVAS_IMAGE_EDIT_TASK_TYPE,
    CREATIVE_CANVAS_IMAGE_MASK_EDIT_TASK_TYPE,
    CreativeCanvasImageEditingSourceMissing,
    CreativeCanvasImageEditingUseCases,
    InvalidCreativeCanvasImageEditingRequest,
    StartCreativeCanvasImageEditingCommand,
    StartCreativeCanvasReferenceImageEditingCommand,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskStartFailed,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain.image_editing import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    InvalidCreativeCanvasImageSize,
    build_image_erase_prompt,
    build_image_outpaint_prompt,
    build_image_redraw_prompt,
    build_image_upscale_prompt,
    resolve_original_image_aspect_ratio,
)
from ai_anime.modules.creative_canvas.infrastructure.image_editing import (
    FreezoneCreativeCanvasImageModelRouter,
    FreezoneCreativeCanvasImagePromptComposer,
    PillowCreativeCanvasImageEditingStorage,
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


def _write_image(
    path: Path,
    *,
    size: tuple[int, int] = (320, 180),
    color: tuple[int, int, int, int] = (255, 0, 0, 255),
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", size, color).save(path, format="PNG")
    return path


def _receipt(
    task_type: str = CREATIVE_CANVAS_IMAGE_EDIT_TASK_TYPE,
    job_id: str = "job-1",
) -> CreativeCanvasTaskReceipt:
    return CreativeCanvasTaskReceipt(
        task_type=task_type,
        job_id=job_id,
        task_key=f"task:key:{job_id}",
        task_episode=0,
        task_scope=job_id,
        backend="inline",
        queue="inline",
        task_id="task-1",
    )


class _FixedJobIds:
    def new_id(self) -> str:
        return "job-1"


class _CapturingScheduler:
    def __init__(self, context: ProjectContext) -> None:
        self.context = context
        self.task: CreativeCanvasTaskSubmission | None = None

    async def enqueue(
        self,
        context: ProjectContext,
        task: CreativeCanvasTaskSubmission,
    ) -> CreativeCanvasTaskReceipt:
        assert context is self.context
        self.task = task
        return _receipt(task.task_type, task.job_id)


class _CapturingPrompts:
    def __init__(self) -> None:
        self.calls: list[
            tuple[
                str,
                CreativeCanvasImageStyleConfig | None,
                CreativeCanvasImageCameraConfig | None,
            ]
        ] = []

    def compose(
        self,
        prompt: str,
        style: CreativeCanvasImageStyleConfig | None,
        camera: CreativeCanvasImageCameraConfig | None,
    ) -> str:
        self.calls.append((prompt, style, camera))
        return "composed prompt"


class _FixedModels:
    def __init__(self) -> None:
        self.received: list[str | None] = []

    def resolve(self, model: str | None) -> str:
        self.received.append(model)
        return "gpt-image-2"


def _editing_use_cases(
    context: ProjectContext,
) -> tuple[
    CreativeCanvasImageEditingUseCases,
    _CapturingScheduler,
    _CapturingPrompts,
    _FixedModels,
]:
    scheduler = _CapturingScheduler(context)
    prompts = _CapturingPrompts()
    models = _FixedModels()
    return (
        CreativeCanvasImageEditingUseCases(
            ProjectCreativeCanvasMediaSourceResolver(),
            PillowCreativeCanvasImageEditingStorage(),
            prompts,
            models,
            _FixedJobIds(),
            scheduler,
        ),
        scheduler,
        prompts,
        models,
    )


@pytest.mark.parametrize(
    ("size", "aspect_ratio"),
    [((320, 180), "16:9"), ((180, 320), "9:16"), ((1000, 707), "4:3")],
)
def test_image_editing_resolves_supported_original_aspect_ratio(
    size: tuple[int, int],
    aspect_ratio: str,
) -> None:
    assert resolve_original_image_aspect_ratio(*size) == aspect_ratio


def test_image_editing_rejects_invalid_image_size() -> None:
    with pytest.raises(InvalidCreativeCanvasImageSize, match="invalid source image size"):
        resolve_original_image_aspect_ratio(0, 100)


def test_image_editing_prompts_preserve_existing_contracts() -> None:
    assert "Upscale and restore the image" in build_image_upscale_prompt()
    assert "Do not redesign the image" in build_image_upscale_prompt()
    assert "Extend the existing image outward" in build_image_outpaint_prompt()
    assert "Do not crop, stretch" in build_image_outpaint_prompt()
    assert build_image_redraw_prompt("replace sky").endswith("replace sky")
    assert "masked region" in build_image_erase_prompt()
    assert "artifacts" in build_image_erase_prompt()


def test_image_editing_model_router_rejects_empty_model() -> None:
    with pytest.raises(ValueError, match="model is required"):
        FreezoneCreativeCanvasImageModelRouter().resolve("")


def test_image_editing_explicit_aspect_ratio_does_not_read_image_size(
    tmp_path: Path,
) -> None:
    class UnusedStorage:
        def size(self, _source_path: Path) -> tuple[int, int]:
            raise AssertionError("explicit aspect ratio must not read image size")

    use_cases = CreativeCanvasImageEditingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        UnusedStorage(),
        _CapturingPrompts(),
        _FixedModels(),
        _FixedJobIds(),
        _CapturingScheduler(_project_context(tmp_path)),
    )

    assert use_cases.resolve_aspect_ratio(tmp_path / "not-an-image", "16:9") == "16:9"


def test_outpaint_storage_creates_transparent_centered_canvas_and_reuses_same_ratio(
    tmp_path: Path,
) -> None:
    project_dir = tmp_path / "project"
    source = _write_image(
        project_dir / "freezone" / "_uploads" / "source.png",
        size=(100, 100),
    )
    same_ratio = _write_image(
        project_dir / "freezone" / "_uploads" / "wide.png",
        size=(160, 90),
    )
    storage = PillowCreativeCanvasImageEditingStorage()

    padded = storage.prepare_outpaint_base(
        source_path=source,
        project_dir=project_dir,
        target_aspect_ratio="16:9",
    )

    assert padded.parent == project_dir / "freezone" / "_uploads"
    assert padded.name.endswith("outpaint_base_source.png")
    with Image.open(padded) as image:
        assert image.size == (178, 100)
        assert image.mode == "RGBA"
        assert image.getpixel((0, 0))[3] == 0
        assert image.getpixel((38, 50))[3] == 0
        assert image.getpixel((39, 50)) == (255, 0, 0, 255)

    assert (
        storage.prepare_outpaint_base(
            source_path=same_ratio,
            project_dir=project_dir,
            target_aspect_ratio="16:9",
        )
        == same_ratio
    )


@pytest.mark.asyncio
async def test_image_upscale_enqueues_exact_freezone_edit_payload(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    source = _write_image(context.output_dir / "freezone" / "_uploads" / "source.png")
    source_url = "/static/alice/demo/freezone/_uploads/source.png"
    camera = CreativeCanvasImageCameraConfig(
        camera_body="Panavision DXL2",
        lens="Arri Signature Prime",
        focal_length_mm=35,
        aperture="f/4",
    )
    style = CreativeCanvasImageStyleConfig(template_id="three_oclock_2300")
    use_cases, scheduler, prompts, models = _editing_use_cases(context)

    result = await use_cases.start(
        StartCreativeCanvasImageEditingCommand(
            context=context,
            project_dir=context.output_dir,
            operation="upscale",
            source_url=source_url,
            image_size="2K",
            model="newapi_gpt_image2",
            quality="low",
            camera=camera,
            style=style,
        )
    )

    assert result == _receipt()
    assert prompts.calls == [(build_image_upscale_prompt(), style, camera)]
    assert models.received == ["newapi_gpt_image2"]
    assert scheduler.task == CreativeCanvasTaskSubmission(
        task_type=CREATIVE_CANVAS_IMAGE_EDIT_TASK_TYPE,
        queue_kind="default",
        job_id="job-1",
        project_dir=context.output_dir,
        payload={
            "prompt": "composed prompt",
            "base_path": source.as_posix(),
            "extra_reference_paths": [],
            "aspect_ratio": "16:9",
            "image_size": "2K",
            "quality": "low",
            "model_id": "",
            "model": "gpt-image-2",
        },
    )


@pytest.mark.asyncio
async def test_image_outpaint_enqueues_padded_freezone_edit_payload(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    _write_image(
        context.output_dir / "freezone" / "_uploads" / "source.png",
        size=(100, 100),
    )
    use_cases, scheduler, prompts, models = _editing_use_cases(context)

    result = await use_cases.start(
        StartCreativeCanvasImageEditingCommand(
            context=context,
            project_dir=context.output_dir,
            operation="outpaint",
            source_url="/static/alice/demo/freezone/_uploads/source.png",
            requested_aspect_ratio="16:9",
            image_size="4K",
            model="image-model",
        )
    )

    assert result == _receipt()
    assert prompts.calls == [(build_image_outpaint_prompt(), None, None)]
    assert models.received == ["image-model"]
    assert scheduler.task is not None
    padded = Path(str(scheduler.task.payload["base_path"]))
    assert padded.exists()
    assert padded.name.endswith("outpaint_base_source.png")
    assert scheduler.task == CreativeCanvasTaskSubmission(
        task_type=CREATIVE_CANVAS_IMAGE_EDIT_TASK_TYPE,
        queue_kind="default",
        job_id="job-1",
        project_dir=context.output_dir,
        payload={
            "prompt": "composed prompt",
            "base_path": padded.as_posix(),
            "extra_reference_paths": [],
            "aspect_ratio": "16:9",
            "image_size": "4K",
            "quality": "medium",
            "model_id": "",
            "model": "gpt-image-2",
        },
    )


@pytest.mark.asyncio
async def test_image_redraw_without_mask_enqueues_freezone_edit_payload(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    source = _write_image(context.output_dir / "freezone" / "_uploads" / "source.png")
    use_cases, scheduler, prompts, _models = _editing_use_cases(context)

    await use_cases.start(
        StartCreativeCanvasImageEditingCommand(
            context=context,
            project_dir=context.output_dir,
            operation="redraw",
            source_url="freezone/_uploads/source.png",
            prompt="replace sky",
            requested_aspect_ratio="original",
            image_size="2K",
            model="image-model",
            quality="high",
        )
    )

    assert prompts.calls == [(build_image_redraw_prompt("replace sky"), None, None)]
    assert scheduler.task == CreativeCanvasTaskSubmission(
        task_type=CREATIVE_CANVAS_IMAGE_EDIT_TASK_TYPE,
        queue_kind="default",
        job_id="job-1",
        project_dir=context.output_dir,
        payload={
            "prompt": "composed prompt",
            "base_path": source.as_posix(),
            "extra_reference_paths": [],
            "aspect_ratio": "16:9",
            "image_size": "2K",
            "quality": "high",
            "model_id": "",
            "model": "gpt-image-2",
        },
    )


@pytest.mark.asyncio
async def test_masked_redraw_uses_erase_prompt_and_mask_edit_payload(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    source = _write_image(context.output_dir / "freezone" / "_uploads" / "source.png")
    mask = _write_image(context.output_dir / "freezone" / "_uploads" / "mask.png")
    use_cases, scheduler, prompts, _models = _editing_use_cases(context)

    result = await use_cases.start(
        StartCreativeCanvasImageEditingCommand(
            context=context,
            project_dir=context.output_dir,
            operation="redraw",
            source_url="freezone/_uploads/source.png",
            mask_url="freezone/_uploads/mask.png",
            prompt="   ",
            requested_aspect_ratio="1:1",
            image_size="2K",
            model="",
            quality=None,
        )
    )

    assert result == _receipt(CREATIVE_CANVAS_IMAGE_MASK_EDIT_TASK_TYPE)
    assert prompts.calls == [(build_image_erase_prompt(), None, None)]
    assert scheduler.task == CreativeCanvasTaskSubmission(
        task_type=CREATIVE_CANVAS_IMAGE_MASK_EDIT_TASK_TYPE,
        queue_kind="default",
        job_id="job-1",
        project_dir=context.output_dir,
        payload={
            "base_path": source.as_posix(),
            "mask_path": mask.as_posix(),
            "prompt": "composed prompt",
            "aspect_ratio": "1:1",
            "image_size": "2K",
            "quality": "medium",
            "model_id": "",
            "model": "gpt-image-2",
        },
    )


@pytest.mark.asyncio
async def test_reference_image_editing_enqueues_exact_payload(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    base = _write_image(
        context.output_dir / "freezone" / "_uploads" / "base.png",
        size=(180, 320),
    )
    reference = _write_image(
        context.output_dir / "freezone" / "_uploads" / "reference.png"
    )
    camera = CreativeCanvasImageCameraConfig(camera_body="Panavision DXL2")
    style = CreativeCanvasImageStyleConfig(template_id="three_oclock_2300")
    use_cases, scheduler, prompts, models = _editing_use_cases(context)

    result = await use_cases.start_reference_edit(
        StartCreativeCanvasReferenceImageEditingCommand(
            context=context,
            project_dir=context.output_dir,
            prompt="edit prompt",
            base_url="freezone/_uploads/base.png",
            extra_reference_urls=("freezone/_uploads/reference.png",),
            aspect_ratio="original",
            image_size="4K",
            camera=camera,
            style=style,
            model="newapi_gpt_image2",
            quality="high",
            canvas_id="canvas-a",
            node_id="node-a",
            model_id="registry-model",
            gen_mode="reference",
        )
    )

    assert result == _receipt()
    assert prompts.calls == [("edit prompt", style, camera)]
    assert models.received == ["newapi_gpt_image2"]
    assert scheduler.task == CreativeCanvasTaskSubmission(
        task_type=CREATIVE_CANVAS_IMAGE_EDIT_TASK_TYPE,
        queue_kind="default",
        job_id="job-1",
        project_dir=context.output_dir,
        payload={
            "prompt": "composed prompt",
            "base_path": base.as_posix(),
            "extra_reference_paths": [reference.as_posix()],
            "aspect_ratio": "9:16",
            "image_size": "4K",
            "model": "gpt-image-2",
            "quality": "high",
            "extra_params": {},
            "canvas_id": "canvas-a",
            "node_id": "node-a",
            "model_id": "registry-model",
            "gen_mode": "reference",
            "task_family": "freezone_canvas",
            "task_label": "编辑图片",
            "display_name": "编辑图片",
        },
    )


@pytest.mark.asyncio
async def test_reference_image_editing_preserves_source_error_contracts(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    use_cases, scheduler, _prompts, _models = _editing_use_cases(context)

    def command(
        base_url: str,
        *extra_reference_urls: str,
    ) -> StartCreativeCanvasReferenceImageEditingCommand:
        return StartCreativeCanvasReferenceImageEditingCommand(
            context=context,
            project_dir=context.output_dir,
            prompt="edit",
            base_url=base_url,
            extra_reference_urls=extra_reference_urls,
            aspect_ratio="16:9",
            image_size="2K",
            model="cloud-image-standard",
        )

    with pytest.raises(
        InvalidCreativeCanvasImageEditingRequest,
        match="base_url is required",
    ):
        await use_cases.start_reference_edit(command(""))

    with pytest.raises(
        CreativeCanvasImageEditingSourceMissing,
        match="base file not found: ",
    ) as base_exc:
        await use_cases.start_reference_edit(command("freezone/_uploads/missing.png"))
    assert base_exc.value.field_name == "base file"

    _write_image(context.output_dir / "freezone" / "_uploads" / "base.png")
    with pytest.raises(
        CreativeCanvasImageEditingSourceMissing,
        match="reference file not found: ",
    ) as reference_exc:
        await use_cases.start_reference_edit(
            command(
                "freezone/_uploads/base.png",
                "freezone/_uploads/missing-reference.png",
            )
        )
    assert reference_exc.value.field_name == "reference file"
    assert scheduler.task is None


@pytest.mark.asyncio
async def test_reference_image_editing_maps_unknown_style_template(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    _write_image(context.output_dir / "freezone" / "_uploads" / "base.png")
    scheduler = _CapturingScheduler(context)
    use_cases = CreativeCanvasImageEditingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        PillowCreativeCanvasImageEditingStorage(),
        FreezoneCreativeCanvasImagePromptComposer(),
        FreezoneCreativeCanvasImageModelRouter(),
        _FixedJobIds(),
        scheduler,
    )

    with pytest.raises(
        InvalidCreativeCanvasImageEditingRequest,
        match="unknown image style template: missing-style",
    ):
        await use_cases.start_reference_edit(
            StartCreativeCanvasReferenceImageEditingCommand(
                context=context,
                project_dir=context.output_dir,
                prompt="edit",
                base_url="freezone/_uploads/base.png",
                aspect_ratio="16:9",
                image_size="2K",
                model="cloud-image-standard",
                style=CreativeCanvasImageStyleConfig(template_id="missing-style"),
            )
        )
    assert scheduler.task is None


@pytest.mark.asyncio
async def test_image_editing_maps_invalid_and_missing_source_paths(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    use_cases, scheduler, _prompts, _models = _editing_use_cases(context)

    with pytest.raises(
        InvalidCreativeCanvasImageEditingRequest,
        match="url resolves outside project",
    ):
        await use_cases.start(
            StartCreativeCanvasImageEditingCommand(
                context=context,
                project_dir=context.output_dir,
                operation="upscale",
                source_url="../outside.png",
                image_size="2K",
                model="image-model",
            )
        )

    with pytest.raises(
        CreativeCanvasImageEditingSourceMissing,
        match="source not found",
    ) as exc:
        await use_cases.start(
            StartCreativeCanvasImageEditingCommand(
                context=context,
                project_dir=context.output_dir,
                operation="upscale",
                source_url="freezone/_uploads/missing.png",
                image_size="2K",
                model="image-model",
            )
        )
    assert exc.value.field_name == "source"
    assert scheduler.task is None


@pytest.mark.asyncio
async def test_image_editing_maps_invalid_and_missing_mask_paths(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    _write_image(context.output_dir / "freezone" / "_uploads" / "source.png")
    use_cases, scheduler, _prompts, _models = _editing_use_cases(context)

    def command(mask_url: str) -> StartCreativeCanvasImageEditingCommand:
        return StartCreativeCanvasImageEditingCommand(
            context=context,
            project_dir=context.output_dir,
            operation="redraw",
            source_url="freezone/_uploads/source.png",
            mask_url=mask_url,
            image_size="2K",
            model="image-model",
        )

    with pytest.raises(
        InvalidCreativeCanvasImageEditingRequest,
        match="url resolves outside project",
    ):
        await use_cases.start(command("../outside-mask.png"))

    with pytest.raises(
        CreativeCanvasImageEditingSourceMissing,
        match="mask not found",
    ) as exc:
        await use_cases.start(command("freezone/_uploads/missing-mask.png"))
    assert exc.value.field_name == "mask"
    assert scheduler.task is None


@pytest.mark.asyncio
async def test_image_editing_validates_source_before_num_images(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    use_cases, _scheduler, _prompts, _models = _editing_use_cases(context)

    with pytest.raises(CreativeCanvasImageEditingSourceMissing, match="source not found"):
        await use_cases.start(
            StartCreativeCanvasImageEditingCommand(
                context=context,
                project_dir=context.output_dir,
                operation="outpaint",
                source_url="freezone/_uploads/missing.png",
                image_size="2K",
                model="image-model",
                num_images=2,
            )
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "message"),
    [
        ("outpaint", "outpaint currently supports only num_images = 1"),
        ("redraw", "num_images is currently limited to 1"),
    ],
)
async def test_image_editing_rejects_multiple_outputs(
    tmp_path: Path,
    operation: str,
    message: str,
) -> None:
    context = _project_context(tmp_path)
    _write_image(context.output_dir / "freezone" / "_uploads" / "source.png")
    use_cases, scheduler, _prompts, _models = _editing_use_cases(context)

    with pytest.raises(InvalidCreativeCanvasImageEditingRequest, match=message):
        await use_cases.start(
            StartCreativeCanvasImageEditingCommand(
                context=context,
                project_dir=context.output_dir,
                operation=operation,  # type: ignore[arg-type]
                source_url="freezone/_uploads/source.png",
                image_size="2K",
                model="image-model",
                num_images=2,
            )
        )
    assert scheduler.task is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "body", "failure", "status_code", "detail"),
    [
        (
            "upscale",
            FreezoneUpscaleRequest(
                source_url="../source.png",
                model="cloud-image-standard",
            ),
            InvalidCreativeCanvasImageEditingRequest("invalid source"),
            400,
            "invalid source",
        ),
        (
            "outpaint",
            FreezoneOutpaintRequest(
                source_url="missing.png",
                model="cloud-image-standard",
            ),
            CreativeCanvasImageEditingSourceMissing(Path("missing.png")),
            404,
            "source not found: missing.png",
        ),
        (
            "redraw",
            FreezoneRedrawRequest(
                source_url="source.png",
                mask_url="../mask.png",
                model="cloud-image-standard",
            ),
            InvalidCreativeCanvasImageEditingRequest("invalid mask"),
            400,
            "invalid mask",
        ),
        (
            "redraw",
            FreezoneRedrawRequest(
                source_url="source.png",
                mask_url="missing-mask.png",
                model="cloud-image-standard",
            ),
            CreativeCanvasImageEditingSourceMissing(
                Path("missing-mask.png"),
                field_name="mask",
            ),
            404,
            "mask not found: missing-mask.png",
        ),
        (
            "upscale",
            FreezoneUpscaleRequest(
                source_url="source.png",
                model="cloud-image-standard",
            ),
            CreativeCanvasTaskStartFailed("broker unavailable"),
            503,
            "failed to start upscale task: broker unavailable",
        ),
        (
            "outpaint",
            FreezoneOutpaintRequest(
                source_url="source.png",
                model="cloud-image-standard",
            ),
            CreativeCanvasTaskStartFailed("broker unavailable"),
            503,
            "failed to start outpaint task: broker unavailable",
        ),
        (
            "redraw",
            FreezoneRedrawRequest(
                source_url="source.png",
                prompt="redraw",
                model="cloud-image-standard",
            ),
            CreativeCanvasTaskStartFailed("broker unavailable"),
            503,
            "failed to start redraw task: broker unavailable",
        ),
        (
            "redraw",
            FreezoneRedrawRequest(
                source_url="source.png",
                mask_url="mask.png",
                model="cloud-image-standard",
            ),
            CreativeCanvasTaskStartFailed("broker unavailable"),
            503,
            "failed to start masked redraw task: broker unavailable",
        ),
    ],
)
async def test_image_editing_routes_preserve_error_contracts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
    body: FreezoneUpscaleRequest | FreezoneOutpaintRequest | FreezoneRedrawRequest,
    failure: Exception,
    status_code: int,
    detail: str,
) -> None:
    context = _project_context(tmp_path)

    async def fake_resolve_project_scope(
        project: str,
        user: dict,
        *,
        required_role: str,
        operation: str,
    ):
        assert project == "project-1"
        assert user == {"username": "alice"}
        assert required_role == "editor"
        assert operation == "access freezone project files"
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class FailingUseCases:
        async def start(self, command: StartCreativeCanvasImageEditingCommand):
            assert command.context is context
            assert command.project_dir == context.output_dir
            assert command.operation == operation
            raise failure

    monkeypatch.setattr(
        image_editing_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        image_editing_routes,
        "creative_canvas_image_editing_use_cases",
        lambda: FailingUseCases(),
    )
    endpoint = {
        "upscale": image_editing_routes.freezone_upscale,
        "outpaint": image_editing_routes.freezone_outpaint,
        "redraw": image_editing_routes.freezone_redraw,
    }[operation]

    with pytest.raises(HTTPException) as exc:
        await endpoint(
            project="project-1",
            body=body,
            user={"username": "alice"},
        )

    assert exc.value.status_code == status_code
    assert exc.value.detail == detail


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "status_code", "detail"),
    [
        (
            InvalidCreativeCanvasImageEditingRequest("base_url is required"),
            400,
            "base_url is required",
        ),
        (
            CreativeCanvasImageEditingSourceMissing(
                Path("missing.png"),
                field_name="base file",
            ),
            404,
            "base file not found: missing.png",
        ),
        (
            CreativeCanvasImageEditingSourceMissing(
                Path("missing-reference.png"),
                field_name="reference file",
            ),
            404,
            "reference file not found: missing-reference.png",
        ),
    ],
)
async def test_reference_image_editing_route_preserves_error_contracts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure: Exception,
    status_code: int,
    detail: str,
) -> None:
    context = _project_context(tmp_path)

    async def fake_resolve_project_scope(*_args, **_kwargs):
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class FailingUseCases:
        async def start_reference_edit(
            self,
            command: StartCreativeCanvasReferenceImageEditingCommand,
        ):
            assert command.context is context
            assert command.project_dir == context.output_dir
            raise failure

    monkeypatch.setattr(
        image_editing_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        image_editing_routes,
        "creative_canvas_reference_image_editing_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        await image_editing_routes._start_reference_image_editing(
            project="project-1",
            user={"username": "alice"},
            prompt="edit",
            base_url="base.png",
            extra_reference_urls=(),
            aspect_ratio="16:9",
            image_size="2K",
            camera=None,
            style=None,
            model=None,
            quality=None,
        )

    assert exc.value.status_code == status_code
    assert exc.value.detail == detail


@pytest.mark.asyncio
async def test_reference_image_editing_route_preserves_runtime_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)

    async def fake_resolve_project_scope(*_args, **_kwargs):
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class FailingUseCases:
        async def start_reference_edit(self, _command):
            raise RuntimeError("broker unavailable")

    monkeypatch.setattr(
        image_editing_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        image_editing_routes,
        "creative_canvas_reference_image_editing_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(RuntimeError, match="broker unavailable"):
        await image_editing_routes._start_reference_image_editing(
            project="project-1",
            user={"username": "alice"},
            prompt="edit",
            base_url="base.png",
            extra_reference_urls=(),
            aspect_ratio="16:9",
            image_size="2K",
            camera=None,
            style=None,
            model=None,
            quality=None,
        )
