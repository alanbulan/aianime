from __future__ import annotations

import base64
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

from ai_anime.modules.ai_assistant.infrastructure.hermes.model_route import (
    decode_model_selection,
    encode_automatic_model,
    encode_model_route,
)


_RUNTIME_MODULE = (
    Path(__file__).parents[1]
    / "desktop"
    / "hermes-runtime"
    / "ai_anime_acp_runtime.py"
)
_ROUTE_CONTRACT = json.loads(
    (Path(__file__).parent / "fixtures" / "model-route-contract.json").read_text(
        encoding="utf-8"
    )
)


def _load_runtime_module():
    module_name = "_test_ai_anime_acp_runtime"
    spec = importlib.util.spec_from_file_location(module_name, _RUNTIME_MODULE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def test_route_model_round_trips_disabled_reasoning() -> None:
    runtime = _load_runtime_module()
    encoded = encode_model_route("cloud:text-model", "none")

    route = runtime._parse_assistant_route_model(f"custom:{encoded}")

    assert route is not None
    assert route.base_model_id == f"custom:{encoded.split(':reasoning-effort:', 1)[0]}"
    assert route.reasoning_effort == "none"


@pytest.mark.parametrize(
    "case",
    _ROUTE_CONTRACT["valid"],
    ids=lambda case: case["id"],
)
def test_runtime_parser_tracks_the_canonical_model_route_codec(case: dict) -> None:
    runtime = _load_runtime_module()
    model_id = case["model"]
    canonical = decode_model_selection(model_id)

    route = runtime._parse_assistant_route_model(model_id)

    assert canonical is not None
    assert route is not None
    assert canonical.selector == case["selector"]
    assert canonical.reasoning_effort == case["reasoningEffort"]
    assert route.reasoning_effort == canonical.reasoning_effort
    assert route.base_model_id == model_id.partition(":reasoning-effort:")[0]
    expected = (
        encode_model_route(case["selector"], case["reasoningEffort"])
        if case["selector"] is not None
        else encode_automatic_model(case["reasoningEffort"])
    )
    assert model_id.endswith(expected)


@pytest.mark.parametrize(
    "case",
    _ROUTE_CONTRACT["invalid"],
    ids=lambda case: case["id"],
)
def test_route_contract_rejects_the_same_invalid_models(case: dict) -> None:
    runtime = _load_runtime_module()

    assert decode_model_selection(case["model"]) is None
    assert runtime._parse_assistant_route_model(case["model"]) is None


@pytest.mark.parametrize(
    "selector",
    [
        "ordinary-model",
        f"cloud:{'x' * 769}",
        "cloud:line\nbreak",
    ],
)
def test_runtime_parser_rejects_invalid_route_selectors(selector: str) -> None:
    runtime = _load_runtime_module()
    encoded = base64.urlsafe_b64encode(selector.encode()).decode().rstrip("=")

    assert runtime._parse_assistant_route_model(f"ai-anime-route:{encoded}") is None


def test_route_codecs_reject_a_malformed_reasoning_token() -> None:
    runtime = _load_runtime_module()
    malformed = f"{encode_model_route('cloud:text-model')}:reasoning-effort:not+base64"

    assert decode_model_selection(malformed) is None
    assert runtime._parse_assistant_route_model(malformed) is None


@pytest.mark.asyncio
async def test_acp_patch_updates_model_and_reasoning_without_rebuilding_agent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime = _load_runtime_module()

    acp_module = ModuleType("acp")
    acp_module.__path__ = []
    schema_module = ModuleType("acp.schema")

    class SetSessionModelResponse:
        pass

    class SetSessionConfigOptionResponse:
        def __init__(self, *, config_options):
            self.config_options = config_options

    schema_module.SetSessionModelResponse = SetSessionModelResponse
    schema_module.SetSessionConfigOptionResponse = SetSessionConfigOptionResponse

    acp_adapter_module = ModuleType("acp_adapter")
    acp_adapter_module.__path__ = []
    server_module = ModuleType("acp_adapter.server")

    class HermesACPAgent:
        async def set_session_model(self, model_id, session_id, **_kwargs):
            self.rebuild_count += 1
            return (model_id, session_id)

        async def set_config_option(self, config_id, session_id, value, **_kwargs):
            self.original_config_count += 1
            return (config_id, session_id, value)

        @staticmethod
        def _resolve_model_selection(model_id, current_provider):
            return current_provider, model_id

    server_module.HermesACPAgent = HermesACPAgent

    constants_module = ModuleType("hermes_constants")

    def parse_reasoning_effort(value):
        if value == "none":
            return {"enabled": False}
        if value in {"low", "medium", "high", "xhigh"}:
            return {"enabled": True, "effort": value}
        return None

    constants_module.parse_reasoning_effort = parse_reasoning_effort
    constants_module.resolve_reasoning_config = lambda _config, _model: None

    hermes_cli_module = ModuleType("hermes_cli")
    hermes_cli_module.__path__ = []
    config_module = ModuleType("hermes_cli.config")
    config_module.load_config = lambda: {}

    for name, module in {
        "acp": acp_module,
        "acp.schema": schema_module,
        "acp_adapter": acp_adapter_module,
        "acp_adapter.server": server_module,
        "hermes_constants": constants_module,
        "hermes_cli": hermes_cli_module,
        "hermes_cli.config": config_module,
    }.items():
        monkeypatch.setitem(sys.modules, name, module)

    agent = SimpleNamespace(
        model="ai-anime-assistant-auto",
        provider="custom",
        reasoning_config=None,
        context_compressor=SimpleNamespace(model="ai-anime-assistant-auto"),
        _primary_runtime={
            "model": "ai-anime-assistant-auto",
            "compressor_model": "ai-anime-assistant-auto",
            "reasoning_config": None,
        },
        _cached_system_prompt="cached",
        _fallback_activated=False,
        _fallback_index=0,
    )
    state = SimpleNamespace(
        model="ai-anime-assistant-auto",
        agent=agent,
    )

    class SessionManager:
        save_count = 0

        @staticmethod
        def get_session(session_id):
            return state if session_id == "session-1" else None

        def save_session(self, _session_id):
            self.save_count += 1

    runtime.install_ai_anime_acp_runtime()
    acp_agent = HermesACPAgent()
    acp_agent.session_manager = SessionManager()
    acp_agent.rebuild_count = 0
    acp_agent.original_config_count = 0

    high_model = runtime._model_with_reasoning_effort(
        runtime._parse_assistant_route_model("ai-anime-assistant-auto"),
        "high",
    )
    original_agent = state.agent
    await acp_agent.set_session_model(high_model, "session-1")

    assert state.agent is original_agent
    assert state.model == high_model
    assert state.agent.reasoning_config == {"enabled": True, "effort": "high"}
    assert acp_agent.rebuild_count == 0

    await acp_agent.set_config_option(
        "reasoning_effort",
        "session-1",
        "none",
    )

    assert state.agent is original_agent
    assert runtime._parse_assistant_route_model(state.model).reasoning_effort == "none"
    assert state.agent.reasoning_config == {"enabled": False}
    assert state.agent._primary_runtime["reasoning_config"] == {"enabled": False}
    assert state.agent.context_compressor.model == state.model
    assert acp_agent.session_manager.save_count == 2
    assert acp_agent.rebuild_count == 0

    await acp_agent.set_session_model("ordinary-model", "session-1")
    assert acp_agent.rebuild_count == 1
