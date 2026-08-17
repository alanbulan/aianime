from __future__ import annotations

import ast
import re
from pathlib import Path


PLUGIN_PATH = (
    Path(__file__).resolve().parents[2]
    / ".hermes"
    / "plugins"
    / "ai_anime"
    / "__init__.py"
)


def _walk_routes(router, prefix: str = ""):
    for route in router.routes:
        if type(route).__name__ == "_IncludedRouter":
            yield from _walk_routes(
                route.original_router,
                prefix + route.include_context.prefix,
            )
            continue
        path = getattr(route, "path", None)
        if path:
            yield prefix + path, (getattr(route, "methods", None) or set())


def _render_static_string(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        return "".join(
            str(item.value) if isinstance(item, ast.Constant) else "{}"
            for item in node.values
        )
    return None


def _normalize_route(path: str) -> str:
    if path.startswith("/projects/"):
        path = f"/api/v1{path}"
    return re.sub(r"\{[^}]+\}", "{}", path.rstrip("/"))


def test_all_static_hermes_api_calls_match_registered_routes() -> None:
    from ai_anime.api.app import create_app

    registered = {
        (method.upper(), _normalize_route(path))
        for path, methods in _walk_routes(create_app())
        for method in methods
    }
    tree = ast.parse(PLUGIN_PATH.read_text(encoding="utf-8"))
    calls: list[tuple[int, str, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
            continue
        if node.func.id not in {"_request", "_request_multipart_file"}:
            continue
        if len(node.args) < 2:
            continue
        method = _render_static_string(node.args[0])
        path = _render_static_string(node.args[1])
        dynamic_path = ast.unparse(node.args[1])
        if method is None or path is None or "suffix" in dynamic_path:
            continue
        calls.append((node.lineno, method.upper(), _normalize_route(path)))

    missing = [
        (line, method, path)
        for line, method, path in calls
        if (method, path) not in registered
    ]
    assert not missing


def test_all_episode_helper_suffixes_match_registered_routes() -> None:
    from ai_anime.api.app import create_app

    registered = {
        (method.upper(), _normalize_route(path))
        for path, methods in _walk_routes(create_app())
        for method in methods
    }
    tree = ast.parse(PLUGIN_PATH.read_text(encoding="utf-8"))
    suffixes: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
            continue
        if node.func.id != "_episode_post" or len(node.args) < 2:
            continue
        suffix = _render_static_string(node.args[1])
        if suffix is not None:
            suffixes.append((node.lineno, suffix))

    missing = [
        (line, suffix)
        for line, suffix in suffixes
        if (
            "POST",
            _normalize_route(f"/api/v1/projects/{{}}/episodes/{{}}/{suffix}"),
        )
        not in registered
    ]
    assert not missing


def test_script_workflow_exposes_one_canonical_graph_route() -> None:
    from ai_anime.api.app import create_app

    paths = {
        _normalize_route(path)
        for path, _methods in _walk_routes(create_app())
    }

    assert "/api/v1/projects/{}/workflow/scripts" in paths
    assert "/api/v1/projects/{}/episodes/{}/identities/plan" in paths
    assert "/api/v1/projects/{}/episodes/{}/identities/plan-async" not in paths


def test_frontend_and_assistant_share_the_production_workflow_route() -> None:
    from ai_anime.api.app import create_app

    root = Path(__file__).resolve().parents[2]
    plugin = PLUGIN_PATH.read_text(encoding="utf-8")
    frontend_gateway = (
        root
        / "frontend"
        / "src"
        / "modules"
        / "production"
        / "infrastructure"
        / "http-production-video-gateway.ts"
    ).read_text(encoding="utf-8")
    paths = {
        _normalize_route(path)
        for path, _methods in _walk_routes(create_app())
    }

    assert "/api/v1/projects/{}/workflow/production" in paths
    assert "/api/v1/projects/{}/episodes/{}/beats/{}/video" in paths
    assert "/api/v1/projects/{}/episodes/{}/beats/{}/audio" in paths
    assert "/api/v1/projects/{}/episodes/{}/audio/generate" in paths
    assert "/api/v1/projects/{}/episodes/{}/tts/generate" not in paths
    assert "/api/v1/projects/{}/tts/preview" not in paths
    assert "/api/v1/projects/{}/tts/voices" not in paths
    assert "ai_anime_run_production_workflow" in plugin
    assert plugin.count('f"/api/v1/projects/{project}/workflow/production"') == 1
    assert (
        frontend_gateway.count(
            "p`api/v1/projects/${project}/workflow/production`"
        )
        == 1
    )
    assert "video_backend" not in plugin
