from __future__ import annotations

import ast
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = REPO_ROOT / "src" / "ai_anime"
COMPOSITION_ROOT_FILES = {"desktop_server.py"}

# These are measured legacy dependencies, not approved architecture. Counts may
# decrease during migration; any new file/module pair or count increase fails.
LEGACY_REVERSE_API_IMPORT_MAX = {
    ("freezone/route_helpers.py", "ai_anime.api.schemas"): 1,
    ("freezone/text_node.py", "ai_anime.api.schemas"): 1,
    ("verification/routes.py", "ai_anime.api.auth"): 1,
    ("verification/routes.py", "ai_anime.api.deps"): 1,
}

LEGACY_ROUTE_IMPORT_MAX: dict[tuple[str, str], int] = {}


def _python_files(root: Path) -> list[Path]:
    return sorted(
        path for path in root.rglob("*.py") if "__pycache__" not in path.parts
    )


def _imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imports.append(node.module)
        elif isinstance(node, ast.Import):
            imports.extend(alias.name for alias in node.names)
    return imports


def _relative(path: Path) -> str:
    return path.relative_to(PACKAGE_ROOT).as_posix()


def _assert_ratchet(
    actual: Counter[tuple[str, str]],
    allowed_max: dict[tuple[str, str], int],
) -> None:
    violations = {
        key: count
        for key, count in actual.items()
        if key not in allowed_max or count > allowed_max[key]
    }
    assert not violations, (
        "Architecture dependency baseline increased. Move the dependency behind "
        f"an application port instead of extending the allowlist: {violations}"
    )


def test_non_api_code_does_not_add_reverse_api_dependencies() -> None:
    actual: Counter[tuple[str, str]] = Counter()
    for path in _python_files(PACKAGE_ROOT):
        relative = _relative(path)
        if (
            relative == "api.py"
            or relative.startswith("api/")
            or relative in COMPOSITION_ROOT_FILES
        ):
            continue
        for imported in _imports(path):
            if imported == "ai_anime.api" or imported.startswith("ai_anime.api."):
                actual[(relative, imported)] += 1

    _assert_ratchet(actual, LEGACY_REVERSE_API_IMPORT_MAX)


def test_route_modules_do_not_add_cross_route_dependencies() -> None:
    actual: Counter[tuple[str, str]] = Counter()
    routes_root = PACKAGE_ROOT / "api" / "routes"
    for path in _python_files(routes_root):
        relative = _relative(path)
        for imported in _imports(path):
            if imported.startswith("ai_anime.api.routes."):
                actual[(relative, imported)] += 1

    _assert_ratchet(actual, LEGACY_ROUTE_IMPORT_MAX)


def test_new_backend_modules_follow_layer_dependencies() -> None:
    modules_root = PACKAGE_ROOT / "modules"
    if not modules_root.exists():
        return

    failures: list[str] = []
    for path in _python_files(modules_root):
        relative = path.relative_to(modules_root).as_posix()
        parts = relative.split("/")
        if len(parts) < 3 or parts[1] not in {
            "domain",
            "application",
            "infrastructure",
        }:
            continue
        context, layer = parts[0], parts[1]

        for imported in _imports(path):
            if imported == "ai_anime.api" or imported.startswith("ai_anime.api."):
                failures.append(f"{relative}: {layer} imports HTTP adapter {imported}")

            target_prefix = "ai_anime.modules."
            if not imported.startswith(target_prefix):
                if layer == "domain" and imported.split(".", 1)[0] in {
                    "fastapi",
                    "pydantic",
                    "aiosqlite",
                    "cognee",
                    "sqlalchemy",
                }:
                    failures.append(
                        f"{relative}: domain imports infrastructure package {imported}"
                    )
                continue

            target_parts = imported[len(target_prefix) :].split(".")
            target_context = target_parts[0]
            target_layer = target_parts[1] if len(target_parts) > 1 else ""
            if target_context != context:
                public_module = f"ai_anime.modules.{target_context}.public"
                if imported != public_module and not imported.startswith(
                    f"{public_module}."
                ):
                    failures.append(
                        f"{relative}: cross-context import must use {public_module}: {imported}"
                    )
                continue

            if layer == "domain" and target_layer in {"application", "infrastructure"}:
                failures.append(
                    f"{relative}: domain depends on {target_layer}: {imported}"
                )
            elif layer == "application" and target_layer == "infrastructure":
                failures.append(
                    f"{relative}: application depends on infrastructure: {imported}"
                )

    assert not failures, "\n".join(failures)


def test_api_package_does_not_eagerly_assemble_routes() -> None:
    package_source = (PACKAGE_ROOT / "api" / "__init__.py").read_text(encoding="utf-8")
    app_source = (PACKAGE_ROOT / "api" / "app.py").read_text(encoding="utf-8")

    assert "include_router" not in package_source
    assert "ai_anime.api.routes" not in package_source
    assert "@application.middleware" not in app_source
    assert "@application.exception_handler" not in app_source
    assert "@application.on_event" not in app_source


def test_lifespan_uses_the_application_container() -> None:
    lifespan_source = (PACKAGE_ROOT / "api" / "lifespan.py").read_text(encoding="utf-8")

    assert "ai_anime.bootstrap" in lifespan_source
    assert "ai_anime.ports.registry" not in lifespan_source


def test_project_workspace_core_does_not_depend_on_fastapi() -> None:
    paths = list((PACKAGE_ROOT / "modules" / "project_workspace").rglob("*.py"))

    failures = [
        _relative(path)
        for path in paths
        if any(
            imported == "fastapi" or imported.startswith("fastapi.")
            for imported in _imports(path)
        )
    ]
    assert not failures


