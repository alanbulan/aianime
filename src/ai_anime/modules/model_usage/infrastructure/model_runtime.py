"""OpenAI-compatible model runtime construction and request settings."""

import os
import uuid
from contextvars import ContextVar
from typing import Any

from ai_anime.shared.runtime_dotenv import load_project_dotenv

load_project_dotenv()

_TEXT_MODEL_IDEMPOTENCY_KEY: ContextVar[str] = ContextVar(
    "ai_anime_text_model_idempotency_key",
    default="",
)

def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _model_gateway_text_http_client_factory(
    *,
    timeout_seconds: float,
    omit_authorization: bool = False,
    model_selector: str | None = None,
) -> Any:
    trust_env = _env_bool("MODEL_TEXT_TRUST_ENV", True)

    def factory():
        import httpx

        kwargs: dict[str, Any] = {"timeout": timeout_seconds}
        if not trust_env:
            kwargs["trust_env"] = False

        async def prepare_model_request(request: httpx.Request) -> None:
            request.headers["X-AI-Anime-Model-Role"] = "TEXT"
            if model_selector:
                request.headers["X-AI-Anime-Model-Selector"] = model_selector
            if (
                omit_authorization
                and request.headers.get("Authorization") == "Bearer ai-anime-no-auth"
            ):
                request.headers.pop("Authorization", None)
            idempotency_key = _TEXT_MODEL_IDEMPOTENCY_KEY.get()
            if (
                idempotency_key
                and request.method.upper() not in {"GET", "HEAD", "OPTIONS"}
                and "Idempotency-Key" not in request.headers
            ):
                request.headers["Idempotency-Key"] = idempotency_key

        kwargs["event_hooks"] = {"request": [prepare_model_request]}
        return httpx.AsyncClient(**kwargs)

    return factory


def _model_gateway_text_openai_provider(
    *,
    api_key: str,
    base_url: str,
    timeout_seconds: float,
    model_selector: str | None = None,
):
    from openai import AsyncOpenAI
    from pydantic_ai.providers.openai import OpenAIProvider

    class _LifecycleManagedOpenAIProvider(OpenAIProvider):
        def __init__(self) -> None:
            omit_authorization = not str(api_key or "").strip()
            http_client_factory = _model_gateway_text_http_client_factory(
                timeout_seconds=timeout_seconds,
                omit_authorization=omit_authorization,
                model_selector=model_selector,
            )
            http_client = http_client_factory()
            super().__init__(
                openai_client=AsyncOpenAI(
                    api_key=api_key or "ai-anime-no-auth",
                    base_url=base_url,
                    timeout=timeout_seconds,
                    max_retries=1,
                    http_client=http_client,
                ),
            )
            self._own_http_client = http_client
            self._http_client_factory = http_client_factory

    return _LifecycleManagedOpenAIProvider()


def _model_gateway_text_openai_model(
    model_name: str,
    *,
    api_key: str,
    base_url: str,
    timeout_seconds: float,
    profile: Any,
    model_selector: str | None = None,
):
    from contextlib import asynccontextmanager

    from pydantic_ai.models.openai import OpenAIChatModel

    class _AutoClosingOpenAIChatModel(OpenAIChatModel):
        async def request(self, *args: Any, **kwargs: Any) -> Any:
            token = _TEXT_MODEL_IDEMPOTENCY_KEY.set(str(uuid.uuid4()))
            try:
                async with self:
                    return await super().request(*args, **kwargs)
            finally:
                _TEXT_MODEL_IDEMPOTENCY_KEY.reset(token)

        @asynccontextmanager
        async def request_stream(self, *args: Any, **kwargs: Any):
            token = _TEXT_MODEL_IDEMPOTENCY_KEY.set(str(uuid.uuid4()))
            try:
                async with self:
                    async with super().request_stream(*args, **kwargs) as response:
                        yield response
            finally:
                _TEXT_MODEL_IDEMPOTENCY_KEY.reset(token)

    return _AutoClosingOpenAIChatModel(
        model_name,
        provider=_model_gateway_text_openai_provider(
            api_key=api_key,
            base_url=base_url,
            timeout_seconds=timeout_seconds,
            model_selector=model_selector,
        ),
        profile=profile,
    )


def _model_gateway_text_profile():
    """Use safe defaults when an OpenAI-compatible relay omits model capabilities."""
    from pydantic_ai.profiles.openai import OpenAIModelProfile

    return OpenAIModelProfile(openai_supports_tool_choice_required=False)


def get_text_pydantic_model(
    *,
    timeout_seconds_override: float | None = None,
    model_name_override: str | None = None,
    model_selector: str | None = None,
):
    """Create the single TEXT-role PydanticAI model from the router snapshot."""
    from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
        resolve_model_for_role,
    )

    model_name = str(model_name_override or "").strip() or resolve_model_for_role("TEXT")
    api_key, base_url = get_model_gateway_credentials()
    if not base_url:
        raise ValueError("Model Base URL is not configured.")
    timeout_seconds = (
        float(timeout_seconds_override)
        if timeout_seconds_override is not None
        else _env_float("MODEL_TEXT_TIMEOUT_SECONDS", 120.0)
    )
    return _model_gateway_text_openai_model(
        model_name,
        api_key=api_key,
        base_url=base_url,
        timeout_seconds=timeout_seconds,
        profile=_model_gateway_text_profile(),
        model_selector=str(model_selector or "").strip() or None,
    )


