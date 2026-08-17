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
import json
import logging
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator, Literal

from ai_anime.modules.ai_assistant.infrastructure.sandbox_wrap import SandboxSpec, wrap_command


@dataclass(slots=True)
class ChatBackendEvent:
    type: Literal["thread_started", "assistant_delta", "tool_update", "complete"]
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
    "ai_anime_pipeline_status",
    "ai_anime_list_tasks",
    "ai_anime_get_task",
    "ai_anime_get_episode_script",
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
        return head.strip(), tail.strip()
    return text.split()[0].strip() or "tool", text


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


def _is_ai_anime_write_tool(name: object) -> bool:
    return str(name or "").strip() in _AI_ANIME_WRITE_TOOLS


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
        self._req_counter = 0
        self._closed = False
        self._initialized = False
        self._tool_names_by_call_id: dict[str, str] = {}
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
            return
        base_cmd = [str(self._cli_path), "acp"]
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
        self._is_new = False

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

        await self._turn_lock.acquire()
        try:
            if self._closed:
                raise RuntimeError("HermesSdkThread is closed")
            await self._prepare()
            assert self._proc is not None and self._proc.stdout is not None
            # Compose prompt blocks (ACP supports rich content; we send plain text).
            text = prompt
            if current_project:
                text = f"[CONTEXT: current_project={current_project}]\n\n{prompt}"
            turn_id = uuid.uuid4().hex
            yield ChatBackendEvent(type="thread_started", thread_id=self.id, turn_id=turn_id)

            req_id = await self._send(
                "session/prompt",
                {
                    "sessionId": self.id,
                    "messageId": turn_id,
                    "prompt": [{"type": "text", "text": text}],
                },
            )

            # Read until we see the final session/prompt response (id matches).
            # Along the way emit assistant_delta / tool_update for any
            # session/update notifications hermes sends.
            assert self._proc.stdout is not None
            tool_call_count = 0
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
                    break
                try:
                    msg = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue

                # Final response for our session/prompt call
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
                    if err:
                        yield ChatBackendEvent(
                            type="complete", thread_id=self.id, turn_id=turn_id,
                            text=(
                                CONTENT_FILTER_MESSAGE
                                if _has_content_filter_signal(err)
                                else f"error: {err.get('message', err)}"
                            ),
                        )
                    else:
                        yield ChatBackendEvent(
                            type="complete", thread_id=self.id, turn_id=turn_id,
                            text="",
                        )
                    return

                # Server-initiated notifications (session/update etc.)
                # ACP notifications carry assistant chunks, tool calls, etc.
                ev = self._translate_notification(msg, turn_id)
                if ev is not None:
                    if ev.type == "tool_update" and (ev.raw or {}).get("sessionUpdate") == "tool_call":
                        tool_call_count += 1
                        if tool_call_count > TURN_TOOL_CALL_LIMIT:
                            _log.warning(
                                "Hermes turn exceeded tool call limit: thread=%s turn=%s limit=%s",
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
            _log.debug("Hermes context usage update: %s", update)
            return None
        if kind == "session_info_update":
            _log.info("Hermes session context updated: %s", update)
            return None
        return None

    async def close(self) -> None:
        """Terminate the hermes subprocess."""
        if self._closed:
            return
        self._closed = True
        if self._proc is None:
            return
        try:
            if self._proc.stdin is not None and not self._proc.stdin.is_closing():
                self._proc.stdin.close()
        except Exception:
            pass
        try:
            self._proc.terminate()
            await asyncio.wait_for(self._proc.wait(), timeout=3.0)
        except asyncio.TimeoutError:
            self._proc.kill()
            await self._proc.wait()
        except ProcessLookupError:
            pass

    @property
    def is_closed(self) -> bool:
        return self._closed


__all__ = ["HermesSdkClient", "HermesSdkThread"]
