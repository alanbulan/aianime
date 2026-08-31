"""Hermes chat backend SDK adapter.

Speaks ACP (Agent Client Protocol — agentclientprotocol.com) over stdin/stdout
JSON-RPC to the desktop-bundled ``hermes acp`` subprocess.

Public:
    HermesSdkClient   — holds spawn config (cli_path, cwd, env, model)
    HermesSdkThread   — one session; yields ChatBackendEvent on stream()

See docs/hermes-acp-protocol.md for the full protocol.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator, Literal

from ai_anime.modules.ai_assistant.application.ports import (
    SessionModelRouteRejected,
)
from ai_anime.modules.ai_assistant.domain import is_slash_command
from ai_anime.modules.ai_assistant.infrastructure.hermes.command_responses import (
    help_response,
    localize_runtime_response,
    model_response,
    should_localize_runtime_command,
    slash_command_parts,
)
from ai_anime.modules.ai_assistant.infrastructure.hermes.model_route import (
    decode_model_selection,
    encode_automatic_model,
    encode_model_route,
)
from ai_anime.modules.ai_assistant.infrastructure.hermes.skill_catalog import (
    expand_skill_invocation,
    merge_runtime_slash_commands,
)
from ai_anime.modules.ai_assistant.infrastructure.sandbox_wrap import SandboxSpec, wrap_command


@dataclass(slots=True)
class ChatBackendEvent:
    type: Literal[
        "thread_started",
        "assistant_delta",
        "tool_update",
        "available_commands",
        "context_usage",
        "complete",
    ]
    thread_id: str | None = None
    turn_id: str | None = None
    text: str | None = None
    name: str | None = None
    success: bool | None = None
    error: str | None = None
    tool_call_id: str | None = None
    tool_phase: Literal["call", "result"] | None = None
    tool_input: Any | None = None
    tool_output: Any | None = None
    raw: Any | None = None

_log = logging.getLogger(__name__)

# How long to wait for the ACP initialize response before giving up.
INITIALIZE_TIMEOUT = 30.0
# How long to wait for hermes to produce a session/new response.
SESSION_NEW_TIMEOUT = 90.0  # cold start runs startup probes (vision/aux); allow them to finish
# Maximum idle period between ACP frames while streaming a prompt. This is not
# a whole-turn deadline: long tool workflows remain alive while they keep
# reporting progress.
try:
    STREAM_READ_TIMEOUT = max(
        30.0,
        float(os.environ.get("HERMES_STREAM_IDLE_TIMEOUT", "300")),
    )
except ValueError:
    STREAM_READ_TIMEOUT = 300.0
try:
    TURN_TOOL_CALL_LIMIT = max(1, int(os.environ.get("HERMES_TURN_TOOL_CALL_LIMIT", "512")))
except ValueError:
    TURN_TOOL_CALL_LIMIT = 512
TOOL_DETAIL_LIMIT = 1600
CONTENT_FILTER_MESSAGE = (
    "本轮回复被模型网关的内容安全过滤拦截了，AI anime 助手没有拿到可用输出。"
    "请把需求拆得更具体，避免一次性要求完成整集或包含敏感/违规描述；"
    "也可以先让我只列当前制作进度和下一步。"
)


def _hermes_acp_command(
    cli_path: Path,
    *,
    windows: bool | None = None,
) -> list[str]:
    """Build the packaged binary or source-entrypoint Hermes command."""
    if cli_path.name != "hermes_acp.py":
        return [str(cli_path), "acp"]
    is_windows = os.name == "nt" if windows is None else windows
    python_path = (
        cli_path.parent
        / ".venv"
        / ("Scripts" if is_windows else "bin")
        / ("python.exe" if is_windows else "python")
    )
    return [str(python_path), str(cli_path), "acp"]


_CONTEXT_CHUNK_ERROR_MARKERS = (
    "separator is found, but chunk is longer than limit",
)
_AI_ANIME_WRITE_TOOLS = {
    "ai_anime_post",
    "ai_anime_patch",
    "ai_anime_delete",
    "ai_anime_create_style",
    "ai_anime_generate_style_preview",
    "ai_anime_upload_style_preview",
    "ai_anime_run_production_workflow",
    "ai_anime_run_script_workflow",
    "ai_anime_start_ingest",
    "ai_anime_build_characters",
    "ai_anime_plan_episodes",
    "ai_anime_generate_script",
    "ai_anime_update_character_face_prompt",
    "ai_anime_plan_identities",
    "ai_anime_plan_scenes",
    "ai_anime_plan_props",
    "ai_anime_generate_scene_master",
    "ai_anime_generate_scene_reverse",
    "ai_anime_generate_sketches",
    "ai_anime_detect_sketch_identities",
    "ai_anime_optimize_video_global",
    "ai_anime_generate_audio",
    "ai_anime_render_first_frames",
    "ai_anime_compose_episode",
    "ai_anime_generate_portrait",
    "ai_anime_generate_identity_image",
    "ai_anime_start_single_video",
}

_AI_ANIME_READ_TOOLS = {
    "ai_anime_get",
    "ai_anime_get_character_media",
    "ai_anime_get_episode_media",
    "ai_anime_get_episode_script",
    "ai_anime_get_final_video",
    "ai_anime_get_first_frames",
    "ai_anime_get_scene_images",
    "ai_anime_get_sketch_candidates",
    "ai_anime_get_sketches",
    "ai_anime_get_task",
    "ai_anime_list_ingest_uploads",
    "ai_anime_list_tasks",
    "ai_anime_pipeline_status",
}

_TOOL_DETAIL_FIELDS = (
    ("command", "命令"),
    ("cmd", "命令"),
    ("arguments", "参数"),
    ("args", "参数"),
    ("input", "输入"),
    ("preview", "预览"),
    ("content", "内容"),
)


def _split_tool_title(title: object) -> tuple[str, str]:
    text = str(title or "").strip()
    if not text:
        return "tool", ""
    head, sep, tail = text.partition(":")
    if sep and head.strip():
        name = head.strip()
        detail = tail.strip()
    else:
        name = text.split()[0].strip() or "tool"
        detail = text
    normalized = re.sub(r"[^a-z0-9]+", "_", text.casefold()).strip("_")
    for internal_name in ("skill_view", "skills_list"):
        if normalized == internal_name or normalized.startswith(f"{internal_name}_"):
            return internal_name, detail
    return name, detail


def _redact_tool_detail(text: str) -> str:
    text = re.sub(
        r"(?i)(api[_-]?key|token|authorization|password|secret)(['\"\s:=]+)[^'\"\s,}]+",
        r"\1\2***",
        text,
    )
    text = re.sub(r"(?i)(bearer\s+)[a-z0-9._~+/=-]+", r"\1***", text)
    return text


def _compact_tool_detail(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value.strip()
    else:
        try:
            text = json.dumps(value, ensure_ascii=False)
        except TypeError:
            text = str(value)
    text = _redact_tool_detail(text.strip())
    if len(text) > TOOL_DETAIL_LIMIT:
        return f"{text[:TOOL_DETAIL_LIMIT]}..."
    return text


def _has_content_filter_signal(value: object) -> bool:
    if isinstance(value, str):
        lowered = value.lower()
        return "content_filter" in lowered or "content filter triggered" in lowered
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() == "finish_reason" and str(item).lower() == "content_filter":
                return True
            if _has_content_filter_signal(item):
                return True
        return False
    if isinstance(value, (list, tuple)):
        return any(_has_content_filter_signal(item) for item in value)
    return False


def _is_context_chunk_error(value: object) -> bool:
    if isinstance(value, str):
        lowered = value.casefold()
        return any(marker in lowered for marker in _CONTEXT_CHUNK_ERROR_MARKERS)
    if isinstance(value, dict):
        return any(
            _is_context_chunk_error(key) or _is_context_chunk_error(item)
            for key, item in value.items()
        )
    if isinstance(value, (list, tuple)):
        return any(_is_context_chunk_error(item) for item in value)
    if isinstance(value, BaseException):
        return _is_context_chunk_error(str(value))
    return False


def _is_ai_anime_write_tool(name: object) -> bool:
    return str(name or "").strip() in _AI_ANIME_WRITE_TOOLS


def _should_stop_after_failed_write(event: ChatBackendEvent) -> bool:
    return (
        event.type == "tool_update"
        and event.tool_phase == "result"
        and event.success is False
        and _is_ai_anime_write_tool(event.name)
    )


def _is_failed_tool_update(
    value: object,
    *,
    suppress_domain_failures: bool = False,
) -> bool:
    if isinstance(value, str):
        raw = value.strip()
        if not raw or raw[0] not in "[{":
            return False
        try:
            return _is_failed_tool_update(
                json.loads(raw),
                suppress_domain_failures=suppress_domain_failures,
            )
        except json.JSONDecodeError:
            return False
    if isinstance(value, (list, tuple)):
        return any(
            _is_failed_tool_update(
                item,
                suppress_domain_failures=suppress_domain_failures,
            )
            for item in value
        )
    if not isinstance(value, dict):
        return False
    status_code = value.get("status_code")
    if suppress_domain_failures and (
        value.get("ok") is True
        or (
            isinstance(status_code, int)
            and 200 <= status_code < 300
            and value.get("ok") is not False
        )
    ):
        return False
    status = str(value.get("status") or "").strip().lower()
    if status in {"failed", "error", "cancelled", "canceled"}:
        return True
    if value.get("ok") is False:
        return True
    for key in ("error", "message", "result", "content", "data", "output"):
        if _is_failed_tool_update(
            value.get(key),
            suppress_domain_failures=suppress_domain_failures,
        ):
            return True
    return False


def _tool_update_outcome(
    update: dict,
    *,
    tool_name: str | None = None,
) -> tuple[bool | None, str | None]:
    status = str(update.get("status") or "").strip().lower()
    if _is_failed_tool_update(
        update,
        suppress_domain_failures=tool_name in _AI_ANIME_READ_TOOLS,
    ):
        detail = (
            update.get("error")
            or update.get("message")
            or update.get("result")
            or status
            or "工具调用失败"
        )
        return False, _compact_tool_detail(detail)
    if status in {"completed", "complete", "success", "succeeded"}:
        return True, None
    return None, None


def _format_tool_call_text(update: dict, title: object) -> str:
    lines = [f"→ {title}"]
    seen: set[str] = set()
    for key, label in _TOOL_DETAIL_FIELDS:
        if key in seen:
            continue
        value = update.get(key)
        if value in (None, "", [], {}):
            continue
        detail = _compact_tool_detail(value)
        if detail:
            lines.append(f"{label}: {detail}")
            seen.add(key)
    return "\n".join(lines)


class HermesSdkClient:
    """Holds spawn configuration for a hermes worker subprocess.

    Each HermesSdkThread reuses this client (cli_path/cwd/env are constant
    per-user), but spawns a fresh subprocess. Hermes' own ACP session
    semantics (resume/fork) live on the thread.
    """

    def __init__(
        self,
        *,
        cli_path: Path,
        cwd: Path,
        env: dict[str, str],
        model: str | None,
        username: str,
    ) -> None:
        self._cli_path = cli_path
        self._cwd = cwd
        self._env = env
        self._model = (model or "").strip() or None
        self._username = username

    def thread_start(self) -> "HermesSdkThread":
        return HermesSdkThread(
            cli_path=self._cli_path,
            cwd=self._cwd,
            env=self._env,
            model=self._model,
            username=self._username,
            session_id=None,
        )

    def thread_resume(self, session_id: str) -> "HermesSdkThread":
        return HermesSdkThread(
            cli_path=self._cli_path,
            cwd=self._cwd,
            env=self._env,
            model=self._model,
            username=self._username,
            session_id=(session_id or "").strip() or None,
        )


class HermesSdkThread:
    """One ACP session against a sandboxed hermes subprocess.

    Lifecycle:
        1. stream() lazily spawns hermes-acp on first call
        2. JSON-RPC: initialize → session/new (or session/resume) → session/prompt
        3. notifications surfaced as ChatBackendEvent
        4. on close, terminate subprocess + revoke the control-plane agent
           session (caller's responsibility in HermesPool)
    """

    def __init__(
        self,
        *,
        cli_path: Path,
        cwd: Path,
        env: dict[str, str],
        model: str | None,
        username: str,
        session_id: str | None,
    ) -> None:
        self._cli_path = cli_path
        self._cwd = cwd
        self._env = env
        self._model = model
        self._username = username
        self.id: str = session_id or ""
        self._is_new = session_id is None
        self._proc: asyncio.subprocess.Process | None = None
        # Drains the subprocess stderr pipe. Without a consumer hermes blocks
        # once the OS pipe buffer fills (4–64KB), which stalls stdout and hangs
        # every ACP turn until the read timeout kills the session.
        self._stderr_task: asyncio.Task[None] | None = None
        self._req_counter = 0
        self._closed = False
        self._initialized = False
        self._session_ready = False
        self._tool_names_by_call_id: dict[str, str] = {}
        self._model_route_selector: str | None = None
        self._model_reasoning_effort: str | None = None
        self._model_route_is_managed = False
        # Serializes the spawn→initialize→session prologue so a background
        # warm() and the first real stream() can't interleave on the shared
        # JSON-RPC stdio. Whichever runs first pays the cold start; the other
        # awaits it and then proceeds against the ready session.
        self._setup_lock = asyncio.Lock()
        # Serializes the entire ACP stdio exchange. Background warm() calls
        # and prompt streams share one subprocess stdout and must never read it
        # concurrently.
        self._turn_lock = asyncio.Lock()

    def _next_id(self) -> int:
        self._req_counter += 1
        return self._req_counter

    async def _send(self, method: str, params: dict[str, Any]) -> int:
        if self._proc is None or self._proc.stdin is None:
            raise RuntimeError("hermes subprocess not started")
        req_id = self._next_id()
        msg = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
        line = json.dumps(msg) + "\n"
        self._proc.stdin.write(line.encode("utf-8"))
        await self._proc.stdin.drain()
        return req_id

    async def _send_notification(self, method: str, params: dict[str, Any]) -> None:
        if self._proc is None or self._proc.stdin is None:
            return
        msg = {"jsonrpc": "2.0", "method": method, "params": params}
        self._proc.stdin.write((json.dumps(msg) + "\n").encode("utf-8"))
        await self._proc.stdin.drain()

    async def _cancel_prompt_and_close(self) -> None:
        try:
            await asyncio.wait_for(
                self._send_notification("session/cancel", {"sessionId": self.id}),
                timeout=1.0,
            )
        except (asyncio.TimeoutError, BrokenPipeError, ConnectionError, RuntimeError):
            _log.debug("failed to notify Hermes about prompt cancellation", exc_info=True)
        await self.close()

    async def _spawn(self) -> None:
        """Launch the hermes acp subprocess inside our sandbox."""
        if self._proc is not None:
            exit_code = getattr(self._proc, "returncode", None)
            if exit_code is None:
                return
            self._proc = None
            await self._stop_stderr_drain()
            self._initialized = False
            self._session_ready = False
            self._req_counter = 0
            self._tool_names_by_call_id.clear()
            _log.warning(
                "restarting exited Hermes worker for user=%s session=%s exit_code=%s",
                self._username,
                self.id,
                exit_code,
            )
        base_cmd = _hermes_acp_command(self._cli_path)
        # Wrap with OS sandbox (codex-linux-sandbox on Linux; sandbox-exec on macOS).
        sandboxed = wrap_command(base_cmd, SandboxSpec(user=self._username, hermes_home=self._cwd))
        _log.info("spawning hermes acp for user=%s (sandboxed=%s)", self._username,
                  sandboxed[0] != base_cmd[0])
        self._proc = await asyncio.create_subprocess_exec(
            *sandboxed,
            cwd=str(self._cwd),
            env=self._env,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._stderr_task = asyncio.create_task(
            self._drain_stderr(self._proc.stderr),
            name=f"hermes-stderr-{self._username}",
        )

    async def _drain_stderr(self, stream: asyncio.StreamReader | None) -> None:
        """Consume hermes stderr forever so the pipe can never fill up.

        A full stderr pipe blocks the child mid-write, which stops stdout and
        deadlocks the ACP exchange. Lines are logged at debug level; the loop
        exits on EOF (process gone) and is cancelled by close().
        """
        if stream is None:
            return
        try:
            while True:
                line = await stream.readline()
                if not line:
                    return
                text = line.decode("utf-8", errors="replace").rstrip()
                if text:
                    _log.debug("hermes stderr [%s]: %s", self._username, text)
        except asyncio.CancelledError:
            raise
        except Exception:
            # Never let stderr bookkeeping surface as a session failure.
            _log.debug("hermes stderr drain stopped", exc_info=True)

    async def _read_until_id(
        self, target_id: int, timeout: float
    ) -> tuple[dict | None, list[dict]]:
        """Read JSON-RPC messages until we see ``id == target_id``.

        Returns ``(response_payload, notifications_seen)``.
        notifications_seen captures any server-initiated messages along the way
        (no ``id``, or different id) that the caller may want to surface as
        ChatBackendEvent.
        """
        notifications: list[dict] = []
        assert self._proc is not None and self._proc.stdout is not None
        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            remaining = max(0.1, deadline - asyncio.get_event_loop().time())
            try:
                line = await asyncio.wait_for(
                    self._proc.stdout.readline(), timeout=remaining
                )
            except asyncio.TimeoutError:
                return None, notifications
            if not line:
                return None, notifications
            try:
                msg = json.loads(line.decode("utf-8"))
            except json.JSONDecodeError:
                _log.warning("non-JSON line from hermes: %r", line[:200])
                continue
            if isinstance(msg, dict) and msg.get("id") == target_id:
                return msg, notifications
            notifications.append(msg)

    async def _initialize(self) -> None:
        if self._initialized:
            return
        req_id = await self._send(
            "initialize",
            {
                "protocolVersion": 1,
                "clientInfo": {"name": "ai_anime", "version": "0.1.0"},
            },
        )
        resp, _ = await self._read_until_id(req_id, INITIALIZE_TIMEOUT)
        if resp is None:
            raise RuntimeError("hermes initialize timed out")
        if "error" in resp:
            raise RuntimeError(f"hermes initialize error: {resp['error']}")
        self._initialized = True
        _log.debug("hermes initialized: %s", resp.get("result", {}).get("agentInfo"))

    async def _ensure_session(self) -> None:
        """Create or resume the ACP session. Updates ``self.id``."""
        if self.id and not self._is_new:
            req_id = await self._send(
                "session/load",
                {"sessionId": self.id, "cwd": str(self._cwd), "mcpServers": []},
            )
            resp, _ = await self._read_until_id(req_id, SESSION_NEW_TIMEOUT)
            if resp and "error" not in resp and resp.get("result") is not None:
                self._capture_model_route(resp.get("result"))
                self._session_ready = True
                return
            _log.warning("session/load failed, falling back to session/new: %s",
                         (resp.get("error") or "empty result") if resp else "timeout")
            self._is_new = True

        req_id = await self._send(
            "session/new",
            {"cwd": str(self._cwd), "mcpServers": []},
        )
        resp, _ = await self._read_until_id(req_id, SESSION_NEW_TIMEOUT)
        if resp is None:
            raise RuntimeError("hermes session/new timed out")
        if "error" in resp:
            raise RuntimeError(f"hermes session/new error: {resp['error']}")
        result = resp.get("result", {})
        self.id = result.get("sessionId") or f"hermes-{uuid.uuid4().hex}"
        self._capture_model_route(result)
        self._is_new = False
        self._session_ready = True

    def _capture_model_route(self, result: object) -> None:
        payload = result if isinstance(result, dict) else {}
        models = payload.get("models")
        model_state = models if isinstance(models, dict) else {}
        current_model = (
            model_state.get("currentModelId")
            or model_state.get("current_model_id")
        )
        selection = decode_model_selection(current_model)
        self._model_route_is_managed = selection is not None
        self._model_route_selector = selection.selector if selection else None
        self._model_reasoning_effort = (
            selection.reasoning_effort if selection else None
        )

    async def get_model_route(self) -> tuple[str | None, str | None]:
        """Return the effective per-conversation route override, if any."""
        async with self._turn_lock:
            if self._closed:
                raise RuntimeError("HermesSdkThread is closed")
            await self._prepare()
            return self._model_route_selector, self._model_reasoning_effort

    async def set_model_route(
        self,
        selector: str | None,
        reasoning_effort: str | None = None,
    ) -> tuple[str | None, str | None]:
        """Persist an exact route override on this ACP conversation only."""
        normalized = str(selector or "").strip() or None
        normalized_effort = str(reasoning_effort or "").strip() or None
        model_id = (
            encode_model_route(normalized, normalized_effort)
            if normalized is not None
            else encode_automatic_model(normalized_effort)
        )
        async with self._turn_lock:
            if self._closed:
                raise RuntimeError("HermesSdkThread is closed")
            await self._prepare()
            if (
                self._model_route_is_managed
                and normalized == self._model_route_selector
                and normalized_effort == self._model_reasoning_effort
            ):
                return self._model_route_selector, self._model_reasoning_effort
            req_id = await self._send(
                "session/set_model",
                {"sessionId": self.id, "modelId": model_id},
            )
            response, _ = await self._read_until_id(req_id, SESSION_NEW_TIMEOUT)
            if response is None:
                raise RuntimeError("切换当前对话模型超时")
            if "error" in response:
                error = response.get("error")
                detail = error.get("message") if isinstance(error, dict) else error
                raise SessionModelRouteRejected(
                    f"切换当前对话模型失败：{detail}"
                )
            self._model_route_is_managed = True
            self._model_route_selector = normalized
            self._model_reasoning_effort = normalized_effort
            return self._model_route_selector, self._model_reasoning_effort

    async def _prepare(self) -> None:
        """Spawn + initialize + create/resume session (the cold-start prologue).

        Idempotent and serialized via ``_setup_lock`` so a background warm() and
        the first real stream() never interleave on the JSON-RPC stdio.
        """
        async with self._setup_lock:
            await self._spawn()
            if self._proc is None or self._proc.stdout is None:
                raise RuntimeError("hermes subprocess failed to start")
            await self._initialize()
            if not self._session_ready:
                await self._ensure_session()

    async def warm(self) -> None:
        """Pre-pay the cold start (spawn + initialize + session) without a prompt.

        Best-effort: called proactively when the user opens a chat/switches scope
        so the first real message hits a ready session. Failures are logged, not
        raised — a failed warm just means the first stream() pays the cold start.
        """
        try:
            async with self._turn_lock:
                if self._closed:
                    return
                await self._prepare()
                _log.info(
                    "hermes worker warmed for user=%s session=%s",
                    self._username,
                    self.id,
                )
        except Exception as e:  # noqa: BLE001 - best-effort prewarm
            _log.warning("hermes warm() failed for user=%s: %s", self._username, e)

    async def stream(self, prompt: str, *, current_project: str | None = None) \
            -> AsyncIterator[ChatBackendEvent]:
        """Send a prompt and yield ChatBackendEvent items as hermes streams them.

        ``current_project`` is included as a prompt prefix so per-user hermes
        knows which AI anime project the user is talking about (see plan).
        """
        if self._closed:
            raise RuntimeError("HermesSdkThread is closed")

        command_parts = slash_command_parts(prompt)
        if command_parts is not None and command_parts[0] in {"help", "model"}:
            command, arguments = command_parts
            turn_id = uuid.uuid4().hex
            if command == "help":
                response_text = help_response()
            else:
                selector = await self.get_model_route()
                response_text = model_response(
                    selector,
                    has_arguments=bool(arguments),
                )
            yield ChatBackendEvent(
                type="thread_started",
                thread_id=self.id or None,
                turn_id=turn_id,
            )
            yield ChatBackendEvent(
                type="assistant_delta",
                thread_id=self.id or None,
                turn_id=turn_id,
                text=response_text,
            )
            yield ChatBackendEvent(
                type="complete",
                thread_id=self.id or None,
                turn_id=turn_id,
                text="",
            )
            return

        expanded_skill_prompt = expand_skill_invocation(self._cwd, prompt)
        text = expanded_skill_prompt or prompt
        if (
            expanded_skill_prompt is None
            and current_project
            and not is_slash_command(prompt)
        ):
            text = f"[CONTEXT: current_project={current_project}]\n\n{prompt}"
        turn_id = uuid.uuid4().hex
        recovered_context_session = False
        localized_command = should_localize_runtime_command(prompt)

        await self._turn_lock.acquire()
        try:
            while True:
                if self._closed:
                    raise RuntimeError("HermesSdkThread is closed")
                try:
                    await self._prepare()
                except Exception as exc:
                    if (
                        not recovered_context_session
                        and _is_context_chunk_error(exc)
                    ):
                        recovered_context_session = True
                        await self._reset_for_fresh_session(str(exc))
                        continue
                    raise

                assert self._proc is not None and self._proc.stdout is not None
                yield ChatBackendEvent(
                    type="thread_started", thread_id=self.id, turn_id=turn_id
                )
                req_id = await self._send(
                    "session/prompt",
                    {
                        "sessionId": self.id,
                        "messageId": turn_id,
                        "prompt": [{"type": "text", "text": text}],
                    },
                )

                # A context-chunk failure is safe to retry only before Hermes has
                # emitted assistant content or invoked a tool. This prevents a
                # fresh-session recovery from duplicating write operations.
                tool_call_count = 0
                emitted_response = False
                retry_fresh_session = False
                command_response_parts: list[str] = []
                while True:
                    try:
                        line = await asyncio.wait_for(
                            self._proc.stdout.readline(), timeout=STREAM_READ_TIMEOUT
                        )
                    except asyncio.TimeoutError:
                        _log.warning(
                            "Hermes prompt produced no ACP frames for %.0f seconds; "
                            "cancelling worker session=%s turn=%s",
                            STREAM_READ_TIMEOUT,
                            self.id,
                            turn_id,
                        )
                        await self._cancel_prompt_and_close()
                        yield ChatBackendEvent(
                            type="complete", thread_id=self.id, turn_id=turn_id,
                            text=(
                                "AI anime 助手长时间没有返回任何进度，本轮已安全停止。"
                                "你可以直接重试，上一轮不会继续在后台占用会话。"
                            ),
                        )
                        return
                    if not line:
                        yield ChatBackendEvent(
                            type="complete",
                            thread_id=self.id,
                            turn_id=turn_id,
                            text="AI anime 助手连接意外中断，请重新发送当前指令。",
                        )
                        return
                    try:
                        msg = json.loads(line.decode("utf-8"))
                    except json.JSONDecodeError:
                        continue

                    if msg.get("id") == req_id:
                        if _has_content_filter_signal(msg):
                            yield ChatBackendEvent(
                                type="complete",
                                thread_id=self.id,
                                turn_id=turn_id,
                                text=CONTENT_FILTER_MESSAGE,
                            )
                            return
                        err = msg.get("error")
                        if (
                            err
                            and not recovered_context_session
                            and not emitted_response
                            and tool_call_count == 0
                            and _is_context_chunk_error(err)
                        ):
                            recovered_context_session = True
                            await self._reset_for_fresh_session(str(err))
                            retry_fresh_session = True
                            break
                        if err:
                            if localized_command:
                                detail = err.get("message", err) if isinstance(err, dict) else err
                                localized = localize_runtime_response(
                                    localized_command,
                                    str(detail or ""),
                                )
                                yield ChatBackendEvent(
                                    type="assistant_delta",
                                    thread_id=self.id,
                                    turn_id=turn_id,
                                    text=localized,
                                )
                            yield ChatBackendEvent(
                                type="complete", thread_id=self.id, turn_id=turn_id,
                                text=(
                                    CONTENT_FILTER_MESSAGE
                                    if _has_content_filter_signal(err)
                                    else (
                                        ""
                                        if localized_command
                                        else f"error: {err.get('message', err)}"
                                    )
                                ),
                            )
                        else:
                            if localized_command:
                                localized = localize_runtime_response(
                                    localized_command,
                                    "".join(command_response_parts),
                                )
                                if localized:
                                    yield ChatBackendEvent(
                                        type="assistant_delta",
                                        thread_id=self.id,
                                        turn_id=turn_id,
                                        text=localized,
                                    )
                            yield ChatBackendEvent(
                                type="complete", thread_id=self.id, turn_id=turn_id,
                                text="",
                            )
                        return

                    ev = self._translate_notification(msg, turn_id)
                    if ev is not None:
                        if ev.type == "assistant_delta" and str(ev.text or "").strip():
                            emitted_response = True
                            if localized_command:
                                command_response_parts.append(str(ev.text or ""))
                                continue
                        if ev.type == "tool_update":
                            emitted_response = True
                            if (ev.raw or {}).get("sessionUpdate") == "tool_call":
                                tool_call_count += 1
                                if tool_call_count > TURN_TOOL_CALL_LIMIT:
                                    _log.warning(
                                        "Hermes turn exceeded tool call limit: "
                                        "thread=%s turn=%s limit=%s",
                                        self.id,
                                        turn_id,
                                        TURN_TOOL_CALL_LIMIT,
                                    )
                                    await self.close()
                                    yield ChatBackendEvent(
                                        type="complete",
                                        thread_id=self.id,
                                        turn_id=turn_id,
                                        text=(
                                            "本轮操作已停止：AI anime 助手连续调用工具超过安全上限。"
                                            "已保留已完成步骤和任务状态，请从当前进度继续。"
                                        ),
                                    )
                                    return
                        yield ev
                        if _should_stop_after_failed_write(ev):
                            _log.warning(
                                "stopping Hermes turn after failed write tool: "
                                "thread=%s turn=%s tool=%s",
                                self.id,
                                turn_id,
                                ev.name,
                            )
                            await self._cancel_prompt_and_close()
                            yield ChatBackendEvent(
                                type="complete",
                                thread_id=self.id,
                                turn_id=turn_id,
                                text=(
                                    "本轮后续操作已停止，避免在前置条件或写入失败后"
                                    "继续提交依赖任务。"
                                ),
                            )
                            return

                if retry_fresh_session:
                    continue
        finally:
            # Don't kill subprocess here — caller may want to send more prompts.
            # HermesPool handles cleanup on idle / shutdown.
            self._turn_lock.release()

    def _translate_notification(self, msg: dict, turn_id: str) -> ChatBackendEvent | None:
        """Map ACP session/update notifications to ChatBackendEvent.

        ACP session/update payload shape (per acp.schema):
            {"method": "session/update", "params": {
                "sessionId": "...", "update": {<one of many variants>}
            }}

        We surface text deltas as ``assistant_delta`` and tool calls as
        ``tool_update``.  Other variants (plans, modes, etc.) are ignored
        for the MVP.
        """
        method = msg.get("method")
        if method != "session/update":
            return None
        update = (msg.get("params") or {}).get("update") or {}
        kind = update.get("sessionUpdate")

        if kind == "agent_message_chunk":
            content = update.get("content") or {}
            text = content.get("text") if isinstance(content, dict) else None
            return ChatBackendEvent(
                type="assistant_delta", thread_id=self.id, turn_id=turn_id,
                text=text or "",
            )
        if kind == "tool_call":
            title = update.get("title") or update.get("kind") or "tool"
            tool_name, _body = _split_tool_title(title)
            tool_call_id = str(update.get("toolCallId") or "").strip()
            if tool_call_id:
                self._tool_names_by_call_id[tool_call_id] = tool_name
            return ChatBackendEvent(
                type="tool_update", thread_id=self.id, turn_id=turn_id,
                text=_format_tool_call_text(update, title),
                name=tool_name,
                tool_call_id=tool_call_id or None,
                tool_phase="call",
                tool_input=(
                    update.get("input")
                    or update.get("arguments")
                    or update.get("rawInput")
                ),
                raw=update,
            )
        if kind == "tool_call_update":
            status = update.get("status")
            tool_call_id = str(update.get("toolCallId") or "").strip()
            tool_name = self._tool_names_by_call_id.get(tool_call_id)
            success, error = _tool_update_outcome(
                update,
                tool_name=tool_name,
            )
            if str(status or "").strip().lower() in {
                "completed",
                "complete",
                "success",
                "succeeded",
                "failed",
                "error",
                "cancelled",
                "canceled",
            }:
                self._tool_names_by_call_id.pop(tool_call_id, None)
            return ChatBackendEvent(
                type="tool_update", thread_id=self.id, turn_id=turn_id,
                text=f"  {status or 'updated'}",
                name=tool_name,
                success=success,
                error=error,
                tool_call_id=tool_call_id or None,
                tool_phase="result",
                tool_output=(
                    update.get("result")
                    if "result" in update
                    else update.get("content")
                ),
                raw=update,
            )
        if kind == "usage_update":
            used = update.get("used")
            size = update.get("size")
            if (
                not isinstance(used, int)
                or isinstance(used, bool)
                or used < 0
                or not isinstance(size, int)
                or isinstance(size, bool)
                or size <= 0
            ):
                _log.warning("Ignoring invalid Hermes context usage update: %s", update)
                return None
            return ChatBackendEvent(
                type="context_usage",
                thread_id=self.id,
                turn_id=turn_id,
                raw={"used": used, "size": size},
            )
        if kind == "session_info_update":
            _log.info("Hermes session context updated: %s", update)
            return None
        if kind == "available_commands_update":
            commands = update.get("availableCommands")
            if not isinstance(commands, list):
                commands = update.get("available_commands")
            commands = merge_runtime_slash_commands(
                self._cwd,
                commands if isinstance(commands, list) else [],
                include_project_tools=bool(self._env.get("AI_ANIME_PROJECT_ID")),
            )
            return ChatBackendEvent(
                type="available_commands",
                thread_id=self.id,
                turn_id=turn_id,
                raw=commands,
            )
        return None

    async def _terminate_subprocess(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None:
            await self._stop_stderr_drain()
            return
        try:
            if proc.stdin is not None and not proc.stdin.is_closing():
                proc.stdin.close()
        except Exception:
            pass
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=3.0)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass
        await self._stop_stderr_drain()

    async def _reset_for_fresh_session(self, reason: str) -> None:
        old_session_id = self.id
        await self._terminate_subprocess()
        self.id = ""
        self._is_new = True
        self._initialized = False
        self._session_ready = False
        self._req_counter = 0
        self._tool_names_by_call_id.clear()
        self._model_route_is_managed = False
        self._model_route_selector = None
        self._model_reasoning_effort = None
        _log.warning(
            "resetting Hermes context session for user=%s old_session=%s reason=%s",
            self._username,
            old_session_id,
            reason,
        )

    async def close(self) -> None:
        """Terminate the hermes subprocess."""
        if self._closed:
            return
        self._closed = True
        await self._terminate_subprocess()

    async def _stop_stderr_drain(self) -> None:
        task = self._stderr_task
        self._stderr_task = None
        if task is None or task.done():
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task

    @property
    def is_closed(self) -> bool:
        return self._closed

    @property
    def has_active_turn(self) -> bool:
        """True while a prompt turn (or warm-up) holds the ACP stdio.

        The pool reads this so an idle reaper or LRU eviction can't kill a
        worker mid-turn. ``last_used`` is only stamped when the pool hands the
        thread out, so a turn longer than the idle window looks idle without it.
        """
        return self._turn_lock.locked()


__all__ = ["HermesSdkClient", "HermesSdkThread"]
