from __future__ import annotations

import ast
import re
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = REPO_ROOT / "src" / "ai_anime"
TASK_RUNNERS_ROOT = (
    PACKAGE_ROOT / "modules" / "task_execution" / "infrastructure" / "runners"
)
ASSET_WORLD_VIEWER_ROUTE = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "viewer.py"
LEGACY_GENERATION_ROUTE = PACKAGE_ROOT / "api" / "routes" / "generation.py"
LEGACY_FREEZONE_ROUTE = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
LEGACY_FREEZONE_HELPERS = PACKAGE_ROOT / "freezone" / "route_helpers.py"
LEGACY_FREEZONE_TEXT_NODE = PACKAGE_ROOT / "freezone" / "text_node.py"
LEGACY_VERIFICATION_ROUTE = PACKAGE_ROOT / "verification" / "routes.py"
COMPOSITION_ROOT_FILES = {"desktop_server.py"}

# These are measured legacy dependencies, not approved architecture. Counts may
# decrease during migration; any new file/module pair or count increase fails.
LEGACY_REVERSE_API_IMPORT_MAX: dict[tuple[str, str], int] = {}

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


def _function_source(path: Path, function_name: str) -> str:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    matches = [
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == function_name
    ]
    assert len(matches) == 1
    node = matches[0]
    return "\n".join(source.splitlines()[node.lineno - 1 : node.end_lineno])


def _relative(path: Path) -> str:
    return path.relative_to(PACKAGE_ROOT).as_posix()


def _removed_freezone_route_source(path: Path) -> str:
    assert path == LEGACY_FREEZONE_ROUTE
    assert not path.exists()
    return ""


def _removed_models_source(path: Path) -> str:
    assert path == PACKAGE_ROOT / "models.py"
    assert not path.exists()
    return ""


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


def test_verification_http_adapter_lives_in_api_layer() -> None:
    routes = tuple(
        PACKAGE_ROOT / "api" / "routes" / "verification" / name
        for name in ("beat_checks.py", "episode_checks.py", "sketch_quality.py")
    )
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"

    assert all(route.exists() for route in routes)
    assert not LEGACY_VERIFICATION_ROUTE.exists()
    assert all(
        "ai_anime.api.routes.identity_access.dependencies" in _imports(route)
        for route in routes
    )
    assert all(
        "ai_anime.modules.verification.public" in _imports(route) for route in routes
    )
    assert all(
        "verification_model_task_scheduler" in route.read_text(encoding="utf-8")
        for route in routes
    )
    assert "verification.create_router()" in api_router.read_text(encoding="utf-8")


def test_backend_root_and_api_routes_remain_grouped_by_context() -> None:
    assert {path.name for path in PACKAGE_ROOT.glob("*.py")} == {
        "__init__.py",
        "cli.py",
        "desktop_server.py",
        "sqlite_store.py",
    }

    api_root = PACKAGE_ROOT / "api"
    assert {path.name for path in api_root.glob("*.py")} == {
        "__init__.py",
        "app.py",
        "deps.py",
        "exception_handlers.py",
        "file_delivery.py",
        "lifespan.py",
        "logging_config.py",
    }

    routes_root = api_root / "routes"
    assert {path.name for path in routes_root.glob("*.py")} == {"__init__.py"}

    expected_contexts = {
        "ai_assistant",
        "asset_world",
        "creative_canvas",
        "identity_access",
        "model_usage",
        "narrative_planning",
        "platform_release",
        "production",
        "project_workspace",
        "story_intake",
        "task_execution",
        "verification",
    }
    assert {
        path.name
        for path in routes_root.iterdir()
        if path.is_dir() and path.name != "__pycache__"
    } == expected_contexts

    registry_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )
    for context in expected_contexts:
        context_entry = routes_root / context / "__init__.py"
        assert "def create_router(" in context_entry.read_text(encoding="utf-8")
        assert f"{context}.create_router(" in registry_source


def test_route_modules_do_not_add_cross_route_dependencies() -> None:
    actual: Counter[tuple[str, str]] = Counter()
    routes_root = PACKAGE_ROOT / "api" / "routes"
    for path in _python_files(routes_root):
        relative = _relative(path)
        source_parts = path.relative_to(routes_root).parts
        if len(source_parts) < 2:
            continue
        source_context = source_parts[0]
        for imported in _imports(path):
            prefix = "ai_anime.api.routes."
            if not imported.startswith(prefix):
                continue
            target_context = imported.removeprefix(prefix).split(".", 1)[0]
            if target_context in {source_context, "identity_access"}:
                continue
            actual[(relative, imported)] += 1

    _assert_ratchet(actual, LEGACY_ROUTE_IMPORT_MAX)


def test_route_request_schemas_are_owned_by_their_adapters() -> None:
    root_schemas = PACKAGE_ROOT / "api" / "schemas.py"
    assert not root_schemas.exists()
    root_source = ""
    cases = (
        (
            "routes/asset_world/viewer_schemas.py",
            "routes/asset_world/viewer.py",
            ("BeatBackgroundAnchorUpdate",),
        ),
        (
            "routes/narrative_planning/content_schemas.py",
            "routes/narrative_planning/content.py",
            ("ContentUpdateRequest", "RewriteGenerateRequest"),
        ),
        (
            "routes/production/sketch_schemas.py",
            "routes/production/sketch.py",
            ("SketchGenerateRequest",),
        ),
        (
            "routes/production/settings_schemas.py",
            "routes/production/settings.py",
            (
                "OperatorPasswordVerifyRequest",
                "RenderSettingsUpdate",
                "SketchRegenQueueItem",
                "SketchRegenQueueUpdate",
                "SketchSettingsUpdate",
            ),
        ),
        (
            "routes/production/audio_schemas.py",
            "routes/production/audio.py",
            ("EpisodeAudioGenerateRequest", "EpisodeAudioRegenerateRequest"),
        ),
        (
            "routes/asset_world/styles_schemas.py",
            "routes/asset_world/styles.py",
            ("StylePreviewRequest",),
        ),
        (
            "routes/asset_world/props_schemas.py",
            "routes/asset_world/props.py",
            ("PropCreate", "PropReferenceGenerateRequest", "PropUpdate"),
        ),
        (
            "routes/creative_canvas/assets_schemas.py",
            "routes/creative_canvas/assets.py",
            ("CreateIdentityAssetRequest",),
        ),
        (
            "routes/creative_canvas/media_schemas.py",
            "routes/creative_canvas/media.py",
            ("FreezoneThreeDViewerScreenshotRequest",),
        ),
        (
            "routes/creative_canvas/presets_schemas.py",
            "routes/creative_canvas/presets.py",
            ("PresetCanvasRequest",),
        ),
        (
            "routes/creative_canvas/commits_schemas.py",
            "routes/creative_canvas/commits.py",
            ("ImpactRequest", "PushRequest"),
        ),
        (
            "routes/creative_canvas/projections_schemas.py",
            "routes/creative_canvas/projections.py",
            (
                "ProjectionPresetCanvasRequest",
                "ProjectionRemoveRequest",
                "ProjectionStatusRequest",
            ),
        ),
        (
            "routes/narrative_planning/episodes_schemas.py",
            "routes/narrative_planning/episodes.py",
            ("EpisodePlanRequest", "EpisodeUpdate", "InsertManualShotRequest"),
        ),
        (
            "routes/production/pool_schemas.py",
            "routes/production/pool.py",
            (
                "GridCutRequest",
                "GridSketchPreviewRequest",
                "PoolSelectRequest",
                "VideoPoolSelectRequest",
            ),
        ),
        (
            "routes/production/render_schemas.py",
            "routes/production/render.py",
            (
                "BeatsRegenerateRequest",
                "GridRegenerateRequest",
                "PlanEntryOut",
                "RenderPlanExecuteRequest",
                "RenderPlanRequest",
                "SketchRegenerateRequest",
            ),
        ),
        (
            "routes/production/video_schemas.py",
            "routes/production/video.py",
            (
                "GlobalOptimizeRequest",
                "VideoReferenceAssetAudioTrimRequest",
                "VideoReferenceAssetCropRequest",
                "VideoReferenceAssetDeleteRequest",
                "SingleVideoRequest",
                "VideoComposeRequest",
            ),
        ),
        (
            "routes/narrative_planning/scripts_schemas.py",
            "routes/narrative_planning/scripts.py",
            (
                "BeatUpdate",
                "BeatVideoPromptGenerateRequest",
                "ScriptGenerateRequest",
                "ScriptSaveRequest",
                "VideoPromptGenerateRequest",
            ),
        ),
        (
            "routes/asset_world/scenes_schemas.py",
            "routes/asset_world/scenes.py",
            (
                "PanoSphereCorrection",
                "PanoViewerCorrection",
                "SceneCreate",
                "ScenePanoGenerateRequest",
                "SceneReferenceGenerateRequest",
                "SceneUpdate",
            ),
        ),
        (
            "routes/creative_canvas/documents_schemas.py",
            "routes/creative_canvas/documents.py",
            ("CanvasPayload",),
        ),
        (
            "routes/asset_world/voice_schemas.py",
            "routes/asset_world/characters.py",
            ("CharacterVoiceRecordRequest", "CharacterVoiceTrimRequest"),
        ),
        (
            "routes/project_workspace/schemas.py",
            "routes/project_workspace/projects.py",
            (
                "NarratorVoiceBindRequest",
                "NarratorVoiceRecordRequest",
                "NarratorVoiceTrimRequest",
            ),
        ),
        (
            "routes/asset_world/characters_schemas.py",
            "routes/asset_world/characters.py",
            (
                "AssetImageSourceSelectionRequest",
                "CharacterAssetRestoreRequest",
                "CharacterCreate",
                "CharacterImageSelectionRequest",
                "CharacterUpdate",
                "IdentityCreate",
                "IdentityImageGenRequest",
                "IdentityUpdate",
                "PortraitGenRequest",
            ),
        ),
        (
            "routes/project_workspace/schemas.py",
            "routes/project_workspace/projects.py",
            ("ProjectCreate", "ProjectUpdate"),
        ),
        (
            "routes/creative_canvas/text_schemas.py",
            "routes/creative_canvas/text.py",
            ("FreezoneStoryScriptGenerateRequest", "FreezoneTextTranslateRequest"),
        ),
        (
            "routes/creative_canvas/audio_schemas.py",
            "routes/creative_canvas/audio.py",
            (
                "FreezoneAudioMusicRequest",
                "FreezoneAudioSpeechRequest",
                "FreezoneAudioVoiceRef",
            ),
        ),
        (
            "routes/creative_canvas/skills_schemas.py",
            "routes/creative_canvas/skills.py",
            (
                "FreezoneFrameFromContextRequest",
                "FreezoneScene360Request",
                "FreezoneSketchFromContextRequest",
            ),
        ),
        (
            "routes/creative_canvas/image_schemas.py",
            "routes/creative_canvas/image.py",
            (
                "FreezoneCharacterMultiViewRequest",
                "FreezoneEditRequest",
                "FreezoneGenRequest",
                "FreezoneImageCameraConfig",
                "FreezoneImageReversePromptData",
                "FreezoneImageReversePromptRequest",
                "FreezoneImageReversePromptResponse",
                "FreezoneImageStyleConfig",
                "FreezoneImageTo3GSRequest",
                "FreezoneMarkDetectData",
                "FreezoneMarkDetectRequest",
                "FreezoneMarkDetectResponse",
                "FreezoneOutpaintRequest",
                "FreezoneRedrawRequest",
                "FreezoneRelightRequest",
                "FreezoneStageAssetAcceptedData",
                "FreezoneStageAssetAcceptedResponse",
                "FreezoneTemplateEditRequest",
                "FreezoneUpscaleRequest",
            ),
        ),
        (
            "routes/creative_canvas/video_schemas.py",
            "routes/creative_canvas/video.py",
            (
                "FreezoneAnalyzeShotsRequest",
                "FreezoneAnalyzeVideoStoryRequest",
                "FreezoneAudioSeparateRequest",
                "FreezoneExtractFramesRequest",
                "FreezoneImageToVideoRequest",
                "FreezoneKeyframeVideoRequest",
                "FreezoneVideoCharacterLibraryItemRequest",
                "FreezoneVideoComposeItem",
                "FreezoneVideoComposeRequest",
                "FreezoneVideoComposeTrack",
                "FreezoneVideoEditRequest",
                "FreezoneVideoEraseRequest",
                "FreezoneVideoGenRequest",
                "FreezoneVideoOmniGenRequest",
                "FreezoneVideoReferenceItem",
                "FreezoneVideoUpscaleRequest",
            ),
        ),
    )

    for schema_path, route_path, model_names in cases:
        adapter_schemas = PACKAGE_ROOT / "api" / schema_path
        route = PACKAGE_ROOT / "api" / route_path
        adapter_source = adapter_schemas.read_text(encoding="utf-8")
        for model_name in model_names:
            assert f"class {model_name}(" not in root_source
            assert f"class {model_name}(" in adapter_source
        module_name = schema_path.removesuffix(".py").replace("/", ".")
        assert f"ai_anime.api.{module_name}" in _imports(route)
        assert "ai_anime.api.schemas" not in _imports(route)

    characters_source = (
        PACKAGE_ROOT / "api" / "routes/asset_world/characters_schemas.py"
    ).read_text(encoding="utf-8")
    projects_source = (
        PACKAGE_ROOT / "api" / "routes/project_workspace/schemas.py"
    ).read_text(encoding="utf-8")
    assert "CharacterAssetKind = Literal[" not in root_source
    assert "CharacterAssetKind = Literal[" in characters_source
    assert "ProjectStatusFilter = Literal[" not in root_source
    assert "ProjectStatusFilter = Literal[" in projects_source

    assert "FREEZONE_DEFAULT_IMAGE_SELECTION =" not in root_source
    assert "FREEZONE_DEFAULT_IMAGE_MODEL =" not in root_source
    assert not (PACKAGE_ROOT / "api" / "canvas_schema_defaults.py").exists()

    canvas_mark_source = (
        PACKAGE_ROOT / "api" / "routes/creative_canvas/mark_schemas.py"
    ).read_text(encoding="utf-8")
    assert "class FreezoneVideoMark(" not in root_source
    assert "class FreezoneVideoMark(BaseModel):" in canvas_mark_source
    for schema_path in (
        "routes/creative_canvas/image_schemas.py",
        "routes/creative_canvas/video_schemas.py",
    ):
        schema = PACKAGE_ROOT / "api" / schema_path
        assert "ai_anime.api.routes.creative_canvas.mark_schemas" in _imports(schema)

    canvas_job_source = (
        PACKAGE_ROOT / "api" / "routes/creative_canvas/job_schemas.py"
    ).read_text(encoding="utf-8")
    for model_name in ("FreezoneJobAcceptedData", "FreezoneJobAcceptedResponse"):
        assert f"class {model_name}(" not in root_source
        assert f"class {model_name}(BaseModel):" in canvas_job_source
    for route_path in (
        "routes/creative_canvas/audio.py",
        "routes/creative_canvas/image.py",
        "routes/creative_canvas/skills.py",
        "routes/creative_canvas/text.py",
        "routes/creative_canvas/video.py",
    ):
        route = PACKAGE_ROOT / "api" / route_path
        assert "ai_anime.api.routes.creative_canvas.job_schemas" in _imports(route)


def test_legacy_generation_route_is_removed() -> None:
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert not LEGACY_GENERATION_ROUTE.exists()
    assert "generation.router" not in api_router_source
    assert "asset_world.create_router()" in api_router_source


def test_legacy_freezone_route_helpers_are_removed() -> None:
    assert not LEGACY_FREEZONE_HELPERS.exists()


def test_new_backend_modules_follow_layer_dependencies() -> None:
    modules_root = PACKAGE_ROOT / "modules"
    if not modules_root.exists():
        return

    failures: list[str] = []
    for path in _python_files(modules_root):
        relative = path.relative_to(modules_root).as_posix()
        parts = relative.split("/")
        if len(parts) >= 3 and parts[1] in {
            "domain",
            "application",
            "infrastructure",
            "presentation",
        }:
            context, layer = parts[0], parts[1]
        elif len(parts) == 2 and parts[1] == "composition.py":
            context, layer = parts[0], "composition"
        else:
            continue

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

    assert "ai_anime.modules.bootstrap.public" in lifespan_source
    assert "ai_anime.shared.ports.registry" not in lifespan_source


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
        if path.is_relative_to(narrative_module) or path == (
            PACKAGE_ROOT / "sqlite_store.py"
        ):
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
        if path.is_relative_to(asset_world_module) or path == (
            PACKAGE_ROOT / "sqlite_store.py"
        ):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.asset_world."):
                continue
            if imported == "ai_anime.modules.asset_world.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not (PACKAGE_ROOT / "services" / "style_service.py").exists()
    assert not (PACKAGE_ROOT / "seedance2_i2v" / "character_voice_storage.py").exists()
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


