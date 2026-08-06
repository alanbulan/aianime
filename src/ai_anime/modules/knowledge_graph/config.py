"""Cognee 配置工具。

管理 Cognee 的初始化和配置。
自动从 .env 文件加载环境变量。

重要：必须在导入 cognee 之前设置环境变量，因为 Cognee 在导入时会读取。
"""

import contextvars
import hashlib
import importlib
import logging
import os
import sys
import uuid
import warnings
from functools import wraps
from pathlib import Path

from dotenv import load_dotenv

from ai_anime.model_access_policy import (
    require_model_role,
    runtime_model_access,
)
from ai_anime.modules.model_usage.public import (
    InsufficientCreditsStop,
    find_insufficient_credits_error,
    find_insufficient_credits_stop,
    get_usage_meter,
    reset_model_call_reservation_active,
    set_model_call_reservation_active,
)
from ai_anime.shared.env_guard import preserve_st_env

# 抑制 cognee/litellm 内部的 Pydantic 序列化警告
# （豆包等非 OpenAI provider 的 Message 字段数与 cognee 期望不同，不影响功能）
warnings.filterwarnings("ignore", message="Pydantic serializer warnings")

# 确保加载 .env 文件（优先使用仓库根目录）
project_root = Path(__file__).resolve().parents[3]
load_dotenv(project_root / ".env", override=False)
load_dotenv(override=False)

COGNEE_EMBEDDING_TIMEOUT_SECONDS = float(os.getenv("COGNEE_EMBEDDING_TIMEOUT", "600"))
_embedding_gateway_patch_installed = False
_litellm_embedding_header_patch_installed = False
_embedding_headers_capture: contextvars.ContextVar[dict[str, str] | None] = (
    contextvars.ContextVar("ai_anime_embedding_headers_capture", default=None)
)
_KEYLESS_MODEL_ACCESS_PLACEHOLDER = "ai-anime-no-auth"


_COGNEE_PROVIDER = "custom"


def _has_idempotency_header(headers: object) -> bool:
    items = getattr(headers, "items", None)
    if not callable(items):
        return False
    return any(str(key).lower() == "idempotency-key" for key, _value in items())


def _with_litellm_idempotency_header(kwargs: dict) -> dict:
    """Add one operation key without replacing a caller-owned key."""
    if _has_idempotency_header(kwargs.get("headers")) or _has_idempotency_header(
        kwargs.get("extra_headers")
    ):
        return kwargs
    extra_headers = dict(kwargs.get("extra_headers") or {})
    extra_headers["Idempotency-Key"] = str(uuid.uuid4())
    return {**kwargs, "extra_headers": extra_headers}


def _install_litellm_operation_idempotency(litellm_module: object | None = None) -> None:
    """Give each LiteLLM text/embedding operation one stable retry key."""
    module = litellm_module or importlib.import_module("litellm")
    for operation_name in ("acompletion", "aembedding"):
        operation = getattr(module, operation_name, None)
        if not callable(operation) or getattr(
            operation, "_ai_anime_idempotency_wrapper", False
        ):
            continue

        @wraps(operation)
        async def wrapped_operation(
            *args,
            __operation=operation,
            **kwargs,
        ):
            return await __operation(
                *args,
                **_with_litellm_idempotency_header(kwargs),
            )

        wrapped_operation._ai_anime_idempotency_wrapper = True
        setattr(module, operation_name, wrapped_operation)


def _wrap_openai_compatible_model(model: str) -> str:
    """Add LiteLLM's transport prefix without interpreting the catalog code."""
    clean_model = str(model or "").strip()
    return f"openai/{clean_model}" if clean_model else ""


def _normalize_openai_compatible_model(model: str) -> str:
    clean_model = str(model or "").strip()
    if not clean_model:
        return clean_model
    return (
        clean_model
        if clean_model.startswith("openai/")
        else _wrap_openai_compatible_model(clean_model)
    )


