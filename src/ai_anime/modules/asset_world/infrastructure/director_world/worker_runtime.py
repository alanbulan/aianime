"""DirectorWorld worker declarations and subprocess commands."""

from __future__ import annotations

from ai_anime.shared.infrastructure.internal_workers import (
    InternalWorkerSpec,
    internal_worker_command,
)


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

DIRECTOR_WORLD_WORKERS = (
    InternalWorkerSpec("scene-360-builder", SCENE_360_BUILDER_MODULE),
    InternalWorkerSpec("scene-overlap-analyzer", SCENE_OVERLAP_ANALYZER_MODULE),
    InternalWorkerSpec("scene-spatial-contract", SCENE_SPATIAL_CONTRACT_MODULE),
    InternalWorkerSpec("block-world-builder", BLOCK_WORLD_BUILDER_MODULE),
)
_WORKERS_BY_MODULE = {worker.module: worker for worker in DIRECTOR_WORLD_WORKERS}


def worker_command(module: str) -> list[str]:
    """Build a module command that also works in the frozen desktop backend."""
    worker = _WORKERS_BY_MODULE.get(module)
    if worker is None:
        raise ValueError(f"Unsupported packaged worker module: {module}")
    return internal_worker_command(worker)


__all__ = [
    "BLOCK_WORLD_BUILDER_MODULE",
    "DIRECTOR_WORLD_WORKERS",
    "SCENE_360_BUILDER_MODULE",
    "SCENE_OVERLAP_ANALYZER_MODULE",
    "SCENE_SPATIAL_CONTRACT_MODULE",
    "worker_command",
]