def test_creative_canvas_callers_use_the_public_api() -> None:
    creative_canvas_module = PACKAGE_ROOT / "modules" / "creative_canvas"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(creative_canvas_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.creative_canvas."):
                continue
            if imported == "ai_anime.modules.creative_canvas.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not failures, "\n".join(failures)


def test_ai_assistant_callers_use_the_public_api() -> None:
    ai_assistant_module = PACKAGE_ROOT / "modules" / "ai_assistant"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(ai_assistant_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.ai_assistant."):
                continue
            if imported == "ai_anime.modules.ai_assistant.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not failures, "\n".join(failures)


def test_backup_callers_use_the_public_api() -> None:
    backup_module = PACKAGE_ROOT / "modules" / "backup"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(backup_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.backup."):
                continue
            if imported == "ai_anime.modules.backup.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not failures, "\n".join(failures)


def test_backup_implementation_is_layered() -> None:
    backup_module = PACKAGE_ROOT / "modules" / "backup"
    root_implementations = sorted(
        path.name
        for path in backup_module.glob("*.py")
        if path.name not in {"__init__.py", "public.py"}
    )

    assert root_implementations == []
    assert (backup_module / "application" / "restore_plan.py").is_file()
    assert (backup_module / "infrastructure" / "files_sync.py").is_file()
    assert (backup_module / "infrastructure" / "sqlite_snapshots.py").is_file()
    assert (backup_module / "infrastructure" / "wal_migrator.py").is_file()
    assert (backup_module / "presentation" / "cli.py").is_file()


def test_bootstrap_callers_use_the_public_api() -> None:
    bootstrap_module = PACKAGE_ROOT / "modules" / "bootstrap"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(bootstrap_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.bootstrap."):
                continue
            if imported == "ai_anime.modules.bootstrap.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not failures, "\n".join(failures)


def test_chat_websocket_transport_stays_in_api_layer() -> None:
    transport = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "websocket.py"
    session_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "session.py"
    turn_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "turns.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    transport_source = transport.read_text(encoding="utf-8")
    session_source = session_adapter.read_text(encoding="utf-8")
    turn_source = turn_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert "fastapi" in _imports(transport)
    assert "ai_anime.modules.ai_assistant.public" in _imports(transport)
    assert "ai_anime.api.routes.ai_assistant.websocket" in _imports(session_adapter)
    assert "ai_anime.api.routes.ai_assistant.websocket" in _imports(turn_adapter)
    assert "ai_anime.api.routes.ai_assistant.websocket" not in _imports(route)
    for owned_operation in (
        "async def send_json_best_effort(",
        "async def _chat_heartbeat(",
        "async def stream_chat_turn(",
        "send_lock = asyncio.Lock()",
        "heartbeat_task = asyncio.create_task(",
        "delivery_open = await send_json_best_effort(",
    ):
        assert owned_operation in transport_source
    for removed_route_implementation in (
        "import asyncio",
        "import contextlib",
        "async def _send_json_best_effort(",
        "async def _chat_heartbeat(",
        "send_lock = asyncio.Lock()",
        "heartbeat_task = asyncio.create_task(",
        "await websocket.send_json(event)",
    ):
        assert removed_route_implementation not in route_source
        assert removed_route_implementation not in session_source
        assert removed_route_implementation not in turn_source
    assert turn_source.count("stream_chat_turn(") == 2
    assert "stream_chat_turn(" not in route_source
    assert "send_json_best_effort(" in session_source
    assert "send_json_best_effort(" in turn_source
    assert "send_json_best_effort(" not in route_source


def test_chat_websocket_auth_stays_in_api_auth_adapter() -> None:
    auth = PACKAGE_ROOT / "api" / "routes" / "identity_access" / "dependencies.py"
    session_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "session.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    contract_tests = REPO_ROOT / "tests" / "contract" / "test_m08_chat_agent.py"
    auth_source = auth.read_text(encoding="utf-8")
    session_source = session_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")
    contract_test_source = contract_tests.read_text(encoding="utf-8")

    assert "ai_anime.modules.identity_access.public" in _imports(auth)
    assert "ai_anime.api.routes.identity_access.dependencies" in _imports(
        session_adapter
    )
    assert "ai_anime.api.routes.identity_access.dependencies" not in _imports(route)
    assert "async def get_websocket_user(" in auth_source
    for owned_operation in (
        'websocket.headers.get("Authorization", "").strip()',
        'bearer.lower().startswith("bearer ")',
        "await _verify_agent_bearer(token)",
        "websocket.cookies.get(AUTH_COOKIE_NAME)",
        "await _verify_browser_session(",
    ):
        assert owned_operation in auth_source
        assert owned_operation not in session_source
        assert owned_operation not in route_source
    for private_dependency in (
        "AUTH_COOKIE_NAME",
        "_verify_agent_bearer",
        "_verify_browser_session",
        "def _authenticate_ws(",
    ):
        assert private_dependency not in route_source
        assert private_dependency not in session_source
    assert session_source.count("get_websocket_user(") == 1
    assert "get_websocket_user(" not in route_source
    assert 'monkeypatch.setattr(chat_session, "_verify_browser_session"' not in (
        contract_test_source
    )
    assert 'monkeypatch.setattr(api_auth, "_verify_browser_session"' in (
        contract_test_source
    )


def test_chat_websocket_session_stays_in_api_adapter() -> None:
    session_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "session.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    session_tests = REPO_ROOT / "tests" / "test_chat_session.py"
    session_source = session_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert session_tests.exists()
    assert "fastapi" in _imports(session_adapter)
    assert "ai_anime.api.routes.identity_access.dependencies" in _imports(
        session_adapter
    )
    assert "ai_anime.api.routes.ai_assistant.scope" in _imports(session_adapter)
    assert "ai_anime.api.routes.ai_assistant.schemas" in _imports(session_adapter)
    assert "ai_anime.api.routes.ai_assistant.turns" in _imports(session_adapter)
    assert "ai_anime.api.routes.ai_assistant.websocket" in _imports(session_adapter)
    assert "ai_anime.modules.ai_assistant.public" in _imports(session_adapter)
    assert "ai_anime.api.routes.ai_assistant.session" in _imports(route)
    for owned_operation in (
        "async def run_chat_session(",
        "await websocket.accept()",
        "await get_websocket_user(websocket)",
        'current_scope = ChatScope(kind="home")',
        "while True:",
        "await websocket.receive_json()",
        'if event_type == "scope.set":',
        "chat_worker_lifecycle.sync_scope(",
        "hermes_runtime_prewarmer.prewarm(",
        'if event_type != "chat.message":',
        "chat_turns.dispatch_chat_turn(",
        "except WebSocketDisconnect:",
    ):
        assert owned_operation in session_source
        assert owned_operation not in route_source
    assert route_source.count("chat_session.run_chat_session(") == 1


def test_chat_http_endpoints_stay_in_dedicated_route() -> None:
    http_route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "http.py"
    websocket_route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    router_registry = PACKAGE_ROOT / "api" / "v1" / "router.py"
    route_tests = REPO_ROOT / "tests" / "test_chat_http_routes.py"
    legacy_tests = REPO_ROOT / "tests" / "test_chat_service_user_agent_scope.py"
    http_source = http_route.read_text(encoding="utf-8")
    websocket_source = websocket_route.read_text(encoding="utf-8")
    registry_source = router_registry.read_text(encoding="utf-8")
    context_source = (
        PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "__init__.py"
    ).read_text(encoding="utf-8")

    assert route_tests.exists()
    assert not legacy_tests.exists()
    assert "fastapi" in _imports(http_route)
    assert "ai_anime.api.routes.identity_access.dependencies" in _imports(http_route)
    assert "ai_anime.api.routes.ai_assistant.access" in _imports(http_route)
    assert "ai_anime.api.routes.ai_assistant.schemas" in _imports(http_route)
    assert "ai_anime.modules.ai_assistant.public" in _imports(http_route)
    for owned_endpoint in (
        '@router.post("/chat/cancel")',
        "async def cancel_chat_turn(",
        '@router.post("/chat/notifications")',
        "async def append_chat_notification(",
        '@router.post("/chat/ui-events")',
        "async def append_chat_ui_event(",
    ):
        assert owned_endpoint in http_source
        assert owned_endpoint not in websocket_source
    assert '@router.websocket("/chat/ws")' in websocket_source
    assert '@router.websocket("/chat/ws")' not in http_source
    assert "ai_assistant.create_router()" in registry_source
    assert 'router.include_router(http.router, tags=["chat"])' in context_source
    assert 'router.include_router(chat.router, tags=["chat"])' in context_source


def test_chat_access_checks_stay_in_api_acl_adapter() -> None:
    access = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "access.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    http_route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "http.py"
    scope_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "scope.py"
    turn_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "turns.py"
    access_tests = REPO_ROOT / "tests" / "test_chat_access.py"
    notification_tests = REPO_ROOT / "tests" / "test_chat_http_routes.py"
    access_source = access.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")
    http_source = http_route.read_text(encoding="utf-8")
    scope_source = scope_adapter.read_text(encoding="utf-8")
    turn_source = turn_adapter.read_text(encoding="utf-8")
    access_test_source = access_tests.read_text(encoding="utf-8")
    notification_test_source = notification_tests.read_text(encoding="utf-8")

    assert "fastapi" not in _imports(access)
    assert "ai_anime.modules.ai_assistant.public" in _imports(access)
    assert "ai_anime.modules.project_workspace.public" in _imports(access)
    assert "ai_anime.api.routes.ai_assistant.access" not in _imports(route)
    assert "ai_anime.api.routes.ai_assistant.access" in _imports(http_route)
    assert "ai_anime.api.routes.ai_assistant.access" in _imports(scope_adapter)
    assert "ai_anime.api.routes.ai_assistant.access" in _imports(turn_adapter)
    for owned_rule in (
        "async def project_context_for_scope(",
        "async def require_ai_assistant_access(",
        'required_role="viewer"',
    ):
        assert owned_rule in access_source
        assert owned_rule not in route_source
        assert owned_rule not in http_source
    for removed_route_dependency in (
        "get_usage_meter",
        "resolve_project_context",
        "def _project_context_for_scope(",
        "def _requester_user_id_for_chat(",
        "def _require_ai_assistant_access(",
    ):
        assert removed_route_dependency not in route_source
        assert removed_route_dependency not in http_source
    assert "model_usage" not in access_source
    assert "credit" not in access_source.lower()
    assert "chat_access.project_context_for_scope(" not in route_source
    assert http_source.count("chat_access.project_context_for_scope(") == 4
    assert scope_source.count("chat_access.project_context_for_scope(") == 1
    assert "chat_access.project_context_for_scope(" not in turn_source
    assert "chat_access.require_ai_assistant_access(" not in route_source
    assert turn_source.count("chat_access.require_ai_assistant_access(") == 1
    assert "_require_ai_assistant_access" not in access_test_source
    assert "_project_context_for_scope" not in notification_test_source


def test_chat_scope_projection_stays_in_api_adapter() -> None:
    scope_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "scope.py"
    session_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "session.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    scope_tests = REPO_ROOT / "tests" / "test_chat_scope.py"
    legacy_route_tests = REPO_ROOT / "tests" / "test_chat_route_prewarm.py"
    scope_source = scope_adapter.read_text(encoding="utf-8")
    session_source = session_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert scope_tests.exists()
    assert not legacy_route_tests.exists()
    assert "fastapi" in _imports(scope_adapter)
    assert "ai_anime.api.routes.ai_assistant.access" in _imports(scope_adapter)
    assert "ai_anime.api.routes.ai_assistant.websocket" in _imports(scope_adapter)
    assert "ai_anime.modules.ai_assistant.public" in _imports(scope_adapter)
    assert "ai_anime.modules.project_workspace.public" in _imports(scope_adapter)
    assert "ai_anime.api.routes.ai_assistant.scope" in _imports(session_adapter)
    assert "ai_anime.api.routes.ai_assistant.scope" not in _imports(route)
    for owned_operation in (
        "async def _history(",
        "async def send_scope_changed(",
        "except ProjectNotFound:",
        "scoped_chat_messages.list(",
        '"type": "scope.changed"',
        "项目不存在或已删除，已切回首页聊天。",
    ):
        assert owned_operation in scope_source
        assert owned_operation not in session_source
        assert owned_operation not in route_source
    for removed_route_dependency in (
        "ProjectContext",
        "ProjectNotFound",
        "def _history(",
        "def _send_scope_changed(",
        "scoped_chat_messages.list(",
    ):
        assert removed_route_dependency not in route_source
        assert removed_route_dependency not in session_source
    assert session_source.count("chat_scope.send_scope_changed(") == 2
    assert "chat_scope.send_scope_changed(" not in route_source


def test_chat_inbound_schemas_stay_in_api_adapter() -> None:
    schemas = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "schemas.py"
    session_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "session.py"
    turn_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "turns.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    http_route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "http.py"
    schemas_source = schemas.read_text(encoding="utf-8")
    session_source = session_adapter.read_text(encoding="utf-8")
    turn_source = turn_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")
    http_source = http_route.read_text(encoding="utf-8")

    assert "pydantic" in _imports(schemas)
    assert "ai_anime.modules.ai_assistant.public" in _imports(schemas)
    assert "ai_anime.api.routes.ai_assistant.schemas" in _imports(session_adapter)
    assert "ai_anime.api.routes.ai_assistant.schemas" in _imports(turn_adapter)
    assert "ai_anime.api.routes.ai_assistant.schemas" not in _imports(route)
    assert "ai_anime.api.routes.ai_assistant.schemas" in _imports(http_route)
    for schema in (
        "ChatScopePayload",
        "ChatAttachmentIn",
        "ChatMessageIn",
        "ScopeSetIn",
        "ChatUiEventIn",
        "ChatNotificationIn",
    ):
        assert f"class {schema}(BaseModel):" in schemas_source
        assert f"class {schema}(BaseModel):" not in session_source
        assert f"class {schema}(BaseModel):" not in route_source
        assert f"class {schema}(BaseModel):" not in http_source
    assert "def to_chat_scope(" in schemas_source
    assert "def attachment_payloads(" in schemas_source
    assert "model_dump(exclude_none=True)" in schemas_source
    assert "BaseModel" not in route_source
    assert "model_dump(" not in route_source
    assert "BaseModel" not in session_source
    assert "model_dump(" not in session_source
    assert "BaseModel" not in http_source
    assert "model_dump(" not in http_source
    assert "def _scope_from_model(" not in route_source
    assert "def _attachment_payloads(" not in route_source
    assert "to_chat_scope(" not in route_source
    # The session adapter funnels scope-bearing inbound events
    # (conversation.delete / scope.set / session.model.*) through one guarded
    # mapper so a bad client scope answers with an error instead of disconnecting.
    assert session_source.count("to_chat_scope(") == 1
    assert "async def _resolve_scope(" in session_source
    assert session_source.count("await _resolve_scope(") == 3
    # Inbound frame validation stays in the schema module, so the transport
    # adapter never imports pydantic model machinery.
    assert "def parse_inbound_frame(" in schemas_source
    assert session_source.count("parse_inbound_frame(") == 4
    assert http_source.count("to_chat_scope(") == 4
    assert turn_source.count("to_chat_scope(") == 1
    assert "attachment_payloads(" not in route_source
    assert turn_source.count("attachment_payloads(") == 2


def test_chat_error_events_stay_in_api_adapter() -> None:
    errors = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "errors.py"
    turn_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "turns.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    errors_source = errors.read_text(encoding="utf-8")
    turn_source = turn_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert "fastapi" not in _imports(errors)
    assert "ai_anime.modules.ai_assistant.public" in _imports(errors)
    assert "ai_anime.modules.model_usage.public" in _imports(errors)
    assert "ai_anime.api.routes.ai_assistant.errors" in _imports(turn_adapter)
    assert "ai_anime.api.routes.ai_assistant.errors" not in _imports(route)
    for owned_rule in (
        "def chat_exception_event(",
        "当前用户已有 AI 对话正在处理中",
        "find_model_quota_error(error)",
        "model_quota_payload(quota_error)",
    ):
        assert owned_rule in errors_source
        assert owned_rule not in route_source
    for removed_route_dependency in (
        "MODEL_QUOTA_EXCEEDED_MESSAGE",
        "find_model_quota_error",
        "model_quota_payload",
    ):
        assert removed_route_dependency not in route_source
    assert turn_source.count("chat_exception_event(") == 1
    assert "chat_exception_event(" not in route_source


def test_chat_turn_dispatch_stays_in_api_adapter() -> None:
    turn_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "turns.py"
    session_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "session.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    turn_tests = REPO_ROOT / "tests" / "test_chat_turns.py"
    turn_source = turn_adapter.read_text(encoding="utf-8")
    session_source = session_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert turn_tests.exists()
    assert "fastapi" in _imports(turn_adapter)
    assert "ai_anime.api.routes.ai_assistant.access" in _imports(turn_adapter)
    assert "ai_anime.api.routes.ai_assistant.errors" in _imports(turn_adapter)
    assert "ai_anime.api.routes.ai_assistant.schemas" in _imports(turn_adapter)
    assert "ai_anime.api.routes.ai_assistant.websocket" in _imports(turn_adapter)
    assert "ai_anime.modules.ai_assistant.public" in _imports(turn_adapter)
    assert "ai_anime.api.routes.ai_assistant.turns" in _imports(session_adapter)
    assert "ai_anime.api.routes.ai_assistant.turns" not in _imports(route)
    for owned_operation in (
        "async def dispatch_chat_turn(",
        "async def _stream_project_turn(",
        "async def _stream_home_turn(",
        "uuid.uuid4().hex",
        '"message": "empty message"',
        '"message": f"unsupported chat scope: {scope.kind}"',
        "chat_access.require_ai_assistant_access(",
        "project_chat_turns.stream(",
        "hermes_home_replies.stream(",
        "chat_exception_event(",
    ):
        assert owned_operation in turn_source
        assert owned_operation not in route_source
    assert session_source.count("chat_turns.dispatch_chat_turn(") == 1
    assert "chat_turns.dispatch_chat_turn(" not in route_source


def test_ai_assistant_owns_chat_text_projection_rules() -> None:
    domain = PACKAGE_ROOT / "modules" / "ai_assistant" / "domain" / "chat_text.py"
    public = PACKAGE_ROOT / "modules" / "ai_assistant" / "public.py"
    turn_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "turns.py"
    hermes_replies = (
        PACKAGE_ROOT
        / "modules"
        / "ai_assistant"
        / "application"
        / "hermes_project_replies.py"
    )
    project_turns = (
        PACKAGE_ROOT
        / "modules"
        / "ai_assistant"
        / "application"
        / "project_chat_turns.py"
    )
    history = (
        PACKAGE_ROOT
        / "modules"
        / "ai_assistant"
        / "infrastructure"
        / "sqlite_chat_history.py"
    )
    domain_imports = _imports(domain)
    turn_source = turn_adapter.read_text(encoding="utf-8")
    hermes_replies_source = hermes_replies.read_text(encoding="utf-8")
    project_turns_source = project_turns.read_text(encoding="utf-8")
    history_source = history.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in domain_imports
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported == "sqlite3"
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
    }
    assert "ai_anime.modules.ai_assistant.public" in _imports(turn_adapter)
    for legacy_definition in (
        "def _completion_text_or_existing(",
        "def _merge_stream_text(",
        "def _strip_replayed_assistant_prefix(",
        "def _strip_replayed_chat_response(",
        "def _message_content(",
        "def _tool_display_payload(",
    ):
        assert legacy_definition not in turn_source
        assert legacy_definition not in history_source
    assert "chat_service._strip_replayed_chat_response" not in turn_source
    assert "chat_service._merge_stream_text" not in turn_source
    assert "strip_stored_assistant_replay" in history_source
    assert "strip_streamed_assistant_replay" in hermes_replies_source
    for internal_rule in (
        "completion_text_or_existing",
        "is_hidden_chat_tool_event",
        "merge_stream_text",
        "message_content",
        "should_emit_final_text",
        "split_trace_contents",
        "strip_replayed_chat_response",
        "strip_stored_assistant_replay",
        "strip_streamed_assistant_replay",
        "text_with_attachment_context",
        "tool_display_payload",
    ):
        assert internal_rule not in public_source
    for projected_rule in (
        "message_content(",
        "should_emit_final_text(",
        "text_with_attachment_context(",
        "tool_display_payload(",
    ):
        assert projected_rule not in turn_source
        assert projected_rule in project_turns_source


def test_ai_assistant_owns_chat_presentation_rules() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    domain = module / "domain" / "chat_presentation.py"
    application = module / "application" / "chat_presentation.py"
    deterministic_replies = module / "application" / "deterministic_replies.py"
    hermes_replies = module / "application" / "hermes_project_replies.py"
    ports = module / "application" / "ports.py"
    adapter = module / "infrastructure" / "json_render_errors.py"
    composition = module / "composition.py"
    public = module / "public.py"
    route_tests = REPO_ROOT / "tests" / "test_chat_http_routes.py"
    domain_source = domain.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    deterministic_replies_source = deterministic_replies.read_text(encoding="utf-8")
    hermes_replies_source = hermes_replies.read_text(encoding="utf-8")
    ports_source = ports.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_test_source = route_tests.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(domain)
        if imported == "os"
        or imported == "sqlite3"
        or imported == "fastapi"
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
    }
    assert "JsonRenderErrors" in ports_source
    assert "JsonRenderErrors" in application_source
    assert "FileJsonRenderErrors" in adapter_source
    assert "JR_ERROR_LOG" in adapter_source
    assert "_chat_presentation = ChatPresentation(FileJsonRenderErrors())" in (
        composition_source
    )
    for operation in (
        "append_tool_ui_specs",
        "extract_tool_ui_specs",
        "normalize_json_render_reply",
        "redact_local_filesystem_paths",
        "dedupe_tool_ui_specs",
        "filter_tool_ui_specs_for_prompt",
    ):
        assert f"def {operation}(" in domain_source
        assert operation in public_source
    assert "redact_local_filesystem_paths" in deterministic_replies_source
    for owned_operation in (
        "self._presentation.append_tool_ui_specs(",
        "self._presentation.extract_tool_ui_specs(",
        "self._presentation.normalize_reply(",
        "redact_local_filesystem_paths(",
        "dedupe_tool_ui_specs(",
        "filter_tool_ui_specs_for_prompt(",
    ):
        assert owned_operation in hermes_replies_source
    assert "chat_service._normalize_json_render_reply" not in route_test_source
    assert "chat_service._append_tool_ui_specs" not in route_test_source


def test_ai_assistant_owns_tool_chat_error_mapping() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    domain = module / "domain" / "tool_errors.py"
    hermes_replies = module / "application" / "hermes_project_replies.py"
    public = module / "public.py"
    route_tests = REPO_ROOT / "tests" / "test_chat_http_routes.py"
    domain_source = domain.read_text(encoding="utf-8")
    hermes_replies_source = hermes_replies.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_test_source = route_tests.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(domain)
        if imported == "os"
        or imported == "sqlite3"
        or imported == "fastapi"
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
    }
    assert "def tool_chat_error(" in domain_source
    assert "redact_secrets" in domain_source
    assert "tool_chat_error" in public_source
    assert "tool_chat_error(" in hermes_replies_source
    assert "tool_name=event_tool_name" in hermes_replies_source
    assert '"json_loads_with_trailing_repair"' not in public_source
    assert "chat_service._extract_tool_chat_error" not in route_test_source


def test_ai_assistant_owns_display_tool_call_rules() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    domain = module / "domain" / "display_tools.py"
    fallback_application = module / "application" / "display_fallback.py"
    hermes_replies = module / "application" / "hermes_project_replies.py"
    public = module / "public.py"
    route_tests = REPO_ROOT / "tests" / "test_chat_http_routes.py"
    domain_source = domain.read_text(encoding="utf-8")
    fallback_application_source = fallback_application.read_text(encoding="utf-8")
    hermes_replies_source = hermes_replies.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_test_source = route_tests.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(domain)
        if imported == "os"
        or imported == "sqlite3"
        or imported == "fastapi"
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
    }
    for operation in (
        "display_tool_call_key",
        "extract_display_tool_call",
        "infer_display_tool_call_from_text",
    ):
        assert f"def {operation}(" in domain_source
        assert operation in public_source
        assert operation in hermes_replies_source
    assert "def is_display_tool_name(" in domain_source
    assert "is_display_tool_name" in public_source
    assert "is_display_tool_name" in fallback_application_source
    assert "chat_service._extract_display_tool_call" not in route_test_source
    assert "chat_service._infer_display_tool_call_from_text" not in route_test_source


def test_ai_assistant_owns_display_tool_fallbacks() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    domain = module / "domain" / "display_fallback.py"
    application = module / "application" / "display_fallback.py"
    hermes_replies = module / "application" / "hermes_project_replies.py"
    ports = module / "application" / "ports.py"
    adapter = module / "infrastructure" / "display_fallback_gateway.py"
    composition = module / "composition.py"
    public = module / "public.py"
    route_tests = REPO_ROOT / "tests" / "test_chat_http_routes.py"
    domain_source = domain.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    hermes_replies_source = hermes_replies.read_text(encoding="utf-8")
    ports_source = ports.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_test_source = route_tests.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(domain)
        if imported == "os"
        or imported == "sqlite3"
        or imported == "fastapi"
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
    }
    assert "class DisplayFallbackGateway(Protocol)" in ports_source
    assert "class DisplayFallbacks" in application_source
    assert "class HttpDisplayFallbackGateway" in adapter_source
    assert "Request" in adapter_source
    assert "urlopen" in adapter_source
    assert "_display_fallbacks = DisplayFallbacks(HttpDisplayFallbackGateway())" in (
        composition_source
    )
    for operation in (
        "project_beat_image_specs",
        "project_sketch_candidate_specs",
        "project_scene_image_specs",
        "project_character_media_specs",
        "project_episode_media_specs",
    ):
        assert f"def {operation}(" in domain_source
        assert operation in application_source
    assert "def fallback_display_tool_ui_specs(" in public_source
    assert hermes_replies_source.count("await self._display_fallbacks.build(") == 2
    assert "chat_service._backend_api_get" not in route_test_source
    assert "chat_service._fallback_display_tool_ui_specs" not in route_test_source


def test_ai_assistant_owns_project_chat_media_projection() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    domain = module / "domain" / "project_media.py"
    application = module / "application" / "project_media.py"
    hermes_replies = module / "application" / "hermes_project_replies.py"
    message_application = module / "application" / "project_messages.py"
    ports = module / "application" / "ports.py"
    adapter = module / "infrastructure" / "project_media_files.py"
    composition = module / "composition.py"
    public = module / "public.py"
    route_tests = REPO_ROOT / "tests" / "test_chat_http_routes.py"
    domain_source = domain.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    hermes_replies_source = hermes_replies.read_text(encoding="utf-8")
    message_application_source = message_application.read_text(encoding="utf-8")
    ports_source = ports.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_test_source = route_tests.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(domain)
        if imported == "os"
        or imported == "sqlite3"
        or imported == "fastapi"
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
    }
    assert "class ProjectMediaFiles(Protocol)" in ports_source
    assert "class ProjectMedia" in application_source
    assert "class LocalProjectMediaFiles" in adapter_source
    assert "AI_ANIME_OUTPUT_DIR" in adapter_source
    assert "project_static_url" in adapter_source
    assert "_project_media = ProjectMedia(LocalProjectMediaFiles())" in (
        composition_source
    )
    assert "def extract_project_media(" in public_source
    assert "self._project_media.extract(" in hermes_replies_source
    assert "def normalize(" in application_source
    assert "self._media.normalize(" in message_application_source
    assert "def merge_project_media_items(" in domain_source
    assert "merge_project_media_items" in message_application_source
    assert "merge_project_media_items" not in public_source
    assert "def filter_markdown_duplicate_media(" in domain_source
    assert "filter_markdown_duplicate_media" in message_application_source
    assert "filter_markdown_duplicate_media" not in public_source
    assert "def normalize_project_media(" not in public_source
    assert "chat_service._extract_media" not in route_test_source
    assert "chat_service._filter_markdown_duplicate_images" not in route_test_source


