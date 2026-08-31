from __future__ import annotations

import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = REPO_ROOT / "src" / "ai_anime"
TASK_RUNNERS_ROOT = (
    PACKAGE_ROOT / "modules" / "task_execution" / "infrastructure" / "runners"
)


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


def _count_imports(root: Path, prefix: str) -> int:
    return sum(
        imported == prefix or imported.startswith(f"{prefix}.")
        for path in _python_files(root)
        for imported in _imports(path)
    )


def test_creative_canvas_legacy_freezone_dependencies_only_shrink() -> None:
    root = PACKAGE_ROOT / "modules" / "creative_canvas" / "infrastructure"
    assert _count_imports(root, "ai_anime.freezone") == 0


def test_creative_canvas_vision_implementation_has_one_owner() -> None:
    infrastructure = PACKAGE_ROOT / "modules" / "creative_canvas" / "infrastructure"
    removed = (
        PACKAGE_ROOT / "freezone" / "image_node.py",
        PACKAGE_ROOT / "freezone" / "mark_node.py",
        PACKAGE_ROOT / "freezone" / "vision_gateway.py",
    )
    assert all(not path.exists() for path in removed)
    assert (infrastructure / "reverse_prompt.py").exists()
    assert (infrastructure / "mark_detection.py").exists()
    assert (infrastructure / "vision_model.py").exists()

    production_sources = "\n".join(
        path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    )
    for legacy_import in (
        "ai_anime.freezone.image_node",
        "ai_anime.freezone.mark_node",
        "ai_anime.freezone.vision_gateway",
    ):
        assert legacy_import not in production_sources


def test_creative_canvas_lock_implementation_has_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "canvas_lock.py"
    owner = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_lock.py"
    )
    assert not legacy.exists()
    assert owner.exists()

    production_sources = "\n".join(
        path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    )
    assert "ai_anime.freezone.canvas_lock" not in production_sources


def test_creative_canvas_document_store_has_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "canvas_store.py"
    infrastructure = PACKAGE_ROOT / "modules" / "creative_canvas" / "infrastructure"
    owners = {
        "def save_canvas(": infrastructure / "canvas_store.py",
        "class CanvasSaveResult": infrastructure / "canvas_store_contracts.py",
        "def atomic_write_json(": infrastructure / "canvas_store_io.py",
        "def append_idempotency_entry(": (infrastructure / "canvas_store_history.py"),
    }
    assert not legacy.exists()
    assert all(path.exists() for path in owners.values())
    assert all(
        len(path.read_text(encoding="utf-8").splitlines()) <= 500
        for path in set(owners.values())
    )

    production_sources = {
        path: path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    }
    assert all(
        "ai_anime.freezone.canvas_store" not in source
        and "from ai_anime.freezone import canvas_store" not in source
        for source in production_sources.values()
    )
    for signature, owner in owners.items():
        matching_owners = [
            path for path, source in production_sources.items() if signature in source
        ]
        assert matching_owners == [owner]


def test_creative_canvas_audio_runtime_has_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "audio_node.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "audio_generation.py"
    )
    infrastructure = PACKAGE_ROOT / "modules" / "creative_canvas" / "infrastructure"
    generation = infrastructure / "audio_generation.py"
    voice_store = infrastructure / "audio_voice_store.py"
    assert not legacy.exists()
    assert generation.exists()
    assert voice_store.exists()

    production_sources = {
        path: path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    }
    assert all(
        "ai_anime.freezone.audio_node" not in source
        and "from ai_anime.freezone import audio_node" not in source
        for source in production_sources.values()
    )
    owners = {
        "class CreativeCanvasGeneratedAudio": application,
        "def create_user_audio_voice(": voice_store,
        "async def generate_freezone_audio_speech(": generation,
        "async def generate_freezone_audio_eleven_music(": generation,
    }
    for signature, owner in owners.items():
        matching_owners = [
            path for path, source in production_sources.items() if signature in source
        ]
        assert matching_owners == [owner]

    runner_source = (TASK_RUNNERS_ROOT / "freezone.py").read_text(encoding="utf-8")
    assert "generate_creative_canvas_audio_speech" in runner_source
    assert "generate_creative_canvas_audio_music" in runner_source
    assert "creative_canvas.infrastructure.audio_generation" not in runner_source
    assert "creative_canvas.infrastructure.audio_voice_store" not in runner_source


def test_creative_canvas_preset_identity_has_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "presets.py"
    owner = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "preset_identity.py"
    )
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_presets.py"
    )
    assert not legacy.exists()
    legacy_source = ""
    owner_source = owner.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")

    assert owner.exists()
    for signature in (
        "def preset_key_for_request(",
        "def canvas_id_for_preset(",
        "def safe_creative_canvas_identifier_fragment(",
    ):
        assert signature in owner_source
        assert signature not in legacy_source
    assert "preset_key_for_request" in public_source
    assert "canvas_id_for_preset" in public_source
    assert "from ai_anime.modules.creative_canvas.domain import (" in adapter_source
    assert "preset_key_for_request" in adapter_source
    assert "canvas_id_for_preset" in adapter_source


def test_creative_canvas_preset_context_rules_have_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "presets.py"
    owner = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "preset_context.py"
    )
    assert not legacy.exists()
    legacy_source = ""
    owner_source = owner.read_text(encoding="utf-8")

    assert owner.exists()
    for signature in (
        "def normalize_preset_scene_name(",
        "def extract_preset_visual_markers(",
        "def preset_identity_character(",
        "def preset_identity_name(",
        "def as_preset_list(",
        "def preset_prop_id(",
        "def preset_identity_id(",
        "def real_preset_identity_ids(",
        "def real_preset_prop_ids(",
        "def replace_preset_beat_markers(",
    ):
        assert signature in owner_source
    for legacy_signature in (
        "def _normalize_scene_name(",
        "def _visual_markers(",
        "def _identity_character(",
        "def _identity_name(",
        "def _as_list(",
        "def _prop_id_from_item(",
        "def _identity_id_from_item(",
        "def _real_identity_ids(",
        "def _real_prop_ids(",
        "def _replace_beat_markers(",
    ):
        assert legacy_signature not in legacy_source


