"""AI anime API toolset for Hermes.

This plugin intentionally avoids terminal/shell/subprocess access. It uses
Python's stdlib HTTP client and the AI anime agent environment injected by
``ai_anime.modules.ai_assistant.infrastructure.hermes.hermes_pool``.
"""

from __future__ import annotations

import json
import mimetypes
import os
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

from tools.registry import tool_error, tool_result

TOOLSET = "ai_anime"
ACP_TOOLSET = "hermes-acp"
REGISTER_TOOLSETS = (ACP_TOOLSET,)
API_PREFIX = "/api/v1/"
try:
    DEFAULT_TIMEOUT_SECONDS = max(30, int(os.environ.get("AI_ANIME_API_TIMEOUT_SECONDS", "120")))
except ValueError:
    DEFAULT_TIMEOUT_SECONDS = 120
SCRIPT_UPLOAD_EXTENSIONS = {".txt", ".md", ".doc", ".docx"}
CHAT_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
STYLE_CONFIG_FIELDS = {
    "base",
    "style_instructions",
    "avoid_instructions",
    "style_tag",
    "label",
    "style_family",
    "animation_subtype",
}
REQUIRED_STYLE_CONFIG_FIELDS = STYLE_CONFIG_FIELDS - {"base"}
INGEST_PATH_ERROR = (
    "invalid ingest API path: use /projects/{project}/ingest/upload or "
    "/projects/{project}/ingest/start; ingest_fast is a task_type, not an endpoint; "
    "do not infer /ingest/init, /ingest/setup, /ingest_script, or /ingest_fast."
)
INGEST_START_TOOL_ERROR = (
    "POST /projects/{project}/ingest/start is only available through "
    "ai_anime_start_ingest; do not call it with ai_anime_post."
)
SCRIPT_WORKFLOW_TOOL_ERROR = (
    "Production workflow routes are only available through "
    "ai_anime_run_production_workflow, ai_anime_run_script_workflow, or their dedicated tools; "
    "do not bypass the task graph with ai_anime_post."
)
TEXT_CONTENT_FILTER_CHAT_ERROR = (
    "模型内容安全过滤拦截了本次文本生成，请调整原文或改写稿中的敏感描述后重试。"
)
VOICE_PREREQ_CHAT_PREFIX = (
    "配音任务没有成功启动：当前缺少声线前置。请到「资产库」上传或录制缺失的"
    "项目解说人声线/角色声线后，再回来继续生成配音。"
)
RENDER_PREREQ_CHAT_PREFIX = (
    "Render 任务没有生成可用图片：当前缺少必要草图前置。请先在「资产库」生成或确认对应 "
    "Beat 的草图后，再重新生成 Render。"
)
_READ_RESULT_CLASSIFIER_PADDING = " " * 512


def _has_text_content_filter(value: Any) -> bool:
    if isinstance(value, str):
        lowered = value.lower()
        return "content_filter" in lowered or "content filter triggered" in lowered
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() == "finish_reason" and str(item).lower() == "content_filter":
                return True
            if _has_text_content_filter(item):
                return True
        return False
    if isinstance(value, list):
        return any(_has_text_content_filter(item) for item in value)
    return False


def _voice_prereq_error_text(value: Any) -> str:
    if isinstance(value, str):
        text = value.strip()
        if "voice_prereq_required" in text or "声线缺失" in text:
            return text[:1200]
        return ""
    if isinstance(value, dict):
        code = str(value.get("code") or "").strip()
        error = str(value.get("error") or value.get("detail") or value.get("message") or "").strip()
        if code == "voice_prereq_required":
            return error[:1200] if error else "voice_prereq_required"
        if "声线缺失" in error:
            return error[:1200]
        for item in value.values():
            found = _voice_prereq_error_text(item)
            if found:
                return found
        return ""
    if isinstance(value, list):
        for item in value:
            found = _voice_prereq_error_text(item)
            if found:
                return found
    return ""


def _render_prereq_error_text(value: Any) -> str:
    if isinstance(value, str):
        text = value.strip()
        if "Render 模式需要草图" in text or "未生成可用图片" in text:
            return text[:1200]
        return ""
    if isinstance(value, dict):
        error = str(value.get("error") or value.get("detail") or value.get("message") or "").strip()
        if "Render 模式需要草图" in error or "未生成可用图片" in error:
            return error[:1200]
        for item in value.values():
            found = _render_prereq_error_text(item)
            if found:
                return found
        return ""
    if isinstance(value, list):
        for item in value:
            found = _render_prereq_error_text(item)
            if found:
                return found
    return ""


def _with_chat_error_hints(value: Any) -> Any:
    if isinstance(value, list):
        return [_with_chat_error_hints(item) for item in value]
    if not isinstance(value, dict):
        return value

    result = {key: _with_chat_error_hints(item) for key, item in value.items()}
    voice_error = _voice_prereq_error_text(value)
    if voice_error:
        result.setdefault(
            "chat_error",
            f"{VOICE_PREREQ_CHAT_PREFIX}\n\n缺失项：{voice_error}",
        )
        result.setdefault(
            "agent_instruction",
            (
                "Reply to the user with chat_error in natural Chinese. Make clear the audio task "
                "was not started. Tell the user they can go to 资产库 to upload or record the missing "
                "voice lines, then continue. Do not retry this dependent task until the prerequisite is fixed."
            ),
        )
    render_error = _render_prereq_error_text(value)
    if render_error:
        result.setdefault(
            "chat_error",
            f"{RENDER_PREREQ_CHAT_PREFIX}\n\n错误原因：{render_error}",
        )
        result.setdefault(
            "agent_instruction",
            (
                "Reply to the user with chat_error in natural Chinese. Make clear the render "
                "task did not produce usable images because sketches are missing. Tell the user "
                "to generate or verify sketches in 资产库 before retrying render. Do not retry "
                "this dependent task until the prerequisite is fixed."
            ),
        )
    if _has_text_content_filter(value):
        result.setdefault("chat_error", TEXT_CONTENT_FILTER_CHAT_ERROR)
        result.setdefault(
            "agent_instruction",
            (
                "Reply to the user with chat_error in natural Chinese. Do not quote the raw "
                "provider JSON or provider_response_id."
            ),
        )
    return result


