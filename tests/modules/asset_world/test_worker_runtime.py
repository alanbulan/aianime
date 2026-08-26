from __future__ import annotations

import importlib
import sys
from types import SimpleNamespace

import pytest

from ai_anime.modules.asset_world.infrastructure.director_world import worker_runtime


def test_allowlisted_worker_modules_are_importable() -> None:
    for worker_name, module_name in worker_runtime._WORKER_MODULES.items():
        module = importlib.import_module(module_name)

        assert callable(getattr(module, "main", None)), worker_name


def test_worker_command_uses_python_module_in_source_runtime(monkeypatch):
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.setattr(sys, "executable", "python-test")

    assert worker_runtime.worker_command(worker_runtime.SCENE_360_BUILDER_MODULE) == [
        "python-test",
        "-m",
        worker_runtime.SCENE_360_BUILDER_MODULE,
    ]


def test_worker_command_uses_allowlisted_dispatch_in_frozen_runtime(monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", "ai-anime-backend.exe")

    assert worker_runtime.worker_command(worker_runtime.SCENE_360_BUILDER_MODULE) == [
        "ai-anime-backend.exe",
        "--internal-worker",
        "scene-360-builder",
    ]


def test_worker_command_rejects_unknown_module():
    with pytest.raises(ValueError, match="Unsupported packaged worker module"):
        worker_runtime.worker_command("untrusted.module")


def test_dispatch_internal_worker_forwards_arguments(monkeypatch):
    calls: list[list[str]] = []
    module = SimpleNamespace(main=lambda: calls.append(list(sys.argv)))
    monkeypatch.setattr(worker_runtime.importlib, "import_module", lambda _name: module)

    exit_code = worker_runtime.dispatch_internal_worker(
        ["--internal-worker", "scene-360-builder", "--scene-name", "中文场景"]
    )

    assert exit_code == 0
    assert calls == [
        [
            worker_runtime.SCENE_360_BUILDER_MODULE,
            "--scene-name",
            "中文场景",
        ]
    ]


def test_dispatch_internal_worker_rejects_unknown_name():
    with pytest.raises(SystemExit, match="Unknown internal worker"):
        worker_runtime.dispatch_internal_worker(
            ["--internal-worker", "untrusted-worker"]
        )
