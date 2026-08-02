from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.canvas import image as image_generation_routes
from ai_anime.api.canvas_image_schemas import (
    FreezoneGenRequest,
    FreezoneImageCameraConfig,
    FreezoneImageStyleConfig,
)
from ai_anime.modules.creative_canvas.application.image_generation import (
    CREATIVE_CANVAS_IMAGE_GENERATION_TASK_TYPE,
    CreativeCanvasImageGenerationReferenceMissing,
    CreativeCanvasImageGenerationUseCases,
    InvalidCreativeCanvasImageGenerationRequest,
    StartCreativeCanvasImageGenerationCommand,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain.image_editing import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
)
from ai_anime.modules.creative_canvas.infrastructure.image_generation import (
    FreezoneCreativeCanvasImageGenerationModelRouter,
)
from ai_anime.modules.creative_canvas.infrastructure.image_editing import (
    FreezoneCreativeCanvasImagePromptComposer,
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


def _receipt(job_id: str = "job-1") -> CreativeCanvasTaskReceipt:
    return CreativeCanvasTaskReceipt(
        task_type=CREATIVE_CANVAS_IMAGE_GENERATION_TASK_TYPE,
        job_id=job_id,
        task_key=f"task:key:{job_id}",
        task_episode=0,
        task_scope=job_id,
        backend="inline",
        queue="inline",
        task_id="task-1",
    )


@pytest.mark.asyncio
async def test_image_generation_enqueues_exact_task_payload(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    first_reference = context.output_dir / "freezone" / "first.png"
    second_reference = context.output_dir / "freezone" / "second.png"
    camera = CreativeCanvasImageCameraConfig(
        camera_body="Panavision DXL2",
        lens="Arri Signature Prime",
        focal_length_mm=35,
        aperture="f/4",
    )
    style = CreativeCanvasImageStyleConfig(template_id="three_oclock_2300")
    expected_receipt = _receipt()

    class FakeSources:
        def resolve(self, project_dir: Path, source_url: str) -> Path:
            assert project_dir == context.output_dir
            return {
                "first": first_reference,
                "second": second_reference,
            }[source_url]

        def exists(self, source_path: Path) -> bool:
            assert source_path in {first_reference, second_reference}
            return True

    class FakePrompts:
        def compose(self, prompt, received_style, received_camera) -> str:
            assert prompt == "rain alley"
            assert received_style is style
            assert received_camera is camera
            return "composed prompt"

    class FakeModels:
        def resolve(self, model) -> str:
            assert model == "image-model"
            return "gpt-image-2"

    class FakeJobIds:
        def new_id(self) -> str:
            return "job-1"

    class FakeScheduler:
        async def enqueue(self, received_context, task):
            assert received_context is context
            assert task == CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_IMAGE_GENERATION_TASK_TYPE,
                queue_kind="default",
                job_id="job-1",
                project_dir=context.output_dir,
                payload={
                    "prompt": "composed prompt",
                    "aspect_ratio": "16:9",
                    "image_size": "4K",
                    "reference_paths": [
                        first_reference.as_posix(),
                        second_reference.as_posix(),
                    ],
                    "model": "gpt-image-2",
                    "quality": "high",
                    "canvas_id": "canvas-1",
                    "node_id": "node-1",
                    "model_id": "registry-model",
                    "gen_mode": "reference",
                    "task_family": "freezone_canvas",
                    "task_label": "Generate sketch",
                    "display_name": "Generate sketch",
                    "source_label": "Background",
                },
            )
            return expected_receipt

    result = await CreativeCanvasImageGenerationUseCases(
        FakeSources(),
        FakePrompts(),
        FakeModels(),
        FakeJobIds(),
        FakeScheduler(),
    ).start(
        StartCreativeCanvasImageGenerationCommand(
            context=context,
            project_dir=context.output_dir,
            prompt="rain alley",
            aspect_ratio="16:9",
            image_size="4K",
            reference_urls=("first", "", "second"),
            camera=camera,
            style=style,
            model="image-model",
            quality="high",
            canvas_id="canvas-1",
            node_id="node-1",
            model_id="registry-model",
            gen_mode="reference",
            task_display={
                "task_label": "Generate sketch",
                "display_name": "Generate sketch",
                "source_label": "Background",
            },
        )
    )

    assert result is expected_receipt


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sources", "error_type", "message"),
    [
        (
            SimpleNamespace(
                resolve=lambda *_args: (_ for _ in ()).throw(
                    ValueError("url resolves outside project")
                ),
                exists=lambda *_args: True,
            ),
            InvalidCreativeCanvasImageGenerationRequest,
            "url resolves outside project",
        ),
        (
            SimpleNamespace(
                resolve=lambda *_args: Path("missing.png"),
                exists=lambda *_args: False,
            ),
            CreativeCanvasImageGenerationReferenceMissing,
            "reference file not found: missing.png",
        ),
    ],
)
async def test_image_generation_maps_invalid_and_missing_references(
    tmp_path: Path,
    sources,
    error_type: type[Exception],
    message: str,
) -> None:
    class UnusedDependency:
        def compose(self, *_args):
            raise AssertionError("prompt composer must not be called")

        def resolve(self, *_args):
            raise AssertionError("model router must not be called")

        def new_id(self):
            raise AssertionError("job ids must not be called")

        async def enqueue(self, *_args):
            raise AssertionError("scheduler must not be called")

    context = _project_context(tmp_path)
    dependency = UnusedDependency()
    use_cases = CreativeCanvasImageGenerationUseCases(
        sources,
        dependency,
        dependency,
        dependency,
        dependency,
    )

    with pytest.raises(error_type, match=message):
        await use_cases.start(
            StartCreativeCanvasImageGenerationCommand(
                context=context,
                project_dir=context.output_dir,
                prompt="generate",
                aspect_ratio="1:1",
                image_size="2K",
                model="cloud-image-standard",
                reference_urls=("reference.png",),
            )
        )