def _billing_model_name(model: str) -> str:
    clean_model = str(model or "").strip()
    if clean_model.startswith("openai/"):
        return clean_model[len("openai/") :]
    return clean_model


def _effective_newapi_gateway() -> tuple[str, str]:
    access = runtime_model_access()
    return str(access.api_key or "").strip(), str(access.base_url or "").strip()


def _current_gateway_fingerprint() -> str:
    api_key, base_url = _effective_newapi_gateway()
    material = f"{base_url}\n{api_key}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


_active_gateway_fingerprint: str | None = None


def cognee_gateway_restart_required() -> bool:
    """Return whether model access changed after Cognee was initialized."""
    return bool(
        _active_gateway_fingerprint
        and _active_gateway_fingerprint != _current_gateway_fingerprint()
    )


def _cognee_transport_api_key(api_key: str, base_url: str) -> str:
    if api_key:
        return api_key
    return _KEYLESS_MODEL_ACCESS_PLACEHOLDER if base_url else ""


def _set_or_clear_env(key: str, value: str) -> None:
    """设置环境变量；空值时清理，避免不同 provider 之间残留配置。"""
    if value:
        os.environ[key] = value
    else:
        os.environ.pop(key, None)


def _clear_cognee_embedding_config_cache() -> None:
    try:
        mod = sys.modules.get(
            "cognee.infrastructure.databases.vector.embeddings.config"
        )
        if mod is None:
            return
        getter = getattr(mod, "get_embedding_config", None)
        cache_clear = getattr(getter, "cache_clear", None)
        if callable(cache_clear):
            cache_clear()
    except Exception:
        pass


def _clear_cognee_llm_config_cache() -> None:
    """清 Cognee get_llm_config 的 lru_cache;不清则换 key 后仍用旧凭据。"""
    try:
        mod = sys.modules.get("cognee.infrastructure.llm.config")
        if mod is None:
            return
        getter = getattr(mod, "get_llm_config", None)
        cache_clear = getattr(getter, "cache_clear", None)
        if callable(cache_clear):
            cache_clear()
    except Exception:
        pass


def _apply_cognee_runtime_defaults() -> None:
    """Apply AI anime's Cognee runtime defaults."""
    os.environ.setdefault("ENABLE_BACKEND_ACCESS_CONTROL", "True")
    os.environ.setdefault("COGNEE_SKIP_CONNECTION_TEST", "true")
    # AI anime stores Cognee graph data locally per project. Ignore legacy
    # Neo4j values that may still exist in older .env files.
    os.environ["GRAPH_DATABASE_PROVIDER"] = "kuzu"
    os.environ["GRAPH_DATASET_DATABASE_HANDLER"] = "kuzu"

    graph_config_module = sys.modules.get(
        "cognee.infrastructure.databases.graph.config"
    )
    if graph_config_module and hasattr(graph_config_module, "get_graph_config"):
        graph_config_module.get_graph_config.cache_clear()


def _patch_cognee_embedding_timeout() -> None:
    """将 Cognee embedding 的硬编码 30s 超时提升为项目可控值。"""
    try:
        import asyncio as _asyncio
    except Exception:
        return

    class _AsyncioProxy:
        def __init__(self, real_asyncio, timeout_seconds: float):
            self._real_asyncio = real_asyncio
            self._timeout_seconds = timeout_seconds

        def __getattr__(self, name):
            return getattr(self._real_asyncio, name)

        def wait_for(self, awaitable, timeout=None):
            effective_timeout = timeout
            if timeout is None or timeout == 30.0:
                effective_timeout = self._timeout_seconds
            return self._real_asyncio.wait_for(awaitable, timeout=effective_timeout)

    for module_name in (
        "cognee.infrastructure.databases.vector.embeddings.LiteLLMEmbeddingEngine",
        "cognee.infrastructure.databases.vector.embeddings.OpenAICompatibleEmbeddingEngine",
    ):
        try:
            _mod = importlib.import_module(module_name)
        except Exception:
            continue
        if getattr(_mod.asyncio, "_ai_anime_timeout_patch", False):
            continue
        proxy = _AsyncioProxy(_asyncio, COGNEE_EMBEDDING_TIMEOUT_SECONDS)
        proxy._ai_anime_timeout_patch = True
        _mod.asyncio = proxy