def test_ai_assistant_owns_scoped_chat_history() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    scope = module / "domain" / "scope.py"
    ports = module / "application" / "ports.py"
    history = module / "infrastructure" / "sqlite_chat_history.py"
    composition = module / "composition.py"
    public = module / "public.py"
    scope_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "scope.py"
    legacy_store = PACKAGE_ROOT / "chat" / "store.py"
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    scope_source = scope_adapter.read_text(encoding="utf-8")

    assert not legacy_store.exists()
    assert "ai_anime.modules.ai_assistant.infrastructure.hermes.store" not in _imports(
        scope_adapter
    )
    assert "ai_anime.modules.ai_assistant.public" in _imports(scope_adapter)
    assert not {
        imported
        for imported in {*_imports(scope), *_imports(ports)}
        if imported == "sqlite3" or imported == "os"
    }
    assert "sqlite3" in _imports(history)
    assert "ai_anime.modules.ai_assistant.infrastructure" in _imports(composition)
    assert "def get_chat_history(" not in composition_source
    assert "get_chat_history" not in public_source
    assert "chat_history" not in scope_source


def test_ai_assistant_owns_project_chat_persistence() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    ports_source = (module / "application" / "ports.py").read_text(encoding="utf-8")
    application_source = (module / "application" / "project_messages.py").read_text(
        encoding="utf-8"
    )
    history_source = (module / "infrastructure" / "sqlite_chat_history.py").read_text(
        encoding="utf-8"
    )
    for operation in (
        "append_project_message",
        "append_project_trace_messages",
        "list_project_messages",
        "list_project_trace_contents",
        "replace_project_trace_messages",
    ):
        assert f"def {operation}(" in ports_source
        assert f"def {operation}(" in history_source
        assert f"self._history.{operation}(" in application_source


def test_ai_assistant_owns_project_chat_message_orchestration() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "project_messages.py"
    deterministic_replies = module / "application" / "deterministic_replies.py"
    project_turns = module / "application" / "project_chat_turns.py"
    composition = module / "composition.py"
    public = module / "public.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "http.py"
    route_tests = REPO_ROOT / "tests" / "test_chat_http_routes.py"
    application_source = application.read_text(encoding="utf-8")
    deterministic_replies_source = deterministic_replies.read_text(encoding="utf-8")
    project_turns_source = project_turns.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")
    route_test_source = route_tests.read_text(encoding="utf-8")

    assert "class ProjectChatMessages" in application_source
    for operation in (
        "list",
        "assistant_contents",
        "trace_contents",
        "replace_traces",
        "append_user",
        "append_assistant",
        "append_traces",
    ):
        assert f"def {operation}(" in application_source
    assert (
        "_project_chat_messages = ProjectChatMessages(_chat_history, _project_media)"
        in composition_source
    )
    assert "def get_project_chat_messages(" not in composition_source
    assert "get_project_chat_messages" not in public_source
    assert "self._project_messages.append_assistant(" in deterministic_replies_source
    assert "self._messages.append_user(" in project_turns_source
    assert "scoped_chat_messages.append_notification(" in route_source
    assert "project_chat_messages" not in route_source
    for legacy_route_call in (
        "chat_service.add_assistant_message(",
        "chat_service.add_user_message(",
        "chat_service.list_messages(",
    ):
        assert legacy_route_call not in route_source
    assert "chat_service.add_assistant_message" not in route_test_source
    assert "chat_service.list_messages" not in route_test_source


def test_ai_assistant_owns_scoped_chat_message_orchestration() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "scoped_chat_messages.py"
    composition = module / "composition.py"
    public = module / "public.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "http.py"
    scope_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "scope.py"
    application_source = application.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")
    scope_source = scope_adapter.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(application)
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure")
    }
    assert "class ScopedChatMessages:" in application_source
    for owned_operation in (
        "self._project_messages.append_assistant(",
        "self._history.append_message(",
        "self._history.append_ui_event(",
        "self._project_messages.list(",
        "self._history.list_messages(",
    ):
        assert owned_operation in application_source
    assert "_scoped_chat_messages = ScopedChatMessages(" in composition_source
    assert "def get_scoped_chat_messages(" in composition_source
    assert "def get_scoped_chat_messages(" in public_source
    assert "scoped_chat_messages = get_scoped_chat_messages()" in route_source
    assert "scoped_chat_messages = get_scoped_chat_messages()" in scope_source
    for route_call in (
        "scoped_chat_messages.append_notification(",
        "scoped_chat_messages.append_ui_event(",
    ):
        assert route_call in route_source
    assert "scoped_chat_messages.list(" in scope_source
    assert "scoped_chat_messages.list(" not in route_source


def test_ai_assistant_has_only_bundled_hermes_agent_runtime() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    project_replies = module / "application" / "project_assistant_replies.py"
    composition = module / "composition.py"
    backend = REPO_ROOT / "desktop" / "src" / "backend.ts"
    project = REPO_ROOT / "pyproject.toml"
    removed_paths = (
        PACKAGE_ROOT / "chat" / "backend_sdk.py",
        module / "application" / "agent_backend.py",
        module / "application" / "agent_backend_prewarm.py",
        module / "application" / "thread_replies.py",
        module / "domain" / "mcp_configuration.py",
        module / "infrastructure" / "agent_backend_runtime.py",
        module / "infrastructure" / "agent_thread_runtime.py",
        module / "infrastructure" / "agent_thread_sessions.py",
        module / "infrastructure" / "agent_tool_configuration.py",
        module / "infrastructure" / "agent_workspace.py",
        module / "infrastructure" / "hermes" / "ai_anime_mcp.py",
        module / "infrastructure" / "hermes" / "service.py",
    )

    assert all(not path.exists() for path in removed_paths)
    assert "claude-agent-sdk" not in project.read_text(encoding="utf-8")
    assert "AI_ANIME_CHAT_BACKEND" not in backend.read_text(encoding="utf-8")
    assert "self._hermes_replies.stream(" in project_replies.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    assert "LocalHermesRuntime()" in composition_source
    assert "LocalAgent" not in composition_source


def test_ai_assistant_owns_chat_run_locks() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "project_assistant_replies.py"
    lifecycle = module / "application" / "chat_worker_lifecycle.py"
    ports = module / "application" / "ports.py"
    adapter = module / "infrastructure" / "chat_run_locks.py"
    history_adapter = module / "infrastructure" / "sqlite_chat_history.py"
    local_state = module / "infrastructure" / "local_state.py"
    composition = module / "composition.py"
    public = module / "public.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    application_source = application.read_text(encoding="utf-8")
    lifecycle_source = lifecycle.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    history_source = history_adapter.read_text(encoding="utf-8")
    local_state_source = local_state.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert "class ChatRunLocks(Protocol):" in ports.read_text(encoding="utf-8")
    assert "class FileChatRunLocks:" in adapter_source
    assert "OpenProcess" in adapter_source
    assert "GetExitCodeProcess" in adapter_source
    assert "def local_state_root(" in local_state_source
    assert "local_state_root" in adapter_source
    assert "local_state_root" in history_source
    assert "def _state_root(" not in adapter_source
    assert "def _state_root(" not in history_source
    assert "def get_chat_run_locks(" not in composition.read_text(encoding="utf-8")
    assert "def get_chat_run_locks(" not in public.read_text(encoding="utf-8")
    assert "ChatRunLocks" not in public.read_text(encoding="utf-8")
    assert "self._run_locks.acquire(" in application_source
    assert "self._run_locks.maintain(" in application_source
    assert "self._run_locks.release(" in application_source
    assert "self._run_locks.force_release(" in lifecycle_source
    assert "self._run_locks.is_active(" in lifecycle_source
    assert "chat_service.force_release_chat_run_lock" not in route_source
    assert "chat_service.chat_run_lock_is_active" not in route_source
    assert "chat_run_locks" not in route_source


def test_ai_assistant_owns_hermes_runtime() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    ports = module / "application" / "ports.py"
    prewarmer = module / "application" / "hermes_runtime_prewarm.py"
    lifecycle = module / "application" / "chat_worker_lifecycle.py"
    home_replies = module / "application" / "hermes_home_replies.py"
    project_replies = module / "application" / "hermes_project_replies.py"
    adapter = module / "infrastructure" / "hermes_runtime.py"
    composition = module / "composition.py"
    public = module / "public.py"
    session_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "session.py"
    ports_source = ports.read_text(encoding="utf-8")
    prewarmer_source = prewarmer.read_text(encoding="utf-8")
    lifecycle_source = lifecycle.read_text(encoding="utf-8")
    home_replies_source = home_replies.read_text(encoding="utf-8")
    project_replies_source = project_replies.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert "class HermesThread(Protocol):" in ports_source
    assert "class HermesRuntime(Protocol):" in ports_source
    assert "class LocalHermesRuntime:" in adapter_source
    assert (
        "ai_anime.modules.ai_assistant.infrastructure.hermes.hermes_pool"
        in _imports(adapter)
    )
    assert "_hermes_runtime = LocalHermesRuntime()" in composition_source
    assert "def get_hermes_runtime(" not in composition_source
    assert "def get_hermes_runtime(" not in public_source
    assert "    HermesRuntime,\n" not in public_source
    assert '"HermesRuntime",' not in public_source
    assert "LocalHermesRuntime" not in public_source
    assert (
        "ai_anime.modules.ai_assistant.infrastructure.hermes.hermes_pool"
        not in _imports(session_adapter)
    )
    assert home_replies_source.count("self._runtime.get_for_user(") == 1
    assert project_replies_source.count("self._runtime.get_for_user(") == 1
    assert prewarmer_source.count("self._runtime.prewarm(") == 1
    assert lifecycle_source.count("self._runtime.set_scope_for_user(") == 1
    assert lifecycle_source.count("self._runtime.close_user(") == 1


def test_ai_assistant_owns_chat_worker_lifecycle() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "chat_worker_lifecycle.py"
    composition = module / "composition.py"
    public = module / "public.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    http_route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "http.py"
    session_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "session.py"
    scope_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "scope.py"
    application_source = application.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")
    http_source = http_route.read_text(encoding="utf-8")
    session_source = session_adapter.read_text(encoding="utf-8")
    scope_source = scope_adapter.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(application)
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure")
    }
    assert "class ChatWorkerLifecycle:" in application_source
    assert "_chat_worker_lifecycle = ChatWorkerLifecycle(" in composition_source
    assert "def get_chat_worker_lifecycle(" in composition_source
    assert "def get_chat_worker_lifecycle(" in public_source
    assert "chat_worker_lifecycle = get_chat_worker_lifecycle()" not in route_source
    assert "chat_worker_lifecycle = get_chat_worker_lifecycle()" in http_source
    assert "chat_worker_lifecycle = get_chat_worker_lifecycle()" in session_source
    assert "chat_worker_lifecycle = get_chat_worker_lifecycle()" in scope_source
    assert "chat_worker_lifecycle.cancel(" not in route_source
    assert http_source.count("chat_worker_lifecycle.cancel(") == 1
    assert "chat_worker_lifecycle.sync_scope(" not in route_source
    assert session_source.count("chat_worker_lifecycle.sync_scope(") == 1
    assert "chat_worker_lifecycle.is_busy(" not in route_source
    assert session_source.count("chat_worker_lifecycle.is_busy(") == 3
    assert scope_source.count("chat_worker_lifecycle.is_busy(") == 1
    assert "def _sync_running_agent_scope(" not in route_source
    assert "def _sync_running_agent_scope(" not in session_source
    assert application_source.count("self._runtime.close_user(") == 1
    assert application_source.count("self._runtime.set_scope_for_user(") == 1
    assert application_source.count("self._run_locks.force_release(") == 1
    assert application_source.count("self._run_locks.is_active(") == 1


def test_ai_assistant_owns_hermes_home_reply_orchestration() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "hermes_home_replies.py"
    composition = module / "composition.py"
    public = module / "public.py"
    turn_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "turns.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    application_source = application.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    turn_source = turn_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(application)
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure")
    }
    assert "class HermesHomeReplies:" in application_source
    assert "_hermes_home_replies = HermesHomeReplies(" in composition_source
    assert "def get_hermes_home_replies(" in composition_source
    assert "def get_hermes_home_replies(" in public_source
    assert "hermes_home_replies = get_hermes_home_replies()" in turn_source
    assert turn_source.count("hermes_home_replies.stream(") == 1
    assert "async def _stream_home_turn(" in turn_source
    assert "stream_chat_turn(" in turn_source
    assert "get_hermes_home_replies" not in route_source
    assert "hermes_home_replies.stream(" not in route_source
    assert "websocket" not in application_source
    for migrated_dependency in (
        "completion_text_or_existing",
        "merge_stream_text",
        "strip_replayed_chat_response",
        "list_project_workspaces",
    ):
        assert migrated_dependency not in route_source
        assert migrated_dependency in application_source
    for owned_operation in (
        "self._runtime.get_for_user(",
        "self._history.load_context_policy(",
        "self._history.append_message(",
        "text_with_attachment_context(",
        "emit_chat_event_best_effort(",
    ):
        assert owned_operation in application_source


def test_ai_assistant_owns_hermes_project_reply_orchestration() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "hermes_project_replies.py"
    dispatcher = module / "application" / "project_assistant_replies.py"
    chat_events = module / "application" / "chat_events.py"
    ports = module / "application" / "ports.py"
    composition = module / "composition.py"
    public = module / "public.py"
    application_source = application.read_text(encoding="utf-8")
    dispatcher_source = dispatcher.read_text(encoding="utf-8")
    chat_events_source = chat_events.read_text(encoding="utf-8")
    ports_source = ports.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(application)
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure")
    }
    assert "ChatEventSink =" in ports_source
    assert "class HermesProjectReplies:" in application_source
    assert "_hermes_project_replies = HermesProjectReplies(" in composition_source
    assert "def get_hermes_project_replies(" not in composition_source
    assert "def get_hermes_project_replies(" not in public_source
    assert "HermesProjectReplies" not in public_source
    assert dispatcher_source.count("self._hermes_replies.stream(") == 1
    assert "async def emit_chat_event_best_effort(" in chat_events_source
    assert "def _emit_chat_event_best_effort(" not in application_source
    for owned_operation in (
        "self._runtime.get_for_user(",
        "self._prompt_context.build(",
        "self._project_messages.load_context_policy(",
        "self._project_messages.trace_contents(",
        "self._presentation.extract_tool_ui_specs(",
        "self._page_sessions.create_token(",
        "self._display_fallbacks.build(",
        "self._project_messages.append_traces(",
        "self._project_media.extract(",
        "self._project_messages.append_assistant(",
    ):
        assert owned_operation in application_source


def test_ai_assistant_owns_deterministic_project_replies() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "deterministic_replies.py"
    dispatcher = module / "application" / "project_assistant_replies.py"
    composition = module / "composition.py"
    public = module / "public.py"
    application_source = application.read_text(encoding="utf-8")
    dispatcher_source = dispatcher.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(application)
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure")
    }
    assert "class DeterministicProjectReplies:" in application_source
    assert "_deterministic_project_replies = DeterministicProjectReplies(" in (
        composition_source
    )
    assert "def get_deterministic_project_replies(" not in composition_source
    assert "def get_deterministic_project_replies(" not in public_source
    assert "DeterministicProjectReplies" not in public_source
    assert dispatcher_source.count("self._deterministic_replies.stream(") == 1
    assert "redact_local_filesystem_paths(" in application_source
    assert "self._project_messages.append_assistant(" in application_source
    assert application_source.count("emit_chat_event_best_effort(") == 2


def test_ai_assistant_owns_project_assistant_reply_dispatch() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "project_assistant_replies.py"
    project_turns = module / "application" / "project_chat_turns.py"
    composition = module / "composition.py"
    public = module / "public.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    application_tests = (
        REPO_ROOT
        / "tests"
        / "modules"
        / "ai_assistant"
        / "test_project_assistant_replies.py"
    )
    application_source = application.read_text(encoding="utf-8")
    project_turns_source = project_turns.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")
    application_test_source = application_tests.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(application)
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure")
    }
    assert "class ProjectAssistantReplies:" in application_source
    assert "_project_assistant_replies = ProjectAssistantReplies(" in (
        composition_source
    )
    assert "def get_project_assistant_replies(" not in composition_source
    assert "def get_project_assistant_replies(" not in public_source
    assert "ProjectAssistantReplies" not in public_source
    assert "get_project_assistant_replies" not in application_test_source
    assert "project_assistant_replies" not in route_source
    assert project_turns_source.count("self._replies.stream(") == 1
    for owned_operation in (
        "self._run_locks.acquire(",
        "self._run_locks.maintain(",
        "self._run_locks.release(",
        "reingest_confirmation_reply(prompt)",
        "script_creation_guidance_prompt(prompt)",
        "self._deterministic_replies.stream(",
        "self._hermes_replies.stream(",
    ):
        assert owned_operation in application_source


def test_ai_assistant_owns_project_chat_turn_orchestration() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "project_chat_turns.py"
    composition = module / "composition.py"
    public = module / "public.py"
    turn_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "turns.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    application_source = application.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    turn_source = turn_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(application)
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure")
    }
    assert "class ProjectChatTurns:" in application_source
    assert "_project_chat_turns = ProjectChatTurns(" in composition_source
    assert "def get_project_chat_turns(" in composition_source
    assert "def get_project_chat_turns(" in public_source
    assert "project_chat_turns = get_project_chat_turns()" in turn_source
    assert turn_source.count("project_chat_turns.stream(") == 1
    assert "async def _stream_project_turn(" in turn_source
    assert "stream_chat_turn(" in turn_source
    assert "get_project_chat_turns" not in route_source
    assert "project_chat_turns.stream(" not in route_source
    assert "websocket" not in application_source
    for owned_operation in (
        "self._messages.append_user(",
        "self._replies.stream(",
        "text_with_attachment_context(",
        "tool_display_payload(",
        "message_content(",
        "should_emit_final_text(",
        "emit_chat_event_best_effort(",
    ):
        assert owned_operation in application_source


def test_ai_assistant_owns_hermes_runtime_prewarm() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "hermes_runtime_prewarm.py"
    composition = module / "composition.py"
    public = module / "public.py"
    session_adapter = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "session.py"
    route = PACKAGE_ROOT / "api" / "routes" / "ai_assistant" / "chat.py"
    application_source = application.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    session_source = session_adapter.read_text(encoding="utf-8")
    route_source = route.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(application)
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure")
    }
    assert "class HermesRuntimePrewarmer:" in application_source
    assert "_hermes_runtime_prewarmer = HermesRuntimePrewarmer(" in composition_source
    assert "def get_hermes_runtime_prewarmer(" in composition_source
    assert "def get_hermes_runtime_prewarmer(" in public_source
    assert "hermes_runtime_prewarmer = get_hermes_runtime_prewarmer()" in session_source
    assert "hermes_runtime_prewarmer" not in route_source
    assert session_source.count("hermes_runtime_prewarmer.prewarm(") == 2
    assert "ai_anime.modules.ai_assistant.infrastructure.hermes" not in _imports(
        session_adapter
    )
    assert "ai_anime.modules.ai_assistant.infrastructure.hermes" not in _imports(route)
    assert application_source.count("self._runtime.prewarm(") == 1


def test_ai_assistant_owns_page_agent_session_issuance() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    application = module / "application" / "page_agent_sessions.py"
    hermes_replies = module / "application" / "hermes_project_replies.py"
    composition = module / "composition.py"
    public = module / "public.py"
    application_source = application.read_text(encoding="utf-8")
    hermes_replies_source = hermes_replies.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert "ai_anime.modules.identity_access.public" in _imports(application)
    assert not {
        imported
        for imported in _imports(application)
        if imported == "fastapi"
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.api")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure")
    }
    assert "class PageAgentSessions:" in application_source
    assert "PAGE_AGENT_SESSION_TTL_SECONDS = 24 * 3600" in application_source
    assert "_page_agent_sessions = PageAgentSessions()" in composition_source
    assert "def get_page_agent_sessions(" in composition_source
    assert "async def create_page_agent_session_token(" in public_source
    assert "PageAgentSessions" not in public_source
    assert hermes_replies_source.count("self._page_sessions.create_token(") == 2


def test_ai_assistant_owns_agent_prompt_context() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    domain = module / "domain" / "prompt_context.py"
    application = module / "application" / "prompt_context.py"
    hermes_replies = module / "application" / "hermes_project_replies.py"
    ports = module / "application" / "ports.py"
    adapter = module / "infrastructure" / "user_preferences.py"
    composition = module / "composition.py"
    public = module / "public.py"
    domain_source = domain.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    hermes_replies_source = hermes_replies.read_text(encoding="utf-8")
    ports_source = ports.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(domain)
        if imported in {"os", "pathlib", "fastapi"}
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
    }
    assert "class UserPreferences(Protocol):" in ports_source
    assert "class AgentPromptContext:" in application_source
    assert "compose_agent_prompt" in application_source
    assert "JSON_RENDER_CHAT_INSTRUCTIONS" in domain_source
    assert "class FileUserPreferences:" in adapter_source
    assert "local_state_root" in adapter_source
    assert "def get_agent_prompt_context(" in composition_source
    assert "def build_agent_prompt_context(" in public_source
    assert "AgentPromptContext" not in public_source
    assert "UserPreferences" not in public_source
    preference_file_owners = [
        path
        for path in _python_files(PACKAGE_ROOT)
        if '"preferences.md"' in path.read_text(encoding="utf-8")
    ]
    assert preference_file_owners == [adapter]
    assert hermes_replies_source.count("self._prompt_context.build(") == 1


def test_ai_assistant_owns_turn_guidance_rules() -> None:
    module = PACKAGE_ROOT / "modules" / "ai_assistant"
    domain = module / "domain" / "turn_guidance.py"
    application = module / "application" / "project_assistant_replies.py"
    public = module / "public.py"
    domain_source = domain.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert not {
        imported
        for imported in _imports(domain)
        if imported in {"os", "pathlib", "fastapi"}
        or imported.startswith("fastapi.")
        or imported.startswith("ai_anime.modules.ai_assistant.infrastructure.hermes")
    }
    assert "def reingest_confirmation_reply(" in domain_source
    assert "def script_creation_guidance_prompt(" in domain_source
    assert "reingest_confirmation_reply" not in public_source
    assert "script_creation_guidance_prompt" not in public_source
    assert "reingest_confirmation_reply(prompt)" in application_source
    assert "script_creation_guidance_prompt(prompt)" in application_source


