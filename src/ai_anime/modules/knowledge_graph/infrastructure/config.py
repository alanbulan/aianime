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
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from threading import RLock
from typing import Callable, Iterator

from dotenv import load_dotenv

from ai_anime.modules.model_usage.public import (
    resolve_model_for_role,
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
_ladybug_windows_path_patch_installed = False
_embedding_headers_capture: contextvars.ContextVar[dict[str, str] | None] = (
    contextvars.ContextVar("ai_anime_embedding_headers_capture", default=None)
)
_embedding_gateway_call_context: contextvars.ContextVar[dict[str, object] | None] = (
    contextvars.ContextVar("ai_anime_embedding_gateway_call", default=None)
)
_model_call_activity_callback: contextvars.ContextVar[
    Callable[[str, str, int], None] | None
] = contextvars.ContextVar("ai_anime_cognee_model_call_activity", default=None)
_KEYLESS_MODEL_ACCESS_PLACEHOLDER = "ai-anime-no-auth"
logger = logging.getLogger(__name__)
_cognee_logging_setup_lock = RLock()
_MISSING_ENV = object()


@contextmanager
def _preserve_application_logging() -> Iterator[None]:
    """Restore process logging after a side-effectful Cognee setup call."""
    root_logger = logging.getLogger()
    original_handlers = list(root_logger.handlers)
    original_filters = list(root_logger.filters)
    original_level = root_logger.level
    original_disabled = root_logger.disabled
    original_excepthook = sys.excepthook
    original_log_file_setting = os.environ.get("COGNEE_LOG_FILE", _MISSING_ENV)
    os.environ["COGNEE_LOG_FILE"] = "false"

    try:
        yield
    finally:
        original_handler_ids = {id(handler) for handler in original_handlers}
        cognee_handlers = [
            handler
            for handler in root_logger.handlers
            if id(handler) not in original_handler_ids
        ]

        root_logger.handlers[:] = original_handlers
        root_logger.filters[:] = original_filters
        root_logger.setLevel(original_level)
        root_logger.disabled = original_disabled
        sys.excepthook = original_excepthook
        if original_log_file_setting is _MISSING_ENV:
            os.environ.pop("COGNEE_LOG_FILE", None)
        else:
            os.environ["COGNEE_LOG_FILE"] = original_log_file_setting

        for handler in cognee_handlers:
            try:
                handler.close()
            except Exception:
                # Logging cleanup must never hide the original import failure.
                pass


def _install_cognee_logging_guard() -> None:
    """Guard every later Cognee ``setup_logging()`` invocation.

    Cognee modules such as the embedding utilities call ``setup_logging`` again
    when they are imported, after the package-level import has completed.
    Guarding only ``import cognee`` therefore does not protect Celery.
    """

    logging_utils = sys.modules.get("cognee.shared.logging_utils")
    if logging_utils is None:
        logger.warning(
            "Cognee logging guard could not be installed because "
            "cognee.shared.logging_utils is not loaded"
        )
        return
    original_setup = getattr(logging_utils, "setup_logging", None)
    if not callable(original_setup) or getattr(
        original_setup, "_ai_anime_logging_guard", False
    ):
        return

    @wraps(original_setup)
    def guarded_setup_logging(log_level=None, name=None):
        # The package import has already configured structlog. Re-running
        # Cognee's process-wide setup from a lazily imported submodule is both
        # redundant and unsafe in a live thread worker because it temporarily
        # clears the application's root handlers.
        del log_level
        return logging_utils.structlog.get_logger(name or logging_utils.__name__)

    guarded_setup_logging._ai_anime_logging_guard = True
    guarded_setup_logging._ai_anime_original = original_setup
    logging_utils.setup_logging = guarded_setup_logging

    # Replace aliases cached by Cognee modules imported during package
    # initialization. Future modules import the guarded function directly.
    for module_name, module in tuple(sys.modules.items()):
        if not module_name.startswith("cognee.") or module is None:
            continue
        module_globals = vars(module)
        for name, value in tuple(module_globals.items()):
            if value is original_setup:
                module_globals[name] = guarded_setup_logging


def _detach_cognee_private_file_handlers(logging_utils) -> int:
    """Detach file handlers created by Cognee before the guard was installed."""

    handler_type = getattr(logging_utils, "PlainFileHandler", None)
    if not isinstance(handler_type, type):
        logger.warning(
            "Cognee private file handlers could not be identified because "
            "PlainFileHandler is unavailable"
        )
        return 0

    root_logger = logging.getLogger()
    handlers = [
        handler for handler in root_logger.handlers if isinstance(handler, handler_type)
    ]
    for handler in handlers:
        root_logger.removeHandler(handler)
        try:
            handler.close()
        except Exception:
            # Do not leave a dangerous handler attached just because closing
            # its underlying stream failed.
            logger.warning("Failed to close a detached Cognee private file handler")
    return len(handlers)


def _import_cognee_without_logging_takeover():
    """Import Cognee without letting it replace application logging.

    Cognee configures logging from its package ``__init__``. That setup
    clears every root handler, installs a Rich traceback renderer with
    ``show_locals=True``, and adds its own file handler. In a Celery thread
    worker this can remove the worker handlers and spend long periods rendering
    large pipeline locals while the broker heartbeat is starved.

    Keep Cognee's internal structlog configuration, which its own loggers
    expect, but restore the host process' root logger and exception hook after
    Cognee logging setup. Cognee logs then flow through the logging policy owned
    by the API, CLI, or Celery process.
    """

    with _cognee_logging_setup_lock:
        loaded = sys.modules.get("cognee")
        if loaded is not None:
            logging_utils = sys.modules.get("cognee.shared.logging_utils")
            if logging_utils is not None:
                existing_setup = getattr(logging_utils, "setup_logging", None)
            else:
                existing_setup = None
            if logging_utils is not None and not getattr(
                existing_setup, "_ai_anime_logging_guard", False
            ):
                # The original host handlers are no longer recoverable after
                # Cognee has configured process-wide logging. Keep this
                # failure mode observable, detach its private file output, then
                # guard every later setup call.
                detached_handlers = _detach_cognee_private_file_handlers(logging_utils)
                logger.warning(
                    "Cognee was imported before AI anime installed its logging "
                    "guard; application logging may already have been replaced; "
                    "detached %d private file handler(s)",
                    detached_handlers,
                )
        else:
            # Cognee mutates the root logger during package import. Other
            # application threads can observe that short import-time window,
            # but restoring the host state immediately afterwards prevents the
            # takeover from persisting for the worker lifetime.
            with _preserve_application_logging():
                with warnings.catch_warnings():
                    # Cognee 1.5.3 still constructs models with two deprecated
                    # Pydantic APIs. Limit the allowance to its package import;
                    # application deprecations remain visible and fail tests.
                    warnings.filterwarnings(
                        "ignore",
                        message=(
                            "Using extra keyword arguments on `Field` is deprecated.*"
                        ),
                    )
                    warnings.filterwarnings(
                        "ignore",
                        message="`json_encoders` is deprecated.*",
                    )
                    loaded = importlib.import_module("cognee")
        _install_cognee_logging_guard()
    return loaded


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


def set_cognee_model_call_activity_callback(
    callback: Callable[[str, str, int], None] | None,
):
    """Observe real Cognee model calls in the current async context."""
    return _model_call_activity_callback.set(callback)


def reset_cognee_model_call_activity_callback(token) -> None:
    _model_call_activity_callback.reset(token)


def _notify_model_call_activity(kind: str, status: str, item_count: int) -> None:
    callback = _model_call_activity_callback.get()
    if callback is None:
        return
    try:
        callback(kind, status, max(1, int(item_count)))
    except Exception as exc:
        logger.debug("failed to publish Cognee model call activity: %s", exc)


def _model_call_item_count(operation_name: str, kwargs: dict) -> int:
    if operation_name != "aembedding":
        return 1
    inputs = kwargs.get("input")
    if isinstance(inputs, (list, tuple)):
        return max(1, len(inputs))
    return 1


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
            __operation_name=operation_name,
            **kwargs,
        ):
            kind = "embedding" if __operation_name == "aembedding" else "text"
            item_count = _model_call_item_count(__operation_name, kwargs)
            _notify_model_call_activity(kind, "started", item_count)
            try:
                response = await __operation(
                    *args,
                    **_with_litellm_idempotency_header(kwargs),
                )
            except BaseException:
                _notify_model_call_activity(kind, "failed", item_count)
                raise
            _notify_model_call_activity(kind, "completed", item_count)
            return response

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
    except Exception as exc:
        logger.debug("failed to clear Cognee embedding config cache: %s", exc)


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
    except Exception as exc:
        logger.debug("failed to clear Cognee LLM config cache: %s", exc)


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


