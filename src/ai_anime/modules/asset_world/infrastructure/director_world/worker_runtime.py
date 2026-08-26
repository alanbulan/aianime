"""Allowlisted subprocess dispatch for packaged DirectorWorld workers."""

from __future__ import annotations

import importlib
import sys
from collections.abc import Sequence


SCENE_360_BUILDER_MODULE = (
    "ai_anime.modules.asset_world.infrastructure.director_world.scene_360_builder"
)
SCENE_OVERLAP_ANALYZER_MODULE = (
    "ai_anime.modules.asset_world.infrastructure.director_world.scene_overlap_analyzer"
)
SCENE_SPATIAL_CONTRACT_MODULE = (
    "ai_anime.modules.asset_world.infrastructure.director_world.scene_spatial_contract"
)
BLOCK_WORLD_BUILDER_MODULE = (
    "ai_anime.modules.asset_world.infrastructure.director_world.block_world_builder"
)
NATIVE_PROJECT_TASK_MODULE = (
    "ai_anime.modules.task_execution.infrastructure.native_task_isolation"
)

_WORKER_MODULES = {
    "scene-360-builder": SCENE_360_BUILDER_MODULE,
    "scene-overlap-analyzer": SCENE_OVERLAP_ANALYZER_MODULE,
    "scene-spatial-contract": SCENE_SPATIAL_CONTRACT_MODULE,
    "block-world-builder": BLOCK_WORLD_BUILDER_MODULE,
    "native-project-task": NATIVE_PROJECT_TASK_MODULE,
}
_WORKER_NAMES_BY_MODULE = {module: name for name, module in _WORKER_MODULES.items()}


def worker_command(module: str) -> list[str]:
    """Build a module command that also works in the frozen desktop backend."""
    worker_name = _WORKER_NAMES_BY_MODULE.get(module)
    if worker_name is None:
        raise ValueError(f"Unsupported packaged worker module: {module}")
    if bool(getattr(sys, "frozen", False)):
        return [sys.executable, "--internal-worker", worker_name]
    return [sys.executable, "-m", module]


def dispatch_internal_worker(args: Sequence[str] | None = None) -> int | None:
    """Run an allowlisted worker when the frozen entrypoint receives its marker."""
    worker_args = list(sys.argv[1:] if args is None else args)
    if not worker_args or worker_args[0] != "--internal-worker":
        return None
    if len(worker_args) < 2:
        raise SystemExit("--internal-worker requires a worker name")

    worker_name = worker_args[1]
    module_name = _WORKER_MODULES.get(worker_name)
    if module_name is None:
        allowed = ", ".join(sorted(_WORKER_MODULES))
        raise SystemExit(f"Unknown internal worker '{worker_name}'. Allowed: {allowed}")

    module = importlib.import_module(module_name)
    main = getattr(module, "main", None)
    if not callable(main):
        raise RuntimeError(f"Internal worker has no callable main(): {module_name}")
    sys.argv = [module_name, *worker_args[2:]]
    result = main()
    return int(result) if isinstance(result, int) else 0


__all__ = [
    "BLOCK_WORLD_BUILDER_MODULE",
    "NATIVE_PROJECT_TASK_MODULE",
    "SCENE_360_BUILDER_MODULE",
    "SCENE_OVERLAP_ANALYZER_MODULE",
    "SCENE_SPATIAL_CONTRACT_MODULE",
    "dispatch_internal_worker",
    "worker_command",
]
