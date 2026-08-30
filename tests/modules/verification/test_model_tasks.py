from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import ProjectTaskSubmissionReceipt
from ai_anime.modules.verification.application.model_tasks import (
    ScheduleVerificationModelTask,
)
from ai_anime.modules.verification.infrastructure import task_services
from ai_anime.modules.task_execution.infrastructure.runners import (
    verification as verification_runner,
)


def _context(tmp_path: Path) -> ProjectContext:
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


@pytest.mark.asyncio
async def test_verification_scheduler_preserves_operation_scope_and_payload(
    tmp_path: Path,
) -> None:
    captured: list[object] = []

    class Submissions:
        async def submit(self, context, submission):
            assert context is project_context
            captured.append(submission)
            return ProjectTaskSubmissionReceipt(
                task_id="task-1",
                task_key="task:verification_model:project-1:2:beat_verify",
                backend="local",
                queue=None,
            )

    project_context = _context(tmp_path)
    scheduled = await ScheduleVerificationModelTask(Submissions()).execute(
        project_context,
        operation="beat_verify",
        episode=2,
        beat_num=3,
        payload={"verify_type": "sketch"},
        display_name="Beat 3 草图验证",
    )

    submission = captured[0]
    assert submission.task_type == "verification_model"
    assert submission.episode == 2
    assert submission.beat_num == 3
    assert submission.scope == "beat_verify"
    assert submission.payload == {
        "operation": "beat_verify",
        "display_name": "Beat 3 草图验证",
        "verify_type": "sketch",
    }
    assert scheduled.as_dict()["scope"] == "beat_verify"


@pytest.mark.asyncio
async def test_verification_runner_dispatches_the_queued_operation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    progress: list[dict[str, object]] = []

    async def run_operation(**kwargs):
        captured.update(kwargs)
        return {"score": 9}

    class Manager:
        def update_progress_for_project(self, _context, _task_type, _episode, **kwargs):
            progress.append(kwargs)

    from ai_anime.modules.verification import public as verification_public

    monkeypatch.setattr(
        verification_public,
        "run_verification_model_operation",
        run_operation,
    )
    monkeypatch.setattr(verification_runner, "get_task_manager", lambda: Manager())

    context = _context(tmp_path)
    result = await verification_runner._run_verification_model(
        {
            "task_type": "verification_model",
            "episode": 2,
            "beat_num": 3,
            "scope": "score_beat",
            "payload": {
                "operation": "score_beat",
                "display_name": "Beat 3 草图评分",
                "pool_id": "candidate-1",
            },
        },
        context,
    )

    assert result == {"score": 9}
    assert captured == {
        "context": context,
        "operation": "score_beat",
        "episode": 2,
        "beat_num": 3,
        "payload": {"pool_id": "candidate-1"},
        "progress_callback": captured["progress_callback"],
        "log_callback": captured["log_callback"],
    }
    assert progress[0]["scope"] == "score_beat"
    assert progress[-1]["progress"] == 0.98


@pytest.mark.asyncio
async def test_sketch_select_closes_store_when_preflight_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = SimpleNamespace(closed=False)

    async def close() -> None:
        store.closed = True

    store.close = close
    monkeypatch.setattr(
        task_services,
        "_make_sqlite_store",
        lambda *_args, **_kwargs: _async_value(store),
    )
    monkeypatch.setattr(
        task_services,
        "load_all_beats",
        lambda *_args, **_kwargs: _async_value([]),
    )
    from ai_anime.modules.production import public as production_public

    monkeypatch.setattr(production_public, "load_pool_index", lambda _path: None)

    with pytest.raises(FileNotFoundError, match="No pool index found"):
        await task_services.run_sketch_select_episode(
            username="alice",
            project="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            episode_num=1,
            quality_threshold=7.0,
            score_gap_for_auto_select=1.0,
            color_prefilter=True,
            fact_check=True,
            promote_selected=False,
        )

    assert store.closed is True


async def _async_value(value):
    return value
