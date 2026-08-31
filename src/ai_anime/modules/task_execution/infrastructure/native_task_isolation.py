"""Run blocking native tasks outside the long-lived API process."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import traceback
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.domain.task_restart_recovery import (
    PROJECT_TASK_CHILD_PROCESS_ENV,
)
from ai_anime.shared.infrastructure.internal_workers import (
    InternalWorkerSpec,
    internal_worker_command,
)

_SCHEMA_VERSION = 1
NATIVE_PROJECT_TASK_WORKER = InternalWorkerSpec("native-project-task", __name__)
ISOLATED_NATIVE_TASK_TYPES = frozenset(
    {
        "ingest_fast",
        "build_characters",
        "build_scenes",
        "build_props",
        "build_episodes",
        "selected_regen",
        "sketch_regen",
    }
)
TaskCancellationCheck = Callable[..., Awaitable[bool]]


def native_project_task_worker_command() -> list[str]:
    """Build the task-execution worker command for source and frozen runtimes."""

    return internal_worker_command(NATIVE_PROJECT_TASK_WORKER)


def should_isolate_project_task(
    task_type: str,
    metadata: dict[str, Any] | None,
) -> bool:
    return (
        str((metadata or {}).get("backend") or "").strip().lower() == "inline"
        and task_type in ISOLATED_NATIVE_TASK_TYPES
        and os.environ.get(PROJECT_TASK_CHILD_PROCESS_ENV) != "1"
    )


def wrap_project_task_runner(
    task_type: str,
    runner: Callable[[dict[str, Any], Any], dict[str, Any] | None] | None,
    *,
    metadata: dict[str, Any] | None,
    cancellation_check: TaskCancellationCheck,
):
    if runner is None or not should_isolate_project_task(task_type, metadata):
        return runner

    def run_isolated(envelope: dict[str, Any], context: ProjectContext):
        return run_isolated_project_task(
            envelope,
            context,
            cancellation_check=cancellation_check,
        )

    return run_isolated


def _context_payload(context: ProjectContext) -> dict[str, Any]:
    return {
        "project_id": context.project_id,
        "project_name": context.project_name,
        "owner_type": context.owner_type,
        "owner_id": context.owner_id,
        "owner_username": context.owner_username,
        "requester_user_id": context.requester_user_id,
        "requester_username": context.requester_username,
        "requester_principals": [list(item) for item in context.requester_principals],
        "effective_role": context.effective_role,
        "home_node_id": context.home_node_id,
        "output_dir": str(context.output_dir),
        "state_dir": str(context.state_dir),
        "runtime_dir": str(context.runtime_dir),
        "is_home_node": context.is_home_node,
    }


def _context_from_payload(payload: dict[str, Any]) -> ProjectContext:
    return ProjectContext(
        project_id=str(payload["project_id"]),
        project_name=str(payload["project_name"]),
        owner_type=str(payload["owner_type"]),
        owner_id=str(payload["owner_id"]),
        owner_username=str(payload["owner_username"]),
        requester_user_id=str(payload["requester_user_id"]),
        requester_username=str(payload["requester_username"]),
        requester_principals=tuple(
            (str(item[0]), str(item[1]))
            for item in payload.get("requester_principals") or []
        ),
        effective_role=str(payload["effective_role"]),
        home_node_id=str(payload["home_node_id"]),
        output_dir=Path(str(payload["output_dir"])),
        state_dir=Path(str(payload["state_dir"])),
        runtime_dir=Path(str(payload["runtime_dir"])),
        is_home_node=bool(payload["is_home_node"]),
    )


def _exit_code_label(returncode: int) -> str:
    if returncode < 0 or returncode > 255:
        return f"{returncode} / 0x{returncode & 0xFFFFFFFF:08X}"
    return str(returncode)


def _read_child_result(result_path: Path) -> dict[str, Any] | None:
    if not result_path.is_file():
        return None
    try:
        payload = json.loads(result_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def run_isolated_project_task(
    envelope: dict[str, Any],
    context: ProjectContext,
    *,
    cancellation_check: TaskCancellationCheck,
) -> dict[str, Any] | None:
    from ai_anime.modules.task_execution.infrastructure.project_subprocesses import (
        run_project_model_subprocess,
    )

    with tempfile.TemporaryDirectory(prefix="ai-anime-native-task-") as temp_root:
        root = Path(temp_root)
        request_path = root / "request.json"
        result_path = root / "result.json"
        request_path.write_text(
            json.dumps(
                {
                    "schema": _SCHEMA_VERSION,
                    "envelope": envelope,
                    "context": _context_payload(context),
                },
                ensure_ascii=False,
                default=str,
            ),
            encoding="utf-8",
        )
        child_env = dict(os.environ)
        child_env[PROJECT_TASK_CHILD_PROCESS_ENV] = "1"
        completed = run_project_model_subprocess(
            [
                *native_project_task_worker_command(),
                str(request_path),
                str(result_path),
            ],
            cancellation_check=cancellation_check,
            env=child_env,
            text=True,
        )
        child_result = _read_child_result(result_path)
        if completed.returncode != 0:
            if child_result and child_result.get("error"):
                raise RuntimeError(
                    f"本地任务子进程执行失败：{child_result['error']}"
                )
            raise RuntimeError(
                "本地任务子进程异常退出"
                f"（code={_exit_code_label(completed.returncode)}）；"
                "本地服务已保持运行，可重新发起该步骤"
            )
        if not child_result or child_result.get("ok") is not True:
            raise RuntimeError("本地任务子进程未返回有效结果")
        result = child_result.get("result")
        return result if isinstance(result, dict) else None


def _write_result(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, default=str),
        encoding="utf-8",
    )


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("native project task requires request and result paths")
    request_path = Path(sys.argv[1])
    result_path = Path(sys.argv[2])
    try:
        from ai_anime.modules.model_usage.public import load_model_access_from_stdin
        from ai_anime.shared.ports.registry import ensure_bootstrap

        load_model_access_from_stdin()
        ensure_bootstrap()
        payload = json.loads(request_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or payload.get("schema") != _SCHEMA_VERSION:
            raise RuntimeError("本地任务子进程请求格式无效")
        envelope = dict(payload.get("envelope") or {})
        context = _context_from_payload(dict(payload.get("context") or {}))

        from ai_anime.modules.task_execution.infrastructure.project_task_runtime import (
            ensure_builtin_runners_registered,
            project_task_run_context,
        )
        from ai_anime.modules.task_execution.infrastructure.runner_registry import (
            get_project_task_runner,
        )

        ensure_builtin_runners_registered()
        task_type = str(envelope.get("task_type") or "")
        if task_type not in ISOLATED_NATIVE_TASK_TYPES:
            raise RuntimeError(f"不支持隔离执行任务：{task_type}")
        runner = get_project_task_runner(task_type)
        if runner is None:
            raise RuntimeError(f"未注册任务执行器：{task_type}")
        run_task_id = str(envelope.get("__run_task_id") or "")
        with project_task_run_context(run_task_id):
            result = runner(envelope, context)
        _write_result(result_path, {"ok": True, "result": result or {"ok": True}})
        return 0
    except BaseException as exc:  # noqa: BLE001
        traceback.print_exc()
        try:
            from ai_anime.shared.utils.error_redaction import safe_exception_message

            error = safe_exception_message(exc if isinstance(exc, Exception) else Exception(str(exc)))
        except Exception:
            error = type(exc).__name__
        _write_result(result_path, {"ok": False, "error": error})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "ISOLATED_NATIVE_TASK_TYPES",
    "NATIVE_PROJECT_TASK_WORKER",
    "main",
    "native_project_task_worker_command",
    "run_isolated_project_task",
    "should_isolate_project_task",
    "wrap_project_task_runner",
]