def test_platform_release_callers_use_the_public_api() -> None:
    platform_release_module = PACKAGE_ROOT / "modules" / "platform_release"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(platform_release_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.platform_release."):
                continue
            if imported == "ai_anime.modules.platform_release.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not failures, "\n".join(failures)


def test_model_usage_callers_use_the_public_api() -> None:
    model_usage_module = PACKAGE_ROOT / "modules" / "model_usage"
    failures: list[str] = []

    for path in _python_files(PACKAGE_ROOT):
        if path.is_relative_to(model_usage_module):
            continue
        relative = _relative(path)
        for imported in _imports(path):
            if not imported.startswith("ai_anime.modules.model_usage."):
                continue
            if imported == "ai_anime.modules.model_usage.public":
                continue
            failures.append(f"{relative}: {imported}")

    assert not failures, "\n".join(failures)


def test_retired_local_billing_stack_is_removed() -> None:
    model_usage = PACKAGE_ROOT / "modules" / "model_usage"
    retired = (
        PACKAGE_ROOT / "api" / "routes" / "model_usage" / "credits.py",
        model_usage / "composition.py",
        model_usage / "application" / "generation_credit.py",
        model_usage / "domain" / "billing_errors.py",
        model_usage / "domain" / "generation_credit.py",
        model_usage / "infrastructure" / "local_usage.py",
        model_usage / "infrastructure" / "provider_instrumentation.py",
        model_usage / "infrastructure" / "registered_usage.py",
        model_usage / "infrastructure" / "registered_credit_quote.py",
        model_usage / "infrastructure" / "generation_catalog.py",
        model_usage / "infrastructure" / "runtime_context.py",
    )
    assert not [path for path in retired if path.exists()]

    guarded = (
        model_usage / "public.py",
        PACKAGE_ROOT / "modules" / "bootstrap" / "container.py",
        PACKAGE_ROOT / "shared" / "ports" / "local" / "__init__.py",
    )
    forbidden = (
        "UsageMeter",
        "BillingRuleNotConfigured",
        "generation_credit",
        "credit_quote",
        "install_provider_instrumentation",
    )
    violations = [
        f"{_relative(path)}: {token}"
        for path in guarded
        for token in forbidden
        if token in path.read_text(encoding="utf-8")
    ]
    assert not violations, "\n".join(violations)


def test_platform_release_does_not_keep_a_noop_release_feed() -> None:
    platform_release = PACKAGE_ROOT / "modules" / "platform_release"
    local_ports = PACKAGE_ROOT / "shared" / "ports" / "local" / "__init__.py"
    assert not (PACKAGE_ROOT / "ports" / "release_feed.py").exists()
    assert not (PACKAGE_ROOT / "ports" / "local" / "release_feed.py").exists()
    assert not (PACKAGE_ROOT / "release_notes.py").exists()
    assert not (platform_release / "application" / "release_notifications.py").exists()
    assert not (platform_release / "infrastructure" / "release_feed.py").exists()
    assert 'register_port("release_feed"' not in local_ports.read_text(encoding="utf-8")


def test_noop_release_notifications_route_is_removed() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "release_notifications.py"
    router = PACKAGE_ROOT / "api" / "v1" / "router.py"

    assert not route.exists()
    assert "release_notifications" not in router.read_text(encoding="utf-8")


def test_runtime_config_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "platform_release" / "runtime_config.py"
    source = route.read_text(encoding="utf-8")

    assert source.count("runtime_config_queries().current()") == 1
    assert "ai_anime.modules.platform_release.public" in _imports(route)
    assert "runtime_env" not in source
    assert "os.environ" not in source
    assert "ULID" not in source


def test_project_file_routes_delegate_to_platform_release() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "project_workspace" / "files.py"
    shared_adapter = PACKAGE_ROOT / "api" / "file_delivery.py"
    platform_routes = (
        PACKAGE_ROOT / "api" / "routes" / "platform_release" / "runtime.py"
    )
    route_source = route.read_text(encoding="utf-8")
    platform_source = platform_routes.read_text(encoding="utf-8")

    assert route_source.count("serve_project_file(") == 2
    assert "def _resolve_project_file(" not in route_source
    assert "def _serve_or_redirect_to_oss(" not in route_source
    assert "def preview_project_media_file(" not in route_source
    assert "ai_anime.modules.platform_release.public" in _imports(shared_adapter)
    assert "ai_anime.api.routes.project_workspace.files" not in _imports(
        platform_routes
    )
    assert "ai_anime.api.file_delivery" in _imports(platform_routes)
    assert platform_source.count("serve_project_file(") == 1


def test_freezone_skill_catalog_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "skills.py"
    legacy_route = LEGACY_FREEZONE_ROUTE
    legacy_catalog = PACKAGE_ROOT / "freezone" / "skill_registry.py"
    catalog_application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "skill_catalog.py"
    )
    run_application = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "application" / "skill_runs.py"
    )
    run_contracts = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "skill_run_contracts.py"
    )
    run_inputs = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "skill_run_inputs.py"
    )
    run_domain = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "skill_runs.py"
    )
    run_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "skill_runs.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    presets = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "preset_payload.py"
    )
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"

    route_source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    catalog_source = catalog_application.read_text(encoding="utf-8")
    run_application_source = run_application.read_text(encoding="utf-8")
    run_contracts_source = run_contracts.read_text(encoding="utf-8")
    run_inputs_source = run_inputs.read_text(encoding="utf-8")
    run_domain_source = run_domain.read_text(encoding="utf-8")
    run_adapter_source = run_adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    presets_source = presets.read_text(encoding="utf-8")
    api_router_source = api_router.read_text(encoding="utf-8")

    assert (
        route_source.count("creative_canvas_skill_catalog_queries().list_skills()") == 1
    )
    assert route_source.count("creative_canvas_skill_run_use_cases().run(") == 1
    assert route_source.count("creative_canvas_skill_run_use_cases().result(") == 1
    assert "class CreativeCanvasSkillCatalogQueries" in catalog_source
    assert "class CreativeCanvasSkillRunUseCases" in run_application_source
    assert "class CreativeCanvasSkillRunRepository" in run_contracts_source
    assert "def group_and_validate_creative_canvas_skill_inputs(" in run_inputs_source
    assert "class CreativeCanvasSkillRunRepository" not in run_application_source
    assert "def group_and_validate_creative_canvas_skill_inputs(" not in (
        run_application_source
    )
    assert "class LocalCreativeCanvasSkillRunRepository" in run_adapter_source
    assert "class LocalCreativeCanvasSkillWorkspace" in run_adapter_source
    assert "def normalize_creative_canvas_skill_input_url(" in run_domain_source
    assert "def creative_canvas_skill_catalog_queries(" in composition_source
    assert "def creative_canvas_skill_run_use_cases(" in composition_source
    assert "def creative_canvas_skill_catalog_queries(" in public_source
    assert "def creative_canvas_skill_run_use_cases(" in public_source
    presets_tree = ast.parse(presets_source)
    skill_catalog_imports = {
        alias.name
        for node in ast.walk(presets_tree)
        if isinstance(node, ast.ImportFrom)
        and node.module == "ai_anime.modules.creative_canvas.application.skill_catalog"
        for alias in node.names
    }
    assert "SKILL_SCHEMA_VERSION" in skill_catalog_imports
    assert "DEFAULT_CREATIVE_CANVAS_IMAGE_MODEL" not in presets_source
    assert "creative_canvas.create_router()" in api_router_source
    assert "freezone.router" not in api_router_source
    assert not legacy_catalog.exists()

    for source in (
        catalog_source,
        run_application_source,
        run_contracts_source,
        run_inputs_source,
        run_domain_source,
        run_adapter_source,
    ):
        assert "fastapi" not in source
        assert "ai_anime.api" not in source
    assert "ai_anime.freezone" not in run_application_source
    assert "ai_anime.modules.creative_canvas.application" not in route_source
    assert not legacy_source


def test_freezone_staging_prop_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "skills.py"
    legacy_route = LEGACY_FREEZONE_ROUTE
    application = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "application" / "staging_prop.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "staging_prop.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    long_application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "long_operations.py"
    )
    runner = TASK_RUNNERS_ROOT / "freezone.py"

    route_source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    application_source = application.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    long_application_source = long_application.read_text(encoding="utf-8")
    runner_source = runner.read_text(encoding="utf-8")

    assert (
        route_source.count(
            "creative_canvas_long_operation_use_cases().start_staging_prop("
        )
        == 1
    )
    assert (
        runner_source.count("creative_canvas_staging_prop_use_cases().generate(") == 1
    )
    assert "class CreativeCanvasLongOperationUseCases" in long_application_source
    assert "class CreativeCanvasStagingPropUseCases" in application_source
    assert "class DirectorWorldCreativeCanvasStagingPropGenerator" in adapter_source
    assert "DirectorWorldCreativeCanvasStagingPropGenerator()" in composition_source
    assert "def creative_canvas_staging_prop_use_cases(" in public_source
    assert '"/projects/{project}/freezone/ai-staging-prop"' not in legacy_source
    assert "async def freezone_ai_staging_prop(" in route_source
    for legacy_implementation in (
        "async def _run_ai_staging_prop(",
        "async def freezone_ai_staging_prop(",
        "generate_ai_staging_prop",
    ):
        assert legacy_implementation not in legacy_source
    for route_implementation_detail in (
        "generate_ai_staging_prop",
        'request.pop("api_key"',
        'request.pop("base_url"',
    ):
        assert route_implementation_detail not in route_source

    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_job_result_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "jobs.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    application = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "application" / "job_results.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "job_results.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"

    route_source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    application_source = application.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    api_router_source = api_router.read_text(encoding="utf-8")

    assert route_source.count("creative_canvas_job_result_queries().get_result(") == 1
    assert "class CreativeCanvasJobResultQueries" in application_source
    assert "class LocalCreativeCanvasJobResultReader" in adapter_source
    assert "LocalCreativeCanvasJobResultReader()" in composition_source
    assert "def creative_canvas_job_result_queries(" in public_source
    assert "creative_canvas.create_router()" in api_router_source
    assert '"/projects/{project}/freezone/jobs/{task_type}/{job_id}/result"' not in (
        legacy_source
    )
    for legacy_implementation in (
        "async def freezone_job_result(",
        "def _text_translate_output_path(",
        "def _story_script_output_path(",
        "def _image_reverse_prompt_output_path(",
        "def _video_compose_output_path(",
        "def _video_erase_output_path(",
        "def _video_upscale_output_path(",
        "def _audio_separate_audio_output_path(",
        "def _audio_separate_mute_video_output_path(",
        "def _public_freezone_video_story_result(",
        "migrate_canvas_static_urls_in_memory",
        "freezone_audio_speech_output_path",
        "freezone_audio_music_output_path",
        "TAG_FREEZONE_JOBS",
    ):
        assert legacy_implementation not in legacy_source
    for route_implementation_detail in (
        "get_task_manager",
        "output_path_for_job",
        "outputs_dir",
        "make_static_url_for_context",
        "json.loads",
        ".glob(",
        ".stat(",
    ):
        assert route_implementation_detail not in route_source

    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_mainline_generation_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "skills.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "mainline_generation.py"
    )
    domain = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "domain"
        / "mainline_generation.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "mainline_generation.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    route_source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    application_source = application.read_text(encoding="utf-8")
    domain_source = domain.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    for handler_name in (
        "freezone_sketch_from_context",
        "freezone_frame_from_context",
        "freezone_scene_360",
    ):
        assert f"async def {handler_name}(" in route_source
        assert f"async def {handler_name}(" not in legacy_source
    for path in (
        '"/projects/{project}/freezone/sketch-from-context"',
        '"/projects/{project}/freezone/frame-from-context"',
        '"/projects/{project}/freezone/scene-360"',
    ):
        assert path in route_source
        assert path not in legacy_source
    assert "class CreativeCanvasMainlineGenerationUseCases" in application_source
    assert "class LocalCreativeCanvasMainlineGenerationConfigSource" in adapter_source
    assert "def creative_canvas_mainline_generation_use_cases(" in composition_source
    assert "def creative_canvas_mainline_generation_use_cases(" in public_source
    skill_run_application = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "application" / "skill_runs.py"
    ).read_text(encoding="utf-8")
    assert "self._mainline_generation.start_" in skill_run_application

    for legacy_implementation in (
        "def _load_freezone_beat_context(",
        "def _mainline_single_beat_config(",
        "def _start_or_enqueue_mainline_sketch_from_context_job(",
        "def _start_or_enqueue_mainline_frame_from_context_job(",
        "def _start_or_enqueue_standalone_frame_from_context_job(",
        "def _start_or_enqueue_mainline_director_control_sketch_job(",
        "def _start_or_enqueue_mainline_beat_sketch_task(",
        "def _start_or_enqueue_mainline_scene_360_task(",
        "def _project_job_response(",
        "get_task_backend",
    ):
        assert legacy_implementation not in legacy_source
    for moved_rule in (
        "def infer_scene_id_from_master_path(",
        "def build_scene_360_prompt(",
    ):
        assert moved_rule in domain_source
    for route_implementation_detail in (
        "make_sqlite_store_for_context",
        "enqueue_project_task",
        "production_generation_context_use_cases",
        "load_project_config",
        "outputs_dir",
    ):
        assert route_implementation_detail not in route_source

    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in domain_source
    assert "ai_anime.api" not in domain_source
    assert "ai_anime.freezone" not in domain_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_generation_catalog_routes_delegate_to_application() -> None:
    image_route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "image.py"
    video_route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "video.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    image_source = image_route.read_text(encoding="utf-8")
    video_source = video_route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")

    assert image_source.count("generation_catalog_queries().") == 2
    assert video_source.count("generation_catalog_queries().") == 1
    assert "creative_canvas.create_router()" in api_router_source
    assert "creative_canvas.create_router()" in api_router_source
    for handler_name in (
        "freezone_image_camera_options",
        "freezone_image_style_templates",
        "freezone_video_camera_templates",
    ):
        assert f"async def {handler_name}(" not in legacy_source
    for removed_handler in ("freezone_image_models", "freezone_video_models"):
        assert f"async def {removed_handler}(" not in image_source
        assert f"async def {removed_handler}(" not in video_source
    assert "/freezone/image/models" not in image_source
    assert "/freezone/video/models" not in video_source
    for implementation_detail in (
        "IMAGE_GENERATION_SELECTIONS",
        "image_generation_selection_options",
        "get_freezone_image_camera_options",
        "get_freezone_image_style_templates",
        "get_freezone_video_model_options",
        "get_video_camera_templates",
    ):
        assert implementation_detail not in image_source
        assert implementation_detail not in video_source
        assert implementation_detail not in legacy_source


def test_freezone_video_processing_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "video.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "video_processing.py"
    )
    domain = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "video_processing.py"
    )
    source_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "media_sources.py"
    )
    job_result_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "job_results.py"
    )
    runner = TASK_RUNNERS_ROOT / "freezone.py"
    execution_application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "job_execution.py"
    )
    video_composition_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "video_composition_job_runtime.py"
    )
    video_erase_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "video_erase_job_runtime.py"
    )
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    application_source = application.read_text(encoding="utf-8")
    domain_source = domain.read_text(encoding="utf-8")
    adapter_source = source_adapter.read_text(encoding="utf-8")
    job_result_adapter_source = job_result_adapter.read_text(encoding="utf-8")
    runner_source = runner.read_text(encoding="utf-8")
    execution_application_source = execution_application.read_text(encoding="utf-8")
    video_composition_source = video_composition_adapter.read_text(encoding="utf-8")
    video_erase_source = video_erase_adapter.read_text(encoding="utf-8")

    endpoint_paths = (
        '"/projects/{project}/freezone/extract-frames"',
        '"/projects/{project}/freezone/analyze-shots"',
        '"/projects/{project}/freezone/analyze-video-story"',
        '"/projects/{project}/freezone/video/upscale"',
        '"/projects/{project}/freezone/video/erase"',
        '"/projects/{project}/freezone/video/audio-separate"',
        '"/projects/{project}/freezone/video/compose"',
    )
    for endpoint_path in endpoint_paths:
        assert source.count(endpoint_path) == 1
        assert endpoint_path not in legacy_source

    assert source.count("creative_canvas_video_processing_use_cases().") == 7
    for command in (
        "StartCreativeCanvasFrameExtractionCommand",
        "StartCreativeCanvasShotAnalysisCommand",
        "StartCreativeCanvasVideoStoryAnalysisCommand",
        "StartCreativeCanvasVideoUpscaleCommand",
        "StartCreativeCanvasVideoEraseCommand",
        "StartCreativeCanvasAudioSeparationCommand",
        "StartCreativeCanvasVideoCompositionCommand",
        "CreativeCanvasVideoCompositionItem",
        "CreativeCanvasVideoCompositionTrack",
    ):
        assert command in source
    for legacy_handler in (
        "async def freezone_extract_frames(",
        "async def freezone_analyze_shots(",
        "async def freezone_analyze_video_story(",
        "async def freezone_video_upscale(",
        "async def freezone_video_erase(",
        "async def freezone_audio_separate(",
        "async def freezone_video_compose(",
        "async def _enqueue_or_start_freezone_video_analysis(",
        "def _start_freezone_video_upscale_task(",
        "def _start_freezone_video_erase_task(",
        "def _start_freezone_audio_separate_task(",
        "def _start_freezone_video_compose_task(",
    ):
        assert legacy_handler not in legacy_source
    for legacy_schema in (
        "FreezoneExtractFramesRequest",
        "FreezoneAnalyzeShotsRequest",
        "FreezoneAnalyzeVideoStoryRequest",
        "FreezoneVideoUpscaleRequest",
        "FreezoneVideoEraseRequest",
        "FreezoneAudioSeparateRequest",
        "FreezoneVideoComposeRequest",
    ):
        assert legacy_schema not in legacy_source
    for implementation_detail in (
        "get_task_backend",
        "project_task_state_key",
        "resolve_static_url_to_path",
        "_new_job_id",
    ):
        assert implementation_detail not in source
    for task_type, runner_name in (
        ("freezone_extract", "run_freezone_extract"),
        ("freezone_analyze", "run_freezone_analyze"),
        ("freezone_video_story", "run_freezone_video_story"),
        ("freezone_video_upscale", "run_freezone_video_upscale"),
        ("freezone_video_erase", "run_freezone_video_erase"),
        ("freezone_audio_separate", "run_freezone_audio_separate"),
        ("freezone_video_compose", "run_freezone_video_compose"),
    ):
        assert (
            runner_source.count(
                f'register_project_task_runner("{task_type}", {runner_name})'
            )
            == 1
        )
    assert (
        domain_source.count("box mode requires box_x, box_y, box_width and box_height")
        == 1
    )
    assert "validate_video_erase_box(" in application_source
    assert "validate_video_erase_box(" in video_erase_source
    assert (
        "box mode requires box_x, box_y, box_width and box_height"
        not in application_source
    )
    assert (
        "box mode requires box_x, box_y, box_width and box_height"
        not in video_erase_source
    )
    assert "_enqueue_or_start_freezone_media_job" not in legacy_source
    assert "def _video_output_path(" in job_result_adapter_source
    assert 'if task_type == "freezone_video_compose":' in job_result_adapter_source
    for rule_name in (
        "validate_video_composition_track_count",
        "validate_video_composition_source_range",
        "validate_video_composition_media_item_count",
        "validate_video_composition_video_item_count",
    ):
        assert f"{rule_name}(" in application_source
    assert "validate_video_composition_source_range(" in video_composition_source
    assert "validate_video_composition_video_item_count(" in video_composition_source
    for rule_message in (
        "tracks is required",
        "tracks must contain at least one media item",
        "video compose requires at least one video item",
        "source_end must be > source_start",
    ):
        assert domain_source.count(rule_message) == 1
        assert rule_message not in application_source
        assert rule_message not in source
        assert rule_message not in legacy_source
        assert rule_message not in execution_application_source
    assert not (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "image_sources.py"
    ).exists()
    assert not (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "image_sources.py"
    ).exists()
    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_video_generation_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "video.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    domain = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "video_generation.py"
    )
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "video_generation.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "video_generation.py"
    )
    runner = TASK_RUNNERS_ROOT / "video.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    domain_source = domain.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    runner_source = runner.read_text(encoding="utf-8")

    endpoint_paths = (
        '"/projects/{project}/freezone/video/gen"',
        '"/projects/{project}/freezone/video/i2v"',
        '"/projects/{project}/freezone/video/keyframes"',
        '"/projects/{project}/freezone/video/omni-gen"',
        '"/projects/{project}/freezone/video/video-edit"',
    )
    for endpoint_path in endpoint_paths:
        assert source.count(endpoint_path) == 1
        assert endpoint_path not in legacy_source

    assert source.count("creative_canvas_video_generation_use_cases().") == 5
    for command in (
        "StartCreativeCanvasTextVideoCommand",
        "StartCreativeCanvasImageVideoCommand",
        "StartCreativeCanvasKeyframeVideoCommand",
        "StartCreativeCanvasOmniVideoCommand",
        "StartCreativeCanvasVideoEditCommand",
    ):
        assert command in source
    for legacy_handler in (
        "async def freezone_video_gen(",
        "async def freezone_video_i2v(",
        "async def freezone_video_keyframes(",
        "async def freezone_video_omni_gen(",
        "async def freezone_video_edit(",
        "async def _start_or_enqueue_freezone_video_gen(",
    ):
        assert legacy_handler not in legacy_source
    for legacy_schema in (
        "FreezoneVideoGenRequest",
        "FreezoneImageToVideoRequest",
        "FreezoneKeyframeVideoRequest",
        "FreezoneVideoOmniGenRequest",
        "FreezoneVideoEditRequest",
    ):
        assert legacy_schema not in legacy_source
    for implementation_detail in (
        "_resolve_url_list",
        "_new_job_id",
        "get_task_backend",
        "resolve_freezone_video_backend",
        "normalize_video_duration_for_backend",
    ):
        assert implementation_detail not in source
    assert not (PACKAGE_ROOT / "freezone" / "video_node.py").exists()
    for layered_source in (domain_source, application_source, adapter_source):
        assert "fastapi" not in layered_source
        assert "ai_anime.api" not in layered_source
    assert "ai_anime.freezone" not in application_source
    assert (
        runner_source.count(
            'register_project_task_runner("freezone_video_gen", run_freezone_video_gen)'
        )
        == 1
    )


