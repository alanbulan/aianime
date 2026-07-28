from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.canvas_image_schemas import FreezoneImageTo3GSRequest
from ai_anime.api.routes.canvas import image as image_to_three_gs_routes
from ai_anime.modules.creative_canvas.application.image_to_3gs import (
    CREATIVE_CANVAS_IMAGE_TO_THREE_GS_TASK_TYPE,
    CreativeCanvasImageToThreeGsSourceMissing,
    CreativeCanvasImageToThreeGsUseCases,
    InvalidCreativeCanvasImageToThreeGsRequest,
    StartCreativeCanvasImageToThreeGsCommand,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskStartFailed,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain.image_to_3gs import (
    InvalidCreativeCanvasImageToThreeGsSource,
    infer_image_to_three_gs_scene_id,
    plan_image_to_three_gs,
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
        task_type=CREATIVE_CANVAS_IMAGE_TO_THREE_GS_TASK_TYPE,
        job_id=job_id,
        task_key=f"task:key:{job_id}",
        task_episode=0,
        task_scope=job_id,
        backend="inline",
        queue="inline",
        task_id="task-1",
    )


@pytest.mark.parametrize(
    ("relative_path", "scene_id"),
    [
        ("assets/scenes/rain-alley/master.png", "rain-alley"),
        ("director_worlds/world-1/pano.webp", "world-1"),
        ("freezone/_uploads/source.jpg", "source"),
    ],
)
def test_image_to_three_gs_scene_id_inference(
    tmp_path: Path,
    relative_path: str,
    scene_id: str,
) -> None:
    source_path = tmp_path / Path(relative_path)

    assert infer_image_to_three_gs_scene_id(source_path, tmp_path) == scene_id


@pytest.mark.parametrize(
    ("source_kind", "step"),
    [("master", "single_face_sharp"), ("reverse", "single_face_sharp")],
)
def test_image_to_three_gs_single_face_plan_preserves_sharp_parameters(
    tmp_path: Path,
    source_kind: str,
    step: str,
) -> None:
    source_path = tmp_path / "assets" / "scenes" / "rain-alley" / "master.png"
    source_url = "/static/alice/demo/assets/scenes/rain-alley/master.png"

    plan = plan_image_to_three_gs(
        source_path=source_path,
        project_dir=tmp_path,
        source_url=source_url,
        source_kind=source_kind,
    )

    assert plan.scene_id == "rain-alley"
    assert plan.source_kind == source_kind
    assert plan.step == step
    assert plan.params == {
        "image_path": source_path.as_posix(),
        "source_kind": source_kind,
        "face_name": "front",
        "depth_meters": 8.0,
        "device": "auto",
        "face_size": 768,
        "internal_size": 1536,
        "max_gaussians_per_face": 1_000_000,
        "timeout_seconds": 1800,
        "source_url": source_url,
    }


def test_image_to_three_gs_pano_plan_preserves_sharp_parameters(
    tmp_path: Path,
) -> None:
    source_path = tmp_path / "director_worlds" / "world-1" / "pano.webp"
    source_url = "/static/alice/demo/director_worlds/world-1/pano.webp"

    plan = plan_image_to_three_gs(
        source_path=source_path,
        project_dir=tmp_path,
        source_url=source_url,
        source_kind="pano",
    )

    assert plan.scene_id == "world-1"
    assert plan.source_kind == "pano"
    assert plan.step == "pano_sharp"
    assert plan.params == {
        "pano_path": source_path.as_posix(),
        "depth_source": "da2",
        "depth_device": "auto",
        "device": "auto",
        "face_size": 768,
        "internal_size": 1536,
        "max_gaussians_per_face": 1_000_000,
        "timeout_seconds": 1800,
        "source_url": source_url,
    }


def test_image_to_three_gs_plan_rejects_non_image_source(tmp_path: Path) -> None:
    source_path = tmp_path / "source.txt"

    with pytest.raises(
        InvalidCreativeCanvasImageToThreeGsSource,
        match="source must be an image",
    ):
        plan_image_to_three_gs(
            source_path=source_path,
            project_dir=tmp_path,
            source_url="source.txt",
            source_kind="master",
        )


@pytest.mark.asyncio
async def test_image_to_three_gs_use_case_enqueues_exact_task_payload(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    source_path = (
        context.output_dir / "assets" / "scenes" / "rain-alley" / "master.png"
    )
    source_url = "/static/alice/demo/assets/scenes/rain-alley/master.png"
    expected_receipt = _receipt()

    class FakeSources:
        def resolve(self, project_dir: Path, received_source_url: str) -> Path:
            assert project_dir == context.output_dir
            assert received_source_url == source_url
            return source_path

        def exists(self, image_path: Path) -> bool:
            assert image_path == source_path
            return True

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
                task_type=CREATIVE_CANVAS_IMAGE_TO_THREE_GS_TASK_TYPE,
                queue_kind="world",
                job_id="job-1",
                project_dir=context.output_dir,
                payload={
                    "scene_id": "rain-alley",
                    "source_path": source_path.as_posix(),
                    "source_kind": "master",
                    "params": {
                        "image_path": source_path.as_posix(),
                        "source_kind": "master",
                        "face_name": "front",
                        "depth_meters": 8.0,
                        "device": "auto",
                        "face_size": 768,
                        "internal_size": 1536,
                        "max_gaussians_per_face": 1_000_000,
                        "timeout_seconds": 1800,
                        "source_url": source_url,
                    },
                    "canvas_id": "canvas-1",
                    "node_id": "node-1",
                },
            )
            return expected_receipt

    result = await CreativeCanvasImageToThreeGsUseCases(
        FakeSources(),
        FakeJobIds(),
        FakeScheduler(),
    ).start(
        StartCreativeCanvasImageToThreeGsCommand(
            context=context,
            project_dir=context.output_dir,
            source_url=source_url,
            source_kind="master",
            canvas_id="canvas-1",
            node_id="node-1",
        )
    )

    assert result.receipt is expected_receipt
    assert result.scope == "job-1"
    assert result.scene_id == "rain-alley"
    assert result.step == "single_face_sharp"


@pytest.mark.asyncio
async def test_image_to_three_gs_use_case_maps_invalid_and_missing_sources(
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

    class NonImageSources:
        def resolve(self, *_args) -> Path:
            return tmp_path / "source.txt"

        def exists(self, *_args) -> bool:
            return True

    class UnusedDependency:
        def new_id(self) -> str:
            raise AssertionError("job ids must not be called")

        async def enqueue(self, *_args):
            raise AssertionError("scheduler must not be called")

    command = StartCreativeCanvasImageToThreeGsCommand(
        context=context,
        project_dir=context.output_dir,
        source_url="source.png",
        source_kind="master",
    )

    with pytest.raises(
        InvalidCreativeCanvasImageToThreeGsRequest,
        match="resolved path escapes project directory",
    ):
        await CreativeCanvasImageToThreeGsUseCases(
            InvalidSources(),
            UnusedDependency(),
            UnusedDependency(),
        ).start(command)

    with pytest.raises(
        CreativeCanvasImageToThreeGsSourceMissing,
        match="source not found",
    ) as exc:
        await CreativeCanvasImageToThreeGsUseCases(
            MissingSources(),
            UnusedDependency(),
            UnusedDependency(),
        ).start(command)
    assert exc.value.source_path == tmp_path / "missing.png"

    with pytest.raises(
        InvalidCreativeCanvasImageToThreeGsRequest,
        match="source must be an image",
    ):
        await CreativeCanvasImageToThreeGsUseCases(
            NonImageSources(),
            UnusedDependency(),
            UnusedDependency(),
        ).start(command)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "status_code", "detail"),
    [
        (
            InvalidCreativeCanvasImageToThreeGsRequest("invalid source"),
            400,
            "invalid source",
        ),
        (
            CreativeCanvasImageToThreeGsSourceMissing(Path("missing.png")),
            404,
            "source not found: missing.png",
        ),
        (
            CreativeCanvasTaskStartFailed("broker unavailable"),
            503,
            "failed to start image-to-3gs task: broker unavailable",
        ),
    ],
)
async def test_image_to_three_gs_route_preserves_error_contract(
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
            assert command.source_kind == "master"
            assert command.canvas_id == "canvas-1"
            assert command.node_id == "node-1"
            raise failure

    monkeypatch.setattr(
        image_to_three_gs_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        image_to_three_gs_routes,
        "creative_canvas_image_to_three_gs_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        await image_to_three_gs_routes.freezone_image_to_3gs(
            project="project-1",
            body=FreezoneImageTo3GSRequest(
                source_url="source.png",
                source_kind="master",
                canvas_id="canvas-1",
                node_id="node-1",
            ),
            user={"username": "alice"},
        )

    assert exc.value.status_code == status_code
    assert exc.value.detail == detail