def _exc_info_value(value: object) -> BaseException | None:
    if isinstance(value, BaseException):
        return value
    if (
        isinstance(value, tuple)
        and len(value) >= 2
        and isinstance(value[1], BaseException)
    ):
        return value[1]
    return None


def _log_record_has_insufficient_credits(record: logging.LogRecord) -> bool:
    candidates: list[BaseException] = []
    record_exc = _exc_info_value(getattr(record, "exc_info", None))
    if record_exc is not None:
        candidates.append(record_exc)

    msg = getattr(record, "msg", None)
    if isinstance(msg, dict):
        msg_exc = _exc_info_value(msg.get("exc_info"))
        if msg_exc is not None:
            candidates.append(msg_exc)
        exception = msg.get("exception")
        if isinstance(exception, BaseException):
            candidates.append(exception)

    return any(
        find_insufficient_credits_stop(exc) is not None
        or find_insufficient_credits_error(exc) is not None
        for exc in candidates
    )


def _install_insufficient_credits_log_filter() -> None:
    """Suppress Cognee/Rich tracebacks for expected credit-limit stops only."""

    class InsufficientCreditsLogFilter(logging.Filter):
        _ai_anime_insufficient_credits_filter = True

        def filter(self, record: logging.LogRecord) -> bool:
            return not _log_record_has_insufficient_credits(record)

    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        if not any(
            getattr(existing_filter, "_ai_anime_insufficient_credits_filter", False)
            for existing_filter in handler.filters
        ):
            handler.addFilter(InsufficientCreditsLogFilter())


def _headers_to_plain_dict(headers: object) -> dict[str, str]:
    items = getattr(headers, "items", None)
    if not callable(items):
        return {}
    return {str(key).lower(): str(value) for key, value in items()}


def _remember_embedding_response_headers(response: object) -> None:
    capture = _embedding_headers_capture.get()
    if capture is None:
        return
    headers = _headers_to_plain_dict(getattr(response, "headers", None))
    if headers:
        capture.clear()
        capture.update(headers)


def _strip_keyless_model_authorization(
    args: tuple[object, ...],
    kwargs: dict,
) -> tuple[tuple[object, ...], dict]:
    positional = list(args)
    headers = kwargs.get("headers")
    positional_headers = len(positional) > 4 and isinstance(positional[4], dict)
    if headers is None and positional_headers:
        headers = positional[4]
    if not isinstance(headers, dict):
        return args, kwargs

    cleaned = dict(headers)
    for key in list(cleaned):
        if (
            str(key).lower() == "authorization"
            and str(cleaned[key]).strip()
            == f"Bearer {_KEYLESS_MODEL_ACCESS_PLACEHOLDER}"
        ):
            cleaned.pop(key, None)
    if cleaned == headers:
        return args, kwargs
    if positional_headers and "headers" not in kwargs:
        positional[4] = cleaned
    else:
        kwargs = {**kwargs, "headers": cleaned}
    return tuple(positional), kwargs