def test_project_workspace_callers_use_the_public_api() -> None:
    workspace_module = PACKAGE_ROOT / "modules" / "project_workspace"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(workspace_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.project_workspace."):
                continue
            if imported == "ai_anime.modules.project_workspace.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not (PACKAGE_ROOT / "project_context.py").exists()
    assert not (PACKAGE_ROOT / "ports" / "project.py").exists()
    assert not (PACKAGE_ROOT / "ports" / "local" / "project.py").exists()
    assert not failures, "\n".join(failures)


def test_identity_access_callers_use_the_public_api() -> None:
    identity_module = PACKAGE_ROOT / "modules" / "identity_access"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(identity_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.identity_access."):
                continue
            if imported == "ai_anime.modules.identity_access.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not (PACKAGE_ROOT / "ports" / "auth.py").exists()
    assert not (PACKAGE_ROOT / "ports" / "auth_contract.py").exists()
    assert not (PACKAGE_ROOT / "ports" / "local" / "auth.py").exists()
    assert not failures, "\n".join(failures)


def test_story_intake_callers_use_the_public_api() -> None:
    story_module = PACKAGE_ROOT / "modules" / "story_intake"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(story_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.story_intake."):
                continue
            if imported == "ai_anime.modules.story_intake.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not (PACKAGE_ROOT / "api" / "chapter_preview.py").exists()
    assert not failures, "\n".join(failures)


def test_narrative_planning_callers_use_the_public_api() -> None:
    narrative_module = PACKAGE_ROOT / "modules" / "narrative_planning"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(narrative_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.narrative_planning."):
                continue
            if imported == "ai_anime.modules.narrative_planning.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not _python_files(PACKAGE_ROOT / "workflows")
    assert not (PACKAGE_ROOT / "manual_shots.py").exists()
    assert not failures, "\n".join(failures)


def test_asset_world_callers_use_the_public_api() -> None:
    asset_world_module = PACKAGE_ROOT / "modules" / "asset_world"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(asset_world_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.asset_world."):
                continue
            if imported == "ai_anime.modules.asset_world.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not (PACKAGE_ROOT / "services" / "style_service.py").exists()
    assert not (
        PACKAGE_ROOT / "seedance2_i2v" / "character_voice_storage.py"
    ).exists()
    assert not failures, "\n".join(failures)


def test_production_callers_use_the_public_api() -> None:
    production_module = PACKAGE_ROOT / "modules" / "production"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(production_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.production."):
                continue
            if imported == "ai_anime.modules.production.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not failures, "\n".join(failures)


def test_production_sketch_edit_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    source = route.read_text(encoding="utf-8")

    assert not (
        PACKAGE_ROOT / "services" / "sketch_pose_service.py"
    ).exists()
    assert "ai_anime.modules.production.public" in _imports(route)
    route_start = source.index("async def get_sketch_pose_editor(")
    route_end = source.index("async def generate_missing_manual_sketches(", route_start)
    route_source = source[route_start:route_end]
    assert route_source.count("sketch_editing_use_cases") == 3
    assert "SketchEditorQuery" in route_source
    assert "SaveSketchEditorCommand" in route_source
    assert "CropCurrentSketchCommand" in route_source
    assert "sketch_pose_editor_use_cases" not in source
    assert "sketch_image_use_cases" not in source
    assert "def _canonical_sketch_path(" not in source
    assert "def _canonical_sketch_url(" not in source
    for legacy_implementation in (
        "ai_anime.services.sketch_pose_service",
        "build_all_episode_candidates",
        "build_pose_candidates",
        "_heuristic_pose_from_bbox",
        "save_pose_editor_state",
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_beats_as_dicts",
        "get_sketch_colors",
        "make_static_url_for_context",
        "Image.open",
        "from PIL",
    ):
        assert legacy_implementation not in route_source


def test_production_image_settings_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_settings.py"
    source = route.read_text(encoding="utf-8")
    generation_source = (
        PACKAGE_ROOT / "api" / "routes" / "generation.py"
    ).read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert "production_image_settings_use_cases" in source
    assert "production_settings.router" in api_router_source
    for handler_name in (
        "get_render_settings",
        "update_render_settings",
        "get_sketch_settings",
        "update_sketch_settings",
        "get_sketch_regen_queue",
        "update_sketch_regen_queue",
        "get_sketch_image_usage",
        "get_image_generation_guard",
        "verify_image_generation_guard_password",
    ):
        assert f"async def {handler_name}(" not in generation_source
    for legacy_helper in (
        "def _resolve_render_image_selection(",
        "def _resolve_sketch_image_selection(",
        "def _resolve_render_bool_setting(",
        "def _render_settings_payload(",
        "def _sketch_settings_payload(",
    ):
        assert legacy_helper not in source

    settings_start = source.index("async def get_render_settings")
    settings_end = source.index("async def get_sketch_regen_queue", settings_start)
    settings_source = source[settings_start:settings_end]
    assert "production_image_settings_use_cases" in settings_source
    assert "load_project_config" not in settings_source
    assert "save_project_config" not in settings_source
    assert "image_generation_selection_options" not in settings_source


def test_production_sketch_regen_queue_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_settings.py"
    source = route.read_text(encoding="utf-8")
    route_start = source.index("async def get_sketch_regen_queue(")
    route_end = source.index("async def get_sketch_image_usage(", route_start)
    route_source = source[route_start:route_end]

    assert "sketch_regen_queue_use_cases" in route_source
    assert "ReplaceSketchRegenQueueCommand" in route_source
    for legacy_helper in (
        "def _sketch_regen_queue_key(",
        "def _is_react_sketch_regen_queue_items(",
        "def _react_sketch_regen_queues(",
        "def _sketch_regen_queue_payload(",
    ):
        assert legacy_helper not in source
    for implementation_detail in (
        "load_project_config",
        "save_project_config",
        "react_sketch_regen_queue",
        '"sketch_regen_queue"',
    ):
        assert implementation_detail not in route_source


def test_production_image_usage_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_settings.py"
    source = route.read_text(encoding="utf-8")
    route_start = source.index("async def get_sketch_image_usage(")
    route_source = source[route_start:]

    assert "image_generation_usage_use_cases" in route_source
    assert "ImageGenerationGuardQuery" in route_source
    assert "def _image_generation_guard_payload(" not in source
    assert "def get_image_scope_warning(" not in (
        PACKAGE_ROOT / "image_request_usage.py"
    ).read_text(encoding="utf-8")
    for implementation_detail in (
        "get_image_usage_summary",
        "count_image_scope_attempts",
        "get_prompt_export_password",
        "ai_anime.image_request_usage",
        "ai_anime.security.operator_auth",
    ):
        assert implementation_detail not in route_source


def test_production_episode_video_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_video.py"
    source = route.read_text(encoding="utf-8")
    generation_source = (
        PACKAGE_ROOT / "api" / "routes" / "generation.py"
    ).read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("episode_video_use_cases().") == 2
    assert "ComposeEpisodeVideoCommand" in source
    assert "EpisodeBeatsMissing" in source
    assert "production_video.router" in api_router_source
    for handler_name in ("compose_video", "get_final_video"):
        assert f"async def {handler_name}(" not in generation_source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_task_backend",
        "enqueue_project_task",
        "project_task_state_key",
        "make_static_url_for_context",
        '"videos" / "episodes"',
        "成片合成需要 project context",
    ):
        assert implementation_detail not in source


def test_production_episode_export_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_export.py"
    source = route.read_text(encoding="utf-8")
    generation_source = (
        PACKAGE_ROOT / "api" / "routes" / "generation.py"
    ).read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("episode_export_use_cases().") == 3
    assert "production_export.router" in api_router_source
    for handler_name in ("export_srt", "export_final_video", "export_zip"):
        assert f"async def {handler_name}(" not in generation_source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "build_srt_content",
        "PathResolver",
        "zipfile",
        "tempfile",
        '"videos" / "episodes"',
        "files_to_pack",
    ):
        assert implementation_detail not in source
    assert not _python_files(PACKAGE_ROOT / "export")


def test_production_episode_audio_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_audio.py"
    source = route.read_text(encoding="utf-8")
    generation_source = (
        PACKAGE_ROOT / "api" / "routes" / "generation.py"
    ).read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("episode_audio_use_cases().") == 2
    assert "GenerateEpisodeAudioCommand" in source
    assert "production_audio.router" in api_router_source
    for handler_name in (
        "generate_tts",
        "preview_tts",
        "list_tts_voices",
        "generate_audio",
        "regenerate_beat_audio",
    ):
        assert f"async def {handler_name}(" not in generation_source
    assert "def _collect_audio_prereq_errors(" not in source
    assert "def _voice_prereq_error_response(" not in source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_task_backend",
        "enqueue_project_task",
        "project_task_state_key",
        "collect_indextts2_voice_prereq_errors",
        "音频生成需要 project context",
    ):
        assert implementation_detail not in source


def test_production_video_pool_routes_and_runner_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_pool.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    video_runner = PACKAGE_ROOT / "task_backend" / "runners" / "video.py"
    legacy_indexer = PACKAGE_ROOT / "generators" / "video_pool_indexer.py"
    models = PACKAGE_ROOT / "models.py"
    source = route.read_text(encoding="utf-8")
    generation_source = generation.read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )
    runner_source = video_runner.read_text(encoding="utf-8")

    assert source.count("video_pool_use_cases().") == 2
    assert "VideoPoolEntryUnavailable" in source
    assert "production_pool.router" in api_router_source
    for handler_name in ("list_video_pool", "select_video_pool"):
        assert f"async def {handler_name}(" not in generation_source
    for implementation_detail in (
        "load_video_pool_index",
        "assign_video_to_beat",
        "make_static_url_for_context",
        '"videos" / "beats"',
    ):
        assert implementation_detail not in source
    assert "video_pool_use_cases" in runner_source
    assert "AddGeneratedVideoCommand" in runner_source
    assert "add_video_to_pool" not in runner_source
    assert "ai_anime.modules.production.public" in _imports(video_runner)
    assert not legacy_indexer.exists()
    assert "class VideoPoolEntry(" not in models.read_text(encoding="utf-8")


def test_production_grid_pool_routes_delegate_to_application() -> None:
    pool_route = PACKAGE_ROOT / "api" / "routes" / "production_pool.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    pool_source = pool_route.read_text(encoding="utf-8")
    source = generation.read_text(encoding="utf-8")
    route_start = pool_source.index("async def list_grids(")
    route_source = pool_source[route_start:]

    assert route_source.count("grid_pool_use_cases") == 10
    assert "SelectGridPoolImageCommand" in route_source
    assert route_source.count("UploadBeatPoolImageCommand") == 2
    assert route_source.count("UploadGridImageCommand") == 1
    assert route_source.count("GridPromptQuery") == 1
    assert route_source.count("GridSketchPreviewCommand") == 1
    assert route_source.count("CutGridCommand") == 1
    assert "GridPoolImageStale" in route_source
    assert "GridPoolSelectionRejected" in route_source
    for handler_name in (
        "list_grids",
        "rebuild_grids_pool_index",
        "get_beat_sketch_candidates",
        "select_pool_image",
        "upload_beat_sketch",
        "upload_beat_render",
        "upload_grid",
        "export_grid_prompt",
        "sketch_grid_preview",
        "cut_grid",
    ):
        assert f"async def {handler_name}(" not in source
    assert route_source.count("GridPoolUploadRejected") == 3
    assert route_source.count("GridPoolPromptRejected") == 1
    assert route_source.count("GridPoolPreviewRejected") == 1
    assert route_source.count("GridPoolCutRejected") == 1
    assert "def _register_uploaded_pool_image(" not in source
    assert "def _uploaded_grid_filename(" not in source
    assert "def _safe_grid_token(" not in source
    assert "def _safe_grids_file(" not in source
    assert "def _find_pool_grid_entry(" not in source
    for implementation_detail in (
        "add_cell_with_dedup",
        "build_pool_index",
        "load_pool_index",
        "register_grid_entry",
        "rebuild_pool_index",
        "save_pool_index",
        "compute_beat_content_hash",
        "is_pool_image_stale",
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "make_static_url_for_context",
        "shutil.copy2",
        "save_grid_and_split",
        "build_beat_sketch_paths",
        "crop_sketch_panels",
        ".glob(",
        ".read_text(",
        ".write_bytes(",
        "_read_uploaded_rgb_image",
    ):
        assert implementation_detail not in route_source


def test_production_video_backend_catalog_has_one_owner() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_video.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    schemas = PACKAGE_ROOT / "api" / "schemas.py"
    video_runner = PACKAGE_ROOT / "task_backend" / "runners" / "video.py"
    seedance_pipeline = PACKAGE_ROOT / "seedance2_i2v" / "pipeline.py"
    source = route.read_text(encoding="utf-8")
    generation_source = generation.read_text(encoding="utf-8")

    assert "video_backend_catalog_use_cases" in source
    assert "async def get_video_backend_options(" not in generation_source
    assert "def _api_video_backend_options(" not in source
    for legacy_implementation in (
        "NEWAPI_VIDEO_DURATION_BOUNDS",
        "newapi_video_backend_options",
        "parse_newapi_video_backend",
        "VideoGenerateRequest",
        "VideoBackendOption",
    ):
        assert legacy_implementation not in source
    schema_source = schemas.read_text(encoding="utf-8")
    assert "class VideoGenerateRequest(" not in schema_source
    assert "class VideoBackendOption(" not in schema_source
    assert "DEFAULT_VIDEO_BACKEND" in schema_source
    assert "is_seedance2_backend" in video_runner.read_text(encoding="utf-8")
    assert "is_huimeng_seedance2_backend" not in seedance_pipeline.read_text(
        encoding="utf-8"
    )


def test_production_global_video_optimization_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_video.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    video_runner = PACKAGE_ROOT / "task_backend" / "runners" / "video.py"
    source = route.read_text(encoding="utf-8")
    generation_source = generation.read_text(encoding="utf-8")

    assert "global_video_optimization_use_cases" in source
    assert "OptimizeEpisodeVideoCommand" in source
    assert "async def global_optimize_video(" not in generation_source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_all_characters",
        "PathResolver",
        'glob("beat_*.png")',
        "get_task_backend",
        "enqueue_project_task",
        "project_task_state_key",
        "全局视频优化需要 project context",
    ):
        assert implementation_detail not in source
    runner_source = video_runner.read_text(encoding="utf-8")
    assert "GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE" in runner_source


def test_production_sketch_generation_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_sketch.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    sketch_runner = PACKAGE_ROOT / "task_backend" / "runners" / "sketch.py"
    source = route.read_text(encoding="utf-8")
    generation_source = generation.read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("sketch_generation_use_cases().") == 1
    assert "GenerateSketchesCommand" in source
    assert "production_sketch.router" in api_router_source
    assert "async def generate_sketches(" not in generation_source
    for implementation_detail in (
        "load_project_config",
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_beats_as_dicts",
        "sketch_grid_split",
        "sketch_scene_grid_split",
        "production_generation_context_use_cases",
        "PathResolver",
        "_runtime_prop_menu_with_global_props",
        "production_image_settings_use_cases",
        "get_task_backend",
        "enqueue_project_task",
        "project_task_state_key",
        "草图生成需要 project context",
    ):
        assert implementation_detail not in source
    runner_source = sketch_runner.read_text(encoding="utf-8")
    assert "SKETCH_GENERATION_TASK_TYPE" in runner_source


def test_production_director_control_sketch_route_delegates_to_application() -> None:
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    freezone = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    sketch_runner = PACKAGE_ROOT / "task_backend" / "runners" / "sketch.py"
    source = generation.read_text(encoding="utf-8")
    route_start = source.index("async def director_control_to_sketch(")
    route_end = source.index("async def get_sketch_pose_editor(", route_start)
    route_source = source[route_start:route_end]

    assert route_source.count("director_control_sketch_use_cases") == 1
    assert "GenerateDirectorControlSketchCommand" in route_source
    for implementation_detail in (
        "beat_director_stage_use_cases",
        "make_project_asset_url_builder",
        "get_task_backend",
        "enqueue_project_task",
        "project_task_state_key",
        "start_control_frame_to_sketch_task",
        "globals()",
        "Direct Render 转草图需要 project context",
    ):
        assert implementation_detail not in route_source
    assert "_start_or_enqueue_mainline_direct_sketch_task" not in (
        freezone.read_text(encoding="utf-8")
    )
    runner_source = sketch_runner.read_text(encoding="utf-8")
    assert "DIRECTOR_CONTROL_TO_SKETCH_TASK_KIND" in runner_source


def test_production_selected_regeneration_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_render.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    render_runner = PACKAGE_ROOT / "task_backend" / "runners" / "render.py"
    source = route.read_text(encoding="utf-8")
    generation_source = generation.read_text(encoding="utf-8")

    assert source.count("selected_regeneration_use_cases().") == 2
    assert source.count("RegenerateSelectedBeatsCommand(") == 2
    assert "SelectedRegenerationKind.RENDER" in source
    assert "SelectedRegenerationKind.SKETCH" in source
    for handler_name in ("regenerate_beats", "regenerate_sketches"):
        assert f"async def {handler_name}(" not in generation_source
    for implementation_detail in (
        "load_project_config",
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_beats_as_dicts",
        "pick_beats_by_number",
        "render_ai_detection_error",
        "production_generation_context_use_cases",
        "_runtime_prop_menu_with_global_props",
        "production_image_settings_use_cases",
        "selection_scope",
        "get_task_backend",
        "enqueue_project_task",
        "project_task_state_key",
        "需要 project context",
    ):
        assert implementation_detail not in source
    runner_source = render_runner.read_text(encoding="utf-8")
    assert "SELECTED_RENDER_REGEN_TASK_TYPE" in runner_source
    assert "SELECTED_SKETCH_REGEN_TASK_TYPE" in runner_source


def test_production_manual_sketch_regeneration_route_delegates_to_application() -> None:
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    source = generation.read_text(encoding="utf-8")
    route_start = source.index("async def generate_missing_manual_sketches(")
    route_end = source.index("async def assign_sketch_colors(", route_start)
    route_source = source[route_start:route_end]

    assert route_source.count("manual_sketch_regeneration_use_cases") == 1
    assert "GenerateMissingManualSketchesCommand" in route_source
    assert "ManualSketchRegenerationRejected" in route_source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_beats_as_dicts",
        "storyboard_beats_for_manual_sketches",
        "missing_manual_shot_segments",
        "choose_manual_sketch_mode_key",
        "load_project_config",
        "production_generation_context_use_cases",
        "production_image_settings_use_cases",
        "selection_scope",
        "get_task_backend",
        "enqueue_project_task",
        "SELECTED_SKETCH_REGEN_TASK_TYPE",
        "需要 project context",
    ):
        assert implementation_detail not in route_source


