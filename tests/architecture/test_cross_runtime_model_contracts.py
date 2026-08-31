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


def _typescript_string_array_record(
    path: Path,
    name: str,
) -> dict[str, tuple[str, ...]]:
    source = path.read_text(encoding="utf-8")
    match = re.search(
        rf"\bconst\s+{re.escape(name)}\s*:.*?=\s*\{{(.*?)^\}};",
        source,
        re.DOTALL | re.MULTILINE,
    )
    assert match is not None, f"missing TypeScript record {name} in {path}"
    entries = re.findall(
        r"^\s*([A-Z0-9_]+):\s*\[(.*?)\],?$",
        match.group(1),
        re.DOTALL | re.MULTILINE,
    )
    assert entries, f"missing TypeScript record entries {name} in {path}"
    return {
        key: tuple(re.findall(r'["\']([^"\']+)["\']', values))
        for key, values in entries
    }


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


def _python_literal_constant(path: Path, name: str):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name
            for target in node.targets
        ):
            return ast.literal_eval(node.value)
        if (
            isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id == name
        ):
            return ast.literal_eval(node.value)
    raise AssertionError(f"missing Python constant {name} in {path}")


def _typescript_integer_constant(path: Path, name: str) -> int:
    source = path.read_text(encoding="utf-8")
    match = re.search(rf"\bconst\s+{re.escape(name)}\s*=\s*(\d+)\s*;", source)
    assert match is not None, f"missing TypeScript integer {name} in {path}"
    return int(match.group(1))


def _typescript_capability_fallback_chain(
    path: Path,
    name: str,
) -> tuple[str, ...]:
    source = path.read_text(encoding="utf-8")
    match = re.search(
        rf"\bconst\s+{re.escape(name)}\s*=\s*(.*?);",
        source,
        re.DOTALL,
    )
    assert match is not None, f"missing TypeScript fallback chain {name} in {path}"
    return tuple(re.findall(r"\bcapabilities\.([A-Za-z0-9_]+)", match.group(1)))


def _typescript_function_body(path: Path, name: str) -> str:
    source = path.read_text(encoding="utf-8")
    match = re.search(
        rf"\bexport\s+function\s+{re.escape(name)}\s*\([^)]*\)"
        rf"\s*:\s*[^{{]+\{{(.*?)^\}}",
        source,
        re.DOTALL | re.MULTILINE,
    )
    assert match is not None, f"missing TypeScript function {name} in {path}"
    return re.sub(r"\s+", " ", match.group(1)).strip()


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


def test_model_selector_validation_stays_aligned_across_runtimes() -> None:
    python_contract = (
        REPO_ROOT
        / "src"
        / "ai_anime"
        / "modules"
        / "ai_assistant"
        / "domain"
        / "model_selector.py"
    )
    hermes_runtime = (
        REPO_ROOT / "desktop" / "hermes-runtime" / "ai_anime_acp_runtime.py"
    )
    desktop_contract = (
        REPO_ROOT / "desktop" / "src" / "commercial-model-proxy-http.ts"
    )
    schema = (
        REPO_ROOT
        / "src"
        / "ai_anime"
        / "api"
        / "routes"
        / "ai_assistant"
        / "schemas.py"
    )
    codec = (
        REPO_ROOT
        / "src"
        / "ai_anime"
        / "modules"
        / "ai_assistant"
        / "infrastructure"
        / "hermes"
        / "model_route.py"
    )

    expected_length = _python_literal_constant(
        python_contract, "MODEL_SELECTOR_MAX_LENGTH"
    )
    expected_prefixes = _python_literal_constant(
        python_contract, "MODEL_SELECTOR_PREFIXES"
    )
    assert expected_length == 768
    assert expected_prefixes == ("cloud:", "byok:")
    assert _python_literal_constant(
        hermes_runtime, "_MODEL_SELECTOR_MAX_LENGTH"
    ) == expected_length
    assert _python_literal_constant(
        hermes_runtime, "_MODEL_SELECTOR_PREFIXES"
    ) == expected_prefixes
    assert _typescript_integer_constant(
        desktop_contract, "MODEL_SELECTOR_MAX_LENGTH"
    ) == expected_length
    assert _typescript_string_collection(
        desktop_contract, "MODEL_SELECTOR_PREFIXES"
    ) == expected_prefixes
    assert "normalize_model_selector" in schema.read_text(encoding="utf-8")
    assert "normalize_model_selector" in codec.read_text(encoding="utf-8")


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


def test_cloud_role_derivation_stays_aligned_across_runtimes() -> None:
    frontend_contract = (
        REPO_ROOT
        / "frontend"
        / "src"
        / "modules"
        / "model_usage"
        / "domain"
        / "commercial-model-access.ts"
    )
    desktop_contract = REPO_ROOT / "desktop" / "src" / "commercial-ipc-support.ts"
    audio_contract = (
        REPO_ROOT
        / "frontend"
        / "src"
        / "modules"
        / "model_usage"
        / "domain"
        / "audio-model.ts"
    )

    assert _typescript_string_array_record(
        frontend_contract,
        "ROLES_BY_OPERATION",
    ) == _typescript_string_array_record(
        desktop_contract,
        "CLOUD_ROLES_BY_OPERATION",
    )
    assert _typescript_string_array_record(
        frontend_contract,
        "MODES_BY_ROLE",
    ) == _typescript_string_array_record(
        desktop_contract,
        "CLOUD_ROLE_MODES",
    )
    expected_mode_keys = ("supportedModes", "audioModes", "modes")
    assert _typescript_capability_fallback_chain(
        frontend_contract,
        "rawModes",
    ) == expected_mode_keys
    assert _typescript_capability_fallback_chain(
        desktop_contract,
        "rawModes",
    ) == expected_mode_keys
    assert _typescript_capability_fallback_chain(
        audio_contract,
        "declaredModes",
    ) == expected_mode_keys
    assert _typescript_function_body(
        frontend_contract,
        "normalizeCommercialModelMode",
    ) == _typescript_function_body(
        REPO_ROOT / "desktop" / "src" / "commercial-model-access.ts",
        "normalizeCommercialModelMode",
    )


def test_image_parameters_are_driven_by_catalog_capabilities() -> None:
    frontend = REPO_ROOT / "frontend" / "src"
    capability = (
        frontend
        / "modules"
        / "creative_canvas"
        / "domain"
        / "imageModelCapability.ts"
    )
    source = capability.read_text(encoding="utf-8")

    assert "supportsCanvasImageParameter" in source
    assert "model?.parameterSchema" in source
    assert not (
        frontend
        / "modules"
        / "model_usage"
        / "domain"
        / "generation-credit.ts"
    ).exists()
    assert not (
        REPO_ROOT
        / "src"
        / "ai_anime"
        / "modules"
        / "model_usage"
        / "domain"
        / "generation_credit.py"
    ).exists()
    production_source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in frontend.rglob("*")
        if path.is_file()
        and path.suffix in {".ts", ".tsx"}
        and "__tests__" not in path.parts
    )
    assert "IMAGE_QUALITY_MODEL_IDS" not in production_source
    assert "imageModelSupportsQuality" not in production_source