def get_text_pydantic_model_settings(
    thinking_env: str,
    default_thinking_level: str,
) -> dict | None:
    """Build PydanticAI model settings for a model gateway text task."""
    thinking_level = get_text_thinking_level(thinking_env, default_thinking_level)
    reasoning_effort = _normalize_openai_compat_reasoning_effort(thinking_level)
    if not reasoning_effort:
        return None
    return {"openai_reasoning_effort": reasoning_effort}


def get_structured_output_model_settings() -> dict[str, str]:
    """Disable reasoning for schema-constrained PydanticAI output."""
    return {"openai_reasoning_effort": "none"}


def get_structured_output_litellm_kwargs() -> dict[str, object]:
    """Disable reasoning for schema-constrained LiteLLM/Instructor output."""
    return {
        "reasoning_effort": "none",
        "allowed_openai_params": ["reasoning_effort"],
    }


def get_pydantic_model_settings(
    *,
    max_tokens: int | None = None,
    thinking_level_override: str | None = None,
) -> dict | None:
    """Build settings for the OpenAI-compatible cloud/BYOK transport."""
    thinking_level = (
        thinking_level_override
        or os.environ.get("MODEL_THINKING_LEVEL")
        or "low"
    )

    settings: dict[str, object] = {}
    if max_tokens is not None:
        settings["max_tokens"] = max_tokens

    if thinking_level:
        reasoning_effort = _normalize_openai_compat_reasoning_effort(thinking_level)
        if reasoning_effort:
            settings["openai_reasoning_effort"] = reasoning_effort

    return settings or None


def get_text_thinking_level(env_name: str, default: str) -> str:
    """Read a path-specific thinking level.

    Missing env vars use the caller default. Explicit empty env vars mean
    "do not send a thinking/reasoning setting" for that path.
    """
    return os.environ.get(env_name, default).strip()


_OPENAI_COMPAT_REASONING_EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}


def _normalize_openai_compat_reasoning_effort(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in _OPENAI_COMPAT_REASONING_EFFORTS else ""


def get_model_reasoning_kwargs(
    *,
    thinking_env: str | None = None,
    default_thinking_level: str | None = None,
) -> dict:
    """Build reasoning kwargs for OpenAI-compatible model gateway/Cognee calls.

    Explicit empty env values disable sending reasoning parameters.
    Both supported access modes use an OpenAI-compatible request shape.
    """
    if thinking_env and thinking_env in os.environ:
        thinking_level = os.environ.get(thinking_env, "").strip()
    elif default_thinking_level is not None:
        thinking_level = default_thinking_level
    else:
        thinking_level = os.environ.get("MODEL_THINKING_LEVEL", "").strip()
    reasoning_effort = _normalize_openai_compat_reasoning_effort(thinking_level)
    if not reasoning_effort:
        return {}
    return {
        "reasoning_effort": reasoning_effort,
        "allowed_openai_params": ["reasoning_effort"],
    }


def get_effective_model_gateway_transport_config():
    """Return the selected cloud-proxy or BYOK runtime endpoint."""
    from ai_anime.modules.model_usage.infrastructure.model_gateway_settings import (
        get_effective_model_gateway_config,
    )

    return get_effective_model_gateway_config()


def get_model_gateway_credentials() -> tuple[str, str]:
    """Resolve the single process-wide cloud-proxy or BYOK endpoint."""

    gateway = get_effective_model_gateway_transport_config()
    return str(gateway.api_key or "").strip(), str(gateway.base_url or "").strip()


def get_model_access_json_transport(
    role: str | None = None,
    model_selector: str | None = None,
) -> tuple[str, dict[str, str]]:
    """Return the process-wide model endpoint and JSON request headers."""
    api_key, base_url = get_model_gateway_credentials()
    if not base_url:
        raise ValueError("Model Base URL is not configured.")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if role:
        headers["X-AI-Anime-Model-Role"] = role.strip().upper()
    if model_selector:
        headers["X-AI-Anime-Model-Selector"] = model_selector.strip()
    return base_url.rstrip("/"), headers


def get_model_access_openai_client(
    *,
    timeout_seconds: float = 120.0,
    role: str = "TEXT",
    model_selector: str | None = None,
):
    """Create one synchronous OpenAI-compatible model operation client."""
    import httpx
    from openai import OpenAI

    api_key, base_url = get_model_gateway_credentials()
    if not base_url:
        raise ValueError("Model Base URL is not configured.")

    event_hooks: dict[str, list[Any]] = {}
    if not api_key:

        def strip_placeholder_authorization(request: httpx.Request) -> None:
            if request.headers.get("Authorization") == "Bearer ai-anime-no-auth":
                request.headers.pop("Authorization", None)

        event_hooks["request"] = [strip_placeholder_authorization]

    http_client = httpx.Client(
        timeout=timeout_seconds,
        event_hooks=event_hooks,
    )
    return OpenAI(
        api_key=api_key or "ai-anime-no-auth",
        base_url=base_url,
        timeout=timeout_seconds,
        max_retries=1,
        default_headers={
            "Idempotency-Key": str(uuid.uuid4()),
            "X-AI-Anime-Model-Role": role.strip().upper(),
            **(
                {"X-AI-Anime-Model-Selector": model_selector.strip()}
                if model_selector and model_selector.strip()
                else {}
            ),
        },
        http_client=http_client,
    )