def test_production_grid_regeneration_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_render.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    render_runner = PACKAGE_ROOT / "task_backend" / "runners" / "render.py"
    source = route.read_text(encoding="utf-8")
    generation_source = generation.read_text(encoding="utf-8")

    assert source.count("grid_regeneration_use_cases().") == 1
    assert "RegenerateGridCommand" in source
    assert "async def regenerate_grid(" not in generation_source
    for implementation_detail in (
        "load_project_config",
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_beats_as_dicts",
        "character_grid_split",
        "scene_grid_split",
        "perfect_grid_split",
        "pick_beats_by_number",
        "render_ai_detection_error",
        "production_generation_context_use_cases",
        "production_image_settings_use_cases",
        "get_task_backend",
        "enqueue_project_task",
        "project_task_state_key",
        "需要 project context",
    ):
        assert implementation_detail not in source
    assert "GRID_REGENERATION_TASK_TYPE" in render_runner.read_text(
        encoding="utf-8"
    )


def test_production_render_plan_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_render.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    schemas = PACKAGE_ROOT / "api" / "schemas.py"
    render_plan_package = PACKAGE_ROOT / "render_plan"
    source = route.read_text(encoding="utf-8")
    generation_source = generation.read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("render_plan_use_cases()") == 2
    assert "BuildRenderPlanCommand" in source
    assert "ExecuteRenderPlanCommand" in source
    assert "RenderPlanGrid" in source
    assert "production_render.router" in api_router_source
    for handler_name in ("render_plan", "render_execute"):
        assert f"async def {handler_name}(" not in generation_source
    for helper_name in (
        "_render_plan_unavailable_response",
        "_render_plan_rejection_response",
    ):
        assert f"def {helper_name}(" not in generation_source
    for implementation_detail in (
        "load_project_config",
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_beats_as_dicts",
        "pick_beats_by_number",
        "render_ai_detection_error",
        "production_generation_context_use_cases",
        "_runtime_prop_menu_with_global_props",
        "production_image_settings_use_cases",
        "build_regen_plan",
        "compute_input_fingerprint",
        "hash_plan",
        "RefImageHasher",
        "selection_scope",
        "get_task_backend",
        "enqueue_project_task",
        "需要 project context",
    ):
        assert implementation_detail not in source
    for removed_helper in (
        "def normalize_beat_indices(",
        "def validate_beat_indices(",
        "def _render_plan_feature_disabled(",
        "def _plan_entry_to_dict(",
        "def _plan_to_dicts(",
        "def _custom_render_plan_error(",
    ):
        assert removed_helper not in source
    schema_source = schemas.read_text(encoding="utf-8")
    assert "class RenderPlanResponse(" not in schema_source
    assert "class RenderPlanExecuteResponse(" not in schema_source
    assert not _python_files(render_plan_package)


