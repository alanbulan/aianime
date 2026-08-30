"""AI anime session configuration support for the bundled Hermes ACP runtime."""

from __future__ import annotations

import base64
import binascii
import functools
import logging
from dataclasses import dataclass
from typing import Any


_AUTOMATIC_MODEL_ID = "ai-anime-assistant-auto"
_MODEL_ROUTE_PREFIX = "ai-anime-route:"
_REASONING_EFFORT_MARKER = ":reasoning-effort:"
_REASONING_CONFIG_ID = "reasoning_effort"
_PATCH_MARKER = "_ai_anime_session_config_patch"

_log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class _AssistantRouteModel:
    base_model_id: str
    reasoning_effort: str | None


def _decode_token(value: str) -> str | None:
    if not value or any(
        not (char.isascii() and (char.isalnum() or char in "-_")) for char in value
    ):
        return None
    try:
        padded = value + "=" * (-len(value) % 4)
        return base64.b64decode(
            padded.encode("ascii"),
            altchars=b"-_",
            validate=True,
        ).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None


def _encode_token(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def _valid_selector(value: str) -> bool:
    return (
        0 < len(value) <= 768
        and (value.startswith("cloud:") or value.startswith("byok:"))
        and not any(ord(char) < 32 or ord(char) == 127 for char in value)
    )


def _valid_reasoning_effort(value: str) -> bool:
    return (
        0 < len(value) <= 64
        and not any(ord(char) < 32 or ord(char) == 127 for char in value)
    )


def _parse_assistant_route_model(value: object) -> _AssistantRouteModel | None:
    model_id = str(value or "").strip()
    route_marker = model_id.find(_MODEL_ROUTE_PREFIX)
    if route_marker >= 0:
        payload_and_suffix = model_id[route_marker + len(_MODEL_ROUTE_PREFIX) :]
        payload, separator, remainder = payload_and_suffix.partition(
            _REASONING_EFFORT_MARKER
        )
        encoded_selector = payload.strip()
        selector = _decode_token(encoded_selector)
        if selector is None or not _valid_selector(selector):
            return None
        base_model_id = (
            f"{model_id[:route_marker]}{_MODEL_ROUTE_PREFIX}{encoded_selector}"
        )
        suffix = remainder if separator else ""
    else:
        automatic_marker = model_id.find(_AUTOMATIC_MODEL_ID)
        if automatic_marker < 0:
            return None
        remainder = model_id[automatic_marker + len(_AUTOMATIC_MODEL_ID) :]
        if remainder and not remainder.startswith(_REASONING_EFFORT_MARKER):
            return None
        base_model_id = model_id[: automatic_marker + len(_AUTOMATIC_MODEL_ID)]
        suffix = (
            remainder[len(_REASONING_EFFORT_MARKER) :] if remainder else ""
        )
    if not suffix:
        return _AssistantRouteModel(base_model_id=base_model_id, reasoning_effort=None)
    effort = _decode_token(suffix.strip())
    if effort is None or not _valid_reasoning_effort(effort):
        return None
    return _AssistantRouteModel(
        base_model_id=base_model_id,
        reasoning_effort=effort,
    )


def _model_with_reasoning_effort(route: _AssistantRouteModel, effort: str) -> str:
    return (
        f"{route.base_model_id}{_REASONING_EFFORT_MARKER}"
        f"{_encode_token(effort)}"
    )


def _reasoning_config_for_model(route: _AssistantRouteModel) -> dict[str, Any] | None:
    if route.reasoning_effort is None:
        return None

    from hermes_constants import parse_reasoning_effort

    return parse_reasoning_effort(route.reasoning_effort)


def _canonical_reasoning_effort(
    value: object,
) -> tuple[str, dict[str, Any] | None]:
    normalized = str(value or "").strip().lower()
    if (
        not _valid_reasoning_effort(normalized)
    ):
        raise ValueError("invalid reasoning effort")

    from hermes_constants import parse_reasoning_effort

    reasoning_config = parse_reasoning_effort(normalized)
    if reasoning_config and reasoning_config.get("enabled") is False:
        return "none", reasoning_config
    return normalized, reasoning_config


def _apply_session_route(
    state: Any,
    model_id: str,
    reasoning_config: dict[str, Any] | None,
) -> None:
    """Update the live agent without rebuilding tools, clients, or session history."""
    agent = state.agent
    state.model = model_id
    agent.model = model_id
    agent.reasoning_config = (
        dict(reasoning_config) if isinstance(reasoning_config, dict) else None
    )

    compressor = getattr(agent, "context_compressor", None)
    if compressor is not None:
        compressor.model = model_id

    primary_runtime = getattr(agent, "_primary_runtime", None)
    if isinstance(primary_runtime, dict):
        updated_runtime = dict(primary_runtime)
        updated_runtime["model"] = model_id
        updated_runtime["compressor_model"] = model_id
        updated_runtime["reasoning_config"] = (
            dict(reasoning_config) if isinstance(reasoning_config, dict) else None
        )
        agent._primary_runtime = updated_runtime

    if hasattr(agent, "_cached_system_prompt"):
        agent._cached_system_prompt = None
    if hasattr(agent, "_fallback_activated"):
        agent._fallback_activated = False
    if hasattr(agent, "_fallback_index"):
        agent._fallback_index = 0


def install_ai_anime_acp_runtime() -> None:
    """Patch Hermes' ACP adapter with session-local, in-place model configuration."""
    from acp.schema import SetSessionConfigOptionResponse, SetSessionModelResponse
    from acp_adapter.server import HermesACPAgent

    if getattr(HermesACPAgent, _PATCH_MARKER, False):
        return

    original_set_model = HermesACPAgent.set_session_model
    original_set_config = HermesACPAgent.set_config_option

    @functools.wraps(original_set_model)
    async def set_session_model(
        self: Any,
        model_id: str,
        session_id: str,
        **kwargs: Any,
    ) -> Any:
        requested_route = _parse_assistant_route_model(model_id)
        if requested_route is None:
            return await original_set_model(self, model_id, session_id, **kwargs)

        state = self.session_manager.get_session(session_id)
        if state is None:
            return await original_set_model(self, model_id, session_id, **kwargs)

        current_provider = str(getattr(state.agent, "provider", "") or "").strip()
        requested_provider, resolved_model = self._resolve_model_selection(
            model_id,
            current_provider or "openrouter",
        )
        resolved_route = _parse_assistant_route_model(resolved_model)
        if resolved_route is None or (
            current_provider and requested_provider != current_provider
        ):
            return await original_set_model(self, model_id, session_id, **kwargs)

        reasoning_config = _reasoning_config_for_model(resolved_route)
        _apply_session_route(state, resolved_model, reasoning_config)
        self.session_manager.save_session(session_id)
        _log.info(
            "Session %s: AI anime model route updated in place to %s",
            session_id,
            resolved_model,
        )
        return SetSessionModelResponse()

    @functools.wraps(original_set_config)
    async def set_config_option(
        self: Any,
        config_id: str,
        session_id: str,
        value: str,
        **kwargs: Any,
    ) -> Any:
        if str(config_id) != _REASONING_CONFIG_ID:
            return await original_set_config(
                self,
                config_id,
                session_id,
                value,
                **kwargs,
            )

        state = self.session_manager.get_session(session_id)
        route = _parse_assistant_route_model(
            getattr(state, "model", "") if state is not None else ""
        )
        if state is None or route is None:
            return await original_set_config(
                self,
                config_id,
                session_id,
                value,
                **kwargs,
            )

        effort, reasoning_config = _canonical_reasoning_effort(value)
        resolved_model = _model_with_reasoning_effort(route, effort)
        _apply_session_route(state, resolved_model, reasoning_config)
        self.session_manager.save_session(session_id)
        _log.info(
            "Session %s: reasoning effort updated in place to %s",
            session_id,
            effort,
        )
        return SetSessionConfigOptionResponse(config_options=[])

    HermesACPAgent.set_session_model = set_session_model
    HermesACPAgent.set_config_option = set_config_option
    setattr(HermesACPAgent, _PATCH_MARKER, True)


__all__ = ["install_ai_anime_acp_runtime"]