def _ce_owner_mode() -> bool:
    """CE single-user mode: authenticate as the local owner without a token.

    A AI anime CE instance trusts local requests as the owner (no
    ``Authorization`` header required), so an external MCP client such as
    Claude Code can call the API on the same machine without minting an
    agent-session token. This is opt-in via ``AI_ANIME_CE_OWNER`` so it can
    never silently drop auth against an EE deployment.
    """
    raw = os.environ.get("AI_ANIME_CE_OWNER", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


# Hosts trusted as the local CE owner in tokenless owner mode. ``urlparse``
# lowercases the hostname and strips the brackets from ``[::1]``, so the bare
# forms below cover the bracketed IPv6 literal too.
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _ce_owner_allow_remote() -> bool:
    """Explicit, separately-named unsafe override for CE-owner mode.

    Tokenless CE-owner mode drops the ``Authorization`` header entirely, so it
    must only target a local CE the caller controls. Pointing it at a remote
    host would send owner-level, unauthenticated requests across the network;
    that is refused unless the operator opts in via
    ``AI_ANIME_CE_OWNER_ALLOW_REMOTE`` (deliberately a different variable from
    ``AI_ANIME_CE_OWNER`` so it cannot be enabled by accident).
    """
    raw = os.environ.get("AI_ANIME_CE_OWNER_ALLOW_REMOTE", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _enforce_ce_owner_target(url: str) -> None:
    """Require a loopback ``AI_ANIME_API_URL`` in tokenless CE-owner mode.

    Called only when owner mode is active and no bearer token is present. The
    host must be a loopback address (``localhost``/``127.0.0.1``/``::1``/
    ``[::1]``) unless the operator has set the explicit unsafe override
    ``AI_ANIME_CE_OWNER_ALLOW_REMOTE=1``.
    """
    if _ce_owner_allow_remote():
        return
    host = (urlparse(url).hostname or "").strip().lower()
    if host in _LOOPBACK_HOSTS:
        return
    raise ValueError(
        "AI_ANIME_CE_OWNER=1 refuses non-loopback AI_ANIME_API_URL "
        f"(host {host!r}): tokenless owner mode sends unauthenticated, "
        "owner-level requests and must point at a local CE "
        "(localhost, 127.0.0.1, ::1). Set AI_ANIME_CE_OWNER_ALLOW_REMOTE=1 "
        "to override (unsafe), or provide AI_ANIME_AGENT_TOKEN."
    )


def _available() -> bool:
    if not os.environ.get("AI_ANIME_API_URL"):
        return False
    return bool(os.environ.get("AI_ANIME_AGENT_TOKEN")) or _ce_owner_mode()


def _base_url() -> str:
    value = os.environ.get("AI_ANIME_API_URL", "").strip()
    if not value:
        raise ValueError("AI_ANIME_API_URL is not set")
    return value.rstrip("/")


def _token() -> str:
    value = os.environ.get("AI_ANIME_AGENT_TOKEN", "").strip()
    if not value:
        raise ValueError("AI_ANIME_AGENT_TOKEN is not set")
    return value


def _default_project_id() -> str:
    return os.environ.get("AI_ANIME_PROJECT_ID", "").strip()


def _project_output_dir() -> Path | None:
    value = (
        os.environ.get("AI_ANIME_PROJECT_OUTPUT_DIR")
        or os.environ.get("SUPERTALE_PROJECT_OUTPUT_DIR")
        or ""
    ).strip()
    return Path(value) if value else None


def _project_static_url(project: str, rel_path: str, local_path: Path | None = None) -> str:
    rel = quote(str(rel_path).lstrip("/"), safe="/")
    base = f"/static/projects/{quote(str(project), safe='')}/{rel}"
    if local_path is not None and local_path.exists():
        return f"{base}?v={local_path.stat().st_mtime_ns}"
    return base


def _normalize_api_path(path: str) -> str:
    raw = str(path or "").strip()
    if not raw:
        raise ValueError("path is required")
    if raw.startswith("http://") or raw.startswith("https://") or raw.startswith("//"):
        raise ValueError("absolute URLs are not allowed; pass a AI anime API path")
    if not raw.startswith("/"):
        raw = f"/{raw}"
    if raw.startswith("/projects/"):
        raw = f"/api/v1{raw}"
    if not raw.startswith(API_PREFIX):
        raise ValueError("path must start with /api/v1/ or /projects/")
    if any(part == ".." for part in raw.split("/")):
        raise ValueError("path traversal is not allowed")
    _validate_ingest_api_path(raw)
    return raw


def _validate_ingest_api_path(path: str) -> None:
    parts = [part for part in path.strip("/").split("/") if part]
    if len(parts) < 3 or parts[:2] != ["api", "v1"]:
        return

    route = parts[2:]
    if route and route[0] in {"ingest", "ingest_fast", "ingest_script"}:
        raise ValueError(INGEST_PATH_ERROR)

    if len(route) < 3 or route[0] != "projects":
        return

    project_route = route[2:]
    if not project_route:
        return

    first = project_route[0]
    if first in {"ingest_fast", "ingest_script"}:
        raise ValueError(INGEST_PATH_ERROR)
    if first != "ingest":
        return
    if project_route not in (["ingest", "upload"], ["ingest", "start"]):
        raise ValueError(INGEST_PATH_ERROR)


def _query_string(params: Any) -> str:
    if not isinstance(params, dict) or not params:
        return ""
    cleaned: dict[str, Any] = {}
    for key, value in params.items():
        if value is None or value == "":
            continue
        cleaned[str(key)] = value
    return f"?{urlencode(cleaned, doseq=True)}" if cleaned else ""


def _request(method: str, path: str, *, query: Any = None, body: Any = None) -> dict[str, Any]:
    api_path = _normalize_api_path(path)
    url = f"{_base_url()}{api_path}{_query_string(query)}"
    payload = None
    headers = {
        "Accept": "application/json",
        "User-Agent": "ai_anime-plugin/0.1.0",
    }
    token = os.environ.get("AI_ANIME_AGENT_TOKEN", "").strip()
    desktop_token = os.environ.get("AI_ANIME_DESKTOP_TOKEN", "").strip()
    if not token:
        if not _ce_owner_mode():
            _token()  # raise the standard "AI_ANIME_AGENT_TOKEN is not set" error
        # Tokenless owner mode drops Authorization entirely, so it must only
        # ever target a loopback CE unless explicitly overridden.
        _enforce_ce_owner_target(_base_url())
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if desktop_token:
        headers["X-AI-Anime-Desktop-Token"] = desktop_token
    if body is not None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = Request(url, data=payload, headers=headers, method=method.upper())
    try:
        with urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS) as resp:
            media_type = str(resp.headers.get_content_type() or "").lower()
            if media_type and media_type != "application/json" and not media_type.endswith("+json"):
                raw_length = resp.headers.get("Content-Length")
                try:
                    content_length = int(raw_length) if raw_length is not None else None
                except (TypeError, ValueError):
                    content_length = None
                return {
                    "ok": 200 <= resp.status < 300,
                    "status_code": resp.status,
                    "data": {
                        "media_type": media_type,
                        "content_length": content_length,
                    },
                }
            text = resp.read().decode("utf-8", errors="replace")
            return _with_chat_error_hints(_decode_response(resp.status, text))
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        return _with_chat_error_hints({
            "ok": False,
            "status_code": exc.code,
            "error": _response_error_text(text) or exc.reason,
            "data": _maybe_json(text),
        })
    except URLError as exc:
        return {"ok": False, "error": f"network_error: {exc.reason}"}


def _request_multipart_file(
    method: str,
    path: str,
    *,
    fields: dict[str, str],
    file_path: Path,
    file_field: str = "file",
) -> dict[str, Any]:
    api_path = _normalize_api_path(path)
    url = f"{_base_url()}{api_path}"
    boundary = f"ai-anime-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for key, value in fields.items():
        chunks.extend(
            (
                f"--{boundary}\r\n".encode("ascii"),
                (
                    f'Content-Disposition: form-data; name="{str(key)}"\r\n\r\n'
                ).encode("utf-8"),
                str(value).encode("utf-8"),
                b"\r\n",
            )
        )
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    chunks.extend(
        (
            f"--{boundary}\r\n".encode("ascii"),
            (
                f'Content-Disposition: form-data; name="{file_field}"; '
                f'filename="{file_path.name}"\r\n'
            ).encode("utf-8"),
            f"Content-Type: {content_type}\r\n\r\n".encode("ascii"),
            file_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode("ascii"),
        )
    )
    headers = {
        "Accept": "application/json",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "User-Agent": "ai_anime-plugin/0.1.0",
    }
    token = os.environ.get("AI_ANIME_AGENT_TOKEN", "").strip()
    desktop_token = os.environ.get("AI_ANIME_DESKTOP_TOKEN", "").strip()
    if not token:
        if not _ce_owner_mode():
            _token()
        _enforce_ce_owner_target(_base_url())
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if desktop_token:
        headers["X-AI-Anime-Desktop-Token"] = desktop_token

    req = Request(
        url,
        data=b"".join(chunks),
        headers=headers,
        method=method.upper(),
    )
    try:
        with urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return _with_chat_error_hints(_decode_response(resp.status, text))
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        return _with_chat_error_hints(
            {
                "ok": False,
                "status_code": exc.code,
                "error": _response_error_text(text) or exc.reason,
                "data": _maybe_json(text),
            }
        )
    except URLError as exc:
        return {"ok": False, "error": f"network_error: {exc.reason}"}


def _decode_response(status_code: int, text: str) -> dict[str, Any]:
    data = _maybe_json(text)
    if isinstance(data, dict):
        return {"status_code": status_code, **data}
    return {"ok": 200 <= status_code < 300, "status_code": status_code, "data": data}


def _maybe_json(text: str) -> Any:
    stripped = text.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return stripped


def _response_error_text(text: str) -> str:
    data = _maybe_json(text)
    if isinstance(data, dict):
        for key in ("error", "message", "detail"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    if isinstance(data, str):
        return data[:500]
    return ""


def _read_tool_result(response: dict[str, Any]) -> str:
    """Keep successful read results from being misclassified by Hermes.

    Hermes 0.19 scans the first 500 result characters for domain values such
    as ``"failed"`` or nested ``"error"`` fields. A successful task-list GET
    may legitimately contain both, so place an explicit transport-success
    marker before the unchanged response payload.
    """
    status_code = response.get("status_code")
    if (
        isinstance(status_code, int)
        and 200 <= status_code < 300
        and response.get("ok") is not False
    ):
        return tool_result(
            {
                "tool_execution": f"completed{_READ_RESULT_CLASSIFIER_PADDING}",
                **response,
            }
        )
    return tool_result(response)


def _project_from_args(args: dict[str, Any]) -> str:
    project = str(args.get("project_id") or args.get("project") or _default_project_id()).strip()
    if not project:
        raise ValueError("project_id is required and AI_ANIME_PROJECT_ID is not set")
    return project


def _limit_items(items: list[dict[str, Any]], args: dict[str, Any], default: int) -> list[dict[str, Any]]:
    raw = args.get("limit")
    try:
        limit = int(raw) if raw is not None else default
    except (TypeError, ValueError):
        limit = default
    limit = max(1, min(limit, default))
    try:
        offset = int(args.get("offset") or 0)
    except (TypeError, ValueError):
        offset = 0
    offset = max(0, offset)
    return items[offset : offset + limit]


def _requested_beats(args: dict[str, Any]) -> set[int] | None:
    raw = args.get("beat_indices") or args.get("beats")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    for key in ("beat", "beat_num", "beat_number", "index"):
        if args.get(key) is not None:
            values.append(args[key])
    beats: set[int] = set()
    for value in values:
        try:
            beat = int(value)
        except (TypeError, ValueError):
            continue
        if beat > 0:
            beats.add(beat)
    return beats or None


def _requested_names(args: dict[str, Any]) -> set[str] | None:
    raw = args.get("names")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    for key in ("name", "character"):
        if args.get(key) is not None:
            values.append(args[key])
    names = {str(value).strip() for value in values if str(value or "").strip()}
    return names or None


def _requested_queries(args: dict[str, Any]) -> set[str] | None:
    raw = args.get("queries") or args.get("keywords")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    for key in ("query", "search", "keyword", "text", "identity_name"):
        if args.get(key) is not None:
            values.append(args[key])
    queries = {str(value).strip() for value in values if str(value or "").strip()}
    return queries or None


def _requested_scene_names(args: dict[str, Any]) -> set[str] | None:
    raw = args.get("names") or args.get("scene_names")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    for key in ("name", "scene_name"):
        if args.get(key) is not None:
            values.append(args[key])
    names = {str(value).strip() for value in values if str(value or "").strip()}
    return names or None


def _requested_scene_indices(args: dict[str, Any]) -> set[int] | None:
    raw = args.get("scene_indices") or args.get("indices")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    if args.get("index") is not None:
        values.append(args["index"])
    indices: set[int] = set()
    for value in values:
        try:
            index = int(value)
        except (TypeError, ValueError):
            continue
        if index > 0:
            indices.add(index)
    return indices or None


def _matches_any_scene_name(scene_name: str, requested_names: set[str] | None) -> bool:
    if requested_names is None:
        return True
    haystack = str(scene_name or "").casefold()
    return any(needle.casefold() in haystack for needle in requested_names if needle)


def _matches_any_text(fields: list[Any], queries: set[str] | None) -> bool:
    if queries is None:
        return True
    haystack = "\n".join(_flatten_text_fields(fields)).casefold()
    return any(query.casefold() in haystack for query in queries if query)


def _flatten_text_fields(fields: list[Any]) -> list[str]:
    values: list[str] = []
    for field in fields:
        if isinstance(field, dict):
            values.extend(_flatten_text_fields(list(field.values())))
        elif isinstance(field, list):
            values.extend(_flatten_text_fields(field))
        elif field is not None:
            text = str(field).strip()
            if text:
                values.append(text)
    return values


def _media_ui_spec(spec_type: str, component_type: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    elements: dict[str, Any] = {
        "root": {
            "type": "Stack",
            "props": {
                "direction": "row",
                "wrap": "wrap",
                "spacing": 16,
                "alignItems": "flex-start",
                "width": "100%",
            },
            "children": [],
        }
    }
    for index, item in enumerate(items, start=1):
        src = str(item.get("src") or item.get("url") or "").strip()
        if not src:
            continue
        key = f"media_{index}"
        title = str(item.get("title") or item.get("label") or f"媒体 {index}").strip()
        description = str(item.get("description") or "").strip()
        props: dict[str, Any] = {
            "src": src,
            "alt": title,
            "title": title,
        }
        if description:
            props["description"] = description
        if component_type == "Image":
            props.update(
                {
                    "fit": item.get("fit") or "cover",
                    "aspectRatio": item.get("aspectRatio") or "3/4",
                    "overlayTitle": title,
                }
            )
            if description:
                props["overlayDescription"] = description
        elif component_type == "Video":
            props["poster"] = str(item.get("poster") or item.get("thumbnail") or "").strip()
            props["controls"] = True
        elif component_type == "Audio":
            props["controls"] = True

        elements[key] = {"type": component_type, "props": props, "children": []}
        elements["root"]["children"].append(key)
    return {"type": spec_type, "root": "root", "elements": elements}


def _image_ui_spec(spec_type: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    return _media_ui_spec(spec_type, "Image", items)


def _video_ui_spec(items: list[dict[str, Any]]) -> dict[str, Any]:
    return _media_ui_spec("keyframe_video", "Video", items)


def _audio_ui_spec(items: list[dict[str, Any]]) -> dict[str, Any]:
    return _media_ui_spec("audio_list", "Audio", items)


def _handle_get(args: dict[str, Any], **_: Any) -> str:
    try:
        path = str(args.get("path") or "")
        return _read_tool_result(
            _request(
                "GET",
                path,
                query=args.get("query"),
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_post(args: dict[str, Any], **_: Any) -> str:
    try:
        path = str(args.get("path") or "")
        normalized_path = _normalize_api_path(path)
        if _is_script_workflow_write_path(normalized_path):
            if _is_ingest_start_path(normalized_path):
                return tool_error(INGEST_START_TOOL_ERROR)
            return tool_error(SCRIPT_WORKFLOW_TOOL_ERROR)
        if normalized_path == "/api/v1/styles":
            return _handle_create_style(args)
        return tool_result(
            _request(
                "POST",
                normalized_path,
                query=args.get("query"),
                body=args.get("body"),
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _chat_image_path(value: Any) -> Path:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("attachment_path is required")
    relative = Path(raw)
    if relative.is_absolute() or any(part == ".." for part in relative.parts):
        raise ValueError("attachment_path must be a project-relative chat attachment")
    project_dir = _project_output_dir()
    if project_dir is None:
        raise ValueError("current project output directory is unavailable")
    root = project_dir.expanduser().resolve()
    attachment_root = (root / "uploads" / "assistant").resolve()
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(attachment_root):
        raise ValueError("only images attached in the current chat can be used")
    if candidate.suffix.lower() not in CHAT_IMAGE_EXTENSIONS:
        raise ValueError("attachment_path must reference a PNG, JPEG, WebP, or GIF image")
    if not candidate.is_file():
        raise ValueError("attached image does not exist")
    return candidate


def _generate_style_preview_response(
    *,
    project: str,
    style_id: str,
    prompt: Any,
) -> dict[str, Any]:
    resolved_prompt = (
        str(prompt or "").strip()
        or "An anonymous adult character in a representative everyday environment"
    )
    response = _request(
        "POST",
        f"/api/v1/styles/{quote(style_id, safe='')}/preview",
        body={
            "project": project,
            "prompt": resolved_prompt,
        },
    )
    if response.get("ok") is not False:
        response.setdefault(
            "agent_instruction",
            "参考图生成已进入任务中心；不要再次创建或更新该风格配置。",
        )
    return response


def _upload_style_preview_response(
    *,
    style_id: str,
    attachment_path: Any,
) -> dict[str, Any]:
    return _request_multipart_file(
        "PUT",
        f"/api/v1/styles/{quote(style_id, safe='')}/preview",
        fields={},
        file_path=_chat_image_path(attachment_path),
    )


def _canonical_style_config(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("config must be an object containing the complete style configuration")
    unknown = sorted(set(value) - STYLE_CONFIG_FIELDS)
    if unknown:
        raise ValueError(
            "unsupported style config fields: "
            + ", ".join(unknown)
            + "; describe all visual details inside style_instructions"
        )
    missing = sorted(REQUIRED_STYLE_CONFIG_FIELDS - set(value))
    if missing:
        raise ValueError("missing required style config fields: " + ", ".join(missing))

    config: dict[str, Any] = {}
    for key in REQUIRED_STYLE_CONFIG_FIELDS:
        raw = value[key]
        if not isinstance(raw, str):
            raise ValueError(f"config.{key} must be a string")
        config[key] = raw.strip()
    for key in ("label", "style_instructions", "avoid_instructions", "style_tag"):
        if not config[key]:
            raise ValueError(f"config.{key} must not be empty")

    family = config["style_family"]
    subtype = config["animation_subtype"]
    if family not in {"live_action", "animation"}:
        raise ValueError("config.style_family must be live_action or animation")
    if family == "animation" and subtype not in {"2d", "3d", "hybrid"}:
        raise ValueError("animation styles require animation_subtype: 2d, 3d, or hybrid")
    if family == "live_action" and subtype:
        raise ValueError("live_action styles require an empty animation_subtype")

    if "base" in value:
        base = value["base"]
        if base is not None and not isinstance(base, str):
            raise ValueError("config.base must be a string or null")
        config["base"] = base.strip() if isinstance(base, str) else None
    return config


def _handle_create_style(args: dict[str, Any], **_: Any) -> str:
    """Create an account-wide style without inventing an internal id."""
    try:
        source = args.get("body") if isinstance(args.get("body"), dict) else args
        name = str(source.get("name") or "").strip()
        if not name:
            raise ValueError("name is required")
        project = str(
            source.get("project")
            or args.get("project_id")
            or _default_project_id()
        ).strip()
        preview_prompt = source.get("preview_prompt")
        attachment_path = source.get("attachment_path")
        create_preview = bool(source.get("create_preview"))
        if attachment_path and (preview_prompt or create_preview):
            raise ValueError("preview_prompt/create_preview and attachment_path cannot be used together")

        config = _canonical_style_config(source.get("config"))

        body: dict[str, Any] = {
            "name": name,
            "config": config,
        }
        style_id = str(source.get("id") or "").strip()
        if style_id:
            body["id"] = style_id
        preview_path = source.get("preview_path")
        if preview_path:
            body["preview_path"] = preview_path
        created = _request("POST", "/api/v1/styles", body=body)
        if created.get("ok") is False:
            if created.get("error") == "style_already_exists":
                created["chat_error"] = (
                    f"风格“{style_id}”已经存在。生成参考图时请改用"
                    " ai_anime_generate_style_preview。"
                )
                created["agent_instruction"] = (
                    "已有风格生成参考图必须使用 ai_anime_generate_style_preview；"
                    "不得重新创建风格或修改配置字段。"
                )
            return tool_result(created)
        data = created.get("data")
        created_style_id = str(
            (data.get("id") if isinstance(data, dict) else "") or style_id
        ).strip()
        if not created_style_id:
            return tool_result(
                {
                    "ok": False,
                    "error": "风格已创建，但接口没有返回风格 ID，无法继续处理参考图",
                    "data": {"style_created": True},
                }
            )

        created_style = {
            "id": created_style_id,
            "name": name,
            **config,
        }
        if isinstance(data, dict) and isinstance(data.get("style"), dict):
            created_style.update(data["style"])

        preview: dict[str, Any] | None = None
        if attachment_path:
            preview = _upload_style_preview_response(
                style_id=created_style_id,
                attachment_path=attachment_path,
            )
        elif preview_prompt or create_preview:
            if not project:
                raise ValueError("project_id is required when generating a reference image")
            preview = _generate_style_preview_response(
                project=project,
                style_id=created_style_id,
                prompt=preview_prompt,
            )
        if preview is None:
            return tool_result(
                {
                    "ok": True,
                    "data": {"style": created_style},
                    "agent_instruction": (
                        "The returned style object is the authoritative saved configuration. "
                        "Do not issue a follow-up GET to verify it."
                    ),
                }
            )
        if preview.get("ok") is False:
            return tool_result(
                {
                    "ok": False,
                    "error": "风格已创建，但参考图处理失败",
                    "chat_error": (
                        f"风格“{name}”已经创建，但参考图处理失败："
                        f"{preview.get('error') or '未知错误'}"
                    ),
                    "data": {
                        "style_created": True,
                        "style_id": created_style_id,
                        "preview": preview,
                    },
                }
            )
        return tool_result(
            {
                "ok": True,
                "data": {
                    "style": created_style,
                    "preview": preview.get("data") or {
                        key: value
                        for key, value in preview.items()
                        if key not in {"ok", "status_code", "agent_instruction"}
                    },
                },
                "agent_instruction": (
                    f"{preview.get('agent_instruction') or ''} "
                    "The returned style object is the authoritative saved configuration. "
                    "After ai_anime_wait_task reports completed, the operation is finished; "
                    "do not call GET /styles/{id} or GET /styles/{id}/preview to verify it."
                ).strip(),
            }
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_generate_style_preview(args: dict[str, Any], **_: Any) -> str:
    try:
        project = _project_from_args(args)
        style_id = str(args.get("style_id") or args.get("id") or "").strip()
        if not style_id:
            raise ValueError("style_id is required")
        return tool_result(
            _generate_style_preview_response(
                project=project,
                style_id=style_id,
                prompt=args.get("prompt"),
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_upload_style_preview(args: dict[str, Any], **_: Any) -> str:
    try:
        style_id = str(args.get("style_id") or args.get("id") or "").strip()
        if not style_id:
            raise ValueError("style_id is required")
        return tool_result(
            _upload_style_preview_response(
                style_id=style_id,
                attachment_path=args.get("attachment_path"),
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_patch(args: dict[str, Any], **_: Any) -> str:
    try:
        return tool_result(_request("PATCH", str(args.get("path") or ""), query=args.get("query"), body=args.get("body")))
    except Exception as exc:
        return tool_error(str(exc))


def _handle_delete(args: dict[str, Any], **_: Any) -> str:
    try:
        return tool_result(_request("DELETE", str(args.get("path") or ""), query=args.get("query"), body=args.get("body")))
    except Exception as exc:
        return tool_error(str(exc))


def _handle_pipeline_status(args: dict[str, Any], **_: Any) -> str:
    try:
        project = _project_from_args(args)
        query = {"episode": args.get("episode")}
        return _read_tool_result(
            _request("GET", f"/api/v1/projects/{project}/pipeline/status", query=query)
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_list_tasks(args: dict[str, Any], **_: Any) -> str:
    try:
        project = _project_from_args(args)
        query = {
            "episode": args.get("episode"),
            "task_type": args.get("task_type"),
            "status": args.get("status"),
        }
        return _read_tool_result(
            _request("GET", f"/api/v1/projects/{project}/tasks", query=query)
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_get_task(args: dict[str, Any], **_: Any) -> str:
    try:
        project = _project_from_args(args)
        task_key = str(args.get("task_key") or "").strip()
        if not task_key:
            raise ValueError("task_key is required")
        return _read_tool_result(
            _request(
                "GET",
                f"/api/v1/projects/{project}/tasks/status",
                query={"task_key": task_key},
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _task_status_from_response(response: dict[str, Any]) -> str:
    data: Any = response.get("data")
    if isinstance(data, dict) and isinstance(data.get("task"), dict):
        data = data["task"]
    for candidate in (data, response.get("task"), response):
        if isinstance(candidate, dict):
            status = str(candidate.get("status") or "").strip().lower()
            if status:
                return status
    return ""


def _handle_wait_task(args: dict[str, Any], **_: Any) -> str:
    """Wait for one asynchronous project task without issuing another write."""
    try:
        project = _project_from_args(args)
        task_key = str(args.get("task_key") or "").strip()
        if not task_key:
            raise ValueError("task_key is required")
        timeout_seconds = min(240.0, max(1.0, float(args.get("timeout_seconds") or 120.0)))
        poll_interval = min(
            5.0,
            max(0.5, float(args.get("poll_interval_seconds") or 1.0)),
        )
        started_at = time.monotonic()
        attempts = 0
        latest: dict[str, Any] = {"ok": True, "status_code": 200, "data": None}
        terminal_statuses = {"completed", "failed", "cancelled", "canceled"}

        while True:
            attempts += 1
            latest = _request(
                "GET",
                f"/api/v1/projects/{project}/tasks/status",
                query={"task_key": task_key},
            )
            status_code = latest.get("status_code")
            if latest.get("ok") is False or (
                isinstance(status_code, int) and status_code >= 400
            ):
                return _read_tool_result(latest)

            status = _task_status_from_response(latest)
            elapsed = time.monotonic() - started_at
            if status in terminal_statuses or elapsed >= timeout_seconds:
                data = latest.get("data")
                task_type = (
                    str(data.get("task_type") or "").strip()
                    if isinstance(data, dict)
                    else ""
                )
                if task_type == "style_preview" and status == "completed":
                    latest = {
                        **latest,
                        "agent_instruction": (
                            "风格参考图任务已经完成，结果已持久化到当前风格。"
                            "直接向用户报告成功，不要再调用风格详情或预览 GET 接口验证。"
                        ),
                    }
                return _read_tool_result(
                    {
                        **latest,
                        "wait": {
                            "terminal": status in terminal_statuses,
                            "status": status or "not_found",
                            "attempts": attempts,
                            "elapsed_seconds": round(elapsed, 2),
                            "timed_out": status not in terminal_statuses,
                        },
                    }
                )
            time.sleep(min(poll_interval, max(0.0, timeout_seconds - elapsed)))
    except Exception as exc:
        return tool_error(str(exc))


def _handle_get_episode_script(args: dict[str, Any], **_: Any) -> str:
    try:
        project = _project_from_args(args)
        episode = int(args.get("episode") or 1)
        return _read_tool_result(
            _request("GET", f"/api/v1/projects/{project}/episodes/{episode}/script")
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_list_ingest_uploads(args: dict[str, Any], **_: Any) -> str:
    """List project files already uploaded to the local ingest script directory."""
    try:
        project = _project_from_args(args)
        current_project = _default_project_id()
        if current_project and project != current_project:
            raise ValueError("can only list uploads for the current Hermes project scope")

        project_dir_raw = os.environ.get("AI_ANIME_PROJECT_OUTPUT_DIR", "").strip()
        if not project_dir_raw:
            project_dir_raw = os.environ.get("SUPERTALE_PROJECT_OUTPUT_DIR", "").strip()
        if not project_dir_raw:
            return tool_result(
                {
                    "ok": True,
                    "data": {
                        "project_id": project,
                        "count": 0,
                        "files": [],
                        "upload_dir_available": False,
                        "message": "project upload directory is not available in this Hermes session",
                    },
                }
            )

        project_dir = Path(project_dir_raw).expanduser().resolve()
        upload_dir = (project_dir / "uploads").resolve()
        if not upload_dir.is_relative_to(project_dir):
            raise ValueError("invalid upload directory")
        if not upload_dir.exists():
            return tool_result(
                {
                    "ok": True,
                    "data": {
                        "project_id": project,
                        "count": 0,
                        "files": [],
                        "upload_dir_available": True,
                    },
                }
            )

        files = []
        for path in upload_dir.iterdir():
            if not path.is_file() or path.name.startswith("."):
                continue
            suffix = path.suffix.lower()
            if suffix not in SCRIPT_UPLOAD_EXTENSIONS:
                continue
            stat = path.stat()
            files.append(
                {
                    "filename": path.name,
                    "size": stat.st_size,
                    "modified_at": int(stat.st_mtime),
                    "extension": suffix,
                }
            )
        files.sort(key=lambda item: (item["modified_at"], item["filename"]), reverse=True)
        return tool_result(
            {
                "ok": True,
                "data": {
                    "project_id": project,
                    "count": len(files),
                    "files": files,
                    "upload_dir_available": True,
                },
            }
        )
    except Exception as exc:
        return tool_error(str(exc))


def _is_ingest_start_path(path: str) -> bool:
    parts = [part for part in path.strip("/").split("/") if part]
    return (
        len(parts) == 6
        and parts[:3] == ["api", "v1", "projects"]
        and parts[4:] == ["ingest", "start"]
    )


def _is_script_workflow_write_path(path: str) -> bool:
    parts = [part for part in path.strip("/").split("/") if part]
    if len(parts) < 5 or parts[:3] != ["api", "v1", "projects"]:
        return False
    suffix = parts[4:]
    if suffix in (
        ["ingest", "start"],
        ["characters", "build"],
        ["episodes", "plan"],
        ["workflow", "scripts"],
        ["workflow", "production"],
    ):
        return True
    return len(suffix) == 4 and suffix[0] == "episodes" and suffix[2:] in (
        ["identities", "plan"],
        ["scenes", "plan"],
        ["script", "generate"],
    )


def _start_script_workflow(
    args: dict[str, Any],
    *,
    mode: str,
    target: str,
    episodes: list[int] | None = None,
) -> dict[str, Any]:
    project = _project_from_args(args)
    body: dict[str, Any] = {"mode": mode, "target": target}
    resolved_episodes = episodes
    if resolved_episodes is None and isinstance(args.get("episodes"), list):
        resolved_episodes = [int(value) for value in args["episodes"]]
    if resolved_episodes:
        body["episodes"] = resolved_episodes
    for key in (
        "filename",
        "rebuild",
        "spine_template",
        "target_episodes",
        "planning_mode",
        "script_mode",
        "target_duration_total",
        "target_beats",
        "max_parallel",
    ):
        if args.get(key) is not None:
            body[key] = args[key]
    return _request(
        "POST",
        f"/api/v1/projects/{project}/workflow/scripts",
        body=body,
    )


def _start_production_workflow(args: dict[str, Any]) -> dict[str, Any]:
    project = _project_from_args(args)
    body: dict[str, Any] = {}
    for key in (
        "episodes",
        "filename",
        "rebuild",
        "spine_template",
        "target_episodes",
        "planning_mode",
        "script_mode",
        "target_duration_total",
        "target_beats",
        "max_parallel",
        "node_timeout_seconds",
        "audio_model",
        "video_model",
        "video_resolution",
        "add_subtitles",
        "add_bgm",
    ):
        if args.get(key) is not None:
            body[key] = args[key]
    return _request(
        "POST",
        f"/api/v1/projects/{project}/workflow/production",
        body=body,
    )


def _handle_run_production_workflow(args: dict[str, Any], **_: Any) -> str:
    """Run the one canonical story-to-final-video production workflow."""
    try:
        return tool_result(_start_production_workflow(args))
    except Exception as exc:
        return tool_error(str(exc))


def _handle_run_script_workflow(args: dict[str, Any], **_: Any) -> str:
    """Run one node or the complete prerequisite-aware script graph."""
    try:
        return tool_result(
            _start_script_workflow(
                args,
                mode=str(args.get("mode") or "through"),
                target=str(args.get("target") or "script"),
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_start_ingest(args: dict[str, Any], **_: Any) -> str:
    """Start story ingestion through the task center's current model routes."""
    try:
        filename = str(args.get("filename") or "").strip()
        if not filename:
            raise ValueError("filename is required")
        return tool_result(
            _start_script_workflow(
                {**args, "filename": filename, "rebuild": bool(args.get("rebuild", False))},
                mode="single",
                target="ingest",
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_build_characters(args: dict[str, Any], **_: Any) -> str:
    """Trigger character extraction from the project's knowledge graph.

    Runs only the ``characters`` node in the canonical graph. Requires ingest
    to be complete and reports that prerequisite if it is missing. Wait with
    ``ai_anime_wait_task(task_key=<returned task_key>)`` and read
    results with ``ai_anime_get(path="/projects/{project}/characters")``.
    """
    try:
        return tool_result(
            _start_script_workflow(args, mode="single", target="characters")
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_plan_episodes(args: dict[str, Any], **_: Any) -> str:
    """Plan/generate episodes (分集规划) from the ingested story + characters.

    Runs only the ``episodes`` node in the canonical graph. Requires ingest
    and character extraction to be complete. Wait with
    ``ai_anime_wait_task(task_key=<returned task_key>)`` and read results
    with ``ai_anime_get(path="/projects/{project}/episodes")``.
    """
    try:
        return tool_result(
            _start_script_workflow(args, mode="single", target="episodes")
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_generate_script(args: dict[str, Any], **_: Any) -> str:
    """Generate one episode through the complete prerequisite-aware script graph.

    Missing ingest, characters, episodes, identities, and scenes are scheduled
    in dependency order. Wait only for the returned workflow task key, then read
    the result with ai_anime_get_episode_script(episode=N).
    """
    try:
        episode = int(args.get("episode") or 0)
        if episode <= 0:
            raise ValueError("episode is required and must be a positive integer")
        return tool_result(
            _start_script_workflow(
                args,
                mode="through",
                target="script",
                episodes=[episode],
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _require_episode(args: dict[str, Any]) -> int:
    episode = int(args.get("episode") or 0)
    if episode <= 0:
        raise ValueError("episode is required and must be a positive integer")
    return episode


def _require_name(args: dict[str, Any]) -> str:
    name = str(args.get("name") or args.get("character") or "").strip()
    if not name:
        raise ValueError("name (character name) is required")
    return name


def _handle_update_character_face_prompt(args: dict[str, Any], **_: Any) -> str:
    """Update a character's face_prompt before portrait generation."""
    try:
        project = _project_from_args(args)
        name = _require_name(args)
        face_prompt = str(args.get("face_prompt") or "").strip()
        if not face_prompt:
            raise ValueError("face_prompt is required")
        return tool_result(
            _request(
                "PATCH",
                f"/api/v1/projects/{project}/characters/{quote(name, safe='')}",
                body={"face_prompt": face_prompt},
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _episode_post(args: dict[str, Any], suffix: str, *, body: Any = None) -> dict[str, Any]:
    project = _project_from_args(args)
    episode = _require_episode(args)
    return _request("POST", f"/api/v1/projects/{project}/episodes/{episode}/{suffix}", body=body)


def _handle_plan_identities(args: dict[str, Any], **_: Any) -> str:
    """Run the identity-planning node for one episode through the canonical graph."""
    try:
        episode = _require_episode(args)
        return tool_result(
            _start_script_workflow(
                args,
                mode="single",
                target="identities",
                episodes=[episode],
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_plan_scenes(args: dict[str, Any], **_: Any) -> str:
    """Plan an episode scene menu before sketch generation."""
    try:
        episode = _require_episode(args)
        return tool_result(
            _start_script_workflow(
                args,
                mode="single",
                target="scenes",
                episodes=[episode],
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_plan_props(args: dict[str, Any], **_: Any) -> str:
    """Plan an episode prop menu before sketch generation."""
    try:
        return tool_result(_episode_post(args, "props/plan"))
    except Exception as exc:
        return tool_error(str(exc))


def _handle_generate_scene_master(args: dict[str, Any], **_: Any) -> str:
    """Generate one scene's canonical master reference image."""
    try:
        project = _project_from_args(args)
        name = str(args.get("name") or args.get("scene_name") or "").strip()
        if not name:
            raise ValueError("name (scene name) is required")
        return tool_result(
            _request(
                "POST",
                f"/api/v1/projects/{project}/scenes/{quote(name, safe='')}/master/generate-async",
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_generate_scene_reverse(args: dict[str, Any], **_: Any) -> str:
    """Generate one scene's reverse master reference image."""
    try:
        project = _project_from_args(args)
        name = str(args.get("name") or args.get("scene_name") or "").strip()
        if not name:
            raise ValueError("name (scene name) is required")
        return tool_result(
            _request(
                "POST",
                f"/api/v1/projects/{project}/scenes/{quote(name, safe='')}/reverse/generate-async",
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_generate_sketches(args: dict[str, Any], **_: Any) -> str:
    """Generate beat sketches for one episode (草图生成, sketch_generation task).

    POST /projects/{project}/episodes/{episode}/sketches/assign-colors, then
    POST /projects/{project}/episodes/{episode}/sketches/generate with the
    canonical request body. Runs after the script exists. Wait with the returned
    task_key.
    """
    try:
        project = _project_from_args(args)
        episode = _require_episode(args)
        body = {
            "grid_index": -1,
            "sketch_scene_grouping": True,
            "aspect_ratio": "2:3",
        }
        if isinstance(args.get("body"), dict):
            body.update(
                {
                    key: value
                    for key, value in args["body"].items()
                    if key
                    in {
                        "style",
                        "grid_index",
                        "sketch_scene_grouping",
                        "aspect_ratio",
                        "image_generation_selection",
                    }
                    and value is not None
                }
            )
        for key in (
            "style",
            "grid_index",
            "sketch_scene_grouping",
            "aspect_ratio",
            "image_generation_selection",
        ):
            if key in args and args[key] is not None:
                body[key] = args[key]
        if args.get("model") is not None and "image_generation_selection" not in body:
            body["image_generation_selection"] = args["model"]

        if args.get("auto_assign_colors", True):
            colors = _request(
                "POST",
                f"/api/v1/projects/{project}/episodes/{episode}/sketches/assign-colors",
            )
            if not colors.get("ok"):
                return tool_result(
                    {
                        "ok": False,
                        "stage": "assign-colors",
                        "error": colors.get("error") or "assign-colors failed",
                        "data": colors,
                    }
                )

        result = _request(
            "POST",
            f"/api/v1/projects/{project}/episodes/{episode}/sketches/generate",
            body=body,
        )
        if isinstance(result, dict):
            result.setdefault("request_body", body)
        return tool_result(result)
    except Exception as exc:
        return tool_error(str(exc))


def _handle_detect_sketch_identities(args: dict[str, Any], **_: Any) -> str:
    """Run episode-wide sketch AI detection for identities and props."""
    try:
        project = _project_from_args(args)
        episode = _require_episode(args)
        result = _request(
            "POST",
            f"/api/v1/projects/{project}/episodes/{episode}/sketches/detect-identities",
        )
        if isinstance(result, dict) and not result.get("ok"):
            error_text = str(result.get("error") or "").casefold()
            if "timed out" in error_text or "timeout" in error_text:
                result.setdefault("retryable", False)
                result.setdefault(
                    "agent_instruction",
                    "Stop retrying this tool in the same turn. Report that AI detection timed "
                    "out and ask the user to retry later or run it from the frontend.",
                )
        return tool_result(result)
    except Exception as exc:
        return tool_error(str(exc))


def _handle_optimize_video_global(args: dict[str, Any], **_: Any) -> str:
    """Run global video optimization for one episode (全局视频优化, global_optimize_video).

    POST /projects/{project}/episodes/{episode}/optimize/video-global. Wait with the
    returned task_key.
    """
    try:
        return tool_result(_episode_post(args, "optimize/video-global"))
    except Exception as exc:
        return tool_error(str(exc))


def _handle_generate_audio(args: dict[str, Any], **_: Any) -> str:
    """Generate episode audio via the current IndexTTS2 audio pipeline."""
    try:
        body: dict[str, Any] = {}
        for key in ("model", "mode", "beat_numbers"):
            if args.get(key) is not None:
                body[key] = args[key]
        result = _episode_post(args, "audio/generate", body=body)
        if (
            isinstance(result, dict)
            and result.get("code") == "audio_generation_not_required"
        ):
            result = {**result, "ok": True, "skipped": True}
        return tool_result(result)
    except Exception as exc:
        return tool_error(str(exc))


def _resolve_episode_beats(project: str, episode: int) -> list[int]:
    """Fetch the episode's beat numbers via GET /episodes/{ep}/beats."""
    resp = _request("GET", f"/api/v1/projects/{project}/episodes/{episode}/beats")
    items: Any = None
    if isinstance(resp, dict):
        for key in ("data", "beats", "items"):
            value = resp.get(key)
            if isinstance(value, list):
                items = value
                break
        if items is None and isinstance(resp.get("data"), dict):
            items = resp["data"].get("beats")
    return [
        int(b["beat_number"])
        for b in (items or [])
        if isinstance(b, dict) and b.get("beat_number") is not None
    ]


def _handle_get_sketches(args: dict[str, Any], **_: Any) -> str:
    """Get display-ready sketch URLs for an episode (to SHOW the user).

    Wraps GET /projects/{project}/episodes/{episode}/beats and returns, per beat,
    the servable ``sketch_url``. Use ``ai_anime_get_first_frames`` for first frames.
    Do NOT read
    the local ``sketch_path`` from a task result, and do NOT use vision_analyze —
    that only lets the agent look at the image, it does NOT show it to the user.
    """
    try:
        project = _project_from_args(args)
        episode = _require_episode(args)
        media_kind = "sketch"
        resp = _request("GET", f"/api/v1/projects/{project}/episodes/{episode}/beats")
        items: Any = None
        if isinstance(resp, dict):
            for key in ("data", "beats", "items"):
                value = resp.get(key)
                if isinstance(value, list):
                    items = value
                    break
            if items is None and isinstance(resp.get("data"), dict):
                items = resp["data"].get("beats")
        sketches = []
        media_items = []
        requested_beats = _requested_beats(args)
        for b in items or []:
            if not isinstance(b, dict):
                continue
            beat_number = b.get("beat_number")
            try:
                beat_int = int(beat_number)
            except (TypeError, ValueError):
                beat_int = None
            if requested_beats is not None and beat_int not in requested_beats:
                continue
            sketch_url = b.get("sketch_url") or ""
            video_url = b.get("video_url") or ""
            sketches.append(
                {
                    "beat_number": beat_number,
                    "sketch_url": sketch_url,
                    "sketch_source": "sketch" if sketch_url else "",
                    "video_url": video_url,
                    "characters": b.get("character_names") or b.get("characters"),
                }
            )
            if sketch_url:
                media_items.append(
                    {
                        "src": sketch_url,
                        "title": f"Beat {beat_number} 草图",
                        "description": "草图",
                        "aspectRatio": "3/4",
                    }
                )
        limited_media = _limit_items(media_items, args, 12)
        return tool_result(
            {
                "ok": True,
                "episode": episode,
                "media_kind": media_kind,
                "count": len(sketches),
                "sketches": sketches,
                "ui_spec": _image_ui_spec("sketch_gallery", limited_media) if limited_media else None,
            }
        )
    except Exception as exc:
        return tool_result({"ok": False, "error": str(exc)})


def _handle_get_first_frames(args: dict[str, Any], **_: Any) -> str:
    """Get display-ready first-frame URLs for an episode (to SHOW the user).

    Wraps GET /projects/{project}/episodes/{episode}/beats and returns, per beat,
    the servable ``frame_url``. Use ``ai_anime_get_sketches`` for sketches.
    """
    try:
        project = _project_from_args(args)
        episode = _require_episode(args)
        resp = _request("GET", f"/api/v1/projects/{project}/episodes/{episode}/beats")
        items: Any = None
        if isinstance(resp, dict):
            for key in ("data", "beats", "items"):
                value = resp.get(key)
                if isinstance(value, list):
                    items = value
                    break
            if items is None and isinstance(resp.get("data"), dict):
                items = resp["data"].get("beats")
        frames = []
        media_items = []
        requested_beats = _requested_beats(args)
        for b in items or []:
            if not isinstance(b, dict):
                continue
            beat_number = b.get("beat_number")
            try:
                beat_int = int(beat_number)
            except (TypeError, ValueError):
                beat_int = None
            if requested_beats is not None and beat_int not in requested_beats:
                continue
            frame_url = b.get("frame_url") or ""
            frames.append(
                {
                    "beat_number": beat_number,
                    "frame_url": frame_url,
                    "video_url": b.get("video_url") or "",
                    "characters": b.get("character_names") or b.get("characters"),
                }
            )
            if frame_url:
                media_items.append(
                    {
                        "src": frame_url,
                        "title": f"Beat {beat_number} 首帧",
                        "description": "首帧",
                        "aspectRatio": "3/4",
                    }
                )
        limited_media = _limit_items(media_items, args, 12)
        return tool_result(
            {
                "ok": True,
                "episode": episode,
                "media_kind": "frame",
                "count": len(frames),
                "frames": frames,
                "ui_spec": _image_ui_spec("sketch_gallery", limited_media) if limited_media else None,
            }
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_get_sketch_candidates(args: dict[str, Any], **_: Any) -> str:
    """Get display-ready sketch pool candidates for one beat."""
    try:
        project = _project_from_args(args)
        episode = _require_episode(args)
        beat = int(args.get("beat") or args.get("beat_num") or args.get("beat_number") or 0)
        if beat <= 0:
            raise ValueError("beat is required")
        resp = _request(
            "GET",
            f"/api/v1/projects/{project}/episodes/{episode}/beats/{beat}/sketch-candidates",
        )
        data = resp.get("data") if isinstance(resp, dict) else None
        if not isinstance(data, dict):
            data = {}
        candidates = data.get("candidates") if isinstance(data.get("candidates"), list) else []
        media_items = []
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            src = str(candidate.get("url") or "").strip()
            if not src:
                continue
            stale = bool(candidate.get("stale"))
            media_items.append(
                {
                    "src": src,
                    "title": f"Beat {beat} 草图候选",
                    "description": "过期候选" if stale else "草图候选",
                    "aspectRatio": "3/4",
                }
            )
        limited_media = _limit_items(media_items, args, 12)
        return tool_result(
            {
                "ok": bool(resp.get("ok", True)) if isinstance(resp, dict) else True,
                "episode": episode,
                "beat": beat,
                "media_kind": "sketch_candidate",
                "current_sketch_url": data.get("current_sketch_url", ""),
                "candidate_count": int(data.get("candidate_count") or len(candidates)),
                "candidates": candidates,
                "ui_spec": _image_ui_spec("sketch_gallery", limited_media) if limited_media else None,
            }
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_get_scene_images(args: dict[str, Any], **_: Any) -> str:
    """Get display-ready scene image URLs for a project (to SHOW the user).

    Wraps GET /projects/{project}/scenes and returns only servable scene asset
    URLs. Do NOT use local ``*_path`` fields and do NOT synthesize URLs.
    """
    try:
        project = _project_from_args(args)
        include_reverse = bool(args.get("include_reverse", True))
        include_pano = bool(args.get("include_pano", False))
        include_custom = bool(args.get("include_custom", False))
        resp = _request("GET", f"/api/v1/projects/{project}/scenes")
        items: Any = None
        if isinstance(resp, dict):
            for key in ("data", "scenes", "items"):
                value = resp.get(key)
                if isinstance(value, list):
                    items = value
                    break
            if items is None and isinstance(resp.get("data"), dict):
                items = resp["data"].get("scenes")

        scenes = []
        media_items = []
        image_count = 0
        requested_names = _requested_scene_names(args)
        requested_indices = _requested_scene_indices(args)
        requested_type = str(args.get("scene_type") or "").strip()
        for scene_index, scene in enumerate(items or [], start=1):
            if not isinstance(scene, dict):
                continue
            scene_name = str(scene.get("name") or "").strip()
            scene_type = str(scene.get("scene_type") or "").strip()
            if requested_indices is not None and scene_index not in requested_indices:
                continue
            if not _matches_any_scene_name(scene_name, requested_names):
                continue
            if requested_type and scene_type != requested_type:
                continue
            images = []
            for kind, field, enabled in (
                ("master", "master_url", True),
                ("reverse_master", "reverse_master_url", include_reverse),
                ("pano", "pano_url", include_pano),
                ("custom_scene", "custom_scene_url", include_custom),
            ):
                url = str(scene.get(field) or "").strip()
                if enabled and url:
                    images.append({"kind": kind, "url": url})
                    media_items.append(
                        {
                            "src": url,
                            "title": f"{scene_name or '场景'} · {kind}",
                            "description": scene.get("description") or scene.get("environment_prompt") or "",
                            "aspectRatio": "16/9" if kind == "pano" else "3/4",
                        }
                    )
            image_count += len(images)
            scenes.append(
                {
                    "index": scene_index,
                    "name": scene_name,
                    "scene_type": scene_type,
                    "description": scene.get("description") or "",
                    "environment_prompt": scene.get("environment_prompt") or "",
                    "master_url": scene.get("master_url") or "",
                    "reverse_master_url": scene.get("reverse_master_url") or "",
                    "pano_url": scene.get("pano_url") or "",
                    "custom_scene_url": scene.get("custom_scene_url") or "",
                    "images": images,
                }
            )
        limited_media = _limit_items(media_items, args, 12)
        return tool_result(
            {
                "ok": True,
                "project_id": project,
                "count": len(scenes),
                "image_count": image_count,
                "scenes": scenes,
                "ui_spec": _image_ui_spec("sketch_gallery", limited_media) if limited_media else None,
            }
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_get_character_media(args: dict[str, Any], **_: Any) -> str:
    """Get display-ready character portrait/identity image URLs."""
    try:
        project = _project_from_args(args)
        media_kind = str(args.get("media_kind") or args.get("kind") or "all").strip().lower()
        if media_kind not in {"all", "portrait", "identity"}:
            media_kind = "all"
        include_identities = bool(args.get("include_identities", True)) and media_kind != "portrait"
        resp = _request("GET", f"/api/v1/projects/{project}/characters")
        items: Any = None
        if isinstance(resp, dict):
            for key in ("data", "characters", "items"):
                value = resp.get(key)
                if isinstance(value, list):
                    items = value
                    break
            if items is None and isinstance(resp.get("data"), dict):
                items = resp["data"].get("characters")

        characters = []
        media_items = []
        requested_names = _requested_names(args)
        requested_queries = _requested_queries(args)
        for character in items or []:
            if not isinstance(character, dict):
                continue
            name = str(character.get("name") or "").strip()
            role = str(character.get("role") or character.get("description") or "").strip()
            character_name_match = _matches_any_text(
                [name, character.get("aliases")],
                requested_names,
            )
            character_query_match = _matches_any_text(
                [
                    name,
                    role,
                    character.get("description"),
                    character.get("appearance"),
                    character.get("profile"),
                    character.get("aliases"),
                ],
                requested_queries,
            )
            character_match = character_name_match and character_query_match
            portrait_url = str(character.get("portrait_url") or "").strip()
            if portrait_url and character_match:
                if media_kind in {"all", "portrait"}:
                    media_items.append(
                        {
                            "src": portrait_url,
                            "title": name or "角色肖像",
                            "description": role,
                            "aspectRatio": "3/4",
                        }
                    )
            identity_items = []
            identities = character.get("identities") or character.get("identity_images") or []
            if include_identities:
                try:
                    identities_resp = _request(
                        "GET",
                        f"/api/v1/projects/{project}/characters/{quote(name, safe='')}/identities",
                    )
                    if isinstance(identities_resp, dict):
                        for key in ("data", "identities", "items"):
                            value = identities_resp.get(key)
                            if isinstance(value, list):
                                identities = value
                                break
                        if isinstance(identities_resp.get("data"), dict):
                            value = identities_resp["data"].get("identities")
                            if isinstance(value, list):
                                identities = value
                except Exception:
                    pass
            if include_identities and isinstance(identities, list):
                for identity in identities:
                    if not isinstance(identity, dict):
                        continue
                    image_url = str(
                        identity.get("image_url")
                        or identity.get("portrait_image_url")
                        or identity.get("costume_image_url")
                        or ""
                    ).strip()
                    if not image_url:
                        continue
                    title = str(
                        identity.get("identity_name")
                        or identity.get("name")
                        or identity.get("identity_id")
                        or name
                        or "身份图"
                    )
                    identity_name_match = _matches_any_text(
                        [
                            name,
                            character.get("aliases"),
                            title,
                            identity.get("identity_name"),
                            identity.get("name"),
                            identity.get("identity_id"),
                        ],
                        requested_names,
                    )
                    identity_query_match = _matches_any_text(
                        [
                            title,
                            identity.get("identity_name"),
                            identity.get("name"),
                            identity.get("identity_id"),
                            identity.get("description"),
                            identity.get("appearance_details"),
                            identity.get("prompt"),
                            identity.get("role"),
                            name,
                            role,
                        ],
                        requested_queries,
                    )
                    identity_match = identity_name_match and identity_query_match
                    if not identity_match:
                        continue
                    identity_items.append({"title": title, "image_url": image_url})
                    media_items.append(
                        {
                            "src": image_url,
                            "title": f"{name} · {title}" if name else title,
                            "description": role,
                            "aspectRatio": "3/4",
                        }
                    )
            if (requested_names is not None or requested_queries is not None) and not character_match and not identity_items:
                continue
            characters.append(
                {
                    "name": name,
                    "role": role,
                    "portrait_url": portrait_url,
                    "identities": identity_items,
                }
            )

        limited_media = _limit_items(media_items, args, 12)
        return tool_result(
            {
                "ok": True,
                "project_id": project,
                "count": len(characters),
                "media_count": len(media_items),
                "characters": characters,
                "ui_spec": _image_ui_spec("character_showcase", limited_media) if limited_media else None,
            }
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_get_episode_media(args: dict[str, Any], **_: Any) -> str:
    """Get display-ready episode video/audio URLs."""
    try:
        project = _project_from_args(args)
        episode = _require_episode(args)
        media_type = str(args.get("media_type") or "video").strip().lower()
        resp = _request("GET", f"/api/v1/projects/{project}/episodes/{episode}/beats")
        items: Any = None
        if isinstance(resp, dict):
            for key in ("data", "beats", "items"):
                value = resp.get(key)
                if isinstance(value, list):
                    items = value
                    break
            if items is None and isinstance(resp.get("data"), dict):
                items = resp["data"].get("beats")

        video_items = []
        audio_items = []
        beats = []
        requested_beats = _requested_beats(args)
        requested_queries = _requested_queries(args)
        for beat in items or []:
            if not isinstance(beat, dict):
                continue
            beat_number = beat.get("beat_number")
            try:
                beat_int = int(beat_number)
            except (TypeError, ValueError):
                beat_int = None
            if requested_beats is not None and beat_int not in requested_beats:
                continue
            if not _matches_any_text(
                [
                    beat.get("title"),
                    beat.get("summary"),
                    beat.get("description"),
                    beat.get("visual_description"),
                    beat.get("image_prompt"),
                    beat.get("video_prompt"),
                    beat.get("narration"),
                    beat.get("voiceover"),
                    beat.get("dialogue"),
                    beat.get("audio_text"),
                    beat.get("speaker"),
                    beat.get("character_names"),
                    beat.get("characters"),
                    beat.get("scene_name"),
                    beat.get("location"),
                ],
                requested_queries,
            ):
                continue
            video_url = str(beat.get("video_url") or "").strip()
            audio_url = str(beat.get("audio_url") or "").strip()
            frame_url = str(beat.get("frame_url") or beat.get("sketch_url") or "").strip()
            beats.append({"beat_number": beat_number, "video_url": video_url, "audio_url": audio_url})
            if video_url:
                video_items.append(
                    {
                        "src": video_url,
                        "poster": frame_url,
                        "title": f"Beat {beat_number} 视频",
                    }
                )
            if audio_url:
                audio_items.append({"src": audio_url, "title": f"Beat {beat_number} 音频"})

        if media_type == "audio":
            limited = _limit_items(audio_items, args, 20)
            ui_spec = _audio_ui_spec(limited) if limited else None
        else:
            limited = _limit_items(video_items, args, 6)
            ui_spec = _video_ui_spec(limited) if limited else None
        return tool_result(
            {
                "ok": True,
                "project_id": project,
                "episode": episode,
                "media_type": media_type,
                "video_count": len(video_items),
                "audio_count": len(audio_items),
                "beats": beats,
                "ui_spec": ui_spec,
            }
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_render_first_frames(args: dict[str, Any], **_: Any) -> str:
    """Generate first frames for an episode (首帧生成, selected_regen task).

    Wraps POST /projects/{project}/episodes/{episode}/beats/regenerate with
    ``{"beat_indices": [...]}``. If ``beat_indices`` is omitted, ALL beats of the
    episode are resolved automatically (GET /episodes/{ep}/beats). Requires sketches
    to exist first. Wait with ai_anime_wait_task(task_key=<returned task_key>).
    """
    try:
        project = _project_from_args(args)
        episode = _require_episode(args)
        beats = args.get("beat_indices") or args.get("beats")
        if not isinstance(beats, list) or not beats:
            beats = _resolve_episode_beats(project, episode)
            if not beats:
                raise ValueError(
                    "could not resolve beats for this episode; generate sketches first "
                    "or pass beat_indices explicitly"
                )
        body: dict[str, Any] = {"beat_indices": [int(b) for b in beats]}
        if args.get("style"):
            body["style"] = str(args["style"])
        if args.get("model"):
            body["model"] = str(args["model"])
        return tool_result(
            _request(
                "POST",
                f"/api/v1/projects/{project}/episodes/{episode}/beats/regenerate",
                body=body,
            )
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_compose_episode(args: dict[str, Any], **_: Any) -> str:
    """Compose/export the final video for one episode (合成导出, compose_episode task).

    POST /projects/{project}/episodes/{episode}/videos/compose. Wait with the returned
    task_key.
    """
    try:
        return tool_result(_episode_post(args, "videos/compose", body={}))
    except Exception as exc:
        return tool_error(str(exc))


def _handle_get_final_video(args: dict[str, Any], **_: Any) -> str:
    """Get and display the composed final episode video when it exists."""
    try:
        project = _project_from_args(args)
        episode = _require_episode(args)
        result = _request("GET", f"/api/v1/projects/{project}/episodes/{episode}/final")
        data = result.get("data") if isinstance(result, dict) else None
        video_url = ""
        if isinstance(data, dict) and data.get("exists"):
            video_url = str(data.get("video_url") or "").strip()
        if video_url and isinstance(result, dict):
            result["ui_spec"] = _video_ui_spec(
                [
                    {
                        "src": video_url,
                        "title": f"第 {episode} 集成片",
                        "description": "最终合成视频",
                    }
                ]
            )
        return tool_result(result)
    except Exception as exc:
        return tool_error(str(exc))


def _handle_generate_portrait(args: dict[str, Any], **_: Any) -> str:
    """Generate one character's portrait (肖像生成, character_portrait task).

    POST /projects/{project}/characters/{name}/portrait-async. Poll
    task_type="character_portrait" (per character). Read via
    ai_anime_get('/projects/{project}/characters').
    """
    try:
        project = _project_from_args(args)
        name = _require_name(args)
        return tool_result(
            _request("POST", f"/api/v1/projects/{project}/characters/{quote(name, safe='')}/portrait-async")
        )
    except Exception as exc:
        return tool_error(str(exc))


def _handle_generate_identity_image(args: dict[str, Any], **_: Any) -> str:
    """Generate a character identity image (身份图生成, identity_image task).

    POST /projects/{project}/characters/{name}/identities/{identity_id}/generate-async.
    Needs both the character name and the identity_id (from the character's identity
    list). Wait with the returned task_key.
    """
    try:
        project = _project_from_args(args)
        name = _require_name(args)
        identity_id = str(args.get("identity_id") or "").strip()
        if not identity_id:
            raise ValueError("identity_id is required")
        path = (
            f"/api/v1/projects/{project}/characters/{quote(name, safe='')}"
            f"/identities/{quote(identity_id, safe='')}/generate-async"
        )
        return tool_result(_request("POST", path))
    except Exception as exc:
        return tool_error(str(exc))


def _handle_start_single_video(args: dict[str, Any], **_: Any) -> str:
    """Generate one beat's video (单 beat 视频, single_video task).

    POST /projects/{project}/episodes/{episode}/beats/{beat}/video. The beat's
    prompt is taken from its stored ``video_prompt`` (set by the script step) —
    you do NOT pass a prompt. Requires the beat's first frame to exist already
    (otherwise the API returns "首帧不存在") and the beat to have a non-empty
    video_prompt (otherwise the backend returns "prompt is required"). Only
    model / duration / resolution / mode are accepted request fields.
    """
    try:
        project = _project_from_args(args)
        episode = int(args.get("episode") or 1)
        beat = int(args.get("beat") or args.get("beat_number") or 0)
        if beat <= 0:
            raise ValueError("beat must be a positive integer")
        body: dict[str, Any] = {}
        for key in ("model", "duration", "resolution", "mode"):
            if args.get(key) is not None:
                body[key] = args[key]
        return tool_result(_request("POST", f"/api/v1/projects/{project}/episodes/{episode}/beats/{beat}/video", body=body))
    except Exception as exc:
        return tool_error(str(exc))


_PATH_PROPS = {
    "path": {
        "type": "string",
        "description": (
            "AI anime relative API path. Must start with /api/v1/ or /projects/. "
            "Absolute URLs are rejected. Ingest routes are only "
            "/projects/{project}/ingest/upload and /projects/{project}/ingest/start; "
            "use ai_anime_start_ingest instead of ai_anime_post for ingest/start; "
            "ingest_fast is a task_type, not an endpoint."
        ),
    },
    "query": {"type": "object", "description": "Optional query parameters."},
}


def _schema(name: str, description: str, properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required or [],
        },
    }


TOOLS = (
    (
        "ai_anime_get",
        _schema("ai_anime_get", "Call a AI anime GET API path without using curl.", _PATH_PROPS, ["path"]),
        _handle_get,
    ),
    (
        "ai_anime_post",
        _schema(
            "ai_anime_post",
            "Call a AI anime POST API path without using curl. Do not use this for "
            "/projects/{project}/ingest/start; use ai_anime_start_ingest.",
            {**_PATH_PROPS, "body": {"type": "object"}},
            ["path"],
        ),
        _handle_post,
    ),
    (
        "ai_anime_create_style",
        _schema(
            "ai_anime_create_style",
            "Create a custom visual style in the current AI anime project. "
            "The server generates the internal style id when omitted.",
            {
                "project_id": {
                    "type": "string",
                    "description": "Project id. Defaults to AI_ANIME_PROJECT_ID.",
                },
                "id": {
                    "type": "string",
                    "description": "Optional stable internal id. Usually omit this field.",
                },
                "name": {"type": "string", "description": "Display name."},
                "config": {
                    "type": "object",
                    "description": (
                        "Complete canonical style configuration using the same field semantics as the "
                        "built-in presets. Put only rendering medium, linework, palette, lighting, "
                        "texture, lens feel, grade, and finish inside style_instructions. Concrete "
                        "character, scene, prop, wardrobe, era, and composition content comes from each "
                        "generation task; non-canonical fields are rejected."
                    ),
                    "additionalProperties": False,
                    "properties": {
                        "base": {
                            "type": ["string", "null"],
                            "description": "Optional preset style id to inherit from.",
                        },
                        "label": {"type": "string", "description": "Non-empty UI label."},
                        "style_instructions": {
                            "type": "string",
                            "description": (
                                "Detailed non-empty rendering instructions beginning with 'Create...'; "
                                "keep under 100 words and explicitly defer concrete character, scene, "
                                "prop, wardrobe, era, and composition content to the generation task."
                            ),
                        },
                        "avoid_instructions": {
                            "type": "string",
                            "description": (
                                "Non-empty negative rendering instructions beginning with 'FORBIDDEN:'; "
                                "protect medium and quality without banning story content, under 60 words."
                            ),
                        },
                        "style_tag": {
                            "type": "string",
                            "description": (
                                "Non-empty 2-4 word uppercase medium/grade tag. Do not encode era, "
                                "location, wardrobe, ethnicity, or story content."
                            ),
                        },
                        "style_family": {
                            "type": "string",
                            "enum": ["live_action", "animation"],
                        },
                        "animation_subtype": {
                            "type": "string",
                            "enum": ["", "2d", "3d", "hybrid"],
                        },
                    },
                    "required": [
                        "label",
                        "style_instructions",
                        "avoid_instructions",
                        "style_tag",
                        "style_family",
                        "animation_subtype",
                    ],
                },
                "create_preview": {
                    "type": "boolean",
                    "description": "Generate and save a reference image after creation.",
                },
                "preview_prompt": {
                    "type": "string",
                    "description": (
                        "Direction for one generated style reference image. It must show one "
                        "clearly visible anonymous adult character and a representative "
                        "environment in the same polished full-frame production still."
                    ),
                },
                "attachment_path": {
                    "type": "string",
                    "description": (
                        "Project-relative path from [CHAT_ATTACHMENTS] to upload as the "
                        "reference image. Cannot be combined with preview_prompt."
                    ),
                },
            },
            ["name", "config"],
        ),
        _handle_create_style,
    ),
    (
        "ai_anime_generate_style_preview",
        _schema(
            "ai_anime_generate_style_preview",
            "Queue a Task Center job that generates and persists only the reference image for "
            "an existing custom style. It must not recreate or modify the style configuration.",
            {
                "project_id": {"type": "string"},
                "style_id": {"type": "string"},
                "prompt": {
                    "type": "string",
                    "description": (
                        "Optional creative direction for one polished full-frame style reference. "
                        "The result must include one clearly visible anonymous adult character and "
                        "a representative environment; do not request an empty scene, no people, or "
                        "no face. The person demonstrates character rendering only and is never a "
                        "reusable identity."
                    ),
                },
            },
            ["style_id"],
        ),
        _handle_generate_style_preview,
    ),
    (
        "ai_anime_upload_style_preview",
        _schema(
            "ai_anime_upload_style_preview",
            "Use an image attached in the current chat as the reference image of an existing "
            "custom style. attachment_path must come from [CHAT_ATTACHMENTS].",
            {
                "project_id": {"type": "string"},
                "style_id": {"type": "string"},
                "attachment_path": {"type": "string"},
            },
            ["style_id", "attachment_path"],
        ),
        _handle_upload_style_preview,
    ),
    (
        "ai_anime_patch",
        _schema("ai_anime_patch", "Call a AI anime PATCH API path without using curl.", {**_PATH_PROPS, "body": {"type": "object"}}, ["path"]),
        _handle_patch,
    ),
    (
        "ai_anime_delete",
        _schema("ai_anime_delete", "Call a AI anime DELETE API path without using curl.", {**_PATH_PROPS, "body": {"type": "object"}}, ["path"]),
        _handle_delete,
    ),
    (
        "ai_anime_pipeline_status",
        _schema(
            "ai_anime_pipeline_status",
            "Get the current AI anime project pipeline status.",
            {
                "project_id": {"type": "string", "description": "Project id. Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Optional episode number."},
            },
        ),
        _handle_pipeline_status,
    ),
    (
        "ai_anime_list_tasks",
        _schema(
            "ai_anime_list_tasks",
            "List AI anime tasks for the current or specified project.",
            {
                "project_id": {"type": "string"},
                "episode": {"type": "integer"},
                "task_type": {"type": "string"},
                "status": {"type": "string"},
            },
        ),
        _handle_list_tasks,
    ),
    (
        "ai_anime_get_task",
        _schema(
            "ai_anime_get_task",
            "Get one AI anime task status using the exact task_key returned when it was created.",
            {
                "project_id": {"type": "string"},
                "task_key": {"type": "string"},
            },
            ["task_key"],
        ),
        _handle_get_task,
    ),
    (
        "ai_anime_wait_task",
        _schema(
            "ai_anime_wait_task",
            "Wait for one asynchronous AI anime task to reach completed, failed, or cancelled. "
            "Pass the exact task_key returned by the task creation tool.",
            {
                "project_id": {"type": "string"},
                "task_key": {"type": "string"},
                "timeout_seconds": {"type": "number", "minimum": 1, "maximum": 240},
                "poll_interval_seconds": {"type": "number", "minimum": 0.5, "maximum": 5},
            },
            ["task_key"],
        ),
        _handle_wait_task,
    ),
    (
        "ai_anime_get_episode_script",
        _schema(
            "ai_anime_get_episode_script",
            "Get one episode script for the current or specified project.",
            {
                "project_id": {"type": "string"},
                "episode": {"type": "integer"},
            },
            ["episode"],
        ),
        _handle_get_episode_script,
    ),
    (
        "ai_anime_list_ingest_uploads",
        _schema(
            "ai_anime_list_ingest_uploads",
            "List files already uploaded to the current project's ingest script directory. Use this when "
            "the user asks which files are currently uploaded, or before starting video/short-drama "
            "ingest from a previously uploaded script.",
            {
                "project_id": {"type": "string", "description": "Project id. Defaults to AI_ANIME_PROJECT_ID."},
            },
        ),
        _handle_list_ingest_uploads,
    ),
    (
        "ai_anime_run_production_workflow",
        _schema(
            "ai_anime_run_production_workflow",
            "Run the single canonical production workflow from persisted story state through final "
            "episode composition. This is the only tool for a continuous/full-generation request: "
            "it uses the same backend entry point as the frontend Complete Generation action, "
            "resumes every missing prerequisite including voice checks and Seedance final prompts, "
            "processes all requested episodes, and returns one "
            "parent task_key. Call it exactly once and wait only for that task_key; do not chain "
            "individual stage tools. Omit episodes to process all planned episodes.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episodes": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Optional 1-based episodes; omit for every planned episode.",
                },
                "filename": {"type": "string", "description": "Uploaded story filename when ingest is missing."},
                "rebuild": {"type": "boolean", "description": "Rebuild story/script data before production. Default: false."},
                "spine_template": {"type": "string", "enum": ["drama", "narrated"]},
                "target_episodes": {"type": "integer", "minimum": 1, "maximum": 200},
                "planning_mode": {"type": "string", "enum": ["chapters", "ai_events", "ai"]},
                "script_mode": {"type": "string", "enum": ["duration", "literal"]},
                "target_duration_total": {"type": "integer", "minimum": 30, "maximum": 600},
                "target_beats": {"type": "integer", "minimum": 5, "maximum": 80},
                "max_parallel": {"type": "integer", "minimum": 1, "maximum": 6},
                "node_timeout_seconds": {"type": "integer", "minimum": 30, "maximum": 28800},
                "audio_model": {"type": "string"},
                "video_model": {"type": "string"},
                "video_resolution": {"type": "string"},
                "add_subtitles": {"type": "boolean"},
                "add_bgm": {"type": "boolean"},
            },
        ),
        _handle_run_production_workflow,
    ),
    (
        "ai_anime_run_script_workflow",
        _schema(
            "ai_anime_run_script_workflow",
            "Run the canonical script-production DAG in the task center. The graph starts "
            "from persisted facts and covers ingest -> characters -> episodes -> identities "
            "+ scenes in parallel -> episode scripts in parallel. mode='through' runs every "
            "missing prerequisite through target; mode='single' runs only target and reports "
            "missing prerequisites. Omit episodes to process every planned episode. If ingest "
            "has not completed, pass an uploaded filename from ai_anime_list_ingest_uploads. "
            "Call this tool exactly once for a multi-episode or whole-story request: pass all "
            "requested episode numbers in one array, or omit episodes for all. Never fan it out "
            "into one workflow call per episode. Wait only for the returned workflow task_key.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "mode": {"type": "string", "enum": ["single", "through"], "description": "Default: through."},
                "target": {
                    "type": "string",
                    "enum": ["ingest", "characters", "episodes", "identities", "scenes", "script"],
                    "description": "Last graph stage to complete. Default: script.",
                },
                "episodes": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Optional 1-based episode numbers; omit for all planned episodes.",
                },
                "filename": {"type": "string", "description": "Uploaded story filename, required only when ingest is missing."},
                "rebuild": {"type": "boolean", "description": "Rebuild ingestion. Default: false."},
                "spine_template": {"type": "string", "enum": ["drama", "narrated"]},
                "target_episodes": {"type": "integer", "description": "Episode count used when planning is missing."},
                "planning_mode": {"type": "string", "enum": ["chapters", "ai_events", "ai"]},
                "script_mode": {"type": "string", "enum": ["duration", "literal"]},
                "target_duration_total": {"type": "integer", "description": "Target seconds per episode."},
                "target_beats": {"type": "integer", "minimum": 5, "maximum": 80, "description": "Explicit beat count per episode."},
                "max_parallel": {"type": "integer", "minimum": 1, "maximum": 6, "description": "Maximum concurrent ready graph nodes. Default: 4."},
            },
        ),
        _handle_run_script_workflow,
    ),
    (
        "ai_anime_start_ingest",
        _schema(
            "ai_anime_start_ingest",
            "Start novel/script ingestion from a file already returned by "
            "ai_anime_list_ingest_uploads through the canonical script-production graph. "
            "Use THIS instead of ai_anime_post. Wait for the returned workflow task_key.",
            {
                "project_id": {
                    "type": "string",
                    "description": "Project id. Defaults to AI_ANIME_PROJECT_ID.",
                },
                "filename": {
                    "type": "string",
                    "description": "Exact uploaded filename returned by ai_anime_list_ingest_uploads.",
                },
                "rebuild": {
                    "type": "boolean",
                    "description": "Rebuild existing ingestion data. Default: false.",
                },
                "spine_template": {
                    "type": "string",
                    "enum": ["drama", "narrated"],
                    "description": "Optional narrative spine template.",
                },
            },
            ["filename"],
        ),
        _handle_start_ingest,
    ),
    (
        "ai_anime_build_characters",
        _schema(
            "ai_anime_build_characters",
            "Run only the character-extraction node in the canonical script-production graph. "
            "It reports a missing ingest prerequisite instead of bypassing the graph. Wait for "
            "the returned workflow task_key, then read /projects/{project}/characters.",
            {
                "project_id": {
                    "type": "string",
                    "description": "Project id. Defaults to AI_ANIME_PROJECT_ID.",
                },
            },
        ),
        _handle_build_characters,
    ),
    (
        "ai_anime_plan_episodes",
        _schema(
            "ai_anime_plan_episodes",
            "Run only the episode-planning node in the canonical script-production graph. "
            "Ingest and character extraction must already be complete. Wait for the returned "
            "workflow task_key, then read /projects/{project}/episodes.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "target_episodes": {"type": "integer", "description": "How many episodes to plan (default 10)."},
                "planning_mode": {"type": "string", "description": "Planning mode (default 'chapters')."},
            },
        ),
        _handle_plan_episodes,
    ),
    (
        "ai_anime_generate_script",
        _schema(
            "ai_anime_generate_script",
            "Generate one episode through the canonical prerequisite-aware graph. Missing ingest, "
            "characters, episodes, identities, and scenes are scheduled in dependency order; "
            "independent identity and scene nodes run concurrently. Wait only for the returned "
            "workflow task_key, then read with ai_anime_get_episode_script. This is only for one "
            "explicitly requested episode; never call it in parallel for multiple episodes. Use "
            "one ai_anime_run_script_workflow call for any multi-episode request.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (1-based, required)."},
            },
            ["episode"],
        ),
        _handle_generate_script,
    ),
    (
        "ai_anime_update_character_face_prompt",
        _schema(
            "ai_anime_update_character_face_prompt",
            "Set or repair one character's face_prompt (面部特征) before portrait generation. "
            "Use this after character extraction if a core character has an empty face_prompt, "
            "or when character_portrait fails with '请先设置面部特征 (face_prompt)'. Real endpoint "
            "PATCH /projects/{project}/characters/{name} with {face_prompt: ...}. After this "
            "succeeds, retry ai_anime_generate_portrait for that character.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "name": {"type": "string", "description": "Character name (required)."},
                "character": {"type": "string", "description": "Alias of name."},
                "face_prompt": {
                    "type": "string",
                    "description": "Concrete facial features: hairstyle, face shape, eyes, skin tone, age cues; no clothing.",
                },
            },
            ["name", "face_prompt"],
        ),
        _handle_update_character_face_prompt,
    ),
    (
        "ai_anime_plan_identities",
        _schema(
            "ai_anime_plan_identities",
            "Run only the identity-planning node for one episode in the canonical graph. "
            "Episode planning must already be complete. Wait for the returned workflow task_key.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
            },
            ["episode"],
        ),
        _handle_plan_identities,
    ),
    (
        "ai_anime_plan_scenes",
        _schema(
            "ai_anime_plan_scenes",
            "Run only the scene-planning node for one episode in the canonical graph. It is a "
            "script-generation prerequisite and can run concurrently with identity planning. "
            "Wait for the returned workflow task_key.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
            },
            ["episode"],
        ),
        _handle_plan_scenes,
    ),
    (
        "ai_anime_plan_props",
        _schema(
            "ai_anime_plan_props",
            "Plan the prop menu for one episode (道具规划, episode_prop_planner task). Use THIS "
            "after script generation and before sketch generation when the pipeline needs prop "
            "context. Real endpoint POST /projects/{project}/episodes/{episode}/props/plan. Wait "
            "with ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
            },
            ["episode"],
        ),
        _handle_plan_props,
    ),
    (
        "ai_anime_generate_scene_master",
        _schema(
            "ai_anime_generate_scene_master",
            "Generate one scene's canonical master reference image (场景正向参考图, "
            "scene_reference_asset task). Real endpoint POST /projects/{project}/scenes/{name}/"
            "master/generate-async. Use scene names from ai_anime_get(path='/projects/{project}/"
            "scenes') or the episode scene menu. Wait with "
            "ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "name": {"type": "string", "description": "Scene name (required)."},
                "scene_name": {"type": "string", "description": "Alias of name."},
            },
            ["name"],
        ),
        _handle_generate_scene_master,
    ),
    (
        "ai_anime_generate_scene_reverse",
        _schema(
            "ai_anime_generate_scene_reverse",
            "Generate one scene's reverse master reference image (场景反向参考图, "
            "scene_reference_asset task). Real endpoint POST /projects/{project}/scenes/{name}/"
            "reverse/generate-async. Wait with "
            "ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "name": {"type": "string", "description": "Scene name (required)."},
                "scene_name": {"type": "string", "description": "Alias of name."},
            },
            ["name"],
        ),
        _handle_generate_scene_reverse,
    ),
    (
        "ai_anime_generate_portrait",
        _schema(
            "ai_anime_generate_portrait",
            "Generate one character's portrait (肖像生成, character_portrait task). Real endpoint "
            "POST /projects/{project}/characters/{name}/portrait-async. Call once per character. "
            "Wait with ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "name": {"type": "string", "description": "Character name (required; from the character list)."},
            },
            ["name"],
        ),
        _handle_generate_portrait,
    ),
    (
        "ai_anime_generate_identity_image",
        _schema(
            "ai_anime_generate_identity_image",
            "Generate a character identity image (身份图生成, identity_image task). Real endpoint POST "
            "/projects/{project}/characters/{name}/identities/{identity_id}/generate-async. Wait "
            "with ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "name": {"type": "string", "description": "Character name (required)."},
                "identity_id": {"type": "string", "description": "Identity id from the character's identity list (required)."},
            },
            ["name", "identity_id"],
        ),
        _handle_generate_identity_image,
    ),
    (
        "ai_anime_generate_sketches",
        _schema(
            "ai_anime_generate_sketches",
            "Generate beat sketches for one episode (草图生成, sketch_generation task). Real endpoint "
            "POST /projects/{project}/episodes/{episode}/sketches/generate with a canonical body. "
            "This tool automatically runs assign-colors first by default and fills safe defaults: "
            "grid_index=-1 (all grids), sketch_scene_grouping=true, "
            "aspect_ratio='2:3'. Use THIS instead of ai_anime_post or guessing the body. Runs "
            "after the script exists. Wait with ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
                "style": {"type": "string", "description": "Optional visual style override."},
                "grid_index": {
                    "type": "integer",
                    "description": "Grid index to generate. Use -1 to generate all grids. Default: -1.",
                },
                "sketch_scene_grouping": {
                    "type": "boolean",
                    "description": "Group sketch grids by scene. Default: true.",
                },
                "aspect_ratio": {
                    "type": "string",
                    "enum": ["2:3", "16:9"],
                    "description": "Sketch aspect ratio. Default: 2:3.",
                },
                "image_generation_selection": {
                    "type": "string",
                    "description": "Optional backend/provider selection from sketch settings.",
                },
                "auto_assign_colors": {
                    "type": "boolean",
                    "description": "Run /sketches/assign-colors before generation. Default: true.",
                },
                "body": {
                    "type": "object",
                    "description": "Advanced override merged into the canonical generate body.",
                },
            },
            ["episode"],
        ),
        _handle_generate_sketches,
    ),
    (
        "ai_anime_detect_sketch_identities",
        _schema(
            "ai_anime_detect_sketch_identities",
            "Run AI detection on one episode's generated sketches and persist detected identities "
            "and props to each beat. Real endpoint POST /projects/{project}/episodes/{episode}/"
            "sketches/detect-identities. Requires sketches to exist and sketch colors to be assigned; "
            "if colors are missing, run ai_anime_generate_sketches or POST assign-colors first. Use "
            "THIS only for a local rework request. Detection runs asynchronously; wait for its returned "
            "task_key. Continuous production must use ai_anime_run_production_workflow.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
            },
            ["episode"],
        ),
        _handle_detect_sketch_identities,
    ),
    (
        "ai_anime_get_sketches",
        _schema(
            "ai_anime_get_sketches",
            "Get display-ready official sketch URLs for an episode, to SHOW the user. This tool "
            "returns only current sketch_url media. It does not fall back to "
            "grids/epNNN/sketch/beat_XX_t* pool candidates and never substitutes first frames. "
            "Use ai_anime_get_first_frames only when the user explicitly "
            "asks for 首帧/first frames. Do NOT read "
            "sketch_path from a task result, and do NOT use vision_analyze to 'show' images. "
            "After calling this tool, do not write markdown images, raw URLs, http/static paths, "
            "or HTML media tags.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
                "beat": {"type": "integer", "description": "Show only one beat's sketch."},
                "beat_indices": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Show only these beat numbers, in episode order.",
                },
                "offset": {
                    "type": "integer",
                    "description": "Zero-based media offset after beat filtering. Use with limit for paging.",
                },
                "limit": {"type": "integer", "description": "Maximum media items to return. Default/max: 12."},
            },
            ["episode"],
        ),
        _handle_get_sketches,
    ),
    (
        "ai_anime_get_first_frames",
        _schema(
            "ai_anime_get_first_frames",
            "Get display-ready first-frame URLs for an episode, to SHOW the user. This tool returns "
            "only frame_url media. Use this only when the user explicitly asks for 首帧/first frames. "
            "Use ai_anime_get_sketches for sketches. After calling this tool, do not write markdown "
            "images, raw URLs, http/static paths, or HTML media tags.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
                "beat": {"type": "integer", "description": "Show only one beat's first frame."},
                "beat_indices": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Show only these beat numbers, in episode order.",
                },
                "offset": {
                    "type": "integer",
                    "description": "Zero-based media offset after beat filtering. Use with limit for paging.",
                },
                "limit": {"type": "integer", "description": "Maximum media items to return. Default/max: 12."},
            },
            ["episode"],
        ),
        _handle_get_first_frames,
    ),
    (
        "ai_anime_get_sketch_candidates",
        _schema(
            "ai_anime_get_sketch_candidates",
            "Get display-ready sketch pool candidates for one beat. This tool shows "
            "grids/epNNN/sketch/beat_XX_t* candidates and is separate from current sketch_url. "
            "Use ai_anime_get_sketches when the user asks for the official/current sketch.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
                "beat": {"type": "integer", "description": "Beat number (required)."},
                "offset": {
                    "type": "integer",
                    "description": "Zero-based candidate offset. Use with limit for paging.",
                },
                "limit": {"type": "integer", "description": "Maximum media items to return. Default/max: 12."},
            },
            ["episode", "beat"],
        ),
        _handle_get_sketch_candidates,
    ),
    (
        "ai_anime_get_scene_images",
        _schema(
            "ai_anime_get_scene_images",
            "Get display-ready scene image URLs for a project, to SHOW the user. Returns per-scene "
            "servable master_url/reverse_master_url/pano_url/custom_scene_url and prepared media data. "
            "Do NOT use local *_path fields, task result paths, or synthesized download URLs. "
            "After calling this tool, do not write markdown images, raw URLs, http/static paths, "
            "or HTML media tags.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "include_reverse": {
                    "type": "boolean",
                    "description": "Include reverse_master_url entries. Default: true.",
                },
                "include_pano": {
                    "type": "boolean",
                    "description": "Include pano_url entries. Default: false.",
                },
                "include_custom": {
                    "type": "boolean",
                    "description": "Include custom_scene_url entries. Default: false.",
                },
                "name": {"type": "string", "description": "Show scenes whose name contains this text."},
                "names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Show scenes whose name contains any of these texts.",
                },
                "scene_name": {"type": "string", "description": "Alias of name; fuzzy contains match."},
                "scene_type": {"type": "string", "description": "Show only scenes with this scene_type."},
                "index": {
                    "type": "integer",
                    "description": "Show only the Nth scene from the API scene list, 1-based.",
                },
                "scene_indices": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Show only these 1-based scene indexes from the API scene list.",
                },
                "offset": {
                    "type": "integer",
                    "description": "Zero-based media offset after scene filtering. Use with limit for paging.",
                },
                "limit": {"type": "integer", "description": "Maximum media items to return. Default/max: 12."},
            },
        ),
        _handle_get_scene_images,
    ),
    (
        "ai_anime_get_character_media",
        _schema(
            "ai_anime_get_character_media",
            "Get display-ready character portrait/identity image URLs and prepared media data. "
            "After calling this tool, do not write markdown images, raw URLs, http/static paths, "
            "or HTML media tags; "
            "the backend renders the returned media automatically.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "include_identities": {"type": "boolean", "description": "Include identity images. Default: true."},
                "media_kind": {
                    "type": "string",
                    "enum": ["all", "portrait", "identity"],
                    "description": "all=portraits plus identity images; portrait=only character portraits; identity=only identity images.",
                },
                "name": {
                    "type": "string",
                    "description": "Show character media whose character name, aliases, or identity name/id contains this text.",
                },
                "names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Show character media whose character name, aliases, or identity name/id contains any of these texts.",
                },
                "query": {
                    "type": "string",
                    "description": "Broad fuzzy text query over character name, role/description, identity names, and identity descriptions.",
                },
                "identity_name": {
                    "type": "string",
                    "description": "Fuzzy text query over identity image names/ids.",
                },
                "offset": {
                    "type": "integer",
                    "description": "Zero-based media offset after character filtering. Use with limit for paging.",
                },
                "limit": {"type": "integer", "description": "Maximum media items to return. Default/max: 12."},
            },
        ),
        _handle_get_character_media,
    ),
    (
        "ai_anime_get_episode_media",
        _schema(
            "ai_anime_get_episode_media",
            "Get display-ready episode beat video/audio URLs and prepared media data. "
            "media_type='video' returns video previews; media_type='audio' returns audio items. "
            "After calling this tool, do not write markdown images, raw URLs, http/static paths, "
            "or HTML media tags; "
            "the backend renders the returned media automatically.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
                "media_type": {"type": "string", "enum": ["video", "audio"], "description": "Default: video."},
                "beat": {"type": "integer", "description": "Show only one beat's video/audio."},
                "beat_indices": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Show only these beat numbers, in episode order.",
                },
                "query": {
                    "type": "string",
                    "description": "Fuzzy text query over beat title, description, narration/dialogue, speaker, characters, and scene.",
                },
                "search": {
                    "type": "string",
                    "description": "Alias of query.",
                },
                "offset": {
                    "type": "integer",
                    "description": "Zero-based media offset after beat filtering. Use with limit for paging.",
                },
                "limit": {"type": "integer", "description": "Maximum media items to return. Video max 6; audio max 20."},
            },
            ["episode"],
        ),
        _handle_get_episode_media,
    ),
    (
        "ai_anime_render_first_frames",
        _schema(
            "ai_anime_render_first_frames",
            "Generate first frames for an episode (首帧生成, selected_regen task). Real endpoint POST "
            "/projects/{project}/episodes/{episode}/beats/regenerate with {beat_indices:[...]}. Omit "
            "beat_indices to render ALL beats of the episode (resolved automatically). Requires sketches "
            "first. Wait with ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
                "beat_indices": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Beat numbers to render. Omit to render all beats of the episode.",
                },
                "style": {"type": "string", "description": "Optional visual style override."},
            },
            ["episode"],
        ),
        _handle_render_first_frames,
    ),
    (
        "ai_anime_generate_audio",
        _schema(
            "ai_anime_generate_audio",
            "Generate episode audio/voiceover using the current IndexTTS2 audio pipeline "
            "(音频生成, audio_generation_indextts2 task). Real endpoint POST /projects/{project}/"
            "episodes/{episode}/audio/generate. Wait with "
            "ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
                "mode": {
                    "type": "string",
                    "description": "Audio generation mode. Backend default is sync_changed.",
                },
                "beat_numbers": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Optional beat numbers for partial audio generation.",
                },
                "model": {"type": "string", "description": "Optional model override."},
            },
            ["episode"],
        ),
        _handle_generate_audio,
    ),
    (
        "ai_anime_optimize_video_global",
        _schema(
            "ai_anime_optimize_video_global",
            "Run global video optimization for one episode (全局视频优化, global_optimize_video task). "
            "Real endpoint POST /projects/{project}/episodes/{episode}/optimize/video-global. Wait "
            "with ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
            },
            ["episode"],
        ),
        _handle_optimize_video_global,
    ),
    (
        "ai_anime_compose_episode",
        _schema(
            "ai_anime_compose_episode",
            "Compose/export the final video for one episode (合成导出, compose_episode task). Real "
            "endpoint POST /projects/{project}/episodes/{episode}/videos/compose. Wait with "
            "ai_anime_wait_task(task_key=<returned task_key>).",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
            },
            ["episode"],
        ),
        _handle_compose_episode,
    ),
    (
        "ai_anime_get_final_video",
        _schema(
            "ai_anime_get_final_video",
            "Get and display the composed final episode video (最终成片展示). Real endpoint GET "
            "/projects/{project}/episodes/{episode}/final. Use this after compose_episode completes "
            "or when the user asks for the final video. If no final video exists, report that state; "
            "do not synthesize file URLs.",
            {
                "project_id": {"type": "string", "description": "Defaults to AI_ANIME_PROJECT_ID."},
                "episode": {"type": "integer", "description": "Episode number (required)."},
            },
            ["episode"],
        ),
        _handle_get_final_video,
    ),
    (
        "ai_anime_start_single_video",
        _schema(
            "ai_anime_start_single_video",
            "Generate one beat's video (单 beat 视频, single_video task), POST /episodes/{ep}/beats/"
            "{beat}/video. You do NOT pass a prompt — the beat's stored video_prompt is used. "
            "Prerequisites: the beat's first frame must exist AND the beat must have a non-empty "
            "video_prompt; if the API returns '首帧不存在' or 'prompt is required', that prerequisite "
            "is missing — report it, do NOT invent fixes. Compose only works after all beat videos exist.",
            {
                "project_id": {"type": "string"},
                "episode": {"type": "integer"},
                "beat": {"type": "integer", "description": "Beat number (required)."},
                "beat_number": {"type": "integer"},
                "model": {"type": "string", "description": "Optional video model override."},
                "duration": {"type": "number", "description": "Optional seconds."},
                "resolution": {"type": "string", "description": "Optional output resolution."},
                "mode": {"type": "string", "description": "Optional generation mode."},
            },
            ["episode", "beat"],
        ),
        _handle_start_single_video,
    ),
)


def register(ctx) -> None:
    for name, schema, handler in TOOLS:
        for toolset in REGISTER_TOOLSETS:
            ctx.register_tool(
                name=name,
                toolset=toolset,
                schema=schema,
                handler=handler,
                check_fn=_available,
                requires_env=["AI_ANIME_API_URL", "AI_ANIME_AGENT_TOKEN"],
                description=schema["description"],
                emoji="",
            )