def test_production_seedance2_panel_routes_delegate_to_application() -> None:
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    source = generation.read_text(encoding="utf-8")
    route_start = source.index("async def get_seedance2_beat_status(")
    route_end = source.index("async def get_beat_pano_background_manifest(", route_start)
    route_source = source[route_start:route_end]

    assert route_source.count("seedance2_panel_use_cases") == 5
    for legacy_helper in (
        "_seedance2_asset_status_payload",
        "_seedance2_returned_last_frame_status_payload",
        "_seedance2_voice_status_payload",
        "_seedance2_panel_context",
        "_seedance2_status_response",
    ):
        assert legacy_helper not in source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "panel_service",
        "PathResolver",
        "build_seedance2_video_panel_state",
        "parse_seedance2_config",
        "dialogue_voice_reference_rows",
        "resolve_narrator_reference_status",
        "make_project_static_url",
    ):
        assert implementation_detail not in route_source


def test_production_single_video_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production_video.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    video_runner = PACKAGE_ROOT / "task_backend" / "runners" / "video.py"
    source = route.read_text(encoding="utf-8")
    generation_source = generation.read_text(encoding="utf-8")

    assert source.count("single_video_use_cases") == 2
    assert "GenerateSingleVideoCommand" in source
    assert "async def generate_single_video(" not in generation_source
    for legacy_helper in (
        "_validate_seedance_pro_dialogue_only",
        "_seedance2_initial_prompt",
        "_legacy_video_prompt_for_mode",
        "_missing_video_prompt_error",
        "SEEDANCE2_SINGLE_VIDEO_CONFIG_FIELDS",
        "_seedance2_request_config_overrides",
        "_merge_seedance2_request_config",
        "_api_audio_duration_seconds",
        "_prepare_seedance2_api_beat",
        "_prepare_happyhorse_api_beat",
        "_prepare_grok_video_api_beat",
    ):
        assert legacy_helper not in source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_beats_as_dicts",
        "PathResolver",
        "resolve_target_video_duration",
        "prepare_seedance2_generation_inputs",
        "_runtime_prop_menu_with_global_props",
        "get_task_backend",
        "enqueue_project_task",
        "project_task_state_key",
        "单条视频生成需要 project context",
    ):
        assert implementation_detail not in source
    runner_source = video_runner.read_text(encoding="utf-8")
    assert "SINGLE_VIDEO_TASK_TYPE" in runner_source