def _ladybug_native_database_path(database_path: object) -> object:
    """Encode non-ASCII Windows paths for Ladybug's narrow native binding."""
    if os.name != "nt" or not isinstance(database_path, str) or database_path.isascii():
        return database_path
    try:
        return database_path.encode("mbcs")
    except UnicodeEncodeError as exc:
        raise RuntimeError(
            "Ladybug 图数据库无法访问当前项目路径：路径包含 Windows 系统编码不支持的字符"
        ) from exc


def _install_ladybug_windows_path_compatibility() -> None:
    """Patch Ladybug's Windows path conversion and aliased pybind close."""
    global _ladybug_windows_path_patch_installed
    if os.name != "nt" or _ladybug_windows_path_patch_installed:
        return

    database_module = importlib.import_module("ladybug.database")
    database_cls = getattr(database_module, "Database")
    original_init_pybind_database = database_cls.init_pybind_database
    original_close = database_cls.close
    path_patch_installed = getattr(
        original_init_pybind_database,
        "_ai_anime_windows_path_patch",
        False,
    )
    if not path_patch_installed:
        @wraps(original_init_pybind_database)
        def patched_init_pybind_database(self):
            logical_path = self.database_path
            native_path = _ladybug_native_database_path(logical_path)
            if native_path is logical_path:
                return original_init_pybind_database(self)

            self.database_path = native_path
            try:
                return original_init_pybind_database(self)
            finally:
                self.database_path = logical_path

        patched_init_pybind_database._ai_anime_windows_path_patch = True
        database_cls.init_pybind_database = patched_init_pybind_database

    # Cognee 1.5 opens Ladybug in a worker process by default. Patching the
    # in-process Database class does not reach that spawned interpreter, so
    # encode the path before it crosses the worker protocol as well.
    proxy_module = importlib.import_module(
        "cognee.infrastructure.databases.graph.kuzu.subprocess.proxy"
    )
    remote_database_cls = getattr(proxy_module, "RemoteKuzuDatabase")
    original_remote_init = remote_database_cls.__init__
    if not getattr(original_remote_init, "_ai_anime_windows_path_patch", False):
        @wraps(original_remote_init)
        def patched_remote_init(self, *args, **kwargs):
            database_path = kwargs.get("db_path")
            native_path = _ladybug_native_database_path(database_path)
            if native_path is not database_path:
                kwargs = {**kwargs, "db_path": native_path}
            return original_remote_init(self, *args, **kwargs)

        patched_remote_init._ai_anime_windows_path_patch = True
        remote_database_cls.__init__ = patched_remote_init

    if not getattr(original_close, "_ai_anime_single_native_close_patch", False):
        @wraps(original_close)
        def patched_close(self):
            # Ladybug 0.16 assigns the same pybind object to both attributes.
            # Its close() then releases that native pointer twice, which raises
            # Windows heap-corruption 0xC0000374 after a Cognee graph task.
            if (
                getattr(self, "_database", None) is not None
                and self._database is getattr(self, "_pybind_database", None)
            ):
                self._pybind_database = None
            return original_close(self)

        patched_close._ai_anime_single_native_close_patch = True
        database_cls.close = patched_close
    _ladybug_windows_path_patch_installed = True


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
    except Exception as exc:
        logger.debug("failed to read embedding response trace: %s", exc)
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