@pytest.mark.asyncio
async def test_image_generation_maps_invalid_model_selection(tmp_path: Path) -> None:
    context = _project_context(tmp_path)

    class FakeModels:
        def resolve(self, *_args):
            raise ValueError("unsupported image model")

    class UnusedDependency:
        def compose(self, *_args):
            raise AssertionError("prompt composer must not be called")

        def new_id(self):
            return "job-1"

        async def enqueue(self, *_args):
            raise AssertionError("scheduler must not be called")

    dependency = UnusedDependency()
    use_cases = CreativeCanvasImageGenerationUseCases(
        SimpleNamespace(),
        dependency,
        FakeModels(),
        dependency,
        dependency,
    )

    with pytest.raises(
        InvalidCreativeCanvasImageGenerationRequest,
        match="unsupported image model",
    ):
        await use_cases.start(
            StartCreativeCanvasImageGenerationCommand(
                context=context,
                project_dir=context.output_dir,
                prompt="generate",
                aspect_ratio="1:1",
                image_size="2K",
                model="unsupported-image-model",
            )
        )


@pytest.mark.asyncio
async def test_image_generation_maps_unknown_style_template(tmp_path: Path) -> None:
    context = _project_context(tmp_path)

    class FakeJobIds:
        def new_id(self) -> str:
            return "job-1"

    class UnusedScheduler:
        async def enqueue(self, *_args):
            raise AssertionError("invalid style must not enqueue a task")

    use_cases = CreativeCanvasImageGenerationUseCases(
        SimpleNamespace(),
        FreezoneCreativeCanvasImagePromptComposer(),
        FreezoneCreativeCanvasImageGenerationModelRouter(),
        FakeJobIds(),
        UnusedScheduler(),
    )

    with pytest.raises(
        InvalidCreativeCanvasImageGenerationRequest,
        match="unknown image style template: missing-style",
    ):
        await use_cases.start(
            StartCreativeCanvasImageGenerationCommand(
                context=context,
                project_dir=context.output_dir,
                prompt="generate",
                aspect_ratio="1:1",
                image_size="2K",
                model="cloud-image-standard",
                style=CreativeCanvasImageStyleConfig(template_id="missing-style"),
            )
        )


def test_image_generation_model_router_preserves_explicit_model_sku() -> None:
    router = FreezoneCreativeCanvasImageGenerationModelRouter()

    assert router.resolve("newapi_gpt_image2") == "newapi_gpt_image2"
    assert router.resolve("custom-image-sku") == "custom-image-sku"
    with pytest.raises(ValueError, match="model is required"):
        router.resolve("")


@pytest.mark.asyncio
async def test_image_generation_route_maps_request_and_preserves_response_shape(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)
    expected_receipt = _receipt()
    captured: list[StartCreativeCanvasImageGenerationCommand] = []

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

    class FakeUseCases:
        async def start(self, command):
            captured.append(command)
            return expected_receipt

    monkeypatch.setattr(
        image_generation_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        image_generation_routes,
        "creative_canvas_image_generation_use_cases",
        lambda: FakeUseCases(),
    )

    result = await image_generation_routes.freezone_gen(
        project="project-1",
        body=FreezoneGenRequest(
            prompt="rain alley",
            aspect_ratio="16:9",
            image_size="4K",
            reference_urls=["first.png"],
            camera=FreezoneImageCameraConfig(
                camera_body="Panavision DXL2",
                lens="Arri Signature Prime",
                focal_length_mm=35,
                aperture="f/4",
            ),
            style=FreezoneImageStyleConfig(template_id="three_oclock_2300"),
            model="image-model",
            quality="high",
            canvas_id="canvas-1",
            node_id="node-1",
            model_id="registry-model",
            gen_mode="reference",
        ),
        user={"username": "alice"},
    )

    assert captured == [
        StartCreativeCanvasImageGenerationCommand(
            context=context,
            project_dir=context.output_dir,
            prompt="rain alley",
            aspect_ratio="16:9",
            image_size="4K",
            reference_urls=("first.png",),
            camera=CreativeCanvasImageCameraConfig(
                camera_body="Panavision DXL2",
                lens="Arri Signature Prime",
                focal_length_mm=35,
                aperture="f/4",
            ),
            style=CreativeCanvasImageStyleConfig(template_id="three_oclock_2300"),
            model="image-model",
            quality="high",
            canvas_id="canvas-1",
            node_id="node-1",
            model_id="registry-model",
            gen_mode="reference",
        )
    ]
    assert result == {
        "ok": True,
        "data": {
            "task_type": "freezone_gen",
            "job_id": "job-1",
            "task_key": "task:key:job-1",
            "backend": "inline",
            "queue": "inline",
            "task_id": "task-1",
        },
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "status_code", "detail"),
    [
        (
            InvalidCreativeCanvasImageGenerationRequest("invalid reference"),
            400,
            "invalid reference",
        ),
        (
            CreativeCanvasImageGenerationReferenceMissing(Path("missing.png")),
            404,
            "reference file not found: missing.png",
        ),
    ],
)
async def test_image_generation_route_preserves_error_contract(
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
        async def start(self, _command):
            raise failure

    monkeypatch.setattr(
        image_generation_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        image_generation_routes,
        "creative_canvas_image_generation_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        await image_generation_routes.freezone_gen(
            project="project-1",
            body=FreezoneGenRequest(
                prompt="generate",
                model="cloud-image-standard",
            ),
            user={"username": "alice"},
        )

    assert exc.value.status_code == status_code
    assert exc.value.detail == detail
