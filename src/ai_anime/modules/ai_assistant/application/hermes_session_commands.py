"""Structured, non-persisted commands for one Hermes conversation."""

from __future__ import annotations

from dataclasses import dataclass

from ai_anime.modules.ai_assistant.application.ports import HermesRuntime
from ai_anime.modules.ai_assistant.domain import ChatScope


class UnsupportedSessionCommand(ValueError):
    """Raised when a UI command is not safe for direct execution."""


@dataclass(frozen=True, slots=True)
class ContextWindowUsage:
    used: int
    size: int


@dataclass(frozen=True, slots=True)
class SessionCommandResult:
    text: str
    usage: ContextWindowUsage | None = None


class HermesSessionCommands:
    _SUPPORTED = frozenset({"compact", "context", "reset", "version"})

    def __init__(self, runtime: HermesRuntime) -> None:
        self._runtime = runtime

    async def execute(
        self,
        username: str,
        scope: ChatScope,
        command: str,
    ) -> SessionCommandResult:
        normalized = str(command or "").strip().lower().removeprefix("/")
        if normalized not in self._SUPPORTED:
            raise UnsupportedSessionCommand(
                f"unsupported session command: {normalized or '<empty>'}"
            )

        thread = await self._runtime.get_for_user(
            username,
            scope_kind=scope.kind,
            project_id=scope.id if scope.kind == "project" else None,
            conversation_id=scope.conversation_id,
        )
        parts: list[str] = []
        context_usage: ContextWindowUsage | None = None
        async for event in thread.stream(
            f"/{normalized}",
            current_project=scope.id if scope.kind == "project" else None,
        ):
            if getattr(event, "type", "") == "context_usage":
                payload = getattr(event, "raw", None)
                if isinstance(payload, dict):
                    used = payload.get("used")
                    size = payload.get("size")
                    if isinstance(used, int) and isinstance(size, int):
                        context_usage = ContextWindowUsage(used=used, size=size)
                continue
            text = str(getattr(event, "text", "") or "")
            if text and getattr(event, "type", "") in {
                "assistant_delta",
                "complete",
            }:
                parts.append(text)

        result = "".join(parts).strip()
        if not result:
            raise RuntimeError("运行内核没有返回命令结果")
        return SessionCommandResult(text=result, usage=context_usage)


__all__ = [
    "ContextWindowUsage",
    "HermesSessionCommands",
    "SessionCommandResult",
    "UnsupportedSessionCommand",
]