def _apply_embedding_dimension_contract(kwargs: dict, dimensions: object) -> int | None:
    """Keep the remote embedding response aligned with the local vector schema."""
    try:
        expected_dimensions = int(dimensions)
    except (TypeError, ValueError):
        return None
    if expected_dimensions <= 0:
        return None
    kwargs["dimensions"] = expected_dimensions
    allowed_openai_params = [
        str(value)
        for value in (kwargs.get("allowed_openai_params") or [])
        if str(value).strip()
    ]
    if "dimensions" not in allowed_openai_params:
        allowed_openai_params.append("dimensions")
    kwargs["allowed_openai_params"] = allowed_openai_params
    return expected_dimensions


def _embedding_vectors(response: object) -> list[list[float]]:
    data = response.get("data") if isinstance(response, dict) else getattr(response, "data", None)
    if not isinstance(data, (list, tuple)):
        return []
    vectors: list[list[float]] = []
    for item in data:
        vector = item.get("embedding") if isinstance(item, dict) else getattr(item, "embedding", None)
        if isinstance(vector, list):
            vectors.append(vector)
    return vectors


def _validate_embedding_dimension_contract(
    response: object,
    expected_dimensions: int | None,
) -> None:
    if expected_dimensions is None:
        return
    actual_dimensions = sorted({len(vector) for vector in _embedding_vectors(response)})
    if not actual_dimensions or actual_dimensions == [expected_dimensions]:
        return
    actual_text = "/".join(str(value) for value in actual_dimensions)
    raise RuntimeError(
        f"嵌入模型返回 {actual_text} 维向量，但本地知识图谱索引配置为 "
        f"{expected_dimensions} 维。请求已携带 dimensions={expected_dimensions}，"
        "请确认模型网关支持并遵守 OpenAI embeddings 的 dimensions 参数。"
    )