def test_freezone_video_asset_library_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "video.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    domain = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "domain"
        / "video_asset_library.py"
    )
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "video_asset_library.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "video_asset_library.py"
    )
    generation_application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "video_generation.py"
    )
    generation_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "video_generation.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    legacy_library = PACKAGE_ROOT / "freezone" / "video_character_library.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    domain_source = domain.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    generation_application_source = generation_application.read_text(encoding="utf-8")
    generation_adapter_source = generation_adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")

    base_path = '"/projects/{project}/freezone/video/character-library"'
    sync_path = '"/projects/{project}/freezone/video/asset-library/sync-from-mainline"'
    delete_path = '"/projects/{project}/freezone/video/character-library/{item_id}"'
    assert source.count(base_path) == 2
    assert source.count(sync_path) == 1
    assert source.count(delete_path) == 1
    for endpoint_path in (base_path, sync_path, delete_path):
        assert endpoint_path not in legacy_source

    assert source.count("creative_canvas_video_asset_library_use_cases().") == 4
    for legacy_handler in (
        "async def freezone_video_character_library(",
        "async def freezone_add_video_character_library_item(",
        "async def freezone_sync_asset_library_from_mainline(",
        "async def freezone_delete_video_character_library_item(",
    ):
        assert legacy_handler not in legacy_source
    assert "FreezoneVideoCharacterLibraryItemRequest" not in legacy_source
    assert not legacy_library.exists()

    for layered_source in (domain_source, application_source, adapter_source):
        assert "fastapi" not in layered_source
        assert "ai_anime.api" not in layered_source
    assert "ai_anime.freezone" not in application_source
    for implementation_detail in (
        "resolve_static_url_to_path",
        "make_sqlite_store_for_context",
        "make_static_url_for_context",
        "resolve_character_voice",
    ):
        assert implementation_detail not in source

    assert "CreativeCanvasVideoAssetReader" in generation_application_source
    assert "LocalCreativeCanvasVideoCharacterCatalog" not in generation_adapter_source
    assert "video_character_library" not in generation_adapter_source
    assert "creative_canvas_video_asset_repository()" in composition_source
    repository_definitions = sum(
        path.read_text(encoding="utf-8").count(
            "class LocalCreativeCanvasVideoAssetRepository"
        )
        for path in _python_files(PACKAGE_ROOT)
    )
    assert repository_definitions == 1


def test_freezone_mark_detection_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "image.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    runner = TASK_RUNNERS_ROOT / "freezone.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")
    runner_source = runner.read_text(encoding="utf-8")

    endpoint_path = '"/projects/{project}/freezone/marks/detect"'
    assert source.count(endpoint_path) == 1
    assert endpoint_path not in legacy_source
    assert (
        source.count("creative_canvas_long_operation_use_cases().start_mark_detection(")
        == 1
    )
    assert (
        runner_source.count("creative_canvas_mark_detection_use_cases().detect(") == 1
    )
    assert "StartCreativeCanvasMarkDetectionCommand" in source
    assert "CreativeCanvasMarkSelection" in source
    assert "creative_canvas.create_router()" in api_router_source
    assert "async def freezone_mark_detect(" not in legacy_source
    assert "FreezoneMarkDetectRequest" not in legacy_source
    assert "FreezoneMarkDetectResponse" not in legacy_source
    assert "detect_freezone_mark" not in legacy_source
    for implementation_detail in (
        "ai_anime.freezone.mark_node",
        "resolve_static_url_to_path",
        "_resolve_url_list",
    ):
        assert implementation_detail not in source


def test_freezone_reverse_prompt_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "image.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    runner = TASK_RUNNERS_ROOT / "freezone.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    runner_source = runner.read_text(encoding="utf-8")

    endpoint_path = '"/projects/{project}/freezone/image/reverse-prompt"'
    assert source.count(endpoint_path) == 1
    assert endpoint_path not in legacy_source
    assert source.count("creative_canvas_reverse_prompt_use_cases().start(") == 1
    assert "StartCreativeCanvasReversePromptCommand" in source
    assert "async def freezone_image_reverse_prompt(" not in legacy_source
    assert "def _start_freezone_image_reverse_prompt_task(" not in legacy_source
    assert "FreezoneImageReversePromptRequest" not in legacy_source
    assert "reverse_prompt_from_image" not in legacy_source
    assert (
        'register_project_task_runner(\n    "freezone_image_reverse_prompt",'
        in runner_source
    )
    for implementation_detail in (
        "get_task_backend",
        "project_task_state_key",
        "resolve_static_url_to_path",
        "asyncio.create_task",
    ):
        assert implementation_detail not in source


def test_freezone_audio_generation_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "audio.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "audio_generation.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    runner = TASK_RUNNERS_ROOT / "freezone.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    runner_source = runner.read_text(encoding="utf-8")
    runner_registrations = {
        (node.args[0].value, node.args[1].id)
        for node in ast.walk(ast.parse(runner_source))
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "register_project_task_runner"
        and len(node.args) >= 2
        and isinstance(node.args[0], ast.Constant)
        and isinstance(node.args[0].value, str)
        and isinstance(node.args[1], ast.Name)
    }

    endpoint_paths = (
        '"/projects/{project}/freezone/audio/speech"',
        '"/projects/{project}/freezone/audio/music"',
        '"/projects/{project}/freezone/audio/voices/design"',
        '"/projects/{project}/freezone/audio/voices/preset"',
    )
    for endpoint_path in endpoint_paths:
        assert source.count(endpoint_path) == 1
        assert endpoint_path not in legacy_source

    assert source.count("creative_canvas_audio_generation_use_cases().") == 4
    assert "StartCreativeCanvasSpeechGenerationCommand" in source
    assert "StartCreativeCanvasMusicGenerationCommand" in source
    assert "StartCreativeCanvasVoiceDesignCommand" in source
    assert "StartCreativeCanvasPresetVoiceCommand" in source
    assert "creative_canvas.create_router()" in api_router_source
    for legacy_implementation in (
        "async def freezone_audio_speech(",
        "async def freezone_audio_music(",
        "def _start_freezone_audio_speech_task(",
        "FreezoneAudioSpeechRequest",
        "FreezoneAudioMusicRequest",
        "generate_freezone_audio_speech",
    ):
        assert legacy_implementation not in legacy_source
    for implementation_detail in (
        "get_task_backend",
        "asyncio.create_task",
        "ai_anime.freezone.audio_node",
        "make_sqlite_store",
        "project_static_url",
    ):
        assert implementation_detail not in source

    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "translate_runtime_errors=False" in composition_source
    assert (
        "freezone_audio_speech",
        "run_freezone_audio_speech",
    ) in runner_registrations
    assert (
        "freezone_audio_music",
        "run_freezone_audio_music",
    ) in runner_registrations
    assert (
        "freezone_voice_design",
        "run_freezone_voice_design",
    ) in runner_registrations
    assert (
        "freezone_voice_preset",
        "run_freezone_voice_preset",
    ) in runner_registrations


def test_freezone_audio_library_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "audio.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "audio_library.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "audio_library.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    application_source = application.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")

    for endpoint_path in (
        '"/projects/{project}/freezone/audio/references"',
        '"/projects/{project}/freezone/audio/voices"',
        '"/projects/{project}/freezone/audio/voices/design"',
        '"/projects/{project}/freezone/audio/voices/preset"',
        '"/projects/{project}/freezone/audio/voices/{voice_id}/media"',
        '"/projects/{project}/freezone/audio/voices/{voice_id}"',
    ):
        assert source.count(endpoint_path) == 1
        assert endpoint_path not in legacy_source

    assert source.count("creative_canvas_audio_library_use_cases().") == 4
    for application_contract in (
        "ListCreativeCanvasAudioReferencesQuery",
        "CreateCreativeCanvasAudioVoiceCommand",
        "DeleteCreativeCanvasAudioVoiceCommand",
        "GetCreativeCanvasAudioVoiceQuery",
    ):
        assert application_contract in source
    for legacy_implementation in (
        "FREEZONE_AUDIO_AGE_GROUP_LABELS",
        "def _freezone_audio_ref_payload(",
        "def _user_voice_media_url(",
        "def _attach_user_voice_media_urls(",
        "def _freezone_character_audio_refs(",
        "async def freezone_audio_references(",
        "async def create_freezone_audio_voice(",
        "async def get_freezone_audio_voice_media(",
        "TAG_FREEZONE_AUDIO",
        "create_user_audio_voice",
        "list_user_audio_voices",
        "resolve_user_audio_voice",
        "load_effective_narration_style_for_voice",
        "load_narrator_reference_audio",
        "resolve_character_voice",
    ):
        assert legacy_implementation not in legacy_source

    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source
    assert "make_sqlite_store_for_context" in adapter_source
    assert "LocalCreativeCanvasAudioLibraryGateway" in composition_source


def test_freezone_canvas_document_queries_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "documents.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "canvas_documents.py"
    )
    domain = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "canvas_documents.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_documents.py"
    )
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    domain_source = domain.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")

    expected_endpoint_counts = {
        '"/projects/{project}/freezone/canvases"': 1,
        '"/projects/{project}/freezone/canvases/{canvas_id}"': 3,
        '"/projects/{project}/freezone/canvases/{canvas_id}/history"': 1,
        '"/projects/{project}/freezone/canvases/{canvas_id}/nodes/{node_id}/generation-history"': 1,
        '"/projects/{project}/freezone/canvases/{canvas_id}/generation-history"': 1,
    }
    for endpoint_path, expected_count in expected_endpoint_counts.items():
        assert source.count(endpoint_path) == expected_count

    for exclusive_endpoint_path in (
        '"/projects/{project}/freezone/canvases"',
        '"/projects/{project}/freezone/canvases/{canvas_id}/history"',
        '"/projects/{project}/freezone/canvases/{canvas_id}/nodes/{node_id}/generation-history"',
        '"/projects/{project}/freezone/canvases/{canvas_id}/generation-history"',
    ):
        assert exclusive_endpoint_path not in legacy_source
    assert (
        '@router.get("/projects/{project}/freezone/canvases/{canvas_id}"'
        not in legacy_source
    )

    assert source.count("creative_canvas_document_queries().") == 5
    assert "creative_canvas.create_router()" in api_router_source
    for legacy_handler in (
        "async def list_canvases(",
        "async def get_canvas(",
        "async def list_canvas_history(",
        "async def get_node_generation_history(",
        "async def get_canvas_generation_history(",
    ):
        assert legacy_handler not in legacy_source
    for migrated_dependency in (
        "read_generation_history",
        "read_canvas_generation_history",
        "sanitize_project_local_paths_in_memory",
    ):
        assert migrated_dependency not in legacy_source
    for implementation_detail in (
        "canvas_store",
        "read_generation_history",
        "read_canvas_generation_history",
        "migrate_canvas_static_urls_in_memory",
        "sanitize_project_local_paths_in_memory",
    ):
        assert implementation_detail not in source

    for domain_rule in (
        "def first_text_value(",
        "def detected_reference_ids_from_beat_context_data(",
        "def sync_frame_context_reference_edges(",
        "def merge_restored_preset_canvas(",
        "def is_preset_managed_canvas_node(",
        "def prepare_creative_canvas_payload_for_write(",
        "def stamp_canvas_mainline_context_project_id(",
    ):
        assert domain_source.count(domain_rule) == 1
        assert domain_rule not in legacy_source

    assert "fastapi" not in domain_source
    assert "ai_anime.freezone" not in domain_source
    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_canvas_document_writes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "documents.py"
    errors = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "errors.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "canvas_writes.py"
    )
    domain = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "canvas_documents.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_writes.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    source = route.read_text(encoding="utf-8")
    errors_source = errors.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    application_source = application.read_text(encoding="utf-8")
    domain_source = domain.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert source.count('"/projects/{project}/freezone/canvases/{canvas_id}"') == 3
    assert (
        source.count('"/projects/{project}/freezone/canvases/{canvas_id}/restore"') == 1
    )
    assert source.count("creative_canvas_document_commands().") == 3
    for legacy_handler in (
        "async def restore_canvas_history(",
        "async def put_canvas(",
        "async def delete_canvas(",
    ):
        assert legacy_handler not in legacy_source
    for legacy_implementation in (
        "def _canvas_scope_from_payload(",
        "def _merge_canvas_metadata(",
        "def _prepare_canvas_payload_for_write(",
        "def _raise_canvas_store_http(",
        "CanvasPayload",
    ):
        assert legacy_implementation not in legacy_source

    assert domain_source.count("def prepare_creative_canvas_payload_for_write(") == 1
    assert "class CreativeCanvasDocumentCommands" in application_source
    assert "class LocalCreativeCanvasDocumentCommandGateway" in adapter_source
    assert "def translate_canvas_store_error(" in adapter_source
    assert "def raise_canvas_document_http_error(" in errors_source
    assert "LocalCreativeCanvasDocumentCommandGateway()" in composition_source
    assert "def creative_canvas_document_commands(" in public_source
    assert "translate_creative_canvas_document_write_error" not in legacy_source
    assert "translate_creative_canvas_document_write_error" not in public_source
    assert "canvas_store" not in source
    assert "canvas_store" not in application_source
    assert "canvas_store" not in domain_source
    assert "canvas_store" not in errors_source
    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_canvas_preset_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "presets.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "canvas_presets.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_presets.py"
    )
    projection_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_projections.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    preset_tests = REPO_ROOT / "tests" / "test_api_freezone_canvas_from_preset.py"
    route_source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    projection_adapter_source = projection_adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    test_source = preset_tests.read_text(encoding="utf-8")

    endpoint_path = '"/projects/{project}/freezone/canvases:from-preset"'
    assert route_source.count(endpoint_path) == 1
    assert endpoint_path not in legacy_source
    for legacy_implementation in (
        "async def create_canvas_from_preset(",
        "def _latest_preset_canvas(",
        "def _canonical_preset_canvas(",
        "def _preset_key_from_canvas_metadata(",
        "PresetCanvasRequest",
    ):
        assert legacy_implementation not in legacy_source

    assert "creative_canvas.create_router()" in api_router_source
    assert route_source.count("creative_canvas_preset_use_cases().create(") == 1
    assert "class CreativeCanvasPresetUseCases" in application_source
    assert "class LocalCreativeCanvasPresetBuilder" in adapter_source
    assert "class LocalCreativeCanvasPresetGateway" in adapter_source
    assert "return LocalCreativeCanvasPresetBuilder()" in composition_source
    assert "return LocalCreativeCanvasPresetGateway()" in composition_source
    assert "def creative_canvas_preset_use_cases(" in public_source
    assert "self._preset_builder.build(" in projection_adapter_source
    for duplicated_builder_detail in (
        "make_sqlite_store_for_context",
        "build_episode_preset_context",
        "build_beat_preset_context",
        "build_asset_preset_context",
        "build_canvas_payload_from_context",
    ):
        assert duplicated_builder_detail not in projection_adapter_source
    for route_implementation_detail in (
        "canvas_store",
        "preset_key_for_request",
        "canvas_id_for_preset",
        "build_canvas_payload_from_context",
        "save_canvas",
        "record_creative_canvas_event",
    ):
        assert route_implementation_detail not in route_source

    assert "ai_anime.api.routes.freezone" not in test_source
    assert "canvas.preset_refresh.conflict" in application_source
    assert "canvas.preset_emitted" in adapter_source
    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_canvas_commit_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "commits.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    legacy_slots = PACKAGE_ROOT / "freezone" / "slots.py"
    slot_contracts = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "slot_targets.py"
    )
    slot_storage = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "infrastructure" / "slots.py"
    )
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "canvas_commits.py"
    )
    domain = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "canvas_commits.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_commits.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    route_source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")
    slot_contracts_source = slot_contracts.read_text(encoding="utf-8")
    slot_storage_source = slot_storage.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    domain_source = domain.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    impact_path = '"/projects/{project}/freezone/impact"'
    push_path = '"/projects/{project}/freezone/push"'
    assert route_source.count(impact_path) == 1
    assert route_source.count(push_path) == 1
    assert impact_path not in legacy_source
    assert push_path not in legacy_source
    for legacy_implementation in (
        "async def freezone_impact(",
        "async def freezone_push(",
        "def _copy_skill_output_to_slot(",
        "def _copy_image_matching_existing_target(",
        "async def _persist_freezone_selected_background_scene_ref(",
        "TAG_FREEZONE_COMMIT",
    ):
        assert legacy_implementation not in legacy_source
    assert not legacy_slots.exists()
    assert slot_contracts.exists()
    assert slot_storage.exists()

    assert "creative_canvas.create_router()" in api_router_source
    assert route_source.count("creative_canvas_slot_commit_use_cases().impact(") == 1
    assert route_source.count("creative_canvas_slot_commit_use_cases().commit(") == 1
    skill_run_source = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "application" / "skill_runs.py"
    ).read_text(encoding="utf-8")
    assert skill_run_source.count("self._slot_commits.copy(") == 1
    assert "class CreativeCanvasSlotCommitUseCases" in application_source
    assert "canvas.push_committed" in application_source
    assert "def compute_creative_canvas_slot_impact(" in domain_source
    assert "def creative_canvas_slot_asset_key(" in domain_source
    assert "class LocalCreativeCanvasSlotCommitGateway" in adapter_source
    assert adapter_source.count("def _copy_image_matching_existing_target(") == 1
    assert "LocalCreativeCanvasSlotCommitGateway()" in composition_source
    assert "def creative_canvas_slot_commit_use_cases(" in public_source
    assert "SlotTarget as SlotTarget" in public_source
    for route_implementation_detail in (
        "resolve_static_url_to_path",
        "slot_target_path",
        "backup_slot_if_exists",
        "record_stale_marks",
        "shutil",
    ):
        assert route_implementation_detail not in route_source

    assert "from fastapi" not in slot_contracts_source
    assert "from fastapi" not in slot_storage_source
    assert "ai_anime.api" not in slot_contracts_source
    assert "ai_anime.api" not in slot_storage_source
    assert "ai_anime.freezone" not in slot_contracts_source
    assert "ai_anime.freezone" not in slot_storage_source
    assert "fastapi" not in domain_source
    assert "pydantic" not in domain_source
    assert "ai_anime.api" not in domain_source
    assert "ai_anime.freezone" not in domain_source
    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_canvas_asset_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "assets.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "canvas_assets.py"
    )
    domain = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "canvas_assets.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_assets.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    route_source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    domain_source = domain.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    for endpoint_path in (
        '"/projects/{project}/freezone/assets"',
        '"/projects/{project}/freezone/assets/beat-context"',
        '"/projects/{project}/freezone/assets/identities"',
        '"/projects/{project}/freezone/director-capture"',
        '"/projects/{project}/freezone/director-capture/sync-background"',
        '"/projects/{project}/freezone/scene-assets-for-beat"',
    ):
        assert route_source.count(endpoint_path) == 1
        assert endpoint_path not in legacy_source
    for legacy_implementation in (
        "DIRECTOR_CAPTURE_FILES",
        "def _freezone_director_control_frames_dir(",
        "def _freezone_director_capture_base(",
        "def _director_capture_file_payload(",
        "async def _beat_for_capture(",
        "def _sync_env_only_to_selected_background(",
        "async def freezone_director_capture_manifest(",
        "async def freezone_director_capture_sync_background(",
        "async def freezone_scene_assets_for_beat(",
        "async def list_freezone_assets(",
        "async def list_freezone_beat_context_assets(",
        "async def freezone_create_identity_asset(",
        "def _asset_record_from_path(",
        "def _asset_record_from_optional_project_path(",
        "def _character_asset_history_links(",
        "def _compact_mainline_context(",
        "def _slot_target_for_asset_record(",
        "def _mainline_context_for_asset_record(",
        "def _director_control_bundle_from_combined_ref(",
        "def _beat_context_asset_from_ref(",
        "def _is_freezone_scene_library_role(",
    ):
        assert legacy_implementation not in legacy_source

    assert "creative_canvas.create_router()" in api_router_source
    assert route_source.count("creative_canvas_asset_use_cases().") == 5
    assert "class ListCreativeCanvasAssetsQuery" in application_source
    assert "class ListCreativeCanvasBeatContextAssetsQuery" in application_source
    assert "class InvalidCreativeCanvasBeatContextQuery" in application_source
    assert "class CreativeCanvasAssetCatalogGateway" in application_source
    assert "class CreativeCanvasAssetUseCases" in application_source
    assert "class CreativeCanvasBeatSceneSource" in application_source
    assert "class CreativeCanvasDirectorCaptureStorage" in application_source
    assert "class CreativeCanvasDirectorStageLinkBuilder" in application_source
    assert "class LocalCreativeCanvasAssetCatalogGateway" in adapter_source
    assert "class LocalCreativeCanvasAssetRecordFactory" in adapter_source
    assert "async def list_beat_context_assets(" in adapter_source
    assert 'getattr(store, "_episodes"' not in adapter_source
    assert "class LocalCreativeCanvasBeatSceneSource" in adapter_source
    assert "class LocalCreativeCanvasDirectorCaptureStorage" in adapter_source
    assert "class LocalCreativeCanvasDirectorStageLinkBuilder" in adapter_source
    assert "LocalCreativeCanvasBeatSceneSource()" in composition_source
    assert "LocalCreativeCanvasDirectorCaptureStorage()" in composition_source
    assert "LocalCreativeCanvasDirectorStageLinkBuilder()" in composition_source
    assert "LocalCreativeCanvasAssetCatalogGateway()" in composition_source
    assert "def creative_canvas_asset_use_cases(" in public_source
    assert "ListCreativeCanvasAssetsQuery" in public_source
    assert "ListCreativeCanvasBeatContextAssetsQuery" in public_source
    assert "InvalidCreativeCanvasBeatContextQuery" in public_source
    assert "character_identity_use_cases().import_asset(" in route_source
    assert "def project_creative_canvas_asset_record(" in domain_source
    assert "def project_creative_canvas_beat_context_asset(" in domain_source
    for route_implementation_detail in (
        "DirectorWorldService",
        "make_sqlite_store_for_context",
        "canonical_beat_director_env_only_path",
        "canonical_beat_selected_background_path",
        "canonical_scene_master_path",
        "canonical_scene_reverse_master_path",
        "build_beat_preset_context",
        "migrate_canvas_static_urls_in_memory",
        "project_creative_canvas_beat_context_asset",
        "get_beats_as_dicts",
        'getattr(store, "_episodes"',
        "resolve_static_url_to_path",
        "CharacterIdentity(",
        "add_character_identity(",
        "from PIL import Image",
        "shutil",
        "os.utime",
    ):
        assert route_implementation_detail not in route_source

    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source
    assert "fastapi" not in domain_source
    assert "pydantic" not in domain_source
    assert "ai_anime.api" not in domain_source
    assert "ai_anime.freezone" not in domain_source


