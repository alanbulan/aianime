from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.canvas import image as image_upscale_routes
from ai_anime.api.schemas import (
    FreezoneImageCameraConfig,
    FreezoneImageStyleConfig,
    FreezoneUpscaleRequest,
)
from ai_anime.modules.creative_canvas.application.image_upscale import (
    CREATIVE_CANVAS_IMAGE_UPSCALE_TASK_TYPE,
    CreativeCanvasImageUpscaleSourceMissing,
    CreativeCanvasImageUpscaleUseCases,
    InvalidCreativeCanvasImageUpscaleRequest,
    StartCreativeCanvasImageUpscaleCommand,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskStartFailed,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain.image_upscale import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    InvalidCreativeCanvasImageSize,
    build_image_upscale_prompt,
    resolve_original_image_aspect_ratio,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.creative_canvas.infrastructure.image_upscale import (
    FreezoneCreativeCanvasImageModelRouter,
)


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


def _receipt(job_id: str = "job-1") -> CreativeCanvasTaskReceipt:
    return CreativeCanvasTaskReceipt(
        task_type=CREATIVE_CANVAS_IMAGE_UPSCALE_TASK_TYPE,
        job_id=job_id,
        task_key=f"task:key:{job_id}",
        task_episode=0,
        task_scope=job_id,
        backend="inline",
        queue="inline",
        task_id="task-1",
    )


@pytest.mark.parametrize(
    ("size", "aspect_ratio"),
    [((320, 180), "16:9"), ((180, 320), "9:16"), ((1000, 707), "4:3")],
)
def test_image_upscale_resolves_supported_original_aspect_ratio(
    size: tuple[int, int],
    aspect_ratio: str,
) -> None:
    assert resolve_original_image_aspect_ratio(*size) == aspect_ratio


def test_image_upscale_rejects_invalid_image_size() -> None:
    with pytest.raises(InvalidCreativeCanvasImageSize, match="invalid source image size"):
        resolve_original_image_aspect_ratio(0, 100)


def test_image_upscale_prompt_preserves_existing_contract() -> None:
    prompt = build_image_upscale_prompt()

    assert "Upscale and restore the image" in prompt
    assert "preserving the original composition" in prompt
    assert "Do not redesign the image" in prompt


def test_image_upscale_model_router_preserves_empty_model_fallback() -> None:
    provider, model = FreezoneCreativeCanvasImageModelRouter().resolve("")

    assert provider == "newapi"
    assert model


@pytest.mark.asyncio
async def test_image_upscale_use_case_enqueues_exact_task_payload(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    source_path = context.output_dir / "freezone" / "_uploads" / "source.png"
    source_url = "/static/alice/demo/freezone/_uploads/source.png"
    camera = CreativeCanvasImageCameraConfig(
        camera_body="Panavision DXL2",
        lens="Arri Signature Prime",
        focal_length_mm=35,
        aperture="f/4",
    )
    style = CreativeCanvasImageStyleConfig(template_id="three_oclock_2300")
    expected_receipt = _receipt()

    class FakeSources:
        def resolve(self, project_dir: Path, received_source_url: str) -> Path:
            assert project_dir == context.output_dir
            assert received_source_url == source_url
            return source_path

        def exists(self, image_path: Path) -> bool:
            assert image_path == source_path
            return True

    class FakeImages:
        def size(self, image_path: Path) -> tuple[int, int]:
            assert image_path == source_path
            return 320, 180

    class FakePrompts:
        def compose(self, received_style, received_camera) -> str:
            assert received_style is style
            assert received_camera is camera
            return "upscale prompt"

    class FakeModels:
        def resolve(self, model: str) -> tuple[str, str]:
            assert model == "newapi_gpt_image2"
            return "newapi", "gpt-image-2"

    class FakeJobIds:
        def new_id(self) -> str:
            return "job-1"

    class FakeScheduler:
        async def enqueue(
            self,
            received_context: ProjectContext,
            task: CreativeCanvasTaskSubmission,
        ) -> CreativeCanvasTaskReceipt:
            assert received_context is context
            assert task == CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_IMAGE_UPSCALE_TASK_TYPE,
                queue_kind="default",
                job_id="job-1",
                project_dir=context.output_dir,
                payload={
                    "prompt": "upscale prompt",
                    "base_path": source_path.as_posix(),
                    "extra_reference_paths": [],
                    "aspect_ratio": "16:9",
                    "image_size": "2K",
                    "provider": "newapi",
                    "model": "gpt-image-2",
                    "quality": "low",
                },
            )
            return expected_receipt

    result = await CreativeCanvasImageUpscaleUseCases(
        FakeSources(),
        FakeImages(),
        FakePrompts(),
        FakeModels(),
        FakeJobIds(),
        FakeScheduler(),
    ).start(
        StartCreativeCanvasImageUpscaleCommand(
            context=context,
            project_dir=context.output_dir,
            source_url=source_url,
            image_size="2K",
            model="newapi_gpt_image2",
            quality="low",
            camera=camera,
            style=style,
        )
    )

    assert result is expected_receipt


@pytest.mark.asyncio
async def test_image_upscale_use_case_maps_invalid_and_missing_sources(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)

    class InvalidSources:
        def resolve(self, *_args) -> Path:
            raise ValueError("resolved path escapes project directory")

        def exists(self, *_args) -> bool:
            raise AssertionError("exists must not be called")

    class MissingSources:
        def resolve(self, *_args) -> Path:
            return tmp_path / "missing.png"

        def exists(self, *_args) -> bool:
            return False

    class UnusedDependency:
        def size(self, *_args):
            raise AssertionError("image inspector must not be called")

        def compose(self, *_args):
            raise AssertionError("prompt composer must not be called")

        def resolve(self, *_args):
            raise AssertionError("model router must not be called")

        def new_id(self):
            raise AssertionError("job ids must not be called")

        async def enqueue(self, *_args):
            raise AssertionError("scheduler must not be called")

    command = StartCreativeCanvasImageUpscaleCommand(
        context=context,
        project_dir=context.output_dir,
        source_url="source.png",
        image_size="2K",
        model="newapi_gpt_image2",
    )
    dependency = UnusedDependency()

    with pytest.raises(
        InvalidCreativeCanvasImageUpscaleRequest,
        match="resolved path escapes project directory",
    ):
        await CreativeCanvasImageUpscaleUseCases(
            InvalidSources(),
            dependency,
            dependency,
            dependency,
            dependency,
            dependency,
        ).start(command)

    with pytest.raises(
        CreativeCanvasImageUpscaleSourceMissing,
        match="source not found",
    ) as exc:
        await CreativeCanvasImageUpscaleUseCases(
            MissingSources(),
            dependency,
            dependency,
            dependency,
            dependency,
            dependency,
        ).start(command)
    assert exc.value.source_path == tmp_path / "missing.png"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "status_code", "detail"),
    [
        (
            InvalidCreativeCanvasImageUpscaleRequest("invalid source"),
            400,
            "invalid source",
        ),
        (
            CreativeCanvasImageUpscaleSourceMissing(Path("missing.png")),
            404,
            "source not found: missing.png",
        ),
        (
            CreativeCanvasTaskStartFailed("broker unavailable"),
            503,
            "failed to start upscale task: broker unavailable",
        ),
    ],
)
async def test_image_upscale_route_preserves_error_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
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
        async def start(self, command):
            assert command.context is context
            assert command.project_dir == context.output_dir
            assert command.source_url == "source.png"
            assert command.image_size == "4K"
            assert command.model == "image-model"
            assert command.quality == "low"
            assert command.camera == CreativeCanvasImageCameraConfig(
                camera_body="Panavision DXL2",
                lens="Arri Signature Prime",
                focal_length_mm=35,
                aperture="f/4",
            )
            assert command.style == CreativeCanvasImageStyleConfig(
                template_id="three_oclock_2300"
            )
            raise failure

    monkeypatch.setattr(
        image_upscale_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        image_upscale_routes,
        "creative_canvas_image_upscale_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        await image_upscale_routes.freezone_upscale(
            project="project-1",
            body=FreezoneUpscaleRequest(
                source_url="source.png",
                image_size="4K",
                model="image-model",
                quality="low",
                camera=FreezoneImageCameraConfig(
                    camera_body="Panavision DXL2",
                    lens="Arri Signature Prime",
                    focal_length_mm=35,
                    aperture="f/4",
                ),
                style=FreezoneImageStyleConfig(template_id="three_oclock_2300"),
            ),
            user={"username": "alice"},
        )

    assert exc.value.status_code == status_code
    assert exc.value.detail == detail
