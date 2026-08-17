"""Project task runner registration package.

Importing this package registers every built-in project task runner.
"""

from ai_anime.modules.task_execution.infrastructure.runners import (  # noqa: F401
    audio,
    character_image,
    episode_assets,
    freezone,
    graph_build,
    identity,
    ingest,
    prop_reference,
    production_workflow,
    render,
    scene_reference,
    script,
    script_workflow,
    sketch,
    sketch_edit_execute,
    stage_asset,
    style_preview,
    video,
)