def test_creative_canvas_preset_aspect_ratio_rules_have_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "presets.py"
    owner = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "domain"
        / "preset_aspect_ratio.py"
    )
    assert not legacy.exists()
    legacy_source = ""
    owner_source = owner.read_text(encoding="utf-8")

    assert owner.exists()
    for signature in (
        "def parse_preset_aspect_ratio(",
        "def nearest_preset_image_aspect_ratio(",
        "def normalize_preset_image_aspect_ratio(",
        "def project_preset_sketch_aspect_ratio(",
        "def context_preset_sketch_aspect_ratio(",
    ):
        assert signature in owner_source
    for legacy_signature in (
        "def _parse_aspect_ratio_value(",
        "def _nearest_supported_image_aspect_ratio(",
        "def _normalize_supported_image_aspect_ratio(",
        "def _project_sketch_aspect_ratio(",
        "def _context_sketch_aspect_ratio(",
    ):
        assert legacy_signature not in legacy_source


def test_creative_canvas_preset_reference_has_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "presets.py"
    owner = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "preset_reference.py"
    )
    assert not legacy.exists()
    legacy_source = ""
    owner_source = owner.read_text(encoding="utf-8")

    assert owner.exists()
    assert "class PresetRef:" in owner_source
    assert "def preset_ref_mainline_context(" in owner_source
    assert "def to_payload(" in owner_source
    assert "class PresetRef:" not in legacy_source
    assert "def _mainline_context_for_ref(" not in legacy_source
    assert "def _compact_context(" not in legacy_source


def test_creative_canvas_preset_infrastructure_has_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "presets.py"
    infrastructure = PACKAGE_ROOT / "modules" / "creative_canvas" / "infrastructure"
    references = infrastructure / "preset_references.py"
    contexts = infrastructure / "preset_contexts.py"
    payload = infrastructure / "preset_payload.py"

    assert not legacy.exists()
    assert references.exists()
    assert contexts.exists()
    assert payload.exists()
    assert all(
        "ai_anime.modules.creative_canvas.public" not in _imports(path)
        for path in (references, contexts, payload)
    )

    production_sources = {
        path: path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    }
    assert all(
        "ai_anime.freezone.presets" not in source
        and "from ai_anime.freezone import presets" not in source
        for source in production_sources.values()
    )
    owners = {
        "def _add_file_ref(": references,
        "def _add_character_refs(": references,
        "def _add_scene_refs(": references,
        "async def build_beat_preset_context(": contexts,
        "async def build_episode_preset_context(": contexts,
        "async def build_asset_preset_context(": contexts,
        "def build_canvas_payload_from_context(": payload,
        "def _beat_render_prompt(": payload,
    }
    for signature, owner in owners.items():
        matching_owners = [
            path for path, source in production_sources.items() if signature in source
        ]
        assert matching_owners == [owner]


def test_creative_canvas_paths_and_project_media_resolution_have_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "paths.py"
    canvas_paths = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "infrastructure" / "paths.py"
    )
    canvas_identity = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "canvas_identity.py"
    )
    project_media = PACKAGE_ROOT / "shared" / "project_media.py"
    assert not legacy.exists()
    assert canvas_paths.exists()
    assert canvas_identity.exists()
    assert project_media.exists()

    production_files = _python_files(PACKAGE_ROOT)
    production_sources = {
        path: path.read_text(encoding="utf-8") for path in production_files
    }
    assert all(
        "ai_anime.freezone.paths" not in source
        for source in production_sources.values()
    )
    resolver_owners = [
        path
        for path, source in production_sources.items()
        if "def resolve_project_media_path(" in source
    ]
    assert resolver_owners == [project_media]


def test_creative_canvas_static_url_projection_has_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "canvas_static_urls.py"
    owner = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_static_urls.py"
    )
    assert not legacy.exists()
    assert owner.exists()

    production_sources = {
        path: path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    }
    assert all(
        "ai_anime.freezone.canvas_static_urls" not in source
        for source in production_sources.values()
    )
    migration_owners = [
        path
        for path, source in production_sources.items()
        if "def migrate_canvas_static_urls_in_memory(" in source
    ]
    assert migration_owners == [owner]


def test_creative_canvas_generation_history_has_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "history.py"
    owner = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "infrastructure" / "history.py"
    )
    assert not legacy.exists()
    assert owner.exists()

    production_sources = {
        path: path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    }
    assert all(
        "ai_anime.freezone.history" not in source
        for source in production_sources.values()
    )
    append_owners = [
        path
        for path, source in production_sources.items()
        if "def append_generation_history(" in source
    ]
    assert append_owners == [owner]


def test_creative_canvas_slot_implementation_has_one_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone" / "slots.py"
    domain = PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "slot_targets.py"
    infrastructure = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "infrastructure" / "slots.py"
    )
    api_schema = PACKAGE_ROOT / "api" / "routes/creative_canvas/commits_schemas.py"
    assert not legacy.exists()
    assert domain.exists()
    assert infrastructure.exists()

    production_sources = {
        path: path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    }
    assert all(
        "ai_anime.freezone.slots" not in source
        for source in production_sources.values()
    )
    slot_path_owners = [
        path
        for path, source in production_sources.items()
        if "def slot_target_path(" in source
    ]
    slot_validation_owners = [
        path
        for path, source in production_sources.items()
        if "def validate_source_for_slot(" in source
    ]
    assert slot_path_owners == [infrastructure]
    assert slot_validation_owners == [domain]

    api_schema_source = api_schema.read_text(encoding="utf-8")
    assert "from ai_anime.modules.creative_canvas.public import SlotTarget" in (
        api_schema_source
    )
    assert "ai_anime.modules.creative_canvas.domain.slot_targets" not in (
        api_schema_source
    )


def test_legacy_freezone_package_has_no_source_files() -> None:
    assert not list((PACKAGE_ROOT / "freezone").glob("*.py"))


def test_task_runner_freezone_job_dependencies_only_shrink() -> None:
    assert _count_imports(TASK_RUNNERS_ROOT, "ai_anime.freezone.jobs") == 0


