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
    ("freezone/slots.py", "ai_anime.api.deps"): 1,
    ("freezone/text_node.py", "ai_anime.api.schemas"): 1,
    ("task_backend/runners/freezone.py", "ai_anime.api.deps"): 18,
    ("task_backend/runners/script.py", "ai_anime.api.deps"): 1,
    ("task_backend/runners/script.py", "ai_anime.api.routes.scripts"): 1,
    ("task_backend/runners/stage_asset.py", "ai_anime.api.deps"): 2,
    ("task_backend/runners/video.py", "ai_anime.api.deps"): 1,
    ("verification/routes.py", "ai_anime.api.auth"): 1,
    ("verification/routes.py", "ai_anime.api.deps"): 1,
}

LEGACY_ROUTE_IMPORT_MAX = {
    ("api/routes/freezone.py", "ai_anime.api.routes.generation"): 3,
    ("api/routes/projects.py", "ai_anime.api.routes._project_audit"): 1,
}


def _python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)


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
                    failures.append(f"{relative}: domain imports infrastructure package {imported}")
                continue

            target_parts = imported[len(target_prefix) :].split(".")
            target_context = target_parts[0]
            target_layer = target_parts[1] if len(target_parts) > 1 else ""
            if target_context != context:
                public_module = f"ai_anime.modules.{target_context}.public"
                if imported != public_module and not imported.startswith(f"{public_module}."):
                    failures.append(
                        f"{relative}: cross-context import must use {public_module}: {imported}"
                    )
                continue

            if layer == "domain" and target_layer in {"application", "infrastructure"}:
                failures.append(f"{relative}: domain depends on {target_layer}: {imported}")
            elif layer == "application" and target_layer == "infrastructure":
                failures.append(f"{relative}: application depends on infrastructure: {imported}")

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
    lifespan_source = (PACKAGE_ROOT / "api" / "lifespan.py").read_text(
        encoding="utf-8"
    )

    assert "ai_anime.bootstrap" in lifespan_source
    assert "ai_anime.ports.registry" not in lifespan_source