def _install_litellm_embedding_header_capture() -> None:
    """Preserve embedding HTTP headers that LiteLLM's EmbeddingResponse drops."""
    global _litellm_embedding_header_patch_installed
    if _litellm_embedding_header_patch_installed:
        return
    try:
        handler_mod = importlib.import_module("litellm.llms.custom_httpx.http_handler")
        sync_cls = getattr(handler_mod, "HTTPHandler", None)
        async_cls = getattr(handler_mod, "AsyncHTTPHandler", None)
    except Exception:
        return

    if sync_cls is not None and not getattr(
        sync_cls, "_ai_anime_header_patch", False
    ):
        original_sync_post = sync_cls.post

        def patched_sync_post(self, *args, **kwargs):
            args, kwargs = _strip_keyless_model_authorization(args, kwargs)
            response = original_sync_post(self, *args, **kwargs)
            _remember_embedding_response_headers(response)
            return response

        sync_cls.post = patched_sync_post
        sync_cls._ai_anime_header_patch = True

    if async_cls is not None and not getattr(
        async_cls, "_ai_anime_header_patch", False
    ):
        original_async_post = async_cls.post

        async def patched_async_post(self, *args, **kwargs):
            args, kwargs = _strip_keyless_model_authorization(args, kwargs)
            response = await original_async_post(self, *args, **kwargs)
            _remember_embedding_response_headers(response)
            return response

        async_cls.post = patched_async_post
        async_cls._ai_anime_header_patch = True

    _litellm_embedding_header_patch_installed = True


def _attach_embedding_response_headers(
    response: object, headers: dict[str, str]
) -> None:
    if not headers:
        return
    try:
        hidden = getattr(response, "_hidden_params", None)
        if not isinstance(hidden, dict):
            hidden = {}
            setattr(response, "_hidden_params", hidden)
        hidden.setdefault("headers", headers)
        hidden.setdefault("response_headers", headers)
        setattr(response, "_response_headers", headers)
    except Exception:
        return


def _embedding_response_trace(
    response: object, headers: dict[str, str]
) -> tuple[str, str]:
    request_id = ""
    response_id = ""
    merged_headers = dict(headers)
    try:
        request_id = (
            str(getattr(response, "request_id", "") or "").strip()
            or str(getattr(response, "_request_id", "") or "").strip()
        )
        response_id = (
            str(getattr(response, "id", "") or "").strip()
            or str(getattr(response, "response_id", "") or "").strip()
        )
        hidden = getattr(response, "_hidden_params", None)
        if isinstance(hidden, dict):
            hidden_headers = (
                hidden.get("headers") or hidden.get("response_headers") or {}
            )
            merged_headers.update(_headers_to_plain_dict(hidden_headers))
            request_id = (
                request_id
                or str(
                    hidden.get("request_id") or hidden.get("requestId") or ""
                ).strip()
            )
            response_id = (
                response_id
                or str(
                    hidden.get("response_id") or hidden.get("responseId") or ""
                ).strip()
            )
        response_headers = getattr(response, "_response_headers", None)
        merged_headers.update(_headers_to_plain_dict(response_headers))
    except Exception:
        pass
    request_id = (
        request_id
        or merged_headers.get("x-request-id", "")
        or merged_headers.get("request-id", "")
        or merged_headers.get("request_id", "")
        or merged_headers.get("x-newapi-request-id", "")
        or merged_headers.get("newapi-request-id", "")
        or merged_headers.get("x-oneapi-request-id", "")
        or merged_headers.get("oneapi-request-id", "")
        or merged_headers.get("x-goog-request-id", "")
    )
    return request_id, response_id