def test_creative_canvas_job_execution_has_one_module_owner() -> None:
    legacy = PACKAGE_ROOT / "freezone"
    module = PACKAGE_ROOT / "modules" / "creative_canvas"
    application = module / "application" / "job_execution.py"
    infrastructure = module / "infrastructure"
    adapters = (
        infrastructure / "image_job_runtime.py",
        infrastructure / "media_process.py",
        infrastructure / "video_analysis_job_runtime.py",
        infrastructure / "video_composition_job_runtime.py",
        infrastructure / "video_erase_job_runtime.py",
        infrastructure / "video_generation_job_runtime.py",
        infrastructure / "video_processing_job_runtime.py",
    )
    assert not list(legacy.glob("*.py"))
    assert application.exists()
    assert all(path.exists() for path in adapters)

    production_sources = {
        path: path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    }
    assert all(
        "ai_anime.freezone.jobs" not in source for source in production_sources.values()
    )
    runner_sources = "\n".join(
        path.read_text(encoding="utf-8") for path in _python_files(TASK_RUNNERS_ROOT)
    )
    assert "creative_canvas.infrastructure" not in runner_sources
    assert "creative_canvas_job_execution_use_cases" in runner_sources


def test_project_task_runtimes_use_the_shared_cognee_store_factory() -> None:
    roots = (
        TASK_RUNNERS_ROOT,
        PACKAGE_ROOT / "modules",
    )
    owner_root = str(PACKAGE_ROOT / "modules" / "knowledge_graph")
    violations = [
        str(path.relative_to(REPO_ROOT))
        for root in roots
        for path in _python_files(root)
        if not str(path).startswith(owner_root)
        and "CogneeStore(" in path.read_text(encoding="utf-8")
    ]
    assert violations == []


def test_round_2_target_modules_are_not_empty_shells() -> None:
    targets = {
        PACKAGE_ROOT / "modules" / "creative_canvas": "public.py",
        PACKAGE_ROOT / "modules" / "ai_assistant": "public.py",
        PACKAGE_ROOT / "modules" / "task_execution": "public.py",
    }
    for root, public_name in targets.items():
        assert root.exists()
        assert (root / public_name).exists()
        assert any(path.name != "__init__.py" for path in _python_files(root))


def test_task_execution_core_contracts_have_one_owner() -> None:
    module = PACKAGE_ROOT / "modules" / "task_execution"
    removed = (
        PACKAGE_ROOT / "task_backend",
        PACKAGE_ROOT / "ports" / "cloud.py",
        PACKAGE_ROOT / "ports" / "local" / "mock_cloud.py",
        PACKAGE_ROOT / "ports" / "local" / "mock_tasks.py",
        PACKAGE_ROOT / "ports" / "local" / "tasks.py",
        PACKAGE_ROOT / "ports" / "tasks.py",
        PACKAGE_ROOT / "task_identity.py",
        PACKAGE_ROOT / "task_backend" / "client.py",
        PACKAGE_ROOT / "task_backend" / "cancel.py",
        PACKAGE_ROOT / "task_backend" / "limits.py",
        PACKAGE_ROOT / "task_backend" / "queues.py",
        PACKAGE_ROOT / "task_backend" / "registry.py",
        PACKAGE_ROOT / "task_backend" / "run_core.py",
        PACKAGE_ROOT / "task_backend" / "subprocesses.py",
    )
    owners = (
        module / "application" / "cloud_tasks.py",
        module / "application" / "project_task_limits.py",
        module / "application" / "project_task_submission.py",
        module / "application" / "ports.py",
        module / "application" / "project_tasks.py",
        module / "application" / "project_task_execution.py",
        module / "application" / "task_cancellation.py",
        module / "domain" / "admission.py",
        module / "domain" / "cloud_task.py",
        module / "domain" / "project_task.py",
        module / "domain" / "queue.py",
        module / "domain" / "task_identity.py",
        module / "domain" / "task_metadata.py",
        module / "domain" / "task_time.py",
        module / "domain" / "task_execution.py",
        module / "domain" / "task_cancellation.py",
        module / "infrastructure" / "admission_policy.py",
        module / "infrastructure" / "inline_backend.py",
        module / "infrastructure" / "project_tasks.py",
        module / "infrastructure" / "project_subprocesses.py",
        module / "infrastructure" / "project_task_capacity.py",
        module / "infrastructure" / "project_task_runtime.py",
        module / "infrastructure" / "runner_registry.py",
        module / "infrastructure" / "runners" / "__init__.py",
        module / "presentation" / "project_task_projection.py",
        module / "public.py",
    )
    assert all(not path.exists() for path in removed)
    assert all(path.exists() for path in owners)

    runner_files = {
        path.name for path in (module / "infrastructure" / "runners").glob("*.py")
    }
    assert runner_files == {
        "__init__.py",
        "audio.py",
        "character_image.py",
        "character_voice.py",
        "episode_assets.py",
        "freezone.py",
        "graph_build.py",
        "identity.py",
        "ingest.py",
        "production_workflow.py",
        "prop_reference.py",
        "render.py",
        "scene_reference.py",
        "script.py",
        "script_workflow.py",
        "sketch.py",
        "sketch_edit_execute.py",
        "stage_asset.py",
        "style_preview.py",
        "verification.py",
        "video.py",
    }

    violations = []
    for path in _python_files(PACKAGE_ROOT):
        if module in path.parents:
            continue
        for imported in _imports(path):
            if imported.startswith("ai_anime.modules.task_execution") and imported != (
                "ai_anime.modules.task_execution.public"
            ):
                violations.append(f"{path.relative_to(REPO_ROOT)} imports {imported}")
    assert violations == []

    ports_source = (PACKAGE_ROOT / "shared" / "ports" / "__init__.py").read_text(
        encoding="utf-8"
    )
    local_ports_source = (
        PACKAGE_ROOT / "shared" / "ports" / "local" / "__init__.py"
    ).read_text(encoding="utf-8")
    assert "get_cloud_adapter" not in ports_source
    assert 'register_port("cloud_adapter"' not in local_ports_source

    task_route = (
        PACKAGE_ROOT / "api" / "routes" / "task_execution" / "tasks.py"
    ).read_text(encoding="utf-8")
    for moved_implementation in (
        "TaskState",
        "project_task_state_key",
        "task_state_key",
        "project_static_url",
        "def _effective_task_status(",
        "def _serialize_task(",
        "def _sanitize_task_result_for_client(",
        "QUEUE_KINDS",
        "project_lane_effective_active_limit",
        "project_user_lane_active_limit",
        "count_active_tasks_for_project_lane",
        "def _remaining(",
    ):
        assert moved_implementation not in task_route
    assert "serialize_project_task" in task_route
    assert "project_task_use_cases()" in task_route
    assert "project_task_limit_use_cases()" in task_route
    for route_owned_dependency in (
        "get_task_backend",
        "get_task_manager",
        "count_project_task_eligible_users",
        "create_project_task_use_cases",
        "create_project_task_limit_use_cases",
    ):
        assert route_owned_dependency not in task_route

    task_backend_route_violations = []
    for path in _python_files(PACKAGE_ROOT / "api" / "routes"):
        source = path.read_text(encoding="utf-8")
        for forbidden in ("get_task_backend", "task_backend_provider"):
            if forbidden in source:
                task_backend_route_violations.append(
                    f"{path.relative_to(REPO_ROOT)}: {forbidden}"
                )
    assert task_backend_route_violations == []


