from __future__ import annotations

import importlib
import sys

import pytest

from ai_anime.modules.asset_world.infrastructure.director_world import worker_runtime


def test_allowlisted_worker_modules_are_importable() -> None:
    for worker in worker_runtime.DIRECTOR_WORLD_WORKERS:
        module = importlib.import_module(worker.module)

        assert callable(getattr(module, "main", None)), worker.name


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


def test_director_world_declares_its_complete_worker_set() -> None:
    workers = worker_runtime.DIRECTOR_WORLD_WORKERS

    assert len({worker.name for worker in workers}) == len(workers)
    assert len({worker.module for worker in workers}) == len(workers)