def _patch_cognee_embedding_gateway() -> None:
    """Force Cognee LiteLLM embeddings through the newAPI OpenAI-compatible gateway."""
    global _embedding_gateway_patch_installed
    if _embedding_gateway_patch_installed:
        return

    try:
        _mod = importlib.import_module(
            "cognee.infrastructure.databases.vector.embeddings.LiteLLMEmbeddingEngine"
        )
    except Exception:
        return

    engine_cls = getattr(_mod, "LiteLLMEmbeddingEngine", None)
    if engine_cls is None or getattr(engine_cls, "_ai_anime_gateway_patch", False):
        _embedding_gateway_patch_installed = True
        return

    original_embed_text = engine_cls.embed_text

    async def patched_embed_text(self, text):
        provider = str(getattr(self, "provider", "") or "").strip().lower()
        endpoint = str(getattr(self, "endpoint", "") or "").strip()
        if provider not in {"custom", "openai"} or not endpoint:
            return await original_embed_text(self, text)

        litellm = _mod.litellm
        original_aembedding = litellm.aembedding

        async def gateway_aembedding(*args, **kwargs):
            kwargs.setdefault("custom_llm_provider", "openai")
            raw_model = str(kwargs.get("model") or "").strip()
            if raw_model:
                kwargs["model"] = _normalize_openai_compatible_model(raw_model)
            if os.getenv("COGNEE_EMBEDDING_SEND_DIMENSIONS", "false").lower() not in (
                "1",
                "true",
                "yes",
                "on",
            ):
                # dimensions 仍用于本地向量库 sizing；默认不传给 newAPI 上游。
                kwargs.pop("dimensions", None)
            response = await original_aembedding(*args, **kwargs)
            _attach_embedding_response_headers(response, captured_headers)
            nonlocal captured_request_id, captured_response_id
            request_id, response_id = _embedding_response_trace(
                response, captured_headers
            )
            captured_request_id = captured_request_id or request_id
            captured_response_id = captured_response_id or response_id
            return response

        litellm.aembedding = gateway_aembedding
        _install_litellm_embedding_header_capture()
        captured_headers: dict[str, str] = {}
        captured_request_id = ""
        captured_response_id = ""
        token = _embedding_headers_capture.set(captured_headers)
        raw_model = str(
            getattr(self, "model", "") or os.getenv("EMBEDDING_MODEL", "")
        ).strip()
        model = _normalize_openai_compatible_model(raw_model)
        billing_model = _billing_model_name(raw_model or model)
        original_model = getattr(self, "model", None)
        reservation_id = ""
        active_token = None
        try:
            if model:
                self.model = model

            try:
                reservation_id = (
                    await get_usage_meter().reserve_current_model_call_credit(
                        model=billing_model,
                        billing_kind="embedding",
                        metadata={"source": "cognee_embedding_gateway"},
                    )
                )
            except Exception as exc:
                insufficient = find_insufficient_credits_error(exc)
                if insufficient is not None:
                    raise InsufficientCreditsStop(
                        user_id=insufficient.user_id,
                        cost=insufficient.cost,
                        balance=insufficient.balance,
                    ) from None
                raise
            active_token = set_model_call_reservation_active(bool(reservation_id))
            result = await original_embed_text(self, text)
        except BaseException:
            if reservation_id:
                try:
                    await get_usage_meter().refund_model_call_credit_reservation(
                        reservation_id,
                        metadata={"source": "cognee_embedding_gateway_exception"},
                    )
                except Exception:
                    pass
            raise
        finally:
            if active_token is not None:
                try:
                    reset_model_call_reservation_active(active_token)
                except Exception:
                    pass
            if original_model is not None:
                self.model = original_model
            _embedding_headers_capture.reset(token)
            litellm.aembedding = original_aembedding
        if reservation_id:
            try:
                request_id = (
                    captured_request_id
                    or captured_headers.get("x-request-id")
                    or captured_headers.get("x-newapi-request-id")
                    or captured_headers.get("x-oneapi-request-id")
                    or ""
                )
                metadata = {"source": "cognee_embedding_gateway"}
                if captured_response_id:
                    metadata["response_id"] = captured_response_id
                await get_usage_meter().bump_model_call(
                    user_id=None,
                    model=billing_model,
                    credit_reservation_id=reservation_id,
                    provider_request_id=request_id,
                    metadata=metadata,
                )
            except Exception:
                pass
        return result

    engine_cls.embed_text = patched_embed_text
    engine_cls._ai_anime_original_embed_text = original_embed_text
    engine_cls._ai_anime_gateway_patch = True
    _embedding_gateway_patch_installed = True