def test_stage_asset_subprocesses_are_owned_by_asset_world() -> None:
    module = PACKAGE_ROOT / "modules" / "asset_world"
    infrastructure = module / "infrastructure" / "director_world"
    public = (module / "public.py").read_text(encoding="utf-8")
    runner = (
        PACKAGE_ROOT
        / "modules"
        / "task_execution"
        / "infrastructure"
        / "runners"
        / "stage_asset.py"
    )
    runner_source = runner.read_text(encoding="utf-8")

    assert not (PACKAGE_ROOT / "stage_asset_tasks.py").exists()
    assert {path.name for path in infrastructure.glob("*.py")} >= {
        "__init__.py",
        "pano_splat_tasks.py",
        "scene_360_tasks.py",
        "scene_package_tasks.py",
        "voxel_world_tasks.py",
    }
    for operation in (
        "run_pano_sharp",
        "run_scene_360",
        "run_single_face_sharp",
        "run_splat_collision",
        "run_voxel_world_from_360",
        "upload_scene_package",
    ):
        assert f'"{operation}"' in public
        assert f"def {operation}(" not in runner_source
    assert "ai_anime.modules.asset_world.public" in _imports(runner)
    assert "ai_anime.stage_asset_tasks" not in runner_source
    assert not list((PACKAGE_ROOT / "modules" / "director_world").rglob("*.py"))


def test_project_sqlite_uow_composes_owned_repositories() -> None:
    entry = PACKAGE_ROOT / "sqlite_store.py"
    asset_repository = (
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "sqlite_assets.py"
    )
    narrative_repository = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "sqlite_narrative.py"
    )
    schema = PACKAGE_ROOT / "shared" / "infrastructure" / "project_sqlite_schema.py"
    core = PACKAGE_ROOT / "shared" / "infrastructure" / "project_sqlite_core.py"
    graph_state = (
        PACKAGE_ROOT / "shared" / "infrastructure" / "project_sqlite_graph_state.py"
    )
    knowledge_store = (
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "store.py"
    )
    entry_source = entry.read_text(encoding="utf-8")
    knowledge_source = knowledge_store.read_text(encoding="utf-8")

    assert len(entry_source.splitlines()) < 50
    assert "class SQLiteStore(" in entry_source
    assert "AssetWorldSQLiteRepositoryMixin" in entry_source
    assert "NarrativeSQLiteRepositoryMixin" in entry_source
    assert "ProjectSQLiteGraphStateMixin" in entry_source
    for reverse_dependency in (
        "ai_anime.modules.asset_world.public",
        "ai_anime.modules.narrative_planning.public",
        "ai_anime.modules.production.public",
    ):
        assert reverse_dependency not in _imports(entry)

    asset_source = asset_repository.read_text(encoding="utf-8")
    narrative_source = narrative_repository.read_text(encoding="utf-8")
    assert "async def add_character(" in asset_source
    assert "async def add_scene(" in asset_source
    assert "async def add_prop(" in asset_source
    assert "async def add_episode(" in narrative_source
    assert "async def add_visual_beats(" in narrative_source
    assert "SQLITE_SCHEMA_SQL =" in schema.read_text(encoding="utf-8")
    assert "class ProjectSQLiteCore:" in core.read_text(encoding="utf-8")
    assert "class ProjectSQLiteGraphStateMixin:" in graph_state.read_text(
        encoding="utf-8"
    )
    assert "class CogneeStore(ProjectSQLiteGraphStateMixin):" in knowledge_source
    assert "def resolve_name(" not in knowledge_source
    assert "def get_cached_prop(" not in knowledge_source


def test_task_restart_recovery_rules_are_owned_by_task_execution() -> None:
    module = PACKAGE_ROOT / "modules" / "task_execution"
    domain = module / "domain" / "task_restart_recovery.py"
    composition = module / "composition.py"
    task_state = module / "infrastructure" / "task_state.py"
    inline_backend = module / "infrastructure" / "inline_backend.py"

    domain_source = domain.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    task_state_source = task_state.read_text(encoding="utf-8")

    assert "class InterruptedTaskRecoveryPlan:" in domain_source
    assert "def build_interrupted_inline_recovery_plan(" in domain_source
    assert 'backend="inline"' in domain_source
    assert 'status="failed"' in domain_source
    assert "服务重启,任务已中断,请重新发起" in domain_source
    assert "_PROCESS_STARTED_AT = datetime.now(timezone.utc)" in task_state_source
    assert "build_interrupted_inline_recovery_plan(" in task_state_source
    assert "_PROCESS_STARTED_AT" not in composition_source
    assert "build_interrupted_inline_recovery_plan(" not in composition_source
    assert not (PACKAGE_ROOT / "task_state.py").exists()
    for moved_rule in (
        "服务重启,任务已中断,请重新发起",
        "ACTIVE_PROJECT_TASK_STATUSES = {",
        "TERMINAL_TASK_STATUSES = {",
    ):
        assert moved_rule not in task_state_source
    for backend in (inline_backend,):
        source = backend.read_text(encoding="utf-8")
        assert "task_execution.domain.task_restart_recovery" in source
        assert "task_state import ACTIVE_PROJECT_TASK_STATUSES" not in source

    legacy_imports = [
        path.relative_to(REPO_ROOT).as_posix()
        for path in _python_files(PACKAGE_ROOT)
        if "ai_anime.task_state" in path.read_text(encoding="utf-8")
    ]
    assert legacy_imports == []


