from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.canvas import image as reverse_prompt_routes
from ai_anime.api.schemas import FreezoneImageReversePromptRequest
from ai_anime.modules.creative_canvas.application.reverse_prompt import (
    CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE,
    CreativeCanvasReversePromptSourceMissing,
    CreativeCanvasReversePromptStartFailed,
    CreativeCanvasReversePromptTask,
    CreativeCanvasReversePromptTaskReceipt,
    CreativeCanvasReversePromptUseCases,
    InvalidCreativeCanvasReversePromptRequest,
    StartCreativeCanvasReversePromptCommand,
)
from ai_anime.modules.creative_canvas.infrastructure.image_sources import (
    ProjectCreativeCanvasImageSourceResolver,
)
from ai_anime.modules.creative_canvas.infrastructure.reverse_prompt import (
    TaskBackendCreativeCanvasReversePromptScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_backend.limits import (
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
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


def _receipt(job_id: str = "job-1") -> CreativeCanvasReversePromptTaskReceipt:
    return CreativeCanvasReversePromptTaskReceipt(
        task_type=CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE,
        job_id=job_id,
        task_key=f"task:key:{job_id}",
        task_episode=0,
        task_scope=job_id,
        backend="inline",
        queue="inline",
        task_id="task-1",
    )


@pytest.mark.asyncio
async def test_reverse_prompt_use_case_enqueues_resolved_source(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    source_path = tmp_path / "output" / "freezone" / "_uploads" / "source.png"
    expected = _receipt()

    class FakeSources:
        def resolve(self, project_dir: Path, source_url: str) -> Path:
            assert project_dir == context.output_dir
            assert source_url == "/static/alice/demo/freezone/_uploads/source.png"
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
            task: CreativeCanvasReversePromptTask,
        ) -> CreativeCanvasReversePromptTaskReceipt:
            assert received_context is context
            assert task == CreativeCanvasReversePromptTask(
                job_id="job-1",
                project_dir=context.output_dir,
                source_path=source_path,
                canvas_id="canvas-1",
                node_id="node-1",
            )
            return expected

    result = await CreativeCanvasReversePromptUseCases(
        FakeSources(),
        FakeJobIds(),
        FakeScheduler(),
    ).start(
        StartCreativeCanvasReversePromptCommand(
            context=context,
            project_dir=context.output_dir,
            source_url="/static/alice/demo/freezone/_uploads/source.png",
            canvas_id="canvas-1",
            node_id="node-1",
        )
    )

    assert result is expected


@pytest.mark.asyncio
async def test_reverse_prompt_use_case_rejects_missing_source_url(
    tmp_path: Path,
) -> None:
    class UnusedSources:
        def resolve(self, *_args) -> Path:
            raise AssertionError("source resolver must not be called")

        def exists(self, *_args) -> bool:
            raise AssertionError("source resolver must not be called")

    class UnusedDependency:
        def new_id(self) -> str:
            raise AssertionError("job ids must not be called")

        async def enqueue(self, *_args):
            raise AssertionError("scheduler must not be called")

    with pytest.raises(
        InvalidCreativeCanvasReversePromptRequest,
        match="source_url is required",
    ):
        await CreativeCanvasReversePromptUseCases(
            UnusedSources(),
            UnusedDependency(),
            UnusedDependency(),
        ).start(
            StartCreativeCanvasReversePromptCommand(
                context=_project_context(tmp_path),
                project_dir=tmp_path,
                source_url="",
            )
        )


@pytest.mark.asyncio
async def test_reverse_prompt_use_case_maps_invalid_and_missing_source(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    missing_path = tmp_path / "missing.png"

    class InvalidSources:
        def resolve(self, *_args) -> Path:
            raise ValueError("resolved path escapes project directory")

        def exists(self, *_args) -> bool:
            raise AssertionError("exists must not be called")

    class MissingSources:
        def resolve(self, *_args) -> Path:
            return missing_path

        def exists(self, image_path: Path) -> bool:
            assert image_path == missing_path
            return False

    class UnusedJobIds:
        def new_id(self) -> str:
            raise AssertionError("job ids must not be called")

    class UnusedScheduler:
        async def enqueue(self, *_args):
            raise AssertionError("scheduler must not be called")

    command = StartCreativeCanvasReversePromptCommand(
        context=context,
        project_dir=context.output_dir,
        source_url="source.png",
    )
    with pytest.raises(
        InvalidCreativeCanvasReversePromptRequest,
        match="resolved path escapes project directory",
    ):
        await CreativeCanvasReversePromptUseCases(
            InvalidSources(),
            UnusedJobIds(),
            UnusedScheduler(),
        ).start(command)

    with pytest.raises(
        CreativeCanvasReversePromptSourceMissing,
        match="source not found",
    ) as exc:
        await CreativeCanvasReversePromptUseCases(
            MissingSources(),
            UnusedJobIds(),
            UnusedScheduler(),
        ).start(command)
    assert exc.value.source_path == missing_path


def test_project_image_source_resolver_reports_file_existence(tmp_path: Path) -> None:
    source = tmp_path / "freezone" / "_uploads" / "source.png"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"image")
    resolver = ProjectCreativeCanvasImageSourceResolver()

    resolved = resolver.resolve(
        tmp_path,
        "/static/alice/demo/freezone/_uploads/source.png",
    )

    assert resolved == source.resolve()
    assert resolver.exists(resolved) is True
    assert resolver.exists(tmp_path / "missing.png") is False


@pytest.mark.asyncio
async def test_task_backend_reverse_prompt_scheduler_preserves_payload_and_receipt(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    captured: dict[str, object] = {}

    class FakeBackend:
        async def enqueue_project_task(self, received_context, **kwargs):
            assert received_context is context
            captured.update(kwargs)
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id="task-1"),
                backend="celery",
                queue="node.local.default",
            )

    task = CreativeCanvasReversePromptTask(
        job_id="job-1",
        project_dir=context.output_dir,
        source_path=context.output_dir / "freezone" / "_uploads" / "source.png",
        canvas_id="canvas-1",
        node_id="node-1",
    )
    result = await TaskBackendCreativeCanvasReversePromptScheduler(
        lambda: FakeBackend()
    ).enqueue(context, task)

    assert captured == {
        "task_type": CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE,
        "queue_kind": "default",
        "episode": 0,
        "scope": "job-1",
        "payload": {
            "job_id": "job-1",
            "project_dir": str(context.output_dir),
            "source_path": task.source_path.as_posix(),
            "canvas_id": "canvas-1",
            "node_id": "node-1",
        },
    }
    assert result.task_type == CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE
    assert result.job_id == "job-1"
    assert (
        result.task_key
        == "task:freezone_image_reverse_prompt:project:project-1:0:job-1"
    )
    assert result.task_episode == 0
    assert result.task_scope == "job-1"
    assert result.backend == "celery"
    assert result.queue == "node.local.default"
    assert result.task_id == "task-1"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [
        ProjectTaskLimitExceeded(
            project_id="project-1",
            queue_kind="default",
            limit=2,
            active=2,
        ),
        ProjectUserTaskLimitExceeded(
            project_id="project-1",
            requester_user_id="user-1",
            queue_kind="default",
            limit=1,
            active=1,
        ),
    ],
)
async def test_task_backend_reverse_prompt_scheduler_preserves_limit_errors(
    tmp_path: Path,
    failure: RuntimeError,
) -> None:
    class FailingBackend:
        async def enqueue_project_task(self, *_args, **_kwargs):
            raise failure

    scheduler = TaskBackendCreativeCanvasReversePromptScheduler(
        lambda: FailingBackend()
    )

    with pytest.raises(type(failure)) as exc:
        await scheduler.enqueue(
            _project_context(tmp_path),
            CreativeCanvasReversePromptTask(
                job_id="job-1",
                project_dir=tmp_path,
                source_path=tmp_path / "source.png",
            ),
        )
    assert exc.value is failure