def test_production_generation_context_routes_delegate_to_application() -> None:
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    freezone = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    generation_source = generation.read_text(encoding="utf-8")
    freezone_source = freezone.read_text(encoding="utf-8")

    assert "production_generation_context_use_cases" not in generation_source
    assert "production_generation_context_use_cases" in freezone_source
    for legacy_helper in (
        "def _build_character_map(",
        "def _episode_from_store_or_none(",
    ):
        assert legacy_helper not in generation_source
        assert legacy_helper not in freezone_source
    assert "ai_anime.api.routes.generation" not in _imports(freezone)


def test_production_sketch_color_rules_have_one_owner() -> None:
    nanobanana = PACKAGE_ROOT / "generators" / "nanobanana_grid.py"
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    callers = {
        nanobanana: "global_prop_marker_colors",
        PACKAGE_ROOT / "freezone" / "presets.py": "global_prop_marker_colors",
        PACKAGE_ROOT / "modules" / "asset_world" / "composition.py": (
            "BRIDGMAN_CHARACTER_PALETTE"
        ),
        PACKAGE_ROOT / "task_backend" / "runners" / "script.py": (
            "assign_identity_sketch_colors"
        ),
    }

    assert not (PACKAGE_ROOT / "generators" / "episode_optimizer.py").exists()
    assert "def _global_prop_marker_colors(" not in nanobanana.read_text(
        encoding="utf-8"
    )
    assert "def _color_assignment_requires_full_sketch_clean(" not in (
        generation.read_text(encoding="utf-8")
    )
    for path, public_name in callers.items():
        source = path.read_text(encoding="utf-8")
        assert public_name in source
        assert "ai_anime.modules.production.public" in _imports(path)
        assert "ai_anime.generators.episode_optimizer" not in _imports(path)


def test_production_sketch_color_assignment_route_delegates_to_application() -> None:
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    source = generation.read_text(encoding="utf-8")
    route_start = source.index("async def assign_sketch_colors(")
    route_end = source.index("\n@router.post(", route_start)
    route_source = source[route_start:route_end]

    assert "sketch_marker_use_cases" in route_source
    assert "AssignProjectSketchColorsCommand" in route_source
    assert "SketchEpisodeBeatsMissing" in route_source
    assert "SketchColorMarkersMissing" in route_source
    assert "sketch_color_assignment_use_cases" not in source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_beats_as_dicts",
        "get_all_characters",
        "get_sketch_colors",
        "set_sketch_colors",
        "update_episode",
        "PathResolver",
        "_runtime_prop_menu_with_global_props",
        "assign_identity_sketch_colors",
        "global_prop_marker_colors",
        "marker_color_change_requires_sketch_clean",
    ):
        assert implementation_detail not in route_source


def test_production_sketch_marker_detection_route_delegates_to_application() -> None:
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    production_public = PACKAGE_ROOT / "modules" / "production" / "public.py"
    models = PACKAGE_ROOT / "models.py"
    domain = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "domain"
        / "sketch_marker_detection.py"
    )
    source = generation.read_text(encoding="utf-8")
    route_start = source.index("async def detect_sketch_identities(")
    route_source = source[route_start:]

    assert "sketch_marker_use_cases" in route_source
    assert "DetectProjectSketchMarkersCommand" in route_source
    assert "sketch_marker_detection_use_cases" not in source
    assert "def _requester_user_id_for_billing(" not in source
    public_source = production_public.read_text(encoding="utf-8")
    assert "def sketch_color_assignment_use_cases(" not in public_source
    assert "def sketch_marker_detection_use_cases(" not in public_source
    assert "split_detected_marker_keys" not in models.read_text(encoding="utf-8")
    assert "def split_detected_marker_keys(" in domain.read_text(encoding="utf-8")
    for implementation_detail in (
        "detect_identities_by_ai",
        "combine_to_grid",
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_usage_meter",
        "get_sketch_colors",
        "get_script_as_dict",
        "get_all_characters",
        "set_beat_detected_identities",
        "set_beat_detected_props",
        "reserve_feature_start_credits",
        "confirm_feature_credit_reservation",
        "refund_feature_credit_reservation",
        "_grid_shape",
        "beat_pattern",
    ):
        assert implementation_detail not in route_source