def test_story_intake_submits_tasks_only_through_task_execution() -> None:
    story_module = PACKAGE_ROOT / "modules" / "story_intake"
    scheduler = story_module / "infrastructure" / "task_scheduler.py"
    bootstrap = story_module / "bootstrap.py"
    public = story_module / "public.py"
    route = PACKAGE_ROOT / "api" / "routes" / "story_intake" / "ingest.py"

    scheduler_source = scheduler.read_text(encoding="utf-8")
    bootstrap_source = bootstrap.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert "ProjectTaskSubmission(" in scheduler_source
    assert "self._submissions.submit(" in scheduler_source
    assert "project_task_submission_use_cases()" in bootstrap_source
    for legacy_source in (
        scheduler_source,
        bootstrap_source,
        public_source,
        route_source,
    ):
        assert "get_task_backend" not in legacy_source
        assert "task_backend_provider" not in legacy_source
        assert "TaskBackendScheduler" not in legacy_source
    assert "enqueue_project_task" not in scheduler_source


def test_narrative_planning_submits_tasks_only_through_task_execution() -> None:
    module = PACKAGE_ROOT / "modules" / "narrative_planning"
    scheduler = module / "infrastructure" / "task_scheduler.py"
    composition = module / "composition.py"
    scheduler_source = scheduler.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")

    route_source = (
        PACKAGE_ROOT / "api" / "routes" / "narrative_planning" / "episodes.py"
    ).read_text(encoding="utf-8")

    assert scheduler_source.count("ProjectTaskSubmission(") == 7
    assert scheduler_source.count("self._submissions.submit(") == 7
    assert "project_task_submission_use_cases()" in composition_source
    for legacy_source in (scheduler_source, composition_source):
        assert "get_task_backend" not in legacy_source
        assert "task_backend_provider" not in legacy_source
        assert "TaskBackendScheduler" not in legacy_source
    assert "enqueue_project_task" not in scheduler_source
    assert "project_task_state_key" not in scheduler_source
    assert "start_episode_asset_planning" in route_source
    assert "start_episode_identity_planning" in route_source
    assert "get_task_backend" not in route_source
    assert "project_task_state_key" not in route_source
    assert "enqueue_project_task" not in route_source


def test_asset_world_submits_tasks_only_through_task_execution() -> None:
    module = PACKAGE_ROOT / "modules" / "asset_world"
    scheduler = module / "infrastructure" / "task_scheduler.py"
    composition = module / "composition.py"
    scheduler_source = scheduler.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")

    assert scheduler_source.count("ProjectTaskSubmission(") == 1
    assert scheduler_source.count("self._submissions.submit(") == 1
    assert composition_source.count("project_task_submission_use_cases()") == 4
    for legacy_source in (scheduler_source, composition_source):
        assert "get_task_backend" not in legacy_source
        assert "task_backend_provider" not in legacy_source
        assert "TaskBackendAssetTaskScheduler" not in legacy_source
    assert "enqueue_project_task" not in scheduler_source
    assert "project_task_state_key" not in scheduler_source


def test_creative_canvas_submits_tasks_only_through_task_execution() -> None:
    module = PACKAGE_ROOT / "modules" / "creative_canvas"
    scheduler = module / "infrastructure" / "task_submission.py"
    composition = module / "composition.py"
    scheduler_source = scheduler.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")

    assert scheduler_source.count("ProjectTaskSubmission(") == 1
    assert scheduler_source.count("self._submissions.submit(") == 1
    assert composition_source.count("project_task_submission_use_cases()") == 11
    for legacy_source in (scheduler_source, composition_source):
        assert "get_task_backend" not in legacy_source
        assert "task_backend_provider" not in legacy_source
        assert "TaskBackendCreativeCanvasTaskScheduler" not in legacy_source
    assert "enqueue_project_task" not in scheduler_source
    assert "project_task_state_key" not in scheduler_source


def test_production_submits_tasks_only_through_task_execution() -> None:
    module = PACKAGE_ROOT / "modules" / "production"
    adapter_paths = tuple(
        module / "infrastructure" / filename
        for filename in (
            "director_control_sketch.py",
            "episode_audio.py",
            "episode_video.py",
            "global_video_optimization.py",
            "grid_regeneration.py",
            "render_planning.py",
            "selected_regeneration.py",
            "single_video.py",
            "sketch_edit_execution.py",
            "sketch_generation.py",
        )
    )
    adapter_sources = [path.read_text(encoding="utf-8") for path in adapter_paths]
    composition_source = (module / "composition.py").read_text(encoding="utf-8")

    route_source = (
        PACKAGE_ROOT / "api" / "routes" / "verification" / "episode_checks.py"
    ).read_text(encoding="utf-8")

    assert (
        sum(source.count("ProjectTaskSubmission(") for source in adapter_sources) == 10
    )
    assert (
        sum(source.count("self._submissions.submit(") for source in adapter_sources)
        == 10
    )
    assert composition_source.count("project_task_submission_use_cases()") == 12
    for legacy_source in (*adapter_sources, composition_source):
        assert "get_task_backend" not in legacy_source
        assert "task_backend_provider" not in legacy_source
        assert "enqueue_project_task" not in legacy_source
        assert "project_task_state_key" not in legacy_source
        assert "class TaskBackend" not in legacy_source
    assert "sketch_edit_execution_use_cases" in route_source
    assert "get_task_backend" not in route_source
    assert "project_task_state_key" not in route_source
    assert "task_config_scope" not in route_source
    assert "enqueue_project_task" not in route_source