@pytest.mark.asyncio
async def test_task_backend_reverse_prompt_scheduler_maps_runtime_failure(
    tmp_path: Path,
) -> None:
    class FailingBackend:
        async def enqueue_project_task(self, *_args, **_kwargs):
            raise RuntimeError("broker unavailable")

    with pytest.raises(
        CreativeCanvasReversePromptStartFailed,
        match="broker unavailable",
    ):
        await TaskBackendCreativeCanvasReversePromptScheduler(
            lambda: FailingBackend()
        ).enqueue(
            _project_context(tmp_path),
            CreativeCanvasReversePromptTask(
                job_id="job-1",
                project_dir=tmp_path,
                source_path=tmp_path / "source.png",
            ),
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "status_code", "detail"),
    [
        (
            InvalidCreativeCanvasReversePromptRequest("invalid source"),
            400,
            "invalid source",
        ),
        (
            CreativeCanvasReversePromptSourceMissing(Path("missing.png")),
            404,
            "source not found: missing.png",
        ),
        (
            CreativeCanvasReversePromptStartFailed("broker unavailable"),
            500,
            "reverse prompt failed: broker unavailable",
        ),
    ],
)
async def test_reverse_prompt_route_preserves_error_contract(
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
            raise failure

    monkeypatch.setattr(
        reverse_prompt_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        reverse_prompt_routes,
        "creative_canvas_reverse_prompt_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        await reverse_prompt_routes.freezone_image_reverse_prompt(
            project="project-1",
            body=FreezoneImageReversePromptRequest(source_url="source.png"),
            user={"username": "alice"},
        )

    assert exc.value.status_code == status_code
    assert exc.value.detail == detail