def test_freezone_canvas_projection_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "projections.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "canvas_projections.py"
    )
    domain = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "domain"
        / "canvas_projections.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_projections.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    projection_tests = REPO_ROOT / "tests" / "test_freezone_projection_merge.py"
    route_source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    domain_source = domain.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    test_source = projection_tests.read_text(encoding="utf-8")

    endpoint_paths = (
        '"/projects/{project}/freezone/projections:build-from-preset"',
        '"/projects/{project}/freezone/canvases/{canvas_id}/projections:from-preset"',
        '"/projects/{project}/freezone/canvases/{canvas_id}/projections:remove"',
        '"/projects/{project}/freezone/canvases/{canvas_id}/projections:status"',
    )
    for endpoint_path in endpoint_paths:
        assert route_source.count(endpoint_path) == 1
        assert endpoint_path not in legacy_source
    for legacy_handler in (
        "async def build_projection_from_preset(",
        "async def project_canvas_from_preset(",
        "async def remove_canvas_projection(",
        "async def projection_status(",
        "async def _build_projection_payload_for_request(",
        "async def _build_canvas_payload_for_preset_request(",
    ):
        assert legacy_handler not in legacy_source

    assert "creative_canvas.create_router()" in api_router_source
    assert route_source.count("creative_canvas_projection_use_cases().") == 4
    assert "class CreativeCanvasProjectionUseCases" in application_source
    assert "class LocalCreativeCanvasProjectionGateway" in adapter_source
    assert (
        "LocalCreativeCanvasProjectionGateway(creative_canvas_preset_builder())"
        in composition_source
    )
    assert "def creative_canvas_projection_use_cases(" in public_source

    for rule in (
        "default_push_target_for_preset",
        "merge_projected_preset_canvas",
        "preset_facts_signature",
        "preset_facts_signature_from_payload",
        "projection_facts_signature_from_payload",
        "projection_group_label",
        "remove_projected_preset_canvas",
        "stamp_preset_facts_signature",
        "stamp_projection_key",
        "stamp_projection_metadata",
        "wrap_projection_payload_in_group",
    ):
        assert domain_source.count(f"def {rule}(") == 1
        assert rule in public_source
    for legacy_implementation in (
        "def _node_projection_key(",
        "def _edge_projection_key(",
        "def _is_replaceable_projection_node(",
        "def _is_replaceable_projection_edge(",
        "def _archive_projection_node(",
        "def _user_owned_projection_node(",
        "def _merge_projected_preset_canvas(",
        "def _remove_projected_preset_canvas(",
        "def _projection_group_id(",
        "def _node_display_size(",
        "def _wrap_projection_payload_in_group(",
        "_PRESET_FACTS_SIGNATURE_OMIT_KEYS",
        "def _canonical_preset_facts_value(",
        "def _preset_facts_signature(",
        "def _stamp_preset_facts_signature(",
        "def _stamp_projection_key(",
        "def _projection_group_label(",
        "def _stamp_projection_metadata(",
        "def _projection_facts_signature_from_payload(",
        "def _preset_facts_signature_from_payload(",
        "def _default_push_target_for_preset(",
    ):
        assert legacy_implementation not in legacy_source

    for implementation_detail in (
        "canvas_store",
        "preset_key_for_request",
        "build_canvas_payload_from_context",
        "merge_projected_preset_canvas",
        "remove_projected_preset_canvas",
        "stamp_projection_metadata",
    ):
        assert implementation_detail not in route_source
    assert "ai_anime.api.routes.freezone" not in test_source
    assert "ai_anime.modules.creative_canvas.public" in test_source
    assert "fastapi" not in domain_source
    assert "ai_anime.api" not in domain_source
    assert "ai_anime.freezone" not in domain_source
    assert "canvas_store" not in domain_source
    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "ai_anime.freezone" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_canvas_events_delegate_to_application() -> None:
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    preset_route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "presets.py"
    projection_route = (
        PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "projections.py"
    )
    domain = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "canvas_events.py"
    )
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "canvas_events.py"
    )
    projection_application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "canvas_projections.py"
    )
    projection_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_projections.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "canvas_events.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    legacy_source = _removed_freezone_route_source(legacy_route)
    preset_route_source = preset_route.read_text(encoding="utf-8")
    projection_route_source = projection_route.read_text(encoding="utf-8")
    domain_source = domain.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    projection_application_source = projection_application.read_text(encoding="utf-8")
    projection_adapter_source = projection_adapter.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    skill_route_source = (
        PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "skills.py"
    ).read_text(encoding="utf-8")
    skill_run_source = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "application" / "skill_runs.py"
    ).read_text(encoding="utf-8")
    assert "skill.run_requested" in skill_run_source
    assert "skill.run_completed" in skill_run_source
    assert "skill.output_committed" in skill_run_source
    for event_type in (
        "canvas.projection_refresh.conflict",
        "canvas.projection_remove.conflict",
    ):
        assert event_type in projection_application_source
    for event_type in (
        "canvas.projection_emitted",
        "canvas.projection_removed",
    ):
        assert event_type in projection_adapter_source
    assert skill_route_source.count("canvas_event_actor(user)") == 2
    assert preset_route_source.count("canvas_event_actor(user)") == 1
    assert projection_route_source.count("canvas_event_actor(user)") == 2
    for legacy_implementation in (
        "CANVAS_EVENT_SCHEMA_VERSION",
        "def _canvas_events_dir(",
        "def _canvas_event_log_path(",
        "def _canvas_event_actor(",
        "def _append_canvas_event(",
        'freezone_root(project_dir) / "_canvas_events"',
    ):
        assert legacy_implementation not in legacy_source

    assert "class CreativeCanvasEventActor" in domain_source
    assert "def canvas_event_actor(" in domain_source
    assert "class CreativeCanvasEventRecorder" in application_source
    assert "class LocalCreativeCanvasEventWriter" in adapter_source
    assert "LocalCreativeCanvasEventWriter()" in composition_source
    assert "def record_creative_canvas_event(" in public_source
    assert "fastapi" not in domain_source
    assert "ai_anime.freezone" not in domain_source
    assert "fastapi" not in application_source
    assert "ai_anime.api" not in application_source
    assert "fastapi" not in adapter_source
    assert "ai_anime.api" not in adapter_source


def test_freezone_text_processing_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "text.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "text_processing.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "text_sources.py"
    )
    domain = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "text_generation.py"
    )
    generation_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "text_generation.py"
    )
    composition = PACKAGE_ROOT / "modules" / "creative_canvas" / "composition.py"
    public = PACKAGE_ROOT / "modules" / "creative_canvas" / "public.py"
    runner = TASK_RUNNERS_ROOT / "freezone.py"
    schemas = PACKAGE_ROOT / "api" / "routes/creative_canvas/text_schemas.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")
    application_source = application.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")
    domain_source = domain.read_text(encoding="utf-8")
    generation_adapter_source = generation_adapter.read_text(encoding="utf-8")
    composition_source = composition.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    runner_source = runner.read_text(encoding="utf-8")
    schemas_source = schemas.read_text(encoding="utf-8")

    endpoint_paths = (
        '"/projects/{project}/freezone/text/translate"',
        '"/projects/{project}/freezone/text/story-script"',
    )
    for endpoint_path in endpoint_paths:
        assert source.count(endpoint_path) == 1
        assert endpoint_path not in legacy_source

    assert source.count("creative_canvas_text_processing_use_cases().") == 2
    assert "StartCreativeCanvasTextTranslationCommand" in source
    assert "StartCreativeCanvasStoryScriptCommand" in source
    assert "creative_canvas.create_router()" in api_router_source
    for legacy_handler in (
        "async def freezone_text_translate(",
        "async def freezone_story_script_generate(",
        "def _start_freezone_text_translate_task(",
        "def _start_freezone_story_script_task(",
        "def _read_freezone_text_file(",
        "def _freezone_history_preview(",
        "def _record_freezone_node_history(",
    ):
        assert legacy_handler not in legacy_source
    for legacy_schema in (
        "FreezoneTextTranslateRequest",
        "FreezoneStoryScriptGenerateRequest",
        "TAG_FREEZONE_TEXT",
    ):
        assert legacy_schema not in legacy_source
    for implementation_detail in (
        "get_task_backend",
        "resolve_static_url_to_path",
        "asyncio.create_task",
        "translate_freezone_text",
        "generate_freezone_story_script",
    ):
        assert implementation_detail not in source

    assert not LEGACY_FREEZONE_TEXT_NODE.exists()
    for layered_source in (
        application_source,
        adapter_source,
        domain_source,
        generation_adapter_source,
    ):
        assert "fastapi" not in layered_source
        assert "ai_anime.api" not in layered_source
    assert "ai_anime.freezone" not in application_source
    assert "pydantic" not in domain_source
    assert "class _CreativeCanvasTranslationResult" in generation_adapter_source
    assert "class _CreativeCanvasStoryScriptResult" in generation_adapter_source
    assert "return response.output.model_dump()" in generation_adapter_source
    assert '("utf-8", "utf-8-sig", "gb18030")' in adapter_source
    assert "translate_runtime_errors=False" in composition_source
    for stable_entry in (
        "translate_creative_canvas_text",
        "generate_creative_canvas_story_script",
    ):
        assert f"def {stable_entry}(" in composition_source
        assert f"def {stable_entry}(" in public_source
    assert "ai_anime.modules.creative_canvas.public" in _imports(runner)
    assert "translate_freezone_text" not in runner_source
    assert "generate_freezone_story_script" not in runner_source
    for removed_schema in (
        "FreezoneTextTranslateData",
        "FreezoneTextTranslateResponse",
        "FreezoneStoryScriptRow",
        "FreezoneStoryScriptGenerateData",
        "FreezoneStoryScriptGenerateResponse",
    ):
        assert f"class {removed_schema}" not in schemas_source
    assert (
        runner_source.count(
            'register_project_task_runner("freezone_text_translate", '
            "run_freezone_text_translate)"
        )
        == 1
    )
    assert (
        runner_source.count(
            'register_project_task_runner("freezone_story_script", '
            "run_freezone_story_script)"
        )
        == 1
    )


def test_freezone_image_to_three_gs_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "image.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    runner = TASK_RUNNERS_ROOT / "stage_asset.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    runner_source = runner.read_text(encoding="utf-8")

    endpoint_path = '"/projects/{project}/freezone/image-to-3gs"'
    assert source.count(endpoint_path) == 1
    assert endpoint_path not in legacy_source
    assert source.count("creative_canvas_image_to_three_gs_use_cases().start(") == 1
    assert "StartCreativeCanvasImageToThreeGsCommand" in source
    assert "async def freezone_image_to_3gs(" not in legacy_source
    assert "def _start_or_enqueue_freezone_image_to_3gs(" not in legacy_source
    assert "def _infer_image_to_3gs_scene_id(" not in legacy_source
    assert "FreezoneImageTo3GSRequest" not in legacy_source
    assert (
        'register_project_task_runner("freezone_image_to_3gs", '
        "run_freezone_image_to_3gs)" in runner_source
    )
    for implementation_detail in (
        "get_task_backend",
        "project_task_state_key",
        "resolve_static_url_to_path",
        "_infer_image_to_3gs_scene_id",
    ):
        assert implementation_detail not in source


def test_freezone_image_editing_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "image.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    prompt_rules = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "domain"
        / "image_editing_prompts.py"
    )
    runner = TASK_RUNNERS_ROOT / "freezone.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    prompt_rule_source = prompt_rules.read_text(encoding="utf-8")
    runner_source = runner.read_text(encoding="utf-8")

    endpoint_paths = (
        '"/projects/{project}/freezone/multi-view"',
        '"/projects/{project}/freezone/relight"',
        '"/projects/{project}/freezone/template-edit"',
        '"/projects/{project}/freezone/edit"',
        '"/projects/{project}/freezone/upscale"',
        '"/projects/{project}/freezone/outpaint"',
        '"/projects/{project}/freezone/redraw"',
    )
    for endpoint_path in endpoint_paths:
        assert source.count(endpoint_path) == 1
        assert endpoint_path not in legacy_source

    assert source.count("creative_canvas_image_editing_use_cases().start(") == 1
    assert source.count("return await _start_image_editing(") == 3
    assert (
        source.count(
            "creative_canvas_reference_image_editing_use_cases().start_reference_edit("
        )
        == 1
    )
    assert source.count("return await _start_reference_image_editing(") == 4
    assert "StartCreativeCanvasImageEditingCommand" in source
    assert "StartCreativeCanvasReferenceImageEditingCommand" in source
    for legacy_handler in (
        "async def freezone_multi_view(",
        "async def freezone_relight(",
        "async def freezone_template_edit(",
        "async def freezone_edit(",
        "async def _start_or_enqueue_freezone_edit_job(",
        "async def freezone_upscale(",
        "async def freezone_outpaint(",
        "async def freezone_redraw(",
        "def _start_or_enqueue_freezone_edit_path(",
        "def _start_or_enqueue_freezone_mask_edit_path(",
    ):
        assert legacy_handler not in legacy_source
    for legacy_schema in (
        "FreezoneCharacterMultiViewRequest",
        "FreezoneEditRequest",
        "FreezoneRelightRequest",
        "FreezoneTemplateEditRequest",
        "FreezoneUpscaleRequest",
        "FreezoneOutpaintRequest",
        "FreezoneRedrawRequest",
    ):
        assert legacy_schema not in legacy_source
    assert "_build_upscale_prompt" not in legacy_source
    assert (
        runner_source.count(
            'register_project_task_runner("freezone_edit", run_freezone_edit)'
        )
        == 1
    )
    assert (
        'register_project_task_runner("freezone_mask_edit", run_freezone_mask_edit)'
        in runner_source
    )
    for legacy_module in (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "application"
        / "image_upscale.py",
        PACKAGE_ROOT / "modules" / "creative_canvas" / "domain" / "image_upscale.py",
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "image_upscale.py",
    ):
        assert not legacy_module.exists()
    for implementation_detail in (
        "get_task_backend",
        "project_task_state_key",
        "resolve_static_url_to_path",
        "_resolve_outpaint_aspect_ratio",
        "_split_provider_and_model",
        "_resolve_freezone_image_provider",
    ):
        assert implementation_detail not in source
    assert "fastapi" not in prompt_rule_source
    assert "ai_anime.api" not in prompt_rule_source


def test_freezone_image_generation_route_and_skill_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "image.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    model_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "image_generation.py"
    )
    runner = TASK_RUNNERS_ROOT / "freezone.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    skill_run_source = (
        PACKAGE_ROOT / "modules" / "creative_canvas" / "application" / "skill_runs.py"
    ).read_text(encoding="utf-8")
    model_adapter_source = model_adapter.read_text(encoding="utf-8")
    runner_source = runner.read_text(encoding="utf-8")

    endpoint_path = '"/projects/{project}/freezone/gen"'
    assert source.count(endpoint_path) == 1
    assert endpoint_path not in legacy_source
    assert source.count("creative_canvas_image_generation_use_cases().start(") == 1
    assert skill_run_source.count("self._image_generation.start(") == 1
    assert "StartCreativeCanvasImageGenerationCommand" in source
    assert "StartCreativeCanvasImageGenerationCommand" in skill_run_source
    assert "async def freezone_gen(" not in legacy_source
    assert "def _start_or_enqueue_freezone_gen_job(" not in legacy_source
    assert "FreezoneGenRequest" not in legacy_source
    assert (
        'register_project_task_runner("freezone_gen", run_freezone_gen)'
        in runner_source
    )
    assert "resolve_image_provider" not in model_adapter_source
    assert "SUPPORTED_CREATIVE_CANVAS_IMAGE_PROVIDERS" not in model_adapter_source
    assert "fastapi" not in model_adapter_source
    for implementation_detail in (
        "get_task_backend",
        "project_task_state_key",
        "resolve_static_url_to_path",
        "_resolve_url_list",
        "_split_provider_and_model",
        "_resolve_freezone_image_provider",
    ):
        assert implementation_detail not in source


def test_freezone_bootstrap_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "bootstrap.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")

    assert source.count("creative_canvas_bootstrap_use_cases().initialize(") == 1
    assert "InitializeCreativeCanvasCommand" in source
    assert "creative_canvas.create_router()" in api_router_source
    assert "async def init_freezone(" not in legacy_source
    assert "def _canvas_actor_id(" not in legacy_source
    assert "TAG_FREEZONE_BOOTSTRAP" not in legacy_source
    assert "canvases_dir" not in legacy_source
    for implementation_detail in (
        "canvas_store",
        "CanvasLockBusy",
        "freezone_root",
        "uploads_dir",
        "canvases_dir",
        "ensure_default_canvas",
    ):
        assert implementation_detail not in source


def test_freezone_media_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "media.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    api_router = PACKAGE_ROOT / "api" / "v1" / "router.py"
    source = route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    api_router_source = api_router.read_text(encoding="utf-8")

    assert source.count("creative_canvas_media_use_cases().") == 2
    assert "StoreCreativeCanvasUploadCommand" in source
    assert "SaveCreativeCanvasScreenshotCommand" in source
    assert "creative_canvas.create_router()" in api_router_source
    assert "async def freezone_upload(" not in legacy_source
    assert "async def freezone_three_d_viewer_screenshot(" not in legacy_source
    assert "TAG_FREEZONE_MEDIA" not in legacy_source
    assert "FreezoneThreeDViewerScreenshotRequest" not in legacy_source
    assert "safe_upload_filename" not in legacy_source
    for implementation_detail in (
        "base64",
        "binascii",
        "write_bytes",
        "output_path_for_job",
        "safe_upload_filename",
        "uploads_dir",
        "project_static_url",
    ):
        assert implementation_detail not in source


def test_production_sketch_edit_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "sketch.py"
    source = route.read_text(encoding="utf-8")

    assert not (PACKAGE_ROOT / "services" / "sketch_pose_service.py").exists()
    assert "ai_anime.modules.production.public" in _imports(route)
    assert source.count("sketch_editing_use_cases().") == 4
    assert "SketchEditorQuery" in source
    assert "SaveSketchEditorCommand" in source
    assert "SketchCropSourceQuery" in source
    assert "CropCurrentSketchCommand" in source
    for handler_name in (
        "get_sketch_pose_editor",
        "save_sketch_pose_editor",
        "get_sketch_crop_source",
        "crop_current_sketch",
    ):
        assert f"async def {handler_name}(" in source
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
        assert legacy_implementation not in source


def test_production_image_settings_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "settings.py"
    source = route.read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert "production_image_settings_use_cases" in source
    assert "production.create_router()" in api_router_source
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
        assert f"async def {handler_name}(" in source
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
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "settings.py"
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
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "settings.py"
    source = route.read_text(encoding="utf-8")
    route_start = source.index("async def get_sketch_image_usage(")
    route_source = source[route_start:]

    assert "image_generation_usage_use_cases" in route_source
    assert "ImageGenerationGuardQuery" in route_source
    assert "def _image_generation_guard_payload(" not in source
    assert "def get_image_scope_warning(" not in (
        PACKAGE_ROOT
        / "modules"
        / "model_usage"
        / "infrastructure"
        / "image_request_usage.py"
    ).read_text(encoding="utf-8")
    for implementation_detail in (
        "get_image_usage_summary",
        "count_image_scope_attempts",
        "get_prompt_export_password",
        "ai_anime.image_request_usage",
        "ai_anime.modules.production.infrastructure.operator_auth",
    ):
        assert implementation_detail not in route_source


def test_production_episode_video_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "video.py"
    source = route.read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("episode_video_use_cases().") == 2
    assert "ComposeEpisodeVideoCommand" in source
    assert "EpisodeBeatsMissing" in source
    assert "production.create_router()" in api_router_source
    for handler_name in ("compose_video", "get_final_video"):
        assert f"async def {handler_name}(" in source
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
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "export.py"
    source = route.read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("episode_export_use_cases().") == 3
    assert "production.create_router()" in api_router_source
    for handler_name in ("export_srt", "export_final_video", "export_zip"):
        assert f"async def {handler_name}(" in source
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
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "audio.py"
    source = route.read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("episode_audio_use_cases().") == 3
    assert "GenerateEpisodeAudioCommand" in source
    assert "production.create_router()" in api_router_source
    for handler_name in (
        "audio_generation_plan",
        "generate_audio",
        "regenerate_beat_audio",
    ):
        assert f"async def {handler_name}(" in source
    for removed_handler in ("generate_tts", "preview_tts", "list_tts_voices"):
        assert f"async def {removed_handler}(" not in source
    for removed_path in ("/tts/generate", "/tts/preview", "/tts/voices"):
        assert removed_path not in source
    assert "def _collect_audio_prereq_errors(" not in source
    assert "def _voice_prereq_error_response(" not in source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "get_task_backend",
        "enqueue_project_task",
        "project_task_state_key",
        "collect_episode_audio_prereq_errors",
        "音频生成需要 project context",
    ):
        assert implementation_detail not in source


def test_production_video_pool_routes_and_runner_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "pool.py"
    video_runner = TASK_RUNNERS_ROOT / "video.py"
    legacy_indexer = PACKAGE_ROOT / "generators" / "video_pool_indexer.py"
    models = PACKAGE_ROOT / "models.py"
    source = route.read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )
    runner_source = video_runner.read_text(encoding="utf-8")

    assert source.count("video_pool_use_cases().") == 3
    assert "VideoPoolEntryUnavailable" in source
    assert "VideoPoolEntryInUse" in source
    assert "production.create_router()" in api_router_source
    for handler_name in (
        "list_video_pool",
        "select_video_pool",
        "delete_video_pool_entry",
    ):
        assert f"async def {handler_name}(" in source
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
    assert "class VideoPoolEntry(" not in _removed_models_source(models)


def test_production_grid_pool_routes_delegate_to_application() -> None:
    pool_route = PACKAGE_ROOT / "api" / "routes" / "production" / "pool.py"
    pool_source = pool_route.read_text(encoding="utf-8")
    route_start = pool_source.index("async def list_grids(")
    route_source = pool_source[route_start:]

    assert route_source.count("grid_pool_use_cases") == 11
    assert "SelectGridPoolImageCommand" in route_source
    assert "DeleteGridPoolImageCommand" in route_source
    assert "GridPoolDeleteRejected" in route_source
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
        "delete_pool_image",
        "upload_beat_sketch",
        "upload_beat_render",
        "upload_grid",
        "export_grid_prompt",
        "sketch_grid_preview",
        "cut_grid",
    ):
        assert f"async def {handler_name}(" in pool_source
    assert route_source.count("GridPoolUploadRejected") == 3
    assert route_source.count("GridPoolPromptRejected") == 1
    assert route_source.count("GridPoolPreviewRejected") == 1
    assert route_source.count("GridPoolCutRejected") == 1
    assert "def _register_uploaded_pool_image(" not in pool_source
    assert "def _uploaded_grid_filename(" not in pool_source
    assert "def _safe_grid_token(" not in pool_source
    assert "def _safe_grids_file(" not in pool_source
    assert "def _find_pool_grid_entry(" not in pool_source
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


