"""AI chat service with project-scoped history and user-level agent sessions."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from ai_anime.chat.backend_sdk import (
    ClaudeSdkClient,
    CodexClient,
    _codex_item_completed_trace,
    _codex_item_started_trace,
    _codex_unwrap_item,
    interrupt_live_claude_client,
    interrupt_live_codex_turn,
)
from ai_anime.modules.ai_assistant.public import (
    append_tool_ui_specs,
    build_agent_prompt_context,
    completion_text_or_existing,
    create_page_agent_session_token,
    dedupe_tool_ui_specs,
    display_tool_call_key,
    extract_display_tool_call,
    extract_tool_ui_specs,
    fallback_display_tool_ui_specs,
    filter_tool_ui_specs_for_prompt,
    get_agent_backend,
    get_agent_thread_sessions,
    get_agent_tool_configuration,
    get_agent_workspace,
    get_chat_history,
    get_chat_run_locks,
    is_hidden_chat_tool_event,
    infer_display_tool_call_from_text,
    merge_stream_text,
    normalize_json_render_reply,
    reingest_confirmation_reply,
    redact_local_filesystem_paths,
    script_creation_guidance_prompt,
    split_trace_contents,
    strip_replayed_chat_response,
    strip_streamed_assistant_replay,
    tool_chat_error,
)
from ai_anime.utils.static_urls import project_static_url

logger = logging.getLogger("ai_anime.chat.service")
agent_backend = get_agent_backend()
agent_thread_sessions = get_agent_thread_sessions()
agent_tool_configuration = get_agent_tool_configuration()
agent_workspace = get_agent_workspace()
chat_history = get_chat_history()
chat_run_locks = get_chat_run_locks()

_MEDIA_EXTENSIONS = {
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".gif": "image",
    ".mp4": "video",
    ".mov": "video",
    ".webm": "video",
    ".wav": "audio",
    ".mp3": "audio",
    ".m4a": "audio",
}
_URL_RE = re.compile(r"(https?://[^\s)>\"]+|/static/[^\s)>\"]+)")
_REL_PATH_RE = re.compile(
    r"(?P<path>(?:assets|videos|audio|images|frames|sketches|grids|uploads|scripts)/[^\s)>\"]+\.(?:png|jpg|jpeg|webp|gif|mp4|mov|webm|wav|mp3|m4a))"
)
_MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
_REINGEST_CANCELLED_BLOCK_RE = re.compile(
    r"\[AI_ANIME_REINGEST_CANCELLED\](.*?)\[/AI_ANIME_REINGEST_CANCELLED\]",
    re.DOTALL,
)


def _media_path_from_static_url(url: str) -> str | None:
    parsed = urlparse(url)
    path = parsed.path if parsed.scheme in {"http", "https"} else url.split("?", 1)[0]
    if not path.startswith("/static/"):
        return None
    rel = path[len("/static/") :]
    parts = rel.split("/", 2)
    if len(parts) == 3:
        return unquote(parts[2])
    return unquote(rel)


def _canonical_project_static_media_url(
    project_id: str,
    project_dir: Path,
    url_or_path: str,
) -> tuple[str, str] | None:
    media_path = _media_path_from_static_url(url_or_path)
    if media_path is None:
        media_path = url_or_path.strip().split("?", 1)[0].lstrip("./")
    if not media_path:
        return None
    local_path = project_dir / media_path
    return project_static_url(project_id, media_path, local_path=local_path), media_path


def _media_project_dir(
    username: str,
    project: str,
    project_dir: str | Path | None = None,
) -> Path:
    return (
        Path(project_dir)
        if project_dir is not None
        else _project_dir(username, project)
    )


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _output_root() -> Path:
    configured = os.environ.get("AI_ANIME_OUTPUT_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return _repo_root() / "output"


def _state_root() -> Path:
    configured = os.environ.get("AI_ANIME_STATE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return _repo_root() / "state"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_dir(username: str, project: str) -> Path:
    base_dir = _output_root() / username / project
    for path in (
        base_dir,
        base_dir / "graph",
        base_dir / "assets",
        base_dir / "assets" / "characters",
        base_dir / "scripts",
        base_dir / "images",
        base_dir / "audio",
        base_dir / "videos",
        base_dir / "uploads",
    ):
        path.mkdir(parents=True, exist_ok=True)
    return base_dir


def _project_state_dir(username: str, project: str) -> Path:
    base_dir = _state_root() / username / project
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir


def _chat_input_history_path(username: str, project: str) -> Path:
    return _project_state_dir(username, project) / "chat_input_history.json"


def load_chat_input_history(username: str, project: str) -> list[str]:
    if not username or not project:
        return []
    path = _chat_input_history_path(username, project)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(payload, list):
        return []
    history: list[str] = []
    for item in payload:
        text = str(item or "").strip()
        if text:
            history.append(text)
    return history


def save_chat_input_history(
    username: str, project: str, history: list[str], *, limit: int = 200
) -> None:
    if not username or not project:
        return
    cleaned: list[str] = []
    for item in history:
        text = str(item or "").strip()
        if text:
            cleaned.append(text)
    if limit > 0:
        cleaned = cleaned[-limit:]
    path = _chat_input_history_path(username, project)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps(cleaned, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_path.replace(path)


def _get_setting(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute(
        "SELECT value FROM chat_settings WHERE key = ?", (key,)
    ).fetchone()
    return str(row["value"]) if row else None


def _set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        """
        INSERT INTO chat_settings(key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        """,
        (key, value, _now_iso()),
    )
    conn.commit()


async def _emit_chat_event_best_effort(on_event, event: dict[str, Any]) -> bool:
    """Emit to the connected client without making persistence depend on it."""
    try:
        await on_event(event)
        return True
    except Exception:
        return False


def _assistant_history_contents(
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> list[str]:
    return [
        str(message.get("content") or "")
        for message in list_messages(
            username,
            project,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if message.get("role") == "assistant"
    ]


def _trace_history_contents(
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> list[str]:
    return chat_history.list_project_trace_contents(
        username,
        project,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def _extract_codex_user_message_text(item: Any) -> str:
    thread_item = _codex_unwrap_item(item)
    parts: list[str] = []
    for content in getattr(thread_item, "content", []) or []:
        item_type = str(getattr(content, "type", "") or "")
        if item_type == "text":
            text = str(getattr(content, "text", "") or "").strip()
            if text:
                parts.append(text)
        elif item_type == "skill":
            name = str(getattr(content, "name", "") or "").strip()
            if name:
                parts.append(f"[skill] {name}")
        elif item_type == "mention":
            name = str(getattr(content, "name", "") or "").strip()
            path = str(getattr(content, "path", "") or "").strip()
            parts.append(f"[mention] {name or path}".strip())
        elif item_type == "image":
            url = str(getattr(content, "url", "") or "").strip()
            if url:
                parts.append(f"[image] {url}")
        elif item_type == "localImage":
            path = str(getattr(content, "path", "") or "").strip()
            if path:
                parts.append(f"[image] {path}")
    return "\n".join(part for part in parts if part).strip()


def _extract_codex_history_trace(item: Any) -> str:
    from openai_codex.generated.v2_all import CommandExecutionThreadItem

    thread_item = _codex_unwrap_item(item)
    started = _codex_item_started_trace(thread_item) or ""
    completed = _codex_item_completed_trace(thread_item) or ""
    body = ""
    if isinstance(thread_item, CommandExecutionThreadItem):
        aggregated = str(thread_item.aggregated_output or "")
        if aggregated:
            body = aggregated
            if not body.endswith("\n"):
                body += "\n"
    return (started + body + completed).strip()


def _load_codex_thread_history(username: str, project: str) -> list[dict[str, Any]]:
    from openai_codex import Codex, CodexConfig
    from openai_codex.generated.v2_all import (
        AgentMessageThreadItem,
        UserMessageThreadItem,
    )

    thread_id = agent_thread_sessions.get_active(username, "codex")
    if not thread_id:
        return []

    workspace = agent_workspace.ensure_codex(username)
    codex_bin = agent_backend.codex_bin_path()
    config = CodexConfig(
        codex_bin=str(codex_bin) if codex_bin is not None else None,
        cwd=str(workspace),
        env=agent_workspace.build_environment(username, project),
        config_overrides=agent_tool_configuration.codex_config_overrides(),
    )

    with Codex(config=config) as codex:
        read_response = codex._client.thread_read(thread_id, include_turns=True)
        thread = read_response.thread
        turns = list(getattr(thread, "turns", []) or [])
        if not turns or not any(getattr(turn, "items", None) for turn in turns):
            resumed = codex._client.thread_resume(
                thread_id,
                {
                    "cwd": str(workspace),
                    "model": agent_backend.codex_model(),
                },
            )
            turns = list(getattr(resumed.thread, "turns", []) or [])

    history: list[dict[str, Any]] = []
    for turn_index, turn in enumerate(turns):
        for item_index, item in enumerate(getattr(turn, "items", []) or []):
            thread_item = _codex_unwrap_item(item)
            created_at = _now_iso()
            if isinstance(thread_item, UserMessageThreadItem):
                content = _extract_codex_user_message_text(thread_item)
                if content:
                    history.append(
                        {
                            "id": turn_index * 1000 + item_index,
                            "role": "user",
                            "content": content,
                            "media": _filter_markdown_duplicate_images(
                                content,
                                _extract_media(content, username, project),
                            ),
                            "created_at": created_at,
                        }
                    )
                continue
            if isinstance(thread_item, AgentMessageThreadItem):
                content = str(thread_item.text or "").strip()
                if content:
                    media = _extract_media(content, username, project)
                    history.append(
                        {
                            "id": turn_index * 1000 + item_index,
                            "role": "assistant",
                            "content": content,
                            "media": _filter_markdown_duplicate_images(content, media),
                            "created_at": created_at,
                        }
                    )
                continue

            trace = _extract_codex_history_trace(thread_item)
            if trace:
                for block_index, block in enumerate(split_trace_contents(trace)):
                    history.append(
                        {
                            "id": turn_index * 10000 + item_index * 10 + block_index,
                            "role": "trace",
                            "content": block,
                            "media": [],
                            "created_at": created_at,
                        }
                    )

    return history


def _sync_codex_history_cache(
    username: str,
    project: str,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> None:
    history = [
        message
        for message in _load_codex_thread_history(username, project)
        if message.get("role") == "trace"
    ]
    if not history:
        return
    chat_history.replace_project_trace_messages(
        username,
        project,
        history,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def list_messages(
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    stored_messages = chat_history.list_project_messages(
        username,
        project,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
        limit=limit,
    )
    messages: list[dict[str, Any]] = []
    previous_assistants: list[str] = []
    for message in stored_messages:
        content = str(message["content"])
        role = str(message["role"])
        if role == "assistant":
            raw_content = content
            content = strip_streamed_assistant_replay(content, previous_assistants)
            previous_assistants.append(raw_content)
        stored_media = _normalize_media_items(
            message.get("media") or [],
            username,
            project,
            project_dir=project_dir,
        )
        extracted_media = _extract_media(
            content, username, project, project_dir=project_dir
        )
        merged_media = _merge_media_items(stored_media, extracted_media)
        messages.append(
            {
                "id": int(message["id"]),
                "role": role,
                "content": content,
                "media": _filter_markdown_duplicate_images(content, merged_media),
                "created_at": str(message["created_at"]),
            }
        )
    return messages


def add_user_message(
    username: str,
    project: str,
    content: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    return chat_history.append_project_message(
        username,
        project,
        "user",
        content,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def add_assistant_message(
    username: str,
    project: str,
    content: str,
    media: list[dict[str, Any]] | None = None,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    content = redact_local_filesystem_paths(content)
    return chat_history.append_project_message(
        username,
        project,
        "assistant",
        content,
        media,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def add_trace_message(
    username: str,
    project: str,
    content: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    return chat_history.append_project_message(
        username,
        project,
        "trace",
        content,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def add_trace_messages(
    username: str,
    project: str,
    contents: list[str],
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> list[dict[str, Any]]:
    return chat_history.append_project_trace_messages(
        username,
        project,
        contents,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def _extract_media(
    content: str,
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
) -> list[dict[str, str]]:
    media_project_dir = _media_project_dir(username, project, project_dir)
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    markdown_images = _collect_markdown_image_refs(content)

    def add_item(raw_url: str, path: str | None = None) -> None:
        candidate = raw_url.strip(".,;)]}")
        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.path.startswith("/static/"):
            candidate = parsed.path
        if candidate.startswith("/static/"):
            canonical = _canonical_project_static_media_url(
                project, media_project_dir, candidate
            )
            if canonical is None:
                return
            candidate, path = canonical
        ext = Path(urlparse(candidate).path).suffix.lower()
        kind = _MEDIA_EXTENSIONS.get(ext)
        if not kind:
            return
        if kind == "image" and (
            candidate in markdown_images
            or (path and path in markdown_images)
            or (path and path.lstrip("./") in markdown_images)
        ):
            return
        effective_path = path or ""
        if not effective_path:
            effective_path = _media_path_from_static_url(candidate) or ""
        key = f"{kind}:{effective_path or candidate}"
        if key in seen:
            return
        seen.add(key)
        items.append(
            {
                "kind": kind,
                "url": candidate,
                "path": effective_path,
                "label": Path(effective_path or candidate).name,
            }
        )

    for match in _URL_RE.finditer(content):
        url = match.group(1)
        if url.startswith("/static/"):
            add_item(url)
        else:
            add_item(url)

    for match in _REL_PATH_RE.finditer(content):
        rel_path = match.group("path")
        full_path = media_project_dir / rel_path
        if full_path.exists():
            static_url = project_static_url(project, rel_path, local_path=full_path)
            add_item(static_url, rel_path)

    return items


def _collect_markdown_image_refs(content: str) -> set[str]:
    refs: set[str] = set()

    for match in _MARKDOWN_IMAGE_RE.finditer(content):
        raw = (match.group(1) or "").strip().strip("<>").strip(".,;)]}")
        if not raw:
            continue
        refs.add(raw)
        parsed = urlparse(raw)
        path = (
            parsed.path if parsed.scheme in {"http", "https"} else raw.split("?", 1)[0]
        )
        if path:
            refs.add(path)
        static_path = _media_path_from_static_url(raw)
        if static_path:
            refs.add(static_path)
            refs.add(static_path.lstrip("./"))
        elif parsed.scheme in {"http", "https"} and parsed.path.startswith("/static/"):
            refs.add(parsed.path)
        elif raw.startswith("/static/"):
            refs.add(raw.split("?", 1)[0])
        else:
            refs.add(path.lstrip("./") if path else raw.lstrip("./"))

    return refs


def _normalize_media_items(
    media: list[dict[str, Any]],
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    seen: set[str] = set()
    media_project_dir = _media_project_dir(username, project, project_dir)

    for item in media:
        if not isinstance(item, dict):
            continue

        candidate = str(item.get("url", "") or "").strip()
        path = str(item.get("path", "") or "").strip()
        if not candidate and not path:
            continue

        if not candidate and path:
            canonical = _canonical_project_static_media_url(
                project, media_project_dir, path
            )
            if canonical is None:
                continue
            candidate, path = canonical

        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.path.startswith("/static/"):
            candidate = parsed.path
        if candidate.startswith("/static/"):
            canonical = _canonical_project_static_media_url(
                project, media_project_dir, candidate
            )
            if canonical is None:
                continue
            candidate, path = canonical

        ext = Path(urlparse(candidate).path).suffix.lower()
        kind = _MEDIA_EXTENSIONS.get(ext)
        if not kind:
            continue

        if not path:
            path = _media_path_from_static_url(candidate) or ""

        key = f"{kind}:{path or candidate}"
        if key in seen:
            continue
        seen.add(key)

        normalized.append(
            {
                "kind": kind,
                "url": candidate,
                "path": path,
                "label": str(item.get("label", "") or Path(path or candidate).name),
            }
        )

    return normalized


def _merge_media_items(*groups: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    seen: set[str] = set()

    for group in groups:
        for item in group:
            kind = str(item.get("kind", "") or "").strip()
            url = str(item.get("url", "") or "").strip()
            path = str(item.get("path", "") or "").strip()
            if not kind or not url:
                continue
            key = f"{kind}:{path or url}"
            if key in seen:
                continue
            seen.add(key)
            merged.append(
                {
                    "kind": kind,
                    "url": url,
                    "path": path,
                    "label": str(item.get("label", "") or Path(path or url).name),
                }
            )

    return merged


def _filter_markdown_duplicate_images(
    content: str, media: list[dict[str, str]]
) -> list[dict[str, str]]:
    markdown_images = _collect_markdown_image_refs(content)
    if not markdown_images:
        return media

    filtered: list[dict[str, str]] = []
    for item in media:
        kind = str(item.get("kind", "") or "").strip()
        if kind != "image":
            filtered.append(item)
            continue

        url = str(item.get("url", "") or "").strip()
        path = str(item.get("path", "") or "").strip()
        if (
            url in markdown_images
            or (path and path in markdown_images)
            or (path and path.lstrip("./") in markdown_images)
        ):
            continue
        filtered.append(item)

    return filtered


def _build_claude_thread(username: str, project: str, agent_token: str):
    workspace = agent_workspace.ensure_claude(username, project, agent_token)
    client = ClaudeSdkClient(
        cli_path=agent_backend.claude_cli_path(),
        cwd=workspace,
        env=agent_workspace.build_environment(username, project, agent_token),
        model=agent_backend.claude_model(),
    )
    session_id = agent_thread_sessions.get_active(username, "claude")
    return client.thread_resume(session_id) if session_id else client.thread_start()


def _build_codex_thread(username: str, project: str, agent_token: str):
    workspace = agent_workspace.ensure_codex(username)
    client = CodexClient(
        codex_bin=agent_backend.codex_bin_path(),
        cwd=workspace,
        env=agent_workspace.build_environment(username, project, agent_token),
        model=agent_backend.codex_model(),
        config_overrides=agent_tool_configuration.codex_config_overrides(),
    )
    thread_id = agent_thread_sessions.get_active(username, "codex")
    return client.thread_resume(thread_id) if thread_id else client.thread_start()


async def interrupt_chat_turn(
    username: str, project: str, thread_id: str, turn_id: str
) -> bool:
    thread_id = str(thread_id or "").strip()
    turn_id = str(turn_id or "").strip()
    backend = agent_backend.name()
    if backend == "claude":
        if not thread_id:
            return False
        try:
            return await interrupt_live_claude_client(thread_id)
        except Exception as exc:
            if "closed stdout" in str(exc):
                return True
            raise
    if backend == "codex":
        if not thread_id or not turn_id:
            return False
        try:
            return await asyncio.to_thread(
                interrupt_live_codex_turn, thread_id, turn_id
            )
        except Exception as exc:
            if "app-server closed stdout" in str(exc):
                return True
            raise
    return False


async def stream_assistant_reply(
    username: str,
    project: str,
    prompt: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    run_lock_id = chat_run_locks.acquire(username, project)
    heartbeat_task = asyncio.create_task(
        chat_run_locks.maintain(username, project, run_lock_id)
    )
    try:
        deterministic = reingest_confirmation_reply(prompt)
        if deterministic is not None:
            return await _stream_deterministic_assistant_reply(
                username,
                project,
                deterministic,
                on_event,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        model_prompt = script_creation_guidance_prompt(prompt) or prompt
        backend = agent_backend.name()
        if backend == "codex":
            return await _stream_assistant_reply_codex(
                username,
                project,
                model_prompt,
                on_event,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        if backend == "hermes":
            return await _stream_assistant_reply_hermes(
                username,
                project,
                model_prompt,
                on_event,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        if backend != "claude":
            raise RuntimeError(f"Unsupported chat backend: {backend}")
        return await _stream_assistant_reply_claude(
            username,
            project,
            model_prompt,
            on_event,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        chat_run_locks.release(username, project, run_lock_id)


async def _stream_deterministic_assistant_reply(
    username: str,
    project: str,
    content: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    content = redact_local_filesystem_paths(content)
    message = add_assistant_message(
        username,
        project,
        content,
        [],
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )
    await _emit_chat_event_best_effort(
        on_event, {"type": "assistant_delta", "text": content}
    )
    await _emit_chat_event_best_effort(on_event, {"type": "done", "message": message})
    return message


async def prewarm_chat_backend(username: str, *, project: str | None = None) -> None:
    """Best-effort pre-warm of the per-user agent worker.

    Called when the user opens a chat / switches project so the first real
    message doesn't pay the full cold-start (spawn → initialize → session/new
    with startup probes). No-op unless the hermes backend is active; never
    raises — pre-warming is purely an optimization.
    """
    try:
        if agent_backend.name() != "hermes":
            return
        from ai_anime.chat.hermes_pool import pool as _hermes_pool

        await _hermes_pool.prewarm(
            username,
            scope_kind="project" if project else "home",
            project_id=project or None,
        )
    except Exception:
        return


async def _stream_assistant_reply_hermes(
    username: str,
    project: str,
    prompt: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Stream via Hermes ACP subprocess (per-user, sandboxed).

    Differs from claude/codex paths:
    - Hermes is per-USER not per-(user, project). Project context is injected
      as a prompt prefix via `current_project=project`.
    - No per-project chat.db session id; HermesPool owns the thread lifecycle.
    """
    from ai_anime.chat.hermes_pool import pool as _hermes_pool

    agent_prompt = build_agent_prompt_context(username, project, prompt)
    thread = await _hermes_pool.get_for_user(
        username,
        scope_kind="project" if project else "home",
        project_id=project or None,
    )
    previous_assistant = (
        _assistant_history_contents(
            username,
            project,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if project
        else []
    )
    previous_trace = (
        _trace_history_contents(
            username,
            project,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if project
        else []
    )
    assistant_text = ""
    tool_text = ""
    tool_ui_specs: list[dict[str, Any]] = []
    fallback_tool_ui_specs: list[dict[str, Any]] = []
    fallback_token: str | None = None
    current_tool_name: str | None = None
    current_tool_hidden = False
    persisted_message: dict[str, Any] | None = None
    seen_display_calls: set[str] = set()
    seen_tool_chat_errors: set[str] = set()

    def persist_partial_reply() -> dict[str, Any] | None:
        nonlocal persisted_message, assistant_text, tool_text
        if persisted_message is not None:
            return persisted_message
        final_text = strip_replayed_chat_response(
            assistant_text, previous_assistant, prompt
        ).strip()
        all_tool_ui_specs = dedupe_tool_ui_specs(
            [*tool_ui_specs, *fallback_tool_ui_specs]
        )
        all_tool_ui_specs = filter_tool_ui_specs_for_prompt(prompt, all_tool_ui_specs)
        final_text = append_tool_ui_specs(final_text, all_tool_ui_specs)
        if not final_text:
            return None
        final_text = normalize_json_render_reply(final_text)
        final_tool_text = strip_streamed_assistant_replay(tool_text, previous_trace)
        if final_tool_text.strip():
            add_trace_messages(
                username,
                project,
                split_trace_contents(final_tool_text),
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        media = _extract_media(final_text, username, project, project_dir=project_dir)
        persisted_message = add_assistant_message(
            username,
            project,
            final_text,
            media,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        return persisted_message

    try:
        async for event in thread.stream(agent_prompt, current_project=project or None):
            if event.type == "thread_started":
                await _emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "thread_started",
                        "thread_id": str(event.thread_id or "").strip() or None,
                        "turn_id": str(event.turn_id or "").strip() or None,
                    },
                )
                continue
            if event.type == "assistant_delta":
                assistant_text = merge_stream_text(assistant_text, event.text)
                streamed_text = strip_replayed_chat_response(
                    assistant_text,
                    previous_assistant,
                    prompt,
                    suppress_partial_replay=True,
                )
                streamed_text = redact_local_filesystem_paths(streamed_text)
                await _emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "assistant_delta",
                        "text": streamed_text,
                    },
                )
                continue
            if event.type == "tool_update":
                if event.raw is not None:
                    mapped_chat_error = tool_chat_error(event.raw)
                    if (
                        mapped_chat_error
                        and mapped_chat_error not in seen_tool_chat_errors
                    ):
                        seen_tool_chat_errors.add(mapped_chat_error)
                        assistant_text = merge_stream_text(
                            assistant_text,
                            ("\n\n" if assistant_text.strip() else "")
                            + mapped_chat_error,
                        )
                        await _emit_chat_event_best_effort(
                            on_event,
                            {
                                "type": "assistant_delta",
                                "text": redact_local_filesystem_paths(
                                    mapped_chat_error
                                ),
                            },
                        )
                    tool_ui_specs.extend(extract_tool_ui_specs(event.raw))
                    display_call = extract_display_tool_call(event.raw)
                    if display_call is not None:
                        tool_name, tool_args = display_call
                        display_call_key = display_tool_call_key(tool_name, tool_args)
                        if display_call_key in seen_display_calls:
                            logger.info(
                                "filtered duplicate hermes display fallback "
                                "turn_id=%s project=%s tool=%s args=%s raw_kind=%s",
                                event.turn_id,
                                project,
                                tool_name,
                                json.dumps(
                                    tool_args,
                                    ensure_ascii=False,
                                    sort_keys=True,
                                    default=str,
                                )[:1000],
                                event.raw.get("sessionUpdate")
                                if isinstance(event.raw, dict)
                                else None,
                            )
                        else:
                            seen_display_calls.add(display_call_key)
                            if fallback_token is None:
                                fallback_token = await create_page_agent_session_token(
                                    username,
                                    project,
                                    agent_kind="hermes-display-fallback",
                                )
                            fallback_tool_ui_specs.extend(
                                await fallback_display_tool_ui_specs(
                                    project,
                                    tool_name,
                                    tool_args,
                                    token=fallback_token,
                                )
                            )
                if event.name:
                    current_tool_name = event.name
                    current_tool_hidden = is_hidden_chat_tool_event(
                        event.name, event.text
                    )
                if current_tool_hidden or is_hidden_chat_tool_event(
                    current_tool_name, event.text
                ):
                    continue
                tool_text += str(event.text or "") + "\n"
                display_tool_text = strip_streamed_assistant_replay(
                    tool_text, previous_trace
                )
                if display_tool_text.strip():
                    await _emit_chat_event_best_effort(
                        on_event,
                        {
                            "type": "tool_update",
                            "text": display_tool_text,
                            "name": current_tool_name,
                        },
                    )
                continue
            if event.type == "complete":
                if seen_tool_chat_errors and assistant_text.strip():
                    continue
                assistant_text = completion_text_or_existing(
                    event.text, assistant_text
                )

        if not assistant_text.strip():
            assistant_text = "(hermes returned no content)"
        if not tool_ui_specs and not fallback_tool_ui_specs:
            inferred_display_call = infer_display_tool_call_from_text(
                prompt,
                assistant_text,
                previous_assistant,
            )
            if inferred_display_call is not None:
                tool_name, tool_args = inferred_display_call
                if fallback_token is None:
                    fallback_token = await create_page_agent_session_token(
                        username,
                        project,
                        agent_kind="hermes-display-fallback",
                    )
                fallback_tool_ui_specs.extend(
                    await fallback_display_tool_ui_specs(
                        project,
                        tool_name,
                        tool_args,
                        token=fallback_token,
                    )
                )
        result_message = persist_partial_reply()
        if result_message is None:
            result_message = add_assistant_message(
                username,
                project,
                "(hermes returned no content)",
                [],
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
            persisted_message = result_message
        await _emit_chat_event_best_effort(
            on_event,
            {"type": "assistant_message", "message": result_message},
        )
        await _emit_chat_event_best_effort(
            on_event, {"type": "done", "message": result_message}
        )
        return result_message
    except Exception:
        raise
    finally:
        persist_partial_reply()


async def _stream_assistant_reply_claude(
    username: str,
    project: str,
    prompt: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    try:
        agent_token = await create_page_agent_session_token(
            username,
            project,
            agent_kind="claude",
        )
        thread = _build_claude_thread(username, project, agent_token)
        agent_prompt = build_agent_prompt_context(username, project, prompt)
        assistant_text = ""
        tool_text = ""
        async for event in thread.stream(agent_prompt):
            if event.type == "thread_started":
                thread_id = str(event.thread_id or "").strip() or None
                if thread_id:
                    agent_thread_sessions.set_active(username, "claude", thread_id)
                await on_event(
                    {
                        "type": "thread_started",
                        "thread_id": thread_id,
                        "turn_id": str(event.turn_id or "").strip() or None,
                    }
                )
                continue
            if event.type == "assistant_delta":
                assistant_text = merge_stream_text(assistant_text, event.text)
                streamed_text = redact_local_filesystem_paths(assistant_text)
                await on_event(
                    {
                        "type": "assistant_delta",
                        "text": streamed_text,
                    }
                )
                continue
            if event.type == "tool_update":
                tool_text = str(event.text or "")
                await on_event({"type": "tool_update", "text": tool_text})
                continue
            if event.type == "complete":
                thread_id = str(event.thread_id or "").strip() or None
                if thread_id:
                    agent_thread_sessions.set_active(username, "claude", thread_id)
                assistant_text = completion_text_or_existing(
                    event.text, assistant_text
                )

        assistant_text = assistant_text.strip() or "已执行，但没有返回正文。"
        assistant_text = normalize_json_render_reply(assistant_text)
        if tool_text.strip():
            add_trace_messages(
                username,
                project,
                split_trace_contents(tool_text),
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        media = _extract_media(
            assistant_text, username, project, project_dir=project_dir
        )
        result_message = add_assistant_message(
            username,
            project,
            assistant_text,
            media,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        await on_event({"type": "done", "message": result_message})
        return result_message
    except Exception:
        raise


async def _stream_assistant_reply_codex(
    username: str,
    project: str,
    prompt: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    assistant_text = ""
    tool_text = ""
    agent_token = await create_page_agent_session_token(
        username,
        project,
        agent_kind="codex",
    )
    thread = _build_codex_thread(username, project, agent_token)
    agent_prompt = build_agent_prompt_context(username, project, prompt)
    async for event in thread.stream(agent_prompt):
        if event.type == "thread_started":
            thread_id = str(event.thread_id or "").strip() or None
            if thread_id:
                agent_thread_sessions.set_active(username, "codex", thread_id)
            await on_event(
                {
                    "type": "thread_started",
                    "thread_id": thread_id,
                    "turn_id": str(event.turn_id or "").strip() or None,
                }
            )
            continue
        if event.type == "assistant_delta":
            assistant_text = merge_stream_text(assistant_text, event.text)
            streamed_text = redact_local_filesystem_paths(assistant_text)
            await on_event(
                {
                    "type": "assistant_delta",
                    "text": streamed_text,
                }
            )
            continue
        if event.type == "tool_update":
            tool_text += str(event.text or "")
            await on_event({"type": "tool_update", "text": tool_text})
            continue
        if event.type == "complete":
            thread_id = str(event.thread_id or "").strip() or None
            if thread_id:
                agent_thread_sessions.set_active(username, "codex", thread_id)
            assistant_text = completion_text_or_existing(event.text, assistant_text)

    assistant_text = assistant_text.strip() or "已执行，但没有返回正文。"
    assistant_text = normalize_json_render_reply(assistant_text)
    if tool_text.strip():
        add_trace_messages(
            username,
            project,
            split_trace_contents(tool_text),
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
    media = _extract_media(assistant_text, username, project, project_dir=project_dir)
    result_message = add_assistant_message(
        username,
        project,
        assistant_text,
        media,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )
    await on_event({"type": "done", "message": result_message})
    return result_message


async def generate_assistant_reply(
    username: str, project: str, prompt: str
) -> dict[str, Any]:
    async def _ignore(_event: dict[str, Any]) -> None:
        return None

    return await stream_assistant_reply(username, project, prompt, _ignore)
