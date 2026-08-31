from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from ai_anime.shared.infrastructure import internal_workers


def _workers() -> tuple[internal_workers.InternalWorkerSpec, ...]:
    return (
        internal_workers.InternalWorkerSpec("asset-worker", "example.asset"),
        internal_workers.InternalWorkerSpec("task-worker", "example.task"),
    )


def test_dispatch_internal_worker_uses_the_composed_registry(monkeypatch) -> None:
    calls: list[list[str]] = []
    module = SimpleNamespace(main=lambda: calls.append(list(sys.argv)))
    monkeypatch.setattr(
        internal_workers.importlib,
        "import_module",
        lambda _name: module,
    )

    exit_code = internal_workers.dispatch_internal_worker(
        tuple(reversed(_workers())),
        ["--internal-worker", "asset-worker", "--scene-name", "中文场景"],
    )

    assert exit_code == 0
    assert calls == [["example.asset", "--scene-name", "中文场景"]]


def test_dispatch_internal_worker_reports_the_complete_allowlist() -> None:
    with pytest.raises(SystemExit) as exc_info:
        internal_workers.dispatch_internal_worker(
            _workers(),
            ["--internal-worker", "untrusted-worker"],
        )

    message = str(exc_info.value)
    assert "Unknown internal worker" in message
    assert "asset-worker" in message
    assert "task-worker" in message