def apply_cognee_project_storage_context(
    state_dir: str | os.PathLike[str],
    cognee_module=None,
) -> tuple[str, str]:
    """Point Cognee system/data storage at a project-local state directory."""
    _apply_cognee_runtime_defaults()
    state_path = Path(state_dir)
    cognee_system_dir = str(state_path / "cognee_system")
    cognee_data_dir = str(state_path / "cognee_data")
    Path(cognee_system_dir).mkdir(parents=True, exist_ok=True)
    Path(cognee_data_dir).mkdir(parents=True, exist_ok=True)

    os.environ["SYSTEM_ROOT_DIRECTORY"] = cognee_system_dir
    os.environ["DATA_ROOT_DIRECTORY"] = cognee_data_dir

    if cognee_module is None:
        with preserve_st_env():
            import cognee as cognee_module

    cognee_module.config.system_root_directory(cognee_system_dir)
    if hasattr(cognee_module.config, "data_root_directory"):
        cognee_module.config.data_root_directory(cognee_data_dir)

    return cognee_system_dir, cognee_data_dir


def _resolve_embedding_config(
    model: str,
    dimensions: int | str | None,
) -> tuple[str, str, str, str]:
    from ai_anime.model_gateway_settings import get_effective_cognee_embedding_config

    effective = get_effective_cognee_embedding_config(
        model=model,
        dimensions=dimensions,
    )
    return (
        effective.provider,
        effective.model,
        effective.dimensions,
        effective.batch_size,
    )


def _clear_third_provider_environment() -> None:
    for key in (
        "COGNEE_LLM_API_KEY",
        "COGNEE_LLM_ENDPOINT",
        "COGNEE_EMBEDDING_API_KEY",
        "COGNEE_EMBEDDING_ENDPOINT",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "OPENROUTER_API_KEY",
        "OPENROUTER_BASE_URL",
    ):
        os.environ.pop(key, None)


def _apply_llm_env(model: str, api_key: str, endpoint: str) -> str:
    normalized_model = _wrap_openai_compatible_model(model)
    os.environ["LLM_PROVIDER"] = _COGNEE_PROVIDER
    os.environ["LLM_MODEL"] = normalized_model
    os.environ["LLM_API_KEY"] = api_key
    os.environ["OPENAI_API_KEY"] = api_key
    _set_or_clear_env("LLM_ENDPOINT", endpoint)
    _set_or_clear_env("OPENAI_API_BASE", endpoint)
    _set_or_clear_env("OPENAI_BASE_URL", endpoint)
    _set_or_clear_env("LLM_API_VERSION", "")
    _clear_cognee_llm_config_cache()
    return normalized_model


def _apply_embedding_env(
    model: str,
    api_key: str,
    endpoint: str,
    dimensions: int | str | None,
) -> tuple[str, str, str, str]:
    (
        embedding_provider,
        embedding_model,
        embedding_dimensions,
        embedding_batch_size,
    ) = _resolve_embedding_config(model, dimensions)
    normalized_model = _wrap_openai_compatible_model(embedding_model)

    os.environ["EMBEDDING_PROVIDER"] = embedding_provider
    os.environ["EMBEDDING_MODEL"] = normalized_model
    os.environ["EMBEDDING_DIMENSIONS"] = embedding_dimensions
    os.environ["EMBEDDING_API_KEY"] = api_key
    if embedding_batch_size:
        os.environ["EMBEDDING_BATCH_SIZE"] = embedding_batch_size
    _set_or_clear_env("EMBEDDING_ENDPOINT", endpoint)
    _set_or_clear_env("EMBEDDING_API_VERSION", "")
    _clear_cognee_embedding_config_cache()

    return (
        embedding_provider,
        normalized_model,
        embedding_dimensions,
        api_key,
    )


_apply_cognee_runtime_defaults()

try:
    with preserve_st_env():
        import cognee
    COGNEE_AVAILABLE = True
except ImportError:
    COGNEE_AVAILABLE = False