async def _call_cognee_embedding_gateway(
    original_aembedding,
    args: tuple,
    kwargs: dict,
):
    call_context = _embedding_gateway_call_context.get()
    if call_context is None:
        return await original_aembedding(*args, **kwargs)

    kwargs.setdefault("custom_llm_provider", "openai")
    raw_model = str(kwargs.get("model") or "").strip()
    if raw_model:
        kwargs["model"] = _normalize_openai_compatible_model(raw_model)
    expected_dimensions = _apply_embedding_dimension_contract(
        kwargs,
        call_context.get("dimensions", kwargs.get("dimensions")),
    )
    response = await original_aembedding(*args, **kwargs)
    _validate_embedding_dimension_contract(response, expected_dimensions)

    context_headers = call_context.get("headers")
    captured_headers = context_headers if isinstance(context_headers, dict) else {}
    _attach_embedding_response_headers(response, captured_headers)
    request_id, response_id = _embedding_response_trace(response, captured_headers)
    if request_id and not call_context.get("request_id"):
        call_context["request_id"] = request_id
    if response_id and not call_context.get("response_id"):
        call_context["response_id"] = response_id
    return response


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
    litellm = _mod.litellm
    original_aembedding = litellm.aembedding

    @wraps(original_aembedding)
    async def gateway_aembedding(*args, **kwargs):
        return await _call_cognee_embedding_gateway(
            original_aembedding,
            args,
            kwargs,
        )

    gateway_aembedding._ai_anime_idempotency_wrapper = True
    litellm.aembedding = gateway_aembedding

    async def patched_embed_text(self, text):
        provider = str(getattr(self, "provider", "") or "").strip().lower()
        endpoint = str(getattr(self, "endpoint", "") or "").strip()
        if provider not in {"custom", "openai"} or not endpoint:
            return await original_embed_text(self, text)

        _install_litellm_embedding_header_capture()
        captured_headers: dict[str, str] = {}
        call_context: dict[str, object] = {
            "dimensions": getattr(self, "dimensions", None),
            "headers": captured_headers,
            "request_id": "",
            "response_id": "",
        }
        headers_token = _embedding_headers_capture.set(captured_headers)
        gateway_token = _embedding_gateway_call_context.set(call_context)
        raw_model = str(
            getattr(self, "model", "") or os.getenv("EMBEDDING_MODEL", "")
        ).strip()
        billing_model = _billing_model_name(raw_model)
        reservation_id = ""
        active_token = None
        try:
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
                except Exception as refund_error:
                    logger.warning(
                        "failed to refund Cognee embedding reservation: %s",
                        refund_error,
                    )
            raise
        finally:
            if active_token is not None:
                try:
                    reset_model_call_reservation_active(active_token)
                except Exception as reset_error:
                    logger.debug(
                        "failed to reset Cognee reservation context: %s",
                        reset_error,
                    )
            _embedding_gateway_call_context.reset(gateway_token)
            _embedding_headers_capture.reset(headers_token)
        if reservation_id:
            try:
                request_id = (
                    str(call_context.get("request_id") or "")
                    or captured_headers.get("x-request-id")
                    or captured_headers.get("x-newapi-request-id")
                    or captured_headers.get("x-oneapi-request-id")
                    or ""
                )
                metadata = {"source": "cognee_embedding_gateway"}
                response_id = str(call_context.get("response_id") or "")
                if response_id:
                    metadata["response_id"] = response_id
                await get_usage_meter().bump_model_call(
                    user_id=None,
                    model=billing_model,
                    credit_reservation_id=reservation_id,
                    provider_request_id=request_id,
                    metadata=metadata,
                )
            except Exception as usage_error:
                logger.warning(
                    "failed to record Cognee embedding usage: %s",
                    usage_error,
                )
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
            cognee_module = _import_cognee_without_logging_takeover()

    cognee_module.config.system_root_directory(cognee_system_dir)
    if hasattr(cognee_module.config, "data_root_directory"):
        cognee_module.config.data_root_directory(cognee_data_dir)

    return cognee_system_dir, cognee_data_dir


def _resolve_embedding_config(
    model: str,
    dimensions: int | str | None,
) -> tuple[str, str, str, str]:
    from ai_anime.modules.model_usage.public import get_effective_cognee_embedding_config

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
        cognee = _import_cognee_without_logging_takeover()
    COGNEE_AVAILABLE = True
except ImportError:
    COGNEE_AVAILABLE = False

def init_cognee(
    *,
    embedding_dimensions: int | str | None = None,
) -> None:
    """Configure Cognee from the current role-routing snapshot."""
    global _active_gateway_fingerprint

    if not COGNEE_AVAILABLE:
        raise ImportError("cognee is not installed. Run: pip install cognee")
    _install_ladybug_windows_path_compatibility()
    if cognee_gateway_restart_required():
        raise RuntimeError(
            "模型网关配置已更新，Cognee 仍持有启动时的旧配置；"
            "请重启 AI anime 后再使用小说知识库。"
        )

    clean_text_model = resolve_model_for_role("TEXT")
    clean_embedding_model = resolve_model_for_role("EMBEDDING")

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
