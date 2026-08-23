"""Public contract of the Knowledge Graph module."""

from importlib import import_module
from typing import TYPE_CHECKING, Any

from ai_anime.modules.knowledge_graph.domain.chapter_detector import ChapterDetector

if TYPE_CHECKING:
    from ai_anime.modules.knowledge_graph.infrastructure.config import (
        get_cognee_status,
        init_cognee,
    )
    from ai_anime.modules.knowledge_graph.infrastructure.pipeline import (
        enrich_scene_environment_from_context,
        extract_props_from_graph,
        extract_scenes_from_script,
        extract_episodes_with_characters,
        run_episode_planning_pipeline,
    )
    from ai_anime.migrations.project.commands.scene_names import (
        migrate_scene_names,
    )
    from ai_anime.modules.knowledge_graph.infrastructure.store import (
        CogneeStore,
        create_cognee_store,
    )
    from ai_anime.modules.knowledge_graph.infrastructure.tools import (
        create_episode_planner_tools,
        create_script_writer_tools,
    )

_LAZY_EXPORTS = {
    "CogneeStore": (
        "ai_anime.modules.knowledge_graph.infrastructure.store",
        "CogneeStore",
    ),
    "create_cognee_store": (
        "ai_anime.modules.knowledge_graph.infrastructure.store",
        "create_cognee_store",
    ),
    "create_episode_planner_tools": (
        "ai_anime.modules.knowledge_graph.infrastructure.tools",
        "create_episode_planner_tools",
    ),
    "create_script_writer_tools": (
        "ai_anime.modules.knowledge_graph.infrastructure.tools",
        "create_script_writer_tools",
    ),
    "enrich_scene_environment_from_context": (
        "ai_anime.modules.knowledge_graph.infrastructure.pipeline",
        "enrich_scene_environment_from_context",
    ),
    "extract_props_from_graph": (
        "ai_anime.modules.knowledge_graph.infrastructure.pipeline",
        "extract_props_from_graph",
    ),
    "extract_scenes_from_script": (
        "ai_anime.modules.knowledge_graph.infrastructure.pipeline",
        "extract_scenes_from_script",
    ),
    "extract_episodes_with_characters": (
        "ai_anime.modules.knowledge_graph.infrastructure.pipeline",
        "extract_episodes_with_characters",
    ),
    "get_cognee_status": (
        "ai_anime.modules.knowledge_graph.infrastructure.config",
        "get_cognee_status",
    ),
    "init_cognee": (
        "ai_anime.modules.knowledge_graph.infrastructure.config",
        "init_cognee",
    ),
    "migrate_scene_names": (
        "ai_anime.migrations.project.commands.scene_names",
        "migrate_scene_names",
    ),
    "run_episode_planning_pipeline": (
        "ai_anime.modules.knowledge_graph.infrastructure.pipeline",
        "run_episode_planning_pipeline",
    ),
}


def __getattr__(name: str) -> Any:
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = target
    value = getattr(import_module(module_name), attribute_name)
    globals()[name] = value
    return value


__all__ = [
    "ChapterDetector",
    "CogneeStore",
    "create_cognee_store",
    "create_episode_planner_tools",
    "create_script_writer_tools",
    "enrich_scene_environment_from_context",
    "extract_episodes_with_characters",
    "extract_props_from_graph",
    "extract_scenes_from_script",
    "get_cognee_status",
    "init_cognee",
    "migrate_scene_names",
    "run_episode_planning_pipeline",
]