def test_removed_legacy_package_shells_do_not_return() -> None:
    removed = (
        "export",
        "render_plan",
        "workflows",
        "prompts",
        "ui",
        "backup",
        "bootstrap",
        "skills",
        "services",
        "assets",
        "agents",
        "audio",
        "chat",
        "cognee",
        "director_world",
        "generators",
        "ports",
        "security",
        "seedance2_i2v",
        "storage",
        "utils",
        "verification",
    )
    assert [name for name in removed if (PACKAGE_ROOT / name).exists()] == []
    assert (PACKAGE_ROOT / "styles" / "presets").is_dir()


def test_recent_bounded_context_moves_do_not_regress() -> None:
    modules_root = PACKAGE_ROOT / "modules"
    for retired_context in ("director_world", "generators"):
        assert not _python_files(modules_root / retired_context)

    for layered_context in ("knowledge_graph", "verification"):
        root_files = {
            path.name for path in (modules_root / layered_context).glob("*.py")
        }
        assert root_files == {"__init__.py", "public.py"}

    knowledge_graph = modules_root / "knowledge_graph"
    assert "run_character_extraction_pipeline" not in (
        knowledge_graph / "public.py"
    ).read_text(encoding="utf-8")
    assert "run_character_extraction_pipeline" not in (
        knowledge_graph / "infrastructure" / "pipeline.py"
    ).read_text(encoding="utf-8")

    media_generation = (
        modules_root / "production" / "infrastructure" / "media_generation"
    )
    public = modules_root / "production" / "public.py"
    for owner_file in (
        "nanobanana_grid.py",
        "pool_indexer.py",
        "prompt_builder.py",
        "video_composer.py",
    ):
        assert (media_generation / owner_file).is_file()
    assert all(
        "ai_anime.modules.production.public" not in _imports(path)
        for path in _python_files(media_generation)
    )

    public_source = public.read_text(encoding="utf-8")
    for public_name in (
        "NanoBananaGridGenerator",
        "IndexTTS2Client",
        "create_video_composer",
        "nanobanana_grid",
    ):
        assert f'"{public_name}"' in public_source


def test_media_generation_mega_modules_stay_split_behind_compatibility_facades() -> (
    None
):
    media_generation = (
        PACKAGE_ROOT / "modules" / "production" / "infrastructure" / "media_generation"
    )
    prompt_facade = media_generation / "prompt_builder.py"
    grid_facade = media_generation / "nanobanana_grid.py"
    prompt_source = prompt_facade.read_text(encoding="utf-8")
    grid_source = grid_facade.read_text(encoding="utf-8")

    for implementation in (
        "prompt_models.py",
        "prompt_components.py",
        "prompt_strategies.py",
        "grid_planning.py",
        "nanobanana_grid_generator.py",
    ):
        assert (media_generation / implementation).is_file()

    assert "class PromptComponents" not in prompt_source
    assert "class UnifiedPromptBuilder" not in prompt_source
    assert "class NanoBananaGridGenerator" not in grid_source
    assert "def scene_grid_split(" not in grid_source
    assert {
        "ai_anime.modules.production.infrastructure.media_generation.prompt_components",
        "ai_anime.modules.production.infrastructure.media_generation.prompt_models",
        "ai_anime.modules.production.infrastructure.media_generation.prompt_strategies",
    }.issubset(_imports(prompt_facade))
    assert {
        "ai_anime.modules.production.infrastructure.media_generation.grid_planning",
        "ai_anime.modules.production.infrastructure.media_generation.nanobanana_grid_generator",
    }.issubset(_imports(grid_facade))


def test_modules_do_not_import_legacy_top_level_packages() -> None:
    legacy_prefixes = (
        "ai_anime.audio",
        "ai_anime.audio_request_usage",
        "ai_anime.storage",
        "ai_anime.backup",
        "ai_anime.bootstrap",
        "ai_anime.skills",
        "ai_anime.services",
        "ai_anime.assets",
        "ai_anime.config",
        "ai_anime.env",
        "ai_anime.image_request_usage",
        "ai_anime.model_access_policy",
        "ai_anime.model_audio_transport",
        "ai_anime.model_gateway_settings",
        "ai_anime.model_text_transport",
        "ai_anime.official_defaults",
        "ai_anime.project_config",
        "ai_anime.sqlite_pragmas",
        "ai_anime.stage_asset_tasks",
        "ai_anime.task_state",
        "ai_anime.time_of_day",
        "ai_anime.video_request_usage",
    )
    violations = [
        f"{path.relative_to(REPO_ROOT)} imports {imported}"
        for path in _python_files(PACKAGE_ROOT / "modules")
        for imported in _imports(path)
        if any(
            imported == prefix or imported.startswith(f"{prefix}.")
            for prefix in legacy_prefixes
        )
    ]
    assert violations == []


def test_commercial_gateway_has_one_fixed_production_origin() -> None:
    production_roots = (
        REPO_ROOT / "desktop" / "src",
        REPO_ROOT / "desktop" / "scripts",
        REPO_ROOT / "frontend" / "src",
        PACKAGE_ROOT,
    )
    production = "\n".join(
        path.read_text(encoding="utf-8")
        for root in production_roots
        for path in root.rglob("*")
        if path.is_file()
        and path.suffix in {".py", ".ts", ".tsx", ".cts", ".mjs", ".cjs"}
        and "__tests__" not in path.parts
        and "tests" not in path.parts
    )
    assert (
        'export const COMMERCIAL_GATEWAY_URL = "https://aianime.mingcw.com";'
        in production
    )
    assert production.count("aianime.mingcw.com") == 1
    assert "AI_ANIME_CLOUD_API_URL" not in production
    assert "OFFICIAL_NEWAPI_BASE_URL" not in production