def test_asset_world_style_layers_do_not_depend_on_fastapi() -> None:
    roots = (
        PACKAGE_ROOT / "modules" / "asset_world" / "domain",
        PACKAGE_ROOT / "modules" / "asset_world" / "application",
    )
    failures = [
        _relative(path)
        for root in roots
        for path in _python_files(root)
        if any(
            imported == "fastapi" or imported.startswith("fastapi.")
            for imported in _imports(path)
        )
    ]
    assert not failures


def test_asset_world_style_route_remains_an_http_adapter() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "styles.py"
    imported_modules = _imports(route)
    source = route.read_text(encoding="utf-8")

    assert "ai_anime.modules.asset_world.public" in imported_modules
    assert not {
        imported
        for imported in imported_modules
        if imported.startswith("ai_anime.generators")
        or imported == "ai_anime.models"
        or imported == "ai_anime.ports"
    }
    assert "StyleService" not in source
    assert "generate_character_reference_unified" not in source
    assert "StyleAnalyzer" not in source
    assert "get_usage_meter" not in source
    assert "tempfile" not in source


def test_asset_world_character_voice_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "characters.py"
    source = route.read_text(encoding="utf-8")

    assert "character_voice_use_cases" in source
    for legacy_implementation in (
        "def _voice_slot_metadata",
        "def _voice_slot_update_fields",
        "def _voice_slot_payload",
        "def _voice_samples_payload",
        "def _apply_character_voice_update",
        "persist_character_voice_file(",
        "trim_existing_character_voice_file(",
        "decode_recorded_audio_data_url(",
        "clear_character_voice_file(",
    ):
        assert legacy_implementation not in source


def test_asset_world_character_catalog_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "characters.py"
    source = route.read_text(encoding="utf-8")

    assert "character_catalog_use_cases" in source
    for legacy_implementation in (
        "def _unset_other_main_characters",
        "def _repair_duplicate_main_characters",
        "from ai_anime.models import NovelCharacter",
        "await store.add_character(",
        "await store.rename_character(",
        "await store.delete_character(",
    ):
        assert legacy_implementation not in source


def test_asset_world_prop_catalog_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "props.py"
    source = route.read_text(encoding="utf-8")

    assert "prop_catalog_use_cases" in source
    for legacy_implementation in (
        "def _prop_payload",
        "def _local_episode_prop_payloads",
        "def _rename_prop_asset_dir",
        "from ai_anime.models import NovelProp",
        "await store.list_props(",
        "await store.add_prop(",
        "await store.update_prop(",
        "await store.rename_prop(",
        "await store.delete_prop(",
    ):
        assert legacy_implementation not in source


def test_episode_prop_promotion_uses_asset_world_public_api() -> None:
    callers = (
        PACKAGE_ROOT / "api" / "routes" / "episodes.py",
        PACKAGE_ROOT / "task_backend" / "runners" / "episode_assets.py",
    )

    assert not (
        PACKAGE_ROOT / "services" / "prop_promotion_service.py"
    ).exists()
    for path in callers:
        source = path.read_text(encoding="utf-8")
        assert "promote_episode_props_to_global" in source
        assert "ai_anime.modules.asset_world.public" in _imports(path)
        assert "ai_anime.services.prop_promotion_service" not in source


def test_runtime_prop_menu_uses_one_asset_world_implementation() -> None:
    generation = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    beat_viewer = (
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "application"
        / "beat_viewer.py"
    )
    beat_viewer_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "beat_viewer.py"
    )
    freezone_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    freezone_presets = PACKAGE_ROOT / "freezone" / "presets.py"
    generation_source = generation.read_text(encoding="utf-8")
    beat_viewer_source = beat_viewer.read_text(encoding="utf-8")
    beat_viewer_adapter_source = beat_viewer_adapter.read_text(encoding="utf-8")
    route_source = freezone_route.read_text(encoding="utf-8")
    presets_source = freezone_presets.read_text(encoding="utf-8")

    assert not (PACKAGE_ROOT / "services" / "prop_ref_service.py").exists()
    assert "ai_anime.modules.asset_world.public" in _imports(generation)
    assert "runtime_prop_menu_for_episode" not in generation_source
    assert "BeatViewerRuntimePropMenuSource" in beat_viewer_source
    assert "runtime_episode_prop_menu" in beat_viewer_adapter_source
    assert "runtime_prop_menu_for_episode" in route_source
    assert "_runtime_prop_menu_with_global_props," not in route_source
    assert "runtime_prop_menu_with_cached_global_props" in presets_source
    assert "ai_anime.services.prop_ref_service" not in presets_source


def test_character_reference_map_uses_one_asset_world_implementation() -> None:
    callers = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "generation_context.py",
        PACKAGE_ROOT / "agents" / "global_video_optimizer.py",
        PACKAGE_ROOT / "director_world" / "control_frame_to_sketch.py",
        PACKAGE_ROOT / "freezone" / "presets.py",
    )

    assert not (
        PACKAGE_ROOT / "services" / "character_ref_service.py"
    ).exists()
    for path in callers:
        source = path.read_text(encoding="utf-8")
        assert "build_character_map_for_grid" in source
        assert "ai_anime.modules.asset_world.public" in _imports(path)
        assert "ai_anime.services.character_ref_service" not in source


def test_removed_character_auto_promotion_service_does_not_return() -> None:
    planner = PACKAGE_ROOT / "agents" / "identity_planner.py"
    source = planner.read_text(encoding="utf-8")

    assert not (
        PACKAGE_ROOT / "services" / "character_promotion_service.py"
    ).exists()
    assert "promote_scene_characters_to_global" not in source
    assert "ai_anime.services.character_promotion_service" not in source


def test_asset_world_prop_task_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "props.py"
    source = route.read_text(encoding="utf-8")

    assert "prop_task_use_cases" in source
    for legacy_implementation in (
        "get_task_backend",
        "project_task_state_key",
        "prop_reference_asset_scope",
        "enqueue_project_task(",
        "await store.get_prop(",
    ):
        assert legacy_implementation not in source


def test_asset_world_scene_catalog_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "scenes.py"
    source = route.read_text(encoding="utf-8")

    assert "scene_catalog_use_cases" in source
    for legacy_implementation in (
        "def _scene_payload",
        "def _stage_3gs_payload",
        "def _rename_scene_asset_dirs",
        "def _derived_scene_names_for",
        "def _derived_scene_guard_error",
        "def _compose_scene_asset_name",
        "await store.add_scene(",
        "await store.update_scene(",
        "await store.rename_scene(",
        "await store.delete_scene(",
    ):
        assert legacy_implementation not in source