def test_production_grid_pool_persistence_models_have_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    pool_models = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "grid_pool_models.py"
    )
    pool_indexer = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "media_generation"
        / "pool_indexer.py"
    )
    legacy_source = _removed_models_source(legacy_models)
    pool_source = pool_models.read_text(encoding="utf-8")

    for model_name in ("GridEntry", "PoolImage", "PoolIndex"):
        assert f"class {model_name}(" not in legacy_source
        assert f"class {model_name}(BaseModel):" in pool_source
    assert "ai_anime.modules.production.infrastructure.grid_pool_models" in _imports(
        pool_indexer
    )


def test_legacy_models_module_is_removed() -> None:
    assert not (PACKAGE_ROOT / "models.py").exists()


def test_narrative_planning_script_models_have_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    script_models = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "application"
        / "script_models.py"
    )
    public = PACKAGE_ROOT / "modules" / "narrative_planning" / "public.py"
    literal_writer = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "application"
        / "literal_script_writing.py"
    )
    prompt_generators = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "beat_prompt_generators.py"
    )
    legacy_source = _removed_models_source(legacy_models)
    model_source = script_models.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    for model_name in ("NarrationScript", "VisualBeat"):
        assert f"class {model_name}(" not in legacy_source
        assert f"class {model_name}(BaseModel):" in model_source
        assert f'"{model_name}"' in public_source
    assert "def format_beat_narration(" not in legacy_source
    assert "def format_beat_narration(" in model_source
    assert '"format_beat_narration"' in public_source
    assert "ai_anime.modules.narrative_planning.application.script_models" in _imports(
        literal_writer
    )
    assert "ai_anime.modules.narrative_planning.application.script_models" in _imports(
        prompt_generators
    )


def test_narrative_planning_event_model_has_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    event_models = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "application"
        / "episode_planning_models.py"
    )
    public = PACKAGE_ROOT / "modules" / "narrative_planning" / "public.py"
    cognee_store = (
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "store.py"
    )
    event_extractor = (
        PACKAGE_ROOT
        / "modules"
        / "knowledge_graph"
        / "infrastructure"
        / "event_extractor.py"
    )
    cognee_pipeline = (
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "pipeline.py"
    )
    cognee_package = PACKAGE_ROOT / "modules" / "knowledge_graph" / "__init__.py"

    assert "class NovelEvent(" not in _removed_models_source(legacy_models)
    assert "class NovelEvent(BaseModel):" in event_models.read_text(encoding="utf-8")
    assert '"NovelEvent"' in public.read_text(encoding="utf-8")
    for caller in (cognee_store, event_extractor):
        assert "ai_anime.modules.narrative_planning.public" in _imports(caller)
    for facade in (cognee_pipeline, cognee_package):
        assert "NovelEvent" not in facade.read_text(encoding="utf-8")


def test_narrative_planning_episode_model_has_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    episode_models = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "application"
        / "episode_planning_models.py"
    )
    public = PACKAGE_ROOT / "modules" / "narrative_planning" / "public.py"
    sqlite_repository = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "sqlite_narrative.py"
    )
    cognee_pipeline = (
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "pipeline.py"
    )
    cognee_package = PACKAGE_ROOT / "modules" / "knowledge_graph" / "__init__.py"
    internal_callers = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "episode_planner_agent.py",
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "identity_planner_agent.py",
    )
    external_callers = (
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "store.py",
        cognee_pipeline,
    )

    assert "class NovelEpisode(" not in _removed_models_source(legacy_models)
    assert "class NovelEpisode(BaseModel):" in episode_models.read_text(
        encoding="utf-8"
    )
    assert '"NovelEpisode"' in public.read_text(encoding="utf-8")
    for caller in internal_callers:
        assert (
            "ai_anime.modules.narrative_planning.application.episode_planning_models"
            in _imports(caller)
        )
    for caller in external_callers:
        assert "ai_anime.modules.narrative_planning.public" in _imports(caller)
    assert (
        "ai_anime.modules.narrative_planning.application.episode_planning_models"
        in _imports(sqlite_repository)
    )
    assert "NovelEpisode" not in cognee_package.read_text(encoding="utf-8")
    assert "NovelEpisode as _NovelEpisode" in cognee_pipeline.read_text(
        encoding="utf-8"
    )


def test_narrative_planning_episode_asset_menus_have_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    episode_models = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "application"
        / "episode_planning_models.py"
    )
    public = PACKAGE_ROOT / "modules" / "narrative_planning" / "public.py"
    legacy_source = _removed_models_source(legacy_models)
    owner_source = episode_models.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")
    callers = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "asset_compiler_agent.py",
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "store.py",
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "preset_contexts.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "media_generation"
        / "image_grid.py",
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "prop_catalog.py",
        PACKAGE_ROOT / "shared" / "utils" / "asset_resolver.py",
    )

    for model_name in ("SceneMenuItem", "PropMenuItem"):
        assert f"class {model_name}(" not in legacy_source
        assert f"class {model_name}(BaseModel):" in owner_source
        assert f'"{model_name}"' in public_source
    for function_name in ("build_scene_menu", "build_prop_menu"):
        assert f"def {function_name}(" not in legacy_source
        assert f"def {function_name}(" in owner_source
        assert f'"{function_name}"' in public_source
    for caller in callers:
        assert "ai_anime.modules.narrative_planning.public" in _imports(caller)


def test_narrative_planning_persisted_beat_models_have_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    beat_models = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "application"
        / "beat_models.py"
    )
    public = PACKAGE_ROOT / "modules" / "narrative_planning" / "public.py"
    sqlite_repository = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "sqlite_narrative.py"
    )
    cognee_package = PACKAGE_ROOT / "modules" / "knowledge_graph" / "__init__.py"
    internal_callers = tuple(
        PACKAGE_ROOT / "modules" / "narrative_planning" / "application" / name
        for name in (
            "beat_video_prompts.py",
            "literal_script_writing.py",
            "manual_beats.py",
            "script_documents.py",
            "script_models.py",
            "video_prompt_optimization.py",
        )
    )
    external_callers = (
        PACKAGE_ROOT / "api" / "routes/narrative_planning/episodes_schemas.py",
        PACKAGE_ROOT / "api" / "routes/narrative_planning/scripts_schemas.py",
        PACKAGE_ROOT / "api" / "routes" / "asset_world" / "assets.py",
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "pipeline.py",
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "store.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "media_generation"
        / "image_grid.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "media_generation"
        / "prompt_components.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "video_prompt_composer.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "video_reference_assets.py",
    )
    legacy_source = _removed_models_source(legacy_models)
    owner_source = beat_models.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    for model_name in ("NovelVisualBeat", "SceneRef"):
        assert f"class {model_name}(" not in legacy_source
        assert f"class {model_name}(BaseModel):" in owner_source
        assert f'"{model_name}"' in public_source
    for function_name in (
        "beat_scene_id",
        "beat_scene_ref",
        "build_scene_ref",
        "sync_beat_asset_refs",
    ):
        assert f"def {function_name}(" not in legacy_source
        assert f"def {function_name}(" in owner_source
        assert f'"{function_name}"' in public_source
    assert "ai_anime.models" not in _imports(beat_models)
    for caller in internal_callers:
        assert (
            "ai_anime.modules.narrative_planning.application.beat_models"
            in _imports(caller)
        )
    assert "ai_anime.modules.narrative_planning.application.beat_models" in _imports(
        public
    )
    assert "NovelVisualBeat" not in cognee_package.read_text(encoding="utf-8")
    for caller in external_callers:
        assert "ai_anime.modules.narrative_planning.public" in _imports(caller)
    assert "ai_anime.modules.narrative_planning.application.beat_models" in _imports(
        sqlite_repository
    )


def test_asset_world_style_config_has_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    style_models = (
        PACKAGE_ROOT / "modules" / "asset_world" / "application" / "style_models.py"
    )
    style_catalog = (
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "style_catalog.py"
    )
    public = PACKAGE_ROOT / "modules" / "asset_world" / "public.py"

    assert "class StyleConfig(" not in _removed_models_source(legacy_models)
    assert "class StyleConfig(BaseModel):" in style_models.read_text(encoding="utf-8")
    assert "ai_anime.modules.asset_world.application.style_models" in _imports(
        style_catalog
    )
    assert "ai_anime.modules.asset_world.application.style_models" in _imports(public)
    assert '"StyleConfig"' in public.read_text(encoding="utf-8")


def test_asset_world_character_models_have_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    character_models = (
        PACKAGE_ROOT / "modules" / "asset_world" / "application" / "character_models.py"
    )
    character_catalog = (
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "character_catalog.py"
    )
    character_identity = (
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "character_identity.py"
    )
    sqlite_repository = (
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "sqlite_assets.py"
    )
    public = PACKAGE_ROOT / "modules" / "asset_world" / "public.py"
    cognee_package = PACKAGE_ROOT / "modules" / "knowledge_graph" / "__init__.py"
    cognee_pipeline = (
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "pipeline.py"
    )
    external_callers = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "identity_planner_agent.py",
        cognee_pipeline,
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "store.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "video_reference_assets.py",
    )
    owner_source = character_models.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert not _removed_models_source(legacy_models)
    for model_name in ("CharacterIdentity", "NovelCharacter"):
        assert f"class {model_name}(BaseModel):" in owner_source
        assert f'"{model_name}"' in public_source
    for caller in (character_catalog, character_identity, sqlite_repository):
        assert "ai_anime.modules.asset_world.application.character_models" in _imports(
            caller
        )
    assert "ai_anime.modules.asset_world.application.character_models" in _imports(
        public
    )
    for caller in external_callers:
        assert "ai_anime.modules.asset_world.public" in _imports(caller)
    assert "NovelCharacter" not in cognee_package.read_text(encoding="utf-8")
    pipeline_source = cognee_pipeline.read_text(encoding="utf-8")
    assert "NovelCharacter as _NovelCharacter" in pipeline_source
    assert "CharacterIdentity" not in pipeline_source

    legacy_importers = [
        _relative(path)
        for path in _python_files(PACKAGE_ROOT)
        if "ai_anime.models" in _imports(path)
    ]
    assert not legacy_importers


def test_asset_world_prop_model_has_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    prop_models = (
        PACKAGE_ROOT / "modules" / "asset_world" / "application" / "prop_models.py"
    )
    prop_catalog = (
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "prop_catalog.py"
    )
    public = PACKAGE_ROOT / "modules" / "asset_world" / "public.py"
    sqlite_repository = (
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "sqlite_assets.py"
    )
    cognee_package = PACKAGE_ROOT / "modules" / "knowledge_graph" / "__init__.py"
    callers = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "asset_compiler_agent.py",
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "pipeline.py",
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "store.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "video_reference_assets.py",
    )

    assert "class NovelProp(" not in _removed_models_source(legacy_models)
    assert "class NovelProp(BaseModel):" in prop_models.read_text(encoding="utf-8")
    assert "ai_anime.modules.asset_world.application.prop_models" in _imports(
        prop_catalog
    )
    assert "ai_anime.modules.asset_world.application.prop_models" in _imports(
        sqlite_repository
    )
    assert "ai_anime.modules.asset_world.application.prop_models" in _imports(public)
    assert '"NovelProp"' in public.read_text(encoding="utf-8")
    assert "NovelProp" not in cognee_package.read_text(encoding="utf-8")
    for caller in callers:
        assert "ai_anime.modules.asset_world.public" in _imports(caller)


def test_asset_world_scene_model_has_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    scene_models = (
        PACKAGE_ROOT / "modules" / "asset_world" / "application" / "scene_models.py"
    )
    scene_catalog = (
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "scene_catalog.py"
    )
    scene_viewer = (
        PACKAGE_ROOT / "modules" / "asset_world" / "application" / "scene_viewer.py"
    )
    public = PACKAGE_ROOT / "modules" / "asset_world" / "public.py"
    sqlite_repository = (
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "sqlite_assets.py"
    )
    cognee_package = PACKAGE_ROOT / "modules" / "knowledge_graph" / "__init__.py"
    callers = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "asset_compiler_agent.py",
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "pipeline.py",
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "store.py",
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "preset_contexts.py",
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "preset_payload.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "media_generation"
        / "scene_reference_images.py",
        PACKAGE_ROOT / "shared" / "utils" / "asset_resolver.py",
    )
    legacy_source = _removed_models_source(legacy_models)
    owner_source = scene_models.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    assert "class NovelScene(" not in legacy_source
    assert "def build_scene_effective_prompt(" not in legacy_source
    assert "class NovelScene(BaseModel):" in owner_source
    assert "def build_scene_effective_prompt(" in owner_source
    for function_name in (
        "resolve_scene_plate",
        "resolve_scene_plate_from_records",
        "resolve_scene_record_name",
    ):
        assert f"def {function_name}(" not in legacy_source
        assert f"def {function_name}(" in owner_source
        assert f'"{function_name}"' in public_source
    assert "ai_anime.modules.asset_world.application.scene_models" in _imports(
        scene_catalog
    )
    assert "ai_anime.modules.asset_world.application.scene_models" in _imports(
        scene_viewer
    )
    assert "ai_anime.modules.asset_world.application.scene_models" in _imports(
        sqlite_repository
    )
    assert "ai_anime.modules.asset_world.application.scene_models" in _imports(public)
    for symbol in ("NovelScene", "build_scene_effective_prompt"):
        assert f'"{symbol}"' in public_source
    assert "NovelScene" not in cognee_package.read_text(encoding="utf-8")
    for caller in callers:
        assert "ai_anime.modules.asset_world.public" in _imports(caller)


def test_production_detected_refs_have_one_owner() -> None:
    legacy_models = PACKAGE_ROOT / "models.py"
    owner = PACKAGE_ROOT / "modules" / "production" / "domain" / "detected_refs.py"
    public = PACKAGE_ROOT / "modules" / "production" / "public.py"
    sqlite_repository = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "sqlite_narrative.py"
    )
    internal_callers = (
        PACKAGE_ROOT / "modules" / "production" / "domain" / "sketch_color.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "domain"
        / "sketch_marker_detection.py",
        PACKAGE_ROOT / "modules" / "production" / "infrastructure" / "sketch_pose.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "media_generation"
        / "prompt_components.py",
    )
    external_callers = (
        PACKAGE_ROOT / "api" / "routes" / "asset_world" / "assets.py",
        PACKAGE_ROOT / "modules" / "knowledge_graph" / "infrastructure" / "store.py",
        sqlite_repository,
        PACKAGE_ROOT / "modules" / "asset_world" / "application" / "scene_viewer.py",
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "application"
        / "literal_script_writing.py",
    )
    constants = ("NO_CHARACTER_MARKER", "NO_PROP_MARKER")
    functions = (
        "collect_prop_marker_ids_from_beat",
        "complete_detected_refs_from_visual_description",
        "extract_char_identities_from_markers",
        "extract_prop_ids_from_markers",
        "normalize_detected_identities",
        "normalize_detected_props",
        "real_detected_identities",
        "real_detected_props",
    )
    legacy_source = _removed_models_source(legacy_models)
    owner_source = owner.read_text(encoding="utf-8")
    public_source = public.read_text(encoding="utf-8")

    for constant in constants:
        assert f"{constant} =" not in legacy_source
        assert f"{constant} =" in owner_source
        assert f'"{constant}"' in public_source
    for function_name in functions:
        assert f"def {function_name}(" not in legacy_source
        assert f"def {function_name}(" in owner_source
        assert f'"{function_name}"' in public_source
    for helper_name in ("_dedupe_non_empty", "_extract_identity_marker_ids"):
        assert f"def {helper_name}(" not in legacy_source
        assert f"def {helper_name}(" in owner_source

    for caller in internal_callers:
        assert "ai_anime.modules.production.domain.detected_refs" in _imports(caller)
    for caller in external_callers:
        assert "ai_anime.modules.production.public" in _imports(caller)

    legacy_imports: list[str] = []
    target_names = set(constants + functions)
    for path in _python_files(PACKAGE_ROOT):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom) or node.module != "ai_anime.models":
                continue
            imported = target_names.intersection(alias.name for alias in node.names)
            if imported:
                legacy_imports.append(
                    f"{_relative(path)}: {', '.join(sorted(imported))}"
                )
    assert not legacy_imports, "\n".join(legacy_imports)


def test_video_reference_capability_is_owned_by_production() -> None:
    production = PACKAGE_ROOT / "modules" / "production"
    retired = PACKAGE_ROOT / "modules" / "seedance2_i2v"
    owners = (
        production / "application" / "video_config.py",
        production / "domain" / "video_dialogue.py",
        production / "infrastructure" / "video_reference_assets.py",
        production / "infrastructure" / "video_reference_panel_service.py",
        production / "infrastructure" / "video_reference_pipeline.py",
        production / "infrastructure" / "video_prompt_composer.py",
        production / "infrastructure" / "video_reference_voice.py",
        production / "infrastructure" / "video_voice_records.py",
        production / "infrastructure" / "video_reference_voice_references.py",
        production / "infrastructure" / "episode_audio_generation.py",
    )
    public_source = (production / "public.py").read_text(encoding="utf-8")

    assert not list(retired.rglob("*.py"))
    assert all(path.is_file() for path in owners)
    for export in (
        "VideoReferenceMode",
        "generate_video_prompt_for_panel",
        "prepare_video_reference_generation_inputs",
        "run_episode_audio_generation",
    ):
        assert f'"{export}"' in public_source


def test_agent_implementations_are_owned_by_business_contexts() -> None:
    modules = PACKAGE_ROOT / "modules"
    legacy = modules / "agents"
    narrative = modules / "narrative_planning"
    production = modules / "production"
    owners = (
        narrative / "infrastructure" / "asset_compiler_agent.py",
        narrative / "infrastructure" / "content_rewriter_agent.py",
        narrative / "infrastructure" / "episode_planner_agent.py",
        narrative / "infrastructure" / "identity_planner_agent.py",
        narrative / "infrastructure" / "keyframe_prompt_builder.py",
        production / "infrastructure" / "global_video_optimizer.py",
    )
    narrative_public = (narrative / "public.py").read_text(encoding="utf-8")
    production_public = (production / "public.py").read_text(encoding="utf-8")

    assert not list(legacy.rglob("*.py"))
    assert all(path.is_file() for path in owners)
    for export in ("AssetCompiler", "EpisodePlannerAgent", "IdentityPlanner"):
        assert f'"{export}"' in narrative_public
    for export in (
        "build_color_appearance_map",
        "get_global_video_optimizer",
        "prepare_global_optimizer_input",
    ):
        assert f'"{export}"' in production_public


def test_production_video_models_use_the_commercial_catalog_contract() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "video.py"
    video_schemas = PACKAGE_ROOT / "api" / "routes/production/video_schemas.py"
    video_runner = TASK_RUNNERS_ROOT / "video.py"
    reference_pipeline = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "video_reference_pipeline.py"
    )
    source = route.read_text(encoding="utf-8")

    assert "video_backend" not in source
    assert "video_backend_catalog" not in source
    assert "resolve_video_generation_route" in source
    assert "video_model=video_model" in source
    video_schema_source = video_schemas.read_text(encoding="utf-8")
    assert "class SingleVideoRequest(" in video_schema_source
    assert "model: Optional[str] = None" in video_schema_source
    assert "backend" not in video_schema_source.lower()
    model_specific_names = ("seedance", "happyhorse", "grok", "huimeng")
    for path in (video_runner, reference_pipeline):
        lowered = path.read_text(encoding="utf-8").lower()
        assert not [name for name in model_specific_names if name in lowered]
    for legacy_module in (
        PACKAGE_ROOT / "modules" / "production" / "domain" / "video_backend.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "application"
        / "video_backend_catalog.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "video_backend_catalog.py",
    ):
        assert not legacy_module.exists()


def test_business_layers_do_not_hardcode_provider_or_model_names() -> None:
    roots = (
        PACKAGE_ROOT / "modules" / "production",
        PACKAGE_ROOT / "modules" / "narrative_planning",
        PACKAGE_ROOT / "modules" / "asset_world",
        PACKAGE_ROOT / "modules" / "creative_canvas",
        PACKAGE_ROOT / "modules" / "verification",
        REPO_ROOT / "frontend" / "src" / "modules" / "production",
        REPO_ROOT / "frontend" / "src" / "modules" / "narrative_planning",
        REPO_ROOT / "frontend" / "src" / "modules" / "asset_world",
        REPO_ROOT / "frontend" / "src" / "modules" / "creative_canvas",
    )
    forbidden = (
        ("seedance", re.compile(r"seedance", re.IGNORECASE)),
        ("seedream", re.compile(r"seedream", re.IGNORECASE)),
        ("nanobanana", re.compile(r"nano[-_ ]?banana", re.IGNORECASE)),
        ("indextts", re.compile(r"index[-_ ]?tts", re.IGNORECASE)),
        ("happyhorse", re.compile(r"happy[-_ ]?horse", re.IGNORECASE)),
        ("huimeng", re.compile(r"huimeng", re.IGNORECASE)),
        ("doubao", re.compile(r"doubao", re.IGNORECASE)),
        ("minimax", re.compile(r"MiniMax|minimax")),
        ("elevenlabs", re.compile(r"eleven[-_ ]?labs", re.IGNORECASE)),
        ("fish-audio", re.compile(r"fish[-_ ]?audio", re.IGNORECASE)),
        ("fish-voice-id", re.compile(r"fish[-_ ]?voice[-_ ]?id", re.IGNORECASE)),
        ("gemini", re.compile(r"Gemini|gemini")),
        ("anthropic", re.compile(r"anthropic", re.IGNORECASE)),
        ("openai", re.compile(r"OpenAI|OpenAi|openai")),
        ("qwen", re.compile(r"qwen", re.IGNORECASE)),
        ("deepseek", re.compile(r"deep[-_ ]?seek", re.IGNORECASE)),
        ("kling", re.compile(r"kling", re.IGNORECASE)),
        ("hailuo", re.compile(r"hailuo", re.IGNORECASE)),
        ("runway", re.compile(r"runway", re.IGNORECASE)),
        ("wan2", re.compile(r"wan2", re.IGNORECASE)),
        ("ltx2", re.compile(r"ltx2", re.IGNORECASE)),
        ("sora", re.compile(r"sora", re.IGNORECASE)),
        ("grok", re.compile(r"grok", re.IGNORECASE)),
        ("fal", re.compile(r"\bfal(?:\.ai|[-_])", re.IGNORECASE)),
        ("volcengine", re.compile(r"volcengine", re.IGNORECASE)),
        ("byteplus", re.compile(r"byteplus", re.IGNORECASE)),
        ("newapi", re.compile(r"new[-_ ]?api", re.IGNORECASE)),
        ("replicate", re.compile(r"\breplicate\b", re.IGNORECASE)),
        ("stability-ai", re.compile(r"stability[-_ ]?ai", re.IGNORECASE)),
        ("midjourney", re.compile(r"midjourney", re.IGNORECASE)),
        ("ideogram", re.compile(r"ideogram", re.IGNORECASE)),
    )
    violations: list[str] = []
    for root in roots:
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in {".py", ".ts", ".tsx"}:
                continue
            if "tests" in path.parts or "__tests__" in path.parts or ".test." in path.name:
                continue
            source = path.read_text(encoding="utf-8")
            matches = [name for name, pattern in forbidden if pattern.search(source)]
            if matches:
                violations.append(
                    f"{path.relative_to(REPO_ROOT).as_posix()}: {', '.join(matches)}"
                )

    assert not violations, "\n".join(violations)