def test_frontend_commercial_bootstrap_has_one_composition_owner() -> None:
    frontend_root = REPO_ROOT / "frontend" / "src"
    sources = {
        path: path.read_text(encoding="utf-8")
        for path in frontend_root.rglob("*")
        if path.suffix in {".ts", ".tsx"}
        and "__tests__" not in path.parts
        and not path.name.endswith(".test.ts")
        and not path.name.endswith(".test.tsx")
    }
    bootstrap_callers = [
        path.relative_to(REPO_ROOT).as_posix()
        for path, source in sources.items()
        if "commercialBridge().bootstrap({" in source
    ]
    assert bootstrap_callers == ["frontend/src/app/commercial-access.ts"]

    composition = sources[frontend_root / "app" / "commercial-access.ts"]
    assert "seedCommercialBootstrapModelUsage(queryClient, payload)" in composition
    assert "seedCommercialBootstrapRelease(queryClient, payload)" in composition
    assert "completeBootstrap(entitlement)" in composition


def test_fastapi_model_access_uses_only_the_desktop_mixed_router() -> None:
    infrastructure = PACKAGE_ROOT / "modules" / "model_usage" / "infrastructure"
    policy = (infrastructure / "model_access_policy.py").read_text(encoding="utf-8")
    settings = (infrastructure / "model_gateway_settings.py").read_text(
        encoding="utf-8"
    )
    assert 'normalized_mode != "mixed"' in policy
    assert '_selected_mode = "mixed"' in policy
    assert 'MODE_MIXED = "mixed"' in settings
    assert 'MODE_CLOUD = "cloud"' not in settings
    assert 'MODE_BYOK = "byok"' not in settings
    assert "AI_ANIME_CLOUD_PROXY_BASE_URL" in policy
    assert "AI_ANIME_CLOUD_PROXY_TOKEN" in policy
    assert "OFFICIAL_NEWAPI_BASE_URL" not in policy
    assert "OPENROUTER_API_KEY" not in policy


def test_desktop_model_access_routes_cloud_and_multiple_byok_providers_together() -> (
    None
):
    main = (REPO_ROOT / "desktop" / "src" / "main.ts").read_text(encoding="utf-8")
    commercial_entry = (REPO_ROOT / "desktop" / "src" / "commercial.ts").read_text(
        encoding="utf-8"
    )
    commercial_client = (
        REPO_ROOT / "desktop" / "src" / "commercial-api-client.ts"
    ).read_text(encoding="utf-8")
    commercial_ipc = (REPO_ROOT / "desktop" / "src" / "commercial-ipc.ts").read_text(
        encoding="utf-8"
    )
    commercial_ipc_support = (
        REPO_ROOT / "desktop" / "src" / "commercial-ipc-support.ts"
    ).read_text(encoding="utf-8")
    cloud_proxy = (
        REPO_ROOT / "desktop" / "src" / "commercial-model-proxy.ts"
    ).read_text(encoding="utf-8")
    cloud_proxy_http = (
        REPO_ROOT / "desktop" / "src" / "commercial-model-proxy-http.ts"
    ).read_text(encoding="utf-8")

    assert "commercialModelProxy = new CommercialModelProxy(" in main
    assert "appendModelRouteAudit(modelRouteLogPath, entry)" in main
    assert "AI_ANIME_CLOUD_PROXY_BASE_URL: commercialModelProxy.baseUrl" in main
    assert "AI_ANIME_CLOUD_PROXY_TOKEN: commercialModelProxy.token" in main
    assert 'mode: "mixed"' in main
    assert "modelRoutingSnapshot(routing)" in main
    assert "byokBaseUrl" not in main
    assert "byokApiKey" not in main

    assert "return this.client.modelRequest({" in cloud_proxy
    assert "requestByok(route, input, prepared)" in cloud_proxy
    assert "requestWithFallback" in cloud_proxy
    assert "modelRoutingSnapshot" in cloud_proxy
    assert "BYOK_CONFIGURATION_ERROR_STATUSES" in cloud_proxy_http
    assert "shouldFallback(route, upstream.status)" in cloud_proxy
    assert "requestedModel" not in cloud_proxy
    assert "cloudPassthroughRoute" not in cloud_proxy
    assert "拒绝绕过统一路由" in cloud_proxy
    assert "export *" not in commercial_entry
    assert "function registerCommercialIpc" not in commercial_entry
    assert 'from "./commercial-api-client.js"' in commercial_entry
    assert 'from "./commercial-ipc.js"' in commercial_entry

    assert "function registerCommercialIpc" in commercial_ipc
    assert "requestResponse(" not in commercial_ipc
    assert "fetchImpl" not in commercial_ipc
    assert (
        "authorization?.capabilities.allowsCustomModels === true"
        in commercial_ipc_support
    )

    assert "function registerCommercialIpc" not in commercial_client
    assert "COMMERCIAL_CHANNELS" not in commercial_client
    assert "requestResponse(" in commercial_client
    assert "IpcMainLike" not in commercial_client


def test_legacy_image_model_configuration_cannot_return() -> None:
    forbidden = {
        "fixed_image",
        "IMAGE_GENERATION_SELECTIONS",
        "NEWAPI_IMAGE_MODEL",
        "SEEDREAM_MODEL",
        "SEEDEDIT_MODEL",
        "VOLCENGINE_VISUAL_ENDPOINT",
    }
    violations: list[str] = []
    for path in _python_files(PACKAGE_ROOT):
        if path == PACKAGE_ROOT / "task_backend" / "subprocesses.py":
            continue
        source = path.read_text(encoding="utf-8")
        for value in forbidden:
            if value in source:
                violations.append(f"{path.relative_to(REPO_ROOT)}: {value}")
    assert violations == []