def init_cognee(
    *,
    text_model: str,
    embedding_model: str,
    embedding_dimensions: int | str | None = None,
) -> None:
    """Configure Cognee from one explicit catalog selection and runtime access mode."""
    global _active_gateway_fingerprint

    if not COGNEE_AVAILABLE:
        raise ImportError("cognee is not installed. Run: pip install cognee")
    if cognee_gateway_restart_required():
        raise RuntimeError(
            "模型网关配置已更新，Cognee 仍持有启动时的旧配置；"
            "请重启 AI anime 后再使用小说知识库。"
        )

    clean_text_model = str(text_model or "").strip()
    clean_embedding_model = str(embedding_model or "").strip()
    if not clean_text_model or not clean_embedding_model:
        raise ValueError("小说知识库必须显式选择文本模型和向量模型")
    require_model_role(clean_text_model, "TEXT")
    require_model_role(clean_embedding_model, "EMBEDDING")

    api_key, gateway_base_url = _effective_newapi_gateway()
    if not gateway_base_url:
        raise ValueError(
            "未设置 Cognee 模型 Base URL。请登录云端或配置专业版 BYOK。"
        )
    api_key = _cognee_transport_api_key(api_key, gateway_base_url)
    _clear_third_provider_environment()
    llm_model = _apply_llm_env(clean_text_model, api_key, gateway_base_url)
    (
        embedding_provider,
        embedding_model,
        embedding_dimensions,
        embedding_api_key,
    ) = _apply_embedding_env(
        clean_embedding_model,
        api_key,
        gateway_base_url,
        embedding_dimensions,
    )

    _apply_cognee_runtime_defaults()

    cognee.config.llm_provider = _COGNEE_PROVIDER
    cognee.config.llm_model = llm_model
    cognee.config.llm_api_key = api_key
    if hasattr(cognee.config, "set_llm_provider"):
        cognee.config.set_llm_provider(_COGNEE_PROVIDER)
    if hasattr(cognee.config, "set_llm_model"):
        cognee.config.set_llm_model(llm_model)
    if hasattr(cognee.config, "set_llm_api_key"):
        cognee.config.set_llm_api_key(api_key)

    cognee.config.embedding_provider = embedding_provider
    cognee.config.embedding_model = embedding_model
    cognee.config.embedding_dimensions = int(embedding_dimensions)
    cognee.config.embedding_api_key = embedding_api_key or api_key
    if hasattr(cognee.config, "set_embedding_provider"):
        cognee.config.set_embedding_provider(embedding_provider)
    if hasattr(cognee.config, "set_embedding_model"):
        cognee.config.set_embedding_model(embedding_model)
    if hasattr(cognee.config, "set_embedding_dimensions"):
        cognee.config.set_embedding_dimensions(int(embedding_dimensions))
    if hasattr(cognee.config, "set_embedding_api_key"):
        cognee.config.set_embedding_api_key(embedding_api_key or api_key)
    _patch_cognee_embedding_timeout()
    _install_insufficient_credits_log_filter()
    _install_litellm_operation_idempotency()
    _patch_cognee_embedding_gateway()
    _active_gateway_fingerprint = _current_gateway_fingerprint()


def get_cognee_status() -> dict:
    """获取 Cognee 状态信息。"""
    if not COGNEE_AVAILABLE:
        return {"available": False, "error": "cognee not installed"}

    try:
        return {
            "available": True,
            "llm_provider": os.getenv(
                "LLM_PROVIDER", getattr(cognee.config, "llm_provider", "unknown")
            ),
            "llm_model": os.getenv(
                "LLM_MODEL", getattr(cognee.config, "llm_model", "unknown")
            ),
            "embedding_provider": os.getenv(
                "EMBEDDING_PROVIDER",
                getattr(cognee.config, "embedding_provider", "unknown"),
            ),
            "embedding_model": os.getenv(
                "EMBEDDING_MODEL", getattr(cognee.config, "embedding_model", "unknown")
            ),
            "embedding_dimensions": int(
                os.getenv(
                    "EMBEDDING_DIMENSIONS",
                    str(getattr(cognee.config, "embedding_dimensions", 0)),
                )
            ),
        }
    except Exception as e:
        return {"available": True, "error": str(e)}