def test_service_runtime_uses_logging_instead_of_bare_print() -> None:
    stdout_entrypoints = {
        "desktop_server.py",
        "migrations/verification/global_shared.py",
        "migrations/verification/seed_mirror_once.py",
        "modules/asset_world/infrastructure/director_world/block_world_builder.py",
        "modules/asset_world/infrastructure/director_world/control_frame_to_sketch.py",
        "modules/asset_world/infrastructure/director_world/pano_sharp.py",
        "modules/asset_world/infrastructure/director_world/scene_360_builder.py",
        "modules/asset_world/infrastructure/director_world/scene_overlap_analyzer.py",
        "modules/asset_world/infrastructure/director_world/scene_spatial_contract.py",
        "modules/asset_world/infrastructure/director_world/staging_prop_ai.py",
        "modules/backup/infrastructure/files_sync.py",
        "modules/backup/infrastructure/sqlite_snapshots.py",
    }
    violations: list[str] = []
    for path in _python_files(PACKAGE_ROOT):
        relative = _relative(path)
        if relative in stdout_entrypoints or relative.startswith(
            "modules/verification/presentation/cli/"
        ):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "print"
            ):
                violations.append(f"{relative}:{node.lineno}")

    assert not violations, "\n".join(violations)


def test_production_global_video_optimization_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "video.py"
    video_runner = TASK_RUNNERS_ROOT / "video.py"
    source = route.read_text(encoding="utf-8")

    assert "global_video_optimization_use_cases" in source
    assert "OptimizeEpisodeVideoCommand" in source
    assert "async def global_optimize_video(" in source
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
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "sketch.py"
    sketch_runner = TASK_RUNNERS_ROOT / "sketch.py"
    source = route.read_text(encoding="utf-8")
    handler_source = _function_source(route, "generate_sketches")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("sketch_generation_use_cases().") == 1
    assert "GenerateSketchesCommand" in handler_source
    assert "production.create_router()" in api_router_source
    assert "async def generate_sketches(" in handler_source
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
        assert implementation_detail not in handler_source
    runner_source = sketch_runner.read_text(encoding="utf-8")
    assert "SKETCH_GENERATION_TASK_TYPE" in runner_source


def test_production_director_control_sketch_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "sketch.py"
    freezone = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    sketch_runner = TASK_RUNNERS_ROOT / "sketch.py"
    source = route.read_text(encoding="utf-8")

    assert source.count("director_control_sketch_use_cases().") == 1
    assert "GenerateDirectorControlSketchCommand" in source
    assert "async def director_control_to_sketch(" in source
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
        assert implementation_detail not in source
    assert "_start_or_enqueue_mainline_direct_sketch_task" not in (
        _removed_freezone_route_source(freezone)
    )
    runner_source = sketch_runner.read_text(encoding="utf-8")
    assert "DIRECTOR_CONTROL_TO_SKETCH_TASK_KIND" in runner_source


def test_production_selected_regeneration_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "render.py"
    render_runner = TASK_RUNNERS_ROOT / "render.py"
    source = route.read_text(encoding="utf-8")

    assert source.count("selected_regeneration_use_cases().") == 2
    assert source.count("RegenerateSelectedBeatsCommand(") == 2
    assert "SelectedRegenerationKind.RENDER" in source
    assert "SelectedRegenerationKind.SKETCH" in source
    for handler_name in ("regenerate_beats", "regenerate_sketches"):
        assert f"async def {handler_name}(" in source
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
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "sketch.py"
    source = route.read_text(encoding="utf-8")
    handler_source = _function_source(route, "generate_missing_manual_sketches")

    assert source.count("manual_sketch_regeneration_use_cases().") == 1
    assert "GenerateMissingManualSketchesCommand" in handler_source
    assert "ManualSketchRegenerationRejected" in handler_source
    assert "async def generate_missing_manual_sketches(" in handler_source
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
        assert implementation_detail not in handler_source


def test_production_grid_regeneration_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "render.py"
    render_runner = TASK_RUNNERS_ROOT / "render.py"
    source = route.read_text(encoding="utf-8")

    assert source.count("grid_regeneration_use_cases().") == 1
    assert "RegenerateGridCommand" in source
    assert "async def regenerate_grid(" in source
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
    assert "GRID_REGENERATION_TASK_TYPE" in render_runner.read_text(encoding="utf-8")


def test_production_render_plan_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "render.py"
    schemas = PACKAGE_ROOT / "api" / "routes/production/render_schemas.py"
    render_plan_package = PACKAGE_ROOT / "render_plan"
    source = route.read_text(encoding="utf-8")
    api_router_source = (PACKAGE_ROOT / "api" / "v1" / "router.py").read_text(
        encoding="utf-8"
    )

    assert source.count("render_plan_use_cases()") == 2
    assert "BuildRenderPlanCommand" in source
    assert "ExecuteRenderPlanCommand" in source
    assert "RenderPlanGrid" in source
    assert "production.create_router()" in api_router_source
    for handler_name in ("render_plan", "render_execute"):
        assert f"async def {handler_name}(" in source
    for helper_name in (
        "_render_plan_unavailable_response",
        "_render_plan_rejection_response",
    ):
        assert f"def {helper_name}(" in source
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


def test_production_video_reference_panel_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "video.py"
    source = route.read_text(encoding="utf-8")

    assert source.count("video_reference_panel_use_cases().") == 5
    assert "async def get_video_reference_status(" in source
    for legacy_helper in (
        "_asset_status_payload",
        "_returned_last_frame_status_payload",
        "_video_reference_voice_status_payload",
        "_video_reference_panel_context",
        "_seedance2_status_response",
    ):
        assert legacy_helper not in source
    for implementation_detail in (
        "make_sqlite_store_for_context",
        "make_sqlite_store(",
        "panel_service",
        "PathResolver",
        "build_video_reference_panel_state",
        "parse_video_config",
        "dialogue_voice_reference_rows",
        "resolve_narrator_reference_status",
        "make_project_static_url",
    ):
        assert implementation_detail not in source


def test_production_single_video_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "video.py"
    video_runner = TASK_RUNNERS_ROOT / "video.py"
    source = route.read_text(encoding="utf-8")

    assert source.count("single_video_use_cases") == 2
    assert "GenerateSingleVideoCommand" in source
    assert "async def generate_single_video(" in source
    for legacy_helper in (
        "_validate_seedance_pro_dialogue_only",
        "_initial_video_prompt",
        "_legacy_video_prompt_for_mode",
        "_missing_video_prompt_error",
        "SEEDANCE2_SINGLE_VIDEO_CONFIG_FIELDS",
        "_seedance2_request_config_overrides",
        "_merge_video_reference_request_config",
        "_api_audio_duration_seconds",
        "_prepare_video_reference_api_beat",
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
        "prepare_video_reference_generation_inputs",
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
    freezone = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    mainline_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "mainline_generation.py"
    )
    asset_world_source = ASSET_WORLD_VIEWER_ROUTE.read_text(encoding="utf-8")
    freezone_source = _removed_freezone_route_source(freezone)
    mainline_adapter_source = mainline_adapter.read_text(encoding="utf-8")

    assert "production_generation_context_use_cases" not in asset_world_source
    assert "production_generation_context_use_cases" not in freezone_source
    assert "production_generation_context_use_cases" in mainline_adapter_source
    for legacy_helper in (
        "def _build_character_map(",
        "def _episode_from_store_or_none(",
    ):
        assert legacy_helper not in asset_world_source
        assert legacy_helper not in freezone_source


def test_production_sketch_color_rules_have_one_owner() -> None:
    image_grid = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "media_generation"
        / "image_grid.py"
    )
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "sketch.py"
    callers = {
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "preset_contexts.py": "global_prop_marker_colors",
        PACKAGE_ROOT / "modules" / "asset_world" / "composition.py": (
            "BRIDGMAN_CHARACTER_PALETTE"
        ),
    }

    assert not (PACKAGE_ROOT / "generators" / "episode_optimizer.py").exists()
    assert "def _global_prop_marker_colors(" not in image_grid.read_text(
        encoding="utf-8"
    )
    assert "def _color_assignment_requires_full_sketch_clean(" not in (
        route.read_text(encoding="utf-8")
    )
    assert "global_prop_marker_colors" in image_grid.read_text(encoding="utf-8")
    assert "ai_anime.modules.production.domain.sketch_color" in _imports(image_grid)
    assert "ai_anime.modules.production.public" not in _imports(image_grid)
    for path, public_name in callers.items():
        source = path.read_text(encoding="utf-8")
        assert public_name in source
        assert "ai_anime.modules.production.public" in _imports(path)
        assert "ai_anime.modules.generators.episode_optimizer" not in _imports(path)
    script_runner_source = (TASK_RUNNERS_ROOT / "script.py").read_text(encoding="utf-8")
    assert "assign_identity_sketch_colors" not in script_runner_source
    assert "clean_sketches" not in script_runner_source
    generation_context = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "application"
        / "generation_context.py"
    ).read_text(encoding="utf-8")
    assert "assign_complete_episode_identity_colors" in generation_context


def test_production_sketch_color_assignment_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "sketch.py"
    source = route.read_text(encoding="utf-8")

    assert source.count("sketch_marker_use_cases().assign_colors") == 1
    assert "AssignProjectSketchColorsCommand" in source
    assert "SketchEpisodeBeatsMissing" in source
    assert "SketchColorMarkersMissing" in source
    assert "async def assign_sketch_colors(" in source
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
        assert implementation_detail not in source


def test_production_sketch_marker_detection_route_delegates_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "production" / "sketch.py"
    production_public = PACKAGE_ROOT / "modules" / "production" / "public.py"
    models = PACKAGE_ROOT / "models.py"
    domain = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "domain"
        / "sketch_marker_detection.py"
    )
    source = route.read_text(encoding="utf-8")

    assert source.count("sketch_marker_detection_task_use_cases().schedule") == 1
    assert "ScheduleSketchMarkerDetectionCommand" in source
    assert "async def detect_sketch_identities(" in source
    assert "sketch_marker_detection_use_cases" not in source
    assert "def _requester_user_id_for_billing(" not in source
    public_source = production_public.read_text(encoding="utf-8")
    assert "def sketch_color_assignment_use_cases(" not in public_source
    assert "def sketch_marker_detection_use_cases(" not in public_source
    assert "split_detected_marker_keys" not in _removed_models_source(models)
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
        assert implementation_detail not in source


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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "styles.py"
    imported_modules = _imports(route)
    source = route.read_text(encoding="utf-8")

    assert "ai_anime.modules.asset_world.public" in imported_modules
    assert not {
        imported
        for imported in imported_modules
        if imported.startswith("ai_anime.modules.generators")
        or imported == "ai_anime.models"
        or imported == "ai_anime.shared.ports"
    }
    assert "StyleService" not in source
    assert "generate_character_reference_unified" not in source
    assert "StyleAnalyzer" not in source
    assert "get_usage_meter" not in source
    assert "tempfile" not in source


def test_asset_world_character_voice_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "characters.py"
    runner = TASK_RUNNERS_ROOT / "character_voice.py"
    source = route.read_text(encoding="utf-8")
    runner_source = runner.read_text(encoding="utf-8")

    assert "character_voice_use_cases" in source
    assert source.count("schedule_voice_design(") == 1
    assert "provision_missing_character_voices" not in source
    assert "provision_missing_character_voices" in runner_source
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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "characters.py"
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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "props.py"
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
        PACKAGE_ROOT / "api" / "routes" / "narrative_planning" / "episodes.py",
        TASK_RUNNERS_ROOT / "episode_assets.py",
    )

    assert not (PACKAGE_ROOT / "services" / "prop_promotion_service.py").exists()
    route_source = callers[0].read_text(encoding="utf-8")
    runner_source = callers[1].read_text(encoding="utf-8")
    assert "promote_episode_props_to_global" not in route_source
    assert "start_episode_asset_planning" in route_source
    assert "promote_episode_props_to_global" in runner_source
    assert "ai_anime.modules.asset_world.public" in _imports(callers[1])
    assert "ai_anime.services.prop_promotion_service" not in route_source
    assert "ai_anime.services.prop_promotion_service" not in runner_source


def test_runtime_prop_menu_uses_one_asset_world_implementation() -> None:
    route = ASSET_WORLD_VIEWER_ROUTE
    beat_viewer = (
        PACKAGE_ROOT / "modules" / "asset_world" / "application" / "beat_viewer.py"
    )
    beat_viewer_adapter = (
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "beat_viewer.py"
    )
    freezone_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    mainline_adapter = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "mainline_generation.py"
    )
    preset_contexts = (
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "preset_contexts.py"
    )
    route_source = route.read_text(encoding="utf-8")
    beat_viewer_source = beat_viewer.read_text(encoding="utf-8")
    beat_viewer_adapter_source = beat_viewer_adapter.read_text(encoding="utf-8")
    freezone_source = _removed_freezone_route_source(freezone_route)
    mainline_adapter_source = mainline_adapter.read_text(encoding="utf-8")
    presets_source = preset_contexts.read_text(encoding="utf-8")

    assert not (PACKAGE_ROOT / "services" / "prop_ref_service.py").exists()
    assert "ai_anime.modules.asset_world.public" in _imports(route)
    assert "runtime_prop_menu_for_episode" not in route_source
    assert "BeatViewerRuntimePropMenuSource" in beat_viewer_source
    assert "runtime_episode_prop_menu" in beat_viewer_adapter_source
    assert "runtime_prop_menu_for_episode" not in freezone_source
    assert "runtime_prop_menu_for_episode" in mainline_adapter_source
    assert "_runtime_prop_menu_with_global_props," not in freezone_source
    assert "runtime_prop_menu_with_cached_global_props" in presets_source
    assert "ai_anime.services.prop_ref_service" not in presets_source


def test_character_reference_map_uses_one_asset_world_implementation() -> None:
    callers = (
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "generation_context.py",
        PACKAGE_ROOT
        / "modules"
        / "production"
        / "infrastructure"
        / "global_video_optimizer.py",
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "director_world"
        / "control_frame_to_sketch.py",
        PACKAGE_ROOT
        / "modules"
        / "creative_canvas"
        / "infrastructure"
        / "preset_payload.py",
    )

    assert not (PACKAGE_ROOT / "services" / "character_ref_service.py").exists()
    for path in callers:
        source = path.read_text(encoding="utf-8")
        assert "build_character_map_for_grid" in source
        if "director_world" in path.parts:
            assert "ai_anime.modules.asset_world.composition" in _imports(path)
        else:
            assert "ai_anime.modules.asset_world.public" in _imports(path)
        assert "ai_anime.services.character_ref_service" not in source


def test_removed_character_auto_promotion_service_does_not_return() -> None:
    planner = (
        PACKAGE_ROOT
        / "modules"
        / "narrative_planning"
        / "infrastructure"
        / "identity_planner_agent.py"
    )
    source = planner.read_text(encoding="utf-8")

    assert not (PACKAGE_ROOT / "services" / "character_promotion_service.py").exists()
    assert "promote_scene_characters_to_global" not in source
    assert "ai_anime.services.character_promotion_service" not in source


def test_asset_world_prop_task_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "props.py"
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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "scenes.py"
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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "scenes.py"
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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "scenes.py"
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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "scenes.py"
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
    beat_viewer_source = ASSET_WORLD_VIEWER_ROUTE.read_text(encoding="utf-8")
    beat_viewer_tree = ast.parse(
        beat_viewer_source,
        filename=str(ASSET_WORLD_VIEWER_ROUTE),
    )
    beat_viewer_adapters = "\n".join(
        ast.get_source_segment(beat_viewer_source, node) or ""
        for node in beat_viewer_tree.body
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
    assert "ai_anime.api.viewer_manifests" not in beat_viewer_source


def test_asset_world_beat_director_stage_routes_delegate_to_application() -> None:
    route = ASSET_WORLD_VIEWER_ROUTE
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
        }
    )
    freezone = _removed_freezone_route_source(LEGACY_FREEZONE_ROUTE)
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
        "ai_anime.modules.asset_world.infrastructure.director_world.store",
        "ai_anime.modules.asset_world.infrastructure.director_world.paths",
    ):
        assert legacy_implementation not in source
    assert "def _beat_scene_name(" not in source
    assert "_director_control_scope" not in freezone


def test_asset_world_background_anchor_routes_delegate_to_application() -> None:
    route = ASSET_WORLD_VIEWER_ROUTE
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
    assert not (PACKAGE_ROOT / "services" / "background_anchor_service.py").exists()
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
        name: (PACKAGE_ROOT / "api" / "routes" / "asset_world" / name).read_text(
            encoding="utf-8"
        )
        for name in ("characters.py", "props.py", "scenes.py")
    }
    beat_viewer_route_source = ASSET_WORLD_VIEWER_ROUTE.read_text(encoding="utf-8")
    beat_viewer_adapter = (
        PACKAGE_ROOT / "modules" / "asset_world" / "infrastructure" / "beat_viewer.py"
    ).read_text(encoding="utf-8")
    shared_source = (PACKAGE_ROOT / "shared" / "project_media.py").read_text(
        encoding="utf-8"
    )

    assert shared_source.count("def make_project_asset_url_builder(") == 1
    for source in route_sources.values():
        assert "make_project_asset_url_builder" in source
    assert "make_project_asset_url_builder" in beat_viewer_adapter
    assert "make_project_asset_url_builder" not in beat_viewer_route_source
    for source in route_sources.values():
        assert "def _asset_url(" not in source
    assert "def _viewer_asset_url(" not in beat_viewer_route_source


def test_asset_world_character_identity_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "characters.py"
    canvas_route = PACKAGE_ROOT / "api" / "routes" / "creative_canvas" / "assets.py"
    legacy_route = PACKAGE_ROOT / "api" / "routes" / "freezone.py"
    application = (
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "application"
        / "character_identity.py"
    )
    adapter = (
        PACKAGE_ROOT
        / "modules"
        / "asset_world"
        / "infrastructure"
        / "character_identity.py"
    )
    source = route.read_text(encoding="utf-8")
    canvas_source = canvas_route.read_text(encoding="utf-8")
    legacy_source = _removed_freezone_route_source(legacy_route)
    application_source = application.read_text(encoding="utf-8")
    adapter_source = adapter.read_text(encoding="utf-8")

    assert "character_identity_use_cases" in source
    assert "character_identity_use_cases().import_asset(" in canvas_source
    assert "async def import_asset(" in application_source
    assert "class LocalCharacterIdentityAssetImporter" in adapter_source
    assert '"/projects/{project}/freezone/assets/identities"' not in legacy_source
    for legacy_implementation in (
        "from ai_anime.models import CharacterIdentity",
        "await store.add_character_identity(",
        "await store.delete_character_identity(",
        "characters = store.get_all_characters()",
        "for ident in target.identities",
        "async def freezone_create_identity_asset(",
    ):
        assert legacy_implementation not in source
        assert legacy_implementation not in legacy_source


def test_asset_world_character_asset_history_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "characters.py"
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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "characters.py"
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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "characters.py"
    source = route.read_text(encoding="utf-8")
    props_source = (
        PACKAGE_ROOT / "api" / "routes" / "asset_world" / "props.py"
    ).read_text(encoding="utf-8")
    scenes_source = (
        PACKAGE_ROOT / "api" / "routes" / "asset_world" / "scenes.py"
    ).read_text(encoding="utf-8")

    assert "image_settings_use_cases" in source
    assert source.count("character_generation_options(") == 3
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
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "characters.py"
    source = route.read_text(encoding="utf-8")

    assert "character_task_use_cases" in source
    for legacy_implementation in (
        "get_task_backend",
        "project_task_state_key",
        "enqueue_project_task(",
    ):
        assert legacy_implementation not in source


def test_asset_world_character_generation_routes_delegate_to_application() -> None:
    route = PACKAGE_ROOT / "api" / "routes" / "asset_world" / "characters.py"
    source = route.read_text(encoding="utf-8")

    assert "character_generation_use_cases" not in source
    assert source.count("schedule_character_portrait(") == 1
    assert source.count("schedule_identity_portrait(") == 1
    assert source.count("schedule_identity_image(") == 1
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
    runner = TASK_RUNNERS_ROOT / "character_image.py"
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
    route = PACKAGE_ROOT / "api" / "routes" / "narrative_planning" / "scripts.py"
    imported_modules = _imports(route)
    forbidden_imports = {
        imported
        for imported in imported_modules
        if imported == "ai_anime.shared.ports"
        or imported == "ai_anime.task_identity"
        or imported.startswith("ai_anime.modules.production.infrastructure.seedance2")
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
    route = PACKAGE_ROOT / "api" / "routes" / "narrative_planning" / "episodes.py"
    imported_modules = _imports(route)
    source = route.read_text(encoding="utf-8")

    assert "ai_anime.shared.utils.media_io" not in imported_modules
    assert "ai_anime.shared.project_media" not in imported_modules
    assert "make_static_url_for_context" not in source
    assert "audio_duration_jobs" not in source
