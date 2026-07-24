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

LEGACY_ROUTE_IMPORT_MAX = {
    ("api/routes/freezone.py", "ai_anime.api.routes.generation"): 2,
}


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

    assert "scene_viewer_use_cases" in viewer_adapters
    assert "scene_viewer_use_cases" in generation
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

    assert "beat_director_stage_use_cases" in director_adapters
    assert "director_control_scope" in freezone
    for legacy_implementation in (
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