def test_asset_world_scene_task_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "scenes.py"
    source = route.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(route))
    task_adapters = "\n".join(
        ast.get_source_segment(source, node) or ""
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name
        in {
            "build_scenes",
            "_start_scene_reference_task",
            "_start_3gs_single_face_task",
            "generate_scene_3gs_pano_ply",
            "generate_scene_pano",
        }
    )

    assert "scene_task_use_cases" in task_adapters
    assert "scene_reference_asset_scope" not in source
    assert "_start_or_enqueue_stage_asset" not in source
    assert "_scene_360_description" not in source
    for legacy_implementation in (
        "get_task_backend",
        "project_task_state_key",
        "enqueue_project_task",
        "task_config_scope",
        "stage_asset_scope",
        'task_type="build_scenes"',
        'task_type="scene_reference_asset"',
        'task_type="stage_asset"',
    ):
        assert legacy_implementation not in task_adapters


def test_asset_world_scene_media_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "scenes.py"
    source = route.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(route))
    media_adapters = "\n".join(
        ast.get_source_segment(source, node) or ""
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name
        in {
            "upload_scene_master",
            "delete_scene_master",
            "upload_scene_pano",
            "delete_scene_pano",
            "upload_scene_custom_package",
            "delete_scene_custom_package",
        }
    )

    assert "scene_media_use_cases" in media_adapters
    assert "_copy_upload_to_temp_file" not in source
    for legacy_implementation in (
        "Image.open",
        "canonical_scene_master_path",
        "compute_scene_master_path",
        "stage_manifest",
        "upload_scene_package",
        "copyfileobj",
        "NamedTemporaryFile",
        "time.time",
    ):
        assert legacy_implementation not in media_adapters


def test_asset_world_scene_viewer_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "scenes.py"
    source = route.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(route))
    viewer_adapters = "\n".join(
        ast.get_source_segment(source, node) or ""
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name
        in {
            "preview_scene_plate",
            "get_scene_pano_manifest",
            "update_scene_pano_correction",
            "get_scene_director_stage_manifest",
            "save_scene_director_world",
            "save_scene_director_world_source",
            "clear_scene_director_world",
        }
    )
    generation = (
        PACKAGE_ROOT / "api" / "routes" / "generation.py"
    ).read_text(encoding="utf-8")
    generation_tree = ast.parse(generation, filename="generation.py")
    beat_viewer_adapters = "\n".join(
        ast.get_source_segment(generation, node) or ""
        for node in generation_tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name
        in {
            "get_beat_pano_background_manifest",
            "get_default_director_stage_palette",
            "get_beat_director_stage_manifest",
            "get_director_control_frame_status",
        }
    )

    assert "scene_viewer_use_cases" in viewer_adapters
    assert "beat_viewer_use_cases" in beat_viewer_adapters
    assert not (PACKAGE_ROOT / "api" / "viewer_manifests.py").exists()
    for legacy_implementation in (
        "_require_scene",
        "_scene_plate_preview_payload",
        "resolve_scene_plate_from_records",
        "compute_scene_master_path",
        "build_pano_viewer_manifest",
        "build_director_stage_manifest",
        "stage_manifest.",
    ):
        assert legacy_implementation not in viewer_adapters
    for legacy_implementation in (
        "_episode_beat_from_resolution",
        "make_sqlite_store",
        "make_sqlite_store_for_context",
        "scene_viewer_use_cases",
        "production_generation_context_use_cases",
        "runtime_prop_menu_for_episode",
        "get_sketch_colors",
        "make_project_asset_url_builder",
        "beat_director_stage_use_cases",
    ):
        assert legacy_implementation not in beat_viewer_adapters
    assert "ai_anime.api.viewer_manifests" not in generation


def test_asset_world_beat_director_stage_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    source = route.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(route))
    director_adapters = "\n".join(
        ast.get_source_segment(source, node) or ""
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name
        in {
            "get_beat_director_stage_overlay",
            "save_beat_director_stage_overlay",
            "export_beat_director_stage_control_frame",
            "get_director_control_frame_status",
            "director_control_to_sketch",
        }
    )
    freezone = (PACKAGE_ROOT / "api" / "routes" / "freezone.py").read_text(
        encoding="utf-8"
    )
    public_api = (PACKAGE_ROOT / "modules" / "asset_world" / "public.py").read_text(
        encoding="utf-8"
    )
    frame_source = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "director_control_sketch.py"
    ).read_text(encoding="utf-8")

    assert "beat_viewer_use_cases" in director_adapters
    assert "director_control_sketch_use_cases" in director_adapters
    assert "beat_viewer_use_cases" in frame_source
    assert "beat_director_stage_use_cases" not in frame_source
    assert "def beat_director_stage_use_cases(" not in public_api
    assert "director_control_scope" not in freezone
    for legacy_implementation in (
        "_episode_beat_from_resolution",
        "make_project_asset_url_builder",
        'getattr(store, "update_beat_asset", None)',
    ):
        assert legacy_implementation not in director_adapters
    for legacy_implementation in (
        "beat_director_stage_use_cases",
        "resolve_beat_scene_name",
        "_director_control_scope",
        "_director_control_payload",
        "_director_overlay_beat_context",
        "_director_same_scene_beats",
        "_director_overlay_payload",
        "_director_overlay_status_payload",
        "_decode_png_data_url",
        "_director_control_frame_export_payload",
        "ai_anime.director_world.store",
        "ai_anime.director_world.paths",
    ):
        assert legacy_implementation not in source
    assert "def _beat_scene_name(" not in source
    assert "_director_control_scope" not in freezone


def test_asset_world_background_anchor_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "generation.py"
    source = route.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(route))
    anchor_adapters = "\n".join(
        ast.get_source_segment(source, node) or ""
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name
        in {
            "get_beat_background_anchors",
            "update_beat_background_anchor",
            "crop_beat_background_anchor",
            "upload_beat_background_anchor",
        }
    )
    public_api = (PACKAGE_ROOT / "modules" / "asset_world" / "public.py").read_text(
        encoding="utf-8"
    )
    composition = (
        PACKAGE_ROOT / "modules" / "asset_world" / "composition.py"
    ).read_text(encoding="utf-8")

    assert anchor_adapters.count("beat_viewer_use_cases") == 4
    assert "_episode_beat_from_resolution" not in source
    assert "BeatBackgroundAnchorUseCases" not in public_api
    assert "def beat_background_anchor_use_cases(" not in composition
    assert not (
        PACKAGE_ROOT / "services" / "background_anchor_service.py"
    ).exists()
    for legacy_implementation in (
        "beat_background_anchor_use_cases",
        "make_sqlite_store",
        "make_sqlite_store_for_context",
        "make_project_asset_url_builder",
        "get_beats_as_dicts",
        'getattr(store, "update_beat_asset", None)',
        "ai_anime.services.background_anchor_service",
        "def _api_background_reference_url_builder(",
        "def _api_background_anchor_url_builder(",
        "def _background_anchors_payload(",
        "background_anchor_path(",
        "copy_to_beat_selected_background(",
        "crop_to_beat_selected_background(",
        "canonical_beat_selected_background_path(",
        "sync_beat_asset_refs(",
    ):
        assert legacy_implementation not in anchor_adapters