def test_third_model_fallback_configuration_cannot_return() -> None:
    backend_config = (
        PACKAGE_ROOT / "modules" / "model_usage" / "infrastructure" / "model_runtime.py"
    ).read_text(encoding="utf-8")
    project_config = (
        PACKAGE_ROOT
        / "modules"
        / "project_workspace"
        / "infrastructure"
        / "project_config.py"
    ).read_text(encoding="utf-8")
    frontend_settings = (
        REPO_ROOT
        / "frontend"
        / "src"
        / "modules"
        / "creative_canvas"
        / "presentation"
        / "settingsStore.ts"
    ).read_text(encoding="utf-8")
    canvas_registry = (
        REPO_ROOT
        / "frontend"
        / "src"
        / "modules"
        / "creative_canvas"
        / "domain"
        / "canvasNodeRegistry.ts"
    ).read_text(encoding="utf-8")

    assert "VIDEO_MODEL_IDS" not in backend_config
    assert "DEFAULT_VIDEO_MODEL" not in backend_config
    assert '"video_model": ""' in project_config
    assert frontend_settings.count("grsaiNanoBananaProModel") == 1
    assert (
        "delete persistedWithoutLegacySecrets.grsaiNanoBananaProModel;"
        in frontend_settings
    )
    assert "nano-banana-pro" not in frontend_settings
    assert "setGrsaiNanoBananaProModel" not in frontend_settings
    assert "gvlm-3.1" not in canvas_registry


def test_dotenv_loading_has_one_canonical_entrypoint() -> None:
    canonical = PACKAGE_ROOT / "shared" / "runtime_dotenv.py"
    violations = [
        str(path.relative_to(REPO_ROOT))
        for path in _python_files(PACKAGE_ROOT)
        if path != canonical
        and (
            "from dotenv import" in path.read_text(encoding="utf-8")
            or "import dotenv" in path.read_text(encoding="utf-8")
        )
    ]

    assert violations == []


def test_direct_text_transports_resolve_the_selected_access_model() -> None:
    direct_transports = (
        PACKAGE_ROOT
        / "modules"
        / "model_usage"
        / "infrastructure"
        / "model_runtime.py",
        PACKAGE_ROOT
        / "modules"
        / "ai_assistant"
        / "infrastructure"
        / "hermes"
        / "hermes_workspace.py",
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "director_world"
        / "block_world_builder.py",
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "director_world"
        / "scene_overlap_analyzer.py",
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "director_world"
        / "scene_spatial_contract.py",
        PACKAGE_ROOT
        / "modules"
        / "verification"
        / "infrastructure"
        / "sketch_visual_gate.py",
        PACKAGE_ROOT
        / "modules"
        / "model_usage"
        / "infrastructure"
        / "generation_catalog.py",
    )
    violations = [
        str(path.relative_to(REPO_ROOT))
        for path in direct_transports
        if "resolve_model_for_role" not in path.read_text(encoding="utf-8")
    ]
    assert violations == []

    raw_chat_transports = {
        path.relative_to(PACKAGE_ROOT).as_posix()
        for path in PACKAGE_ROOT.rglob("*.py")
        if "/chat/completions" in path.read_text(encoding="utf-8")
    }
    assert raw_chat_transports == {
        "modules/model_usage/infrastructure/model_text_transport.py"
    }

    model_usage_sources = "\n".join(
        path.read_text(encoding="utf-8") for path in _python_files(PACKAGE_ROOT)
    )
    assert "resolve_internal_model_for_role" not in model_usage_sources
    assert "require_model_role" not in model_usage_sources
    config_source = (
        PACKAGE_ROOT / "modules" / "model_usage" / "infrastructure" / "model_runtime.py"
    ).read_text(encoding="utf-8")
    assert 'request.headers["X-AI-Anime-Model-Role"] = "TEXT"' in config_source


def test_cognee_litellm_transport_owns_operation_idempotency() -> None:
    source = (
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "config.py"
    ).read_text(encoding="utf-8")
    assert "_install_litellm_operation_idempotency()" in source
    assert 'for operation_name in ("acompletion", "aembedding")' in source
    assert 'extra_headers["Idempotency-Key"] = str(uuid.uuid4())' in source


def test_sqlite_sync_migrations_and_protocol_errors_have_one_owner() -> None:
    verification_runner = (
        PACKAGE_ROOT / "migrations" / "verification" / "runner.py"
    ).read_text(encoding="utf-8")
    assert "run_sqlite_migrations" in verification_runner
    assert "def _run_sync_migrations(" not in verification_runner
    legacy_gateway_migration = (
        PACKAGE_ROOT
        / "migrations"
        / "model_usage"
        / "legacy_gateway_secrets.py"
    ).read_text(encoding="utf-8")
    assert "run_sqlite_migrations" in legacy_gateway_migration
    assert "CREATE TABLE IF NOT EXISTS schema_migrations" not in legacy_gateway_migration

    sources = {
        path: path.read_text(encoding="utf-8")
        for path in _python_files(PACKAGE_ROOT)
    }
    owners = [
        path
        for path, source in sources.items()
        if "def model_protocol_error_message(" in source
    ]
    assert owners == [
        PACKAGE_ROOT
        / "modules"
        / "model_usage"
        / "infrastructure"
        / "protocol_errors.py"
    ]
    assert all("def _protocol_error_message(" not in source for source in sources.values())
    assert all(
        "def _newapi_protocol_error_message(" not in source
        for source in sources.values()
    )
    video_generator = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "media_generation"
        / "video_generator.py"
    ).read_text(encoding="utf-8")
    assert "model_protocol_error_message" in video_generator
    assert "def _error_message(payload: object, fallback: str)" not in video_generator


def test_project_database_paths_use_the_shared_project_paths_owner() -> None:
    task_state = (
        PACKAGE_ROOT
        / "modules"
        / "task_execution"
        / "infrastructure"
        / "task_state.py"
    ).read_text(encoding="utf-8")
    director_world = (
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "director_world"
        / "service.py"
    ).read_text(encoding="utf-8")
    sketch_edit_tasks = (
        PACKAGE_ROOT
        / "modules"
        / "verification"
        / "infrastructure"
        / "sketch_edit_tasks.py"
    ).read_text(encoding="utf-8")

    assert "paths.data_db.resolve()" in task_state
    assert 'Path(STATE_DIR) / username / project / "data.db"' not in task_state
    assert "ProjectPaths(user, project).data_db.resolve()" in director_world
    assert 'Path(STATE_DIR).resolve() / user / project / "data.db"' not in director_world
    assert "resolve_project_data_db_path(project_dir)" in sketch_edit_tasks
    assert 'repo_root / "state" / user / project / "data.db"' not in sketch_edit_tasks
