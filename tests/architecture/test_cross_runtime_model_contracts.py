"""Cross-runtime model contract drift checks."""

from __future__ import annotations

import ast
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _typescript_string_collection(path: Path, name: str) -> tuple[str, ...]:
    source = path.read_text(encoding="utf-8")
    match = re.search(
        rf"\b{re.escape(name)}\s*=\s*(?:new Set\(\s*)?"
        rf"\[(.*?)\]\s*(?:as const)?\s*\)?\s*;",
        source,
        re.DOTALL,
    )
    assert match is not None, f"missing TypeScript collection {name} in {path}"
    return tuple(re.findall(r'["\']([^"\']+)["\']', match.group(1)))


def _python_frozenset(path: Path, name: str) -> frozenset[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == name for target in node.targets):
            continue
        assert isinstance(node.value, ast.Call) and node.value.args
        return frozenset(ast.literal_eval(node.value.args[0]))
    raise AssertionError(f"missing Python frozenset {name} in {path}")


def _typescript_integer_constant(path: Path, name: str) -> int:
    source = path.read_text(encoding="utf-8")
    match = re.search(rf"\bconst\s+{re.escape(name)}\s*=\s*(\d+)\s*;", source)
    assert match is not None, f"missing TypeScript integer {name} in {path}"
    return int(match.group(1))


def test_model_roles_and_protocols_stay_aligned_across_runtimes() -> None:
    frontend = REPO_ROOT / "frontend" / "src" / "modules" / "model_usage" / "domain"
    frontend_contract = frontend / "commercial-model-access.ts"
    desktop_contract = REPO_ROOT / "desktop" / "src" / "commercial-model-access.ts"
    python_contract = (
        REPO_ROOT
        / "src"
        / "ai_anime"
        / "modules"
        / "model_usage"
        / "infrastructure"
        / "model_access_policy.py"
    )

    frontend_roles = _typescript_string_collection(
        frontend_contract,
        "BYOK_MODEL_ROLES",
    )
    desktop_roles = _typescript_string_collection(
        desktop_contract,
        "BYOK_MODEL_ROLES",
    )
    python_roles = _python_frozenset(python_contract, "MODEL_ROLES")
    assert frontend_roles == desktop_roles
    assert len(frontend_roles) == len(set(frontend_roles))
    assert frozenset(frontend_roles) == python_roles

    assert _typescript_string_collection(
        frontend_contract,
        "BYOK_PROVIDER_PROTOCOLS",
    ) == _typescript_string_collection(desktop_contract, "BYOK_PROVIDER_PROTOCOLS")

    depth_name = "MAX_RUNTIME_PARAMETER_OVERRIDE_DEPTH"
    frontend_depth = _typescript_integer_constant(frontend_contract, depth_name)
    desktop_depth = _typescript_integer_constant(desktop_contract, depth_name)
    assert frontend_depth == desktop_depth == 8


def test_video_core_parameter_names_stay_aligned_across_runtimes() -> None:
    frontend_contract = (
        REPO_ROOT
        / "frontend"
        / "src"
        / "modules"
        / "creative_canvas"
        / "domain"
        / "videoGenerationModel.ts"
    )
    desktop_contract = REPO_ROOT / "desktop" / "src" / "commercial-ipc-support.ts"

    frontend_names = _typescript_string_collection(
        frontend_contract,
        "NON_EXTRA_VIDEO_PARAMETER_KEYS",
    )
    desktop_names = _typescript_string_collection(
        desktop_contract,
        "VIDEO_CORE_PARAMETER_NAMES",
    )
    assert frontend_names == desktop_names
    assert len(frontend_names) == len(set(frontend_names))


def test_image_quality_capability_stays_aligned_across_runtimes() -> None:
    frontend_contract = (
        REPO_ROOT
        / "frontend"
        / "src"
        / "modules"
        / "model_usage"
        / "domain"
        / "generation-credit.ts"
    )
    python_contract = (
        REPO_ROOT
        / "src"
        / "ai_anime"
        / "modules"
        / "model_usage"
        / "domain"
        / "generation_credit.py"
    )
    frontend_ids = frozenset(
        _typescript_string_collection(frontend_contract, "IMAGE_QUALITY_MODEL_IDS")
    )
    python_ids = _python_frozenset(python_contract, "IMAGE_QUALITY_MODEL_IDS")
    assert frontend_ids == python_ids

    overlays = (
        "EraseOverlay.tsx",
        "GridActionConfirmOverlay.tsx",
        "LightEditorPanel.tsx",
        "MultiAngleEditorPanel.tsx",
        "OutpaintEditorOverlay.tsx",
        "RedrawOverlay.tsx",
        "UpscaleEditorOverlay.tsx",
    )
    presentation = (
        REPO_ROOT
        / "frontend"
        / "src"
        / "modules"
        / "creative_canvas"
        / "presentation"
    )
    for name in overlays:
        source = (presentation / name).read_text(encoding="utf-8")
        assert "imageModelSupportsQuality" in source
        assert "function imageModelSupportsQuality" not in source