def test_asset_routes_share_one_project_media_url_builder() -> None:
    route_sources = {
        name: (PACKAGE_ROOT / "api" / "routes" / name).read_text(encoding="utf-8")
        for name in ("characters.py", "props.py", "scenes.py")
    }
    generation_source = (PACKAGE_ROOT / "api" / "routes" / "generation.py").read_text(
        encoding="utf-8"
    )
    beat_viewer_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "beat_viewer.py"
    ).read_text(encoding="utf-8")
    shared_source = (PACKAGE_ROOT / "shared" / "project_media.py").read_text(
        encoding="utf-8"
    )

    assert shared_source.count("def make_project_asset_url_builder(") == 1
    for source in route_sources.values():
        assert "make_project_asset_url_builder" in source
    assert "make_project_asset_url_builder" in beat_viewer_adapter
    assert "make_project_asset_url_builder" not in generation_source
    for source in route_sources.values():
        assert "def _asset_url(" not in source
    assert "def _viewer_asset_url(" not in generation_source


def test_asset_world_character_identity_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "characters.py"
    source = route.read_text(encoding="utf-8")

    assert "character_identity_use_cases" in source
    for legacy_implementation in (
        "from ai_anime.models import CharacterIdentity",
        "await store.add_character_identity(",
        "await store.delete_character_identity(",
        "characters = store.get_all_characters()",
        "for ident in target.identities",
    ):
        assert legacy_implementation not in source


def test_asset_world_character_asset_history_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "characters.py"
    source = route.read_text(encoding="utf-8")

    assert "character_asset_history_use_cases" in source
    for legacy_implementation in (
        "def _identity_by_id",
        "def _backup_character_asset",
        "def _resolve_character_asset_path",
        "def _history_id_for_path",
        "def _character_asset_history_entries",
        "def _character_asset_history_path",
        "def _sync_restored_identity_asset",
        "shutil.copy2(source, target)",
    ):
        assert legacy_implementation not in source


def test_asset_world_character_image_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "characters.py"
    source = route.read_text(encoding="utf-8")

    assert "character_image_use_cases" in source
    for legacy_implementation in (
        "from PIL import Image",
        "Image.open(io.BytesIO(",
        "await store.delete_identity_image(",
        "def _safe_asset_name",
        "backup_character_asset",
        "image_attempts = len(",
        "portrait_attempts = len(",
    ):
        assert legacy_implementation not in source


def test_asset_world_image_settings_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "characters.py"
    source = route.read_text(encoding="utf-8")
    props_source = (PACKAGE_ROOT / "api" / "routes" / "props.py").read_text(
        encoding="utf-8"
    )
    scenes_source = (PACKAGE_ROOT / "api" / "routes" / "scenes.py").read_text(
        encoding="utf-8"
    )

    assert "image_settings_use_cases" in source
    assert source.count("character_generation_options(") == 6
    assert props_source.count(".project_style(") == 2
    assert scenes_source.count(".project_style(") == 2
    for adapter_source in (source, props_source, scenes_source):
        assert "image_settings_use_cases" in adapter_source
        assert "load_project_config" not in adapter_source
        assert "def _project_style" not in adapter_source
    for legacy_implementation in (
        "CHARACTER_IMAGE_SELECTION_CONFIG_KEY",
        "ASSET_IMAGE_SELECTION_CONFIG_KEYS",
        "CHARACTER_IMAGE_USAGE_TASK_TYPES",
        "def _character_image_selection_payload",
        "def _asset_image_source_selection_payload",
        "def _validate_asset_image_source_kind",
        "def _resolve_character_image_model",
        "resolve_character_model(",
        "character_image_selection_options",
        "image_generation_selection_options",
        "normalize_character_image_selection",
        "normalize_image_generation_selection",
        "get_character_image_selection",
        "get_image_usage_summary",
        "load_project_config_file",
        "update_project_config_file",
    ):
        assert legacy_implementation not in source


def test_asset_world_character_task_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "characters.py"
    source = route.read_text(encoding="utf-8")

    assert "character_task_use_cases" in source
    for legacy_implementation in (
        "get_task_backend",
        "project_task_state_key",
        "enqueue_project_task(",
    ):
        assert legacy_implementation not in source


def test_asset_world_character_generation_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "characters.py"
    source = route.read_text(encoding="utf-8")

    assert "character_generation_use_cases" in source
    for legacy_implementation in (
        "generate_character_reference_unified",
        "generate_identity_image_unified",
        "compute_portrait_path",
        "compute_identity_costume_path",
        "compute_identity_portrait_path",
        "shutil.copy",
        "shutil.rmtree",
        "re.sub",
    ):
        assert legacy_implementation not in source


def test_asset_world_character_image_runner_is_an_adapter() -> None:
    runner = PACKAGE_ROOT / "task_backend" / "runners" / "character_image.py"
    source = runner.read_text(encoding="utf-8")

    assert "execute_character_image_task" in source
    for implementation_detail in (
        "CogneeStore",
        "generate_character_reference_unified",
        "generate_identity_image_unified",
        "shutil",
        "def _generate_",
        "def _safe_asset_name",
    ):
        assert implementation_detail not in source


def test_narrative_script_route_remains_an_http_adapter() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "scripts.py"
    imported_modules = _imports(route)
    forbidden_imports = {
        imported
        for imported in imported_modules
        if imported == "ai_anime.ports"
        or imported == "ai_anime.task_identity"
        or imported.startswith("ai_anime.seedance2_i2v")
    }
    source = route.read_text(encoding="utf-8")
    forbidden_calls = {
        call
        for call in (
            "enqueue_project_task(",
            "reserve_feature_start_credits(",
            "confirm_feature_credit_reservation(",
            "refund_feature_credit_reservation(",
        )
        if call in source
    }

    assert not forbidden_imports
    assert not forbidden_calls


def test_narrative_episode_route_remains_an_http_adapter() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "episodes.py"
    imported_modules = _imports(route)
    source = route.read_text(encoding="utf-8")

    assert "ai_anime.utils.media_io" not in imported_modules
    assert "ai_anime.shared.project_media" not in imported_modules
    assert "make_static_url_for_context" not in source
    assert "audio_duration_jobs" not in source
