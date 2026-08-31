from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.domain.task_restart_recovery import (
    PROJECT_TASK_CHILD_PROCESS_ENV,
)
from ai_anime.modules.task_execution.infrastructure import native_task_isolation


def _ctx(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-native",
        project_name="中文项目",
        owner_type="user",
        owner_id="owner",
        owner_username="alice",
        requester_user_id="editor",
        requester_username="bob",
        requester_principals=(("user", "editor"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "输出",
        state_dir=tmp_path / "状态",
        runtime_dir=tmp_path / "运行",
        is_home_node=True,
    )


@pytest.mark.parametrize(
    ("task_type", "backend", "expected"),
    [
        ("ingest_fast", "inline", True),
        ("build_characters", "inline", True),
        ("build_scenes", "inline", True),
        ("build_props", "inline", True),
        ("build_episodes", "inline", True),
        ("selected_regen", "inline", True),
        ("sketch_regen", "inline", True),
        ("production_workflow", "inline", False),
        ("ingest_fast", "celery", False),
    ],
)
def test_only_inline_native_graph_tasks_are_isolated(
    monkeypatch,
    task_type: str,
    backend: str,
    expected: bool,
) -> None:
    monkeypatch.delenv(PROJECT_TASK_CHILD_PROCESS_ENV, raising=False)

    assert native_task_isolation.should_isolate_project_task(
        task_type,
        {"backend": backend},
    ) is expected


def test_child_process_never_recursively_isolates(monkeypatch) -> None:
    monkeypatch.setenv(PROJECT_TASK_CHILD_PROCESS_ENV, "1")

    assert not native_task_isolation.should_isolate_project_task(
        "ingest_fast",
        {"backend": "inline"},
    )


def test_isolated_runner_returns_child_result(tmp_path: Path, monkeypatch) -> None:
    from ai_anime.modules.task_execution.infrastructure import project_subprocesses

    observed: dict[str, object] = {}

    def fake_worker_command(module: str) -> list[str]:
        observed["module"] = module
        return ["python", "native-worker"]

    def fake_subprocess(args, *, cancellation_check, env, **kwargs):
        observed["args"] = list(args)
        observed["env"] = env
        request_path = Path(args[-2])
        result_path = Path(args[-1])
        observed["request"] = request_path.read_text(encoding="utf-8")
        result_path.write_text(
            '{"ok": true, "result": {"characters": 3}}',
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(args, 0)

    monkeypatch.setattr(
        native_task_isolation,
        "native_project_task_worker_command",
        lambda: fake_worker_command(native_task_isolation.__name__),
    )
    monkeypatch.setattr(
        project_subprocesses,
        "run_project_model_subprocess",
        fake_subprocess,
    )

    result = native_task_isolation.run_isolated_project_task(
        {
            "project_id": "project-native",
            "task_type": "build_characters",
            "__run_task_id": "task-1",
        },
        _ctx(tmp_path),
        cancellation_check=lambda **kwargs: None,
    )

    assert result == {"characters": 3}
    assert "中文项目" in str(observed["request"])
    assert observed["env"][PROJECT_TASK_CHILD_PROCESS_ENV] == "1"


def test_native_crash_is_reported_without_losing_parent_process(
    tmp_path: Path,
    monkeypatch,
) -> None:
    from ai_anime.modules.task_execution.infrastructure import project_subprocesses

    monkeypatch.setattr(
        native_task_isolation,
        "native_project_task_worker_command",
        lambda: ["worker"],
    )
    monkeypatch.setattr(
        project_subprocesses,
        "run_project_model_subprocess",
        lambda *args, **kwargs: subprocess.CompletedProcess(args, -1073740940),
    )

    with pytest.raises(RuntimeError, match="0xC0000374"):
        native_task_isolation.run_isolated_project_task(
            {
                "project_id": "project-native",
                "task_type": "ingest_fast",
                "__run_task_id": "task-2",
            },
            _ctx(tmp_path),
            cancellation_check=lambda **kwargs: None,
        )


def test_native_worker_command_supports_source_and_frozen_runtimes(monkeypatch) -> None:
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.setattr(sys, "executable", "python-test")

    assert native_task_isolation.native_project_task_worker_command() == [
        "python-test",
        "-m",
        native_task_isolation.__name__,
    ]

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert native_task_isolation.native_project_task_worker_command() == [
        "python-test",
        "--internal-worker",
        "native-project-task",
    ]
