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

from ai_anime.modules.ai_assistant.public import (
    append_tool_ui_specs,
    build_agent_prompt_context,
    completion_text_or_existing,
    create_page_agent_session_token,
    dedupe_tool_ui_specs,
    display_tool_call_key,
    extract_display_tool_call,
    extract_project_media,
    extract_tool_ui_specs,
    fallback_display_tool_ui_specs,
    filter_tool_ui_specs_for_prompt,
    get_agent_backend,
    get_agent_thread_replies,
    get_agent_thread_runtime,
    get_chat_run_locks,
    get_hermes_runtime,
    get_project_chat_messages,
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

logger = logging.getLogger("ai_anime.chat.service")
agent_backend = get_agent_backend()
agent_thread_replies = get_agent_thread_replies()
agent_thread_runtime = get_agent_thread_runtime()
chat_run_locks = get_chat_run_locks()
hermes_runtime = get_hermes_runtime()
project_chat_messages = get_project_chat_messages()

_REINGEST_CANCELLED_BLOCK_RE = re.compile(
    r"\[AI_ANIME_REINGEST_CANCELLED\](.*?)\[/AI_ANIME_REINGEST_CANCELLED\]",
    re.DOTALL,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _state_root() -> Path:
    configured = os.environ.get("AI_ANIME_STATE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return _repo_root() / "state"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


async def interrupt_chat_turn(
    username: str, project: str, thread_id: str, turn_id: str
) -> bool:
    return await agent_thread_runtime.interrupt(
        agent_backend.name(),
        thread_id,
        turn_id,
    )


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
            return await agent_thread_replies.stream(
                "codex",
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
        return await agent_thread_replies.stream(
            "claude",
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
    message = project_chat_messages.append_assistant(
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
        await hermes_runtime.prewarm(
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
    agent_prompt = build_agent_prompt_context(username, project, prompt)
    thread = await hermes_runtime.get_for_user(
        username,
        scope_kind="project" if project else "home",
        project_id=project or None,
    )
    previous_assistant = (
        project_chat_messages.assistant_contents(
            username,
            project,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if project
        else []
    )
    previous_trace = (
        project_chat_messages.trace_contents(
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
            project_chat_messages.append_traces(
                username,
                project,
                split_trace_contents(final_tool_text),
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        media = extract_project_media(
            final_text,
            username,
            project,
            project_dir=project_dir,
        )
        persisted_message = project_chat_messages.append_assistant(
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
            result_message = project_chat_messages.append_assistant(
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


async def generate_assistant_reply(
    username: str, project: str, prompt: str
) -> dict[str, Any]:
    async def _ignore(_event: dict[str, Any]) -> None:
        return None

    return await stream_assistant_reply(username, project, prompt, _ignore)
