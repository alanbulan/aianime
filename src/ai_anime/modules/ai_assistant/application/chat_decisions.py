"""In-turn user decision gate for AI Assistant tool calls."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ai_anime.modules.ai_assistant.application.ports import ChatEventSink
from ai_anime.modules.ai_assistant.domain import ChatScope

DecisionEventSink = Callable[[dict[str, Any]], Awaitable[None]]
logger = logging.getLogger(__name__)


class ChatDecisionUnavailable(RuntimeError):
    """No matching live chat turn can host a decision request."""


class ChatDecisionNotFound(LookupError):
    """The requested decision does not belong to the current user."""


class ChatDecisionInvalid(ValueError):
    """A submitted decision answer does not match its request."""


class ChatDecisionCancelled(RuntimeError):
    """The chat turn ended before the decision was answered."""


@dataclass
class _DecisionContext:
    scope: ChatScope
    turn_id: str
    emit: ChatEventSink
    persist: DecisionEventSink
    pending_ids: set[str] = field(default_factory=set)


@dataclass
class _PendingDecision:
    username: str
    context: _DecisionContext
    request: dict[str, Any]
    future: asyncio.Future[list[dict[str, Any]]]


class ChatDecisions:
    """Coordinates a blocking tool request with an out-of-band browser answer."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._contexts: dict[tuple[str, str, str], _DecisionContext] = {}
        self._pending: dict[str, _PendingDecision] = {}
        self._resolved: dict[str, tuple[str, list[dict[str, Any]]]] = {}

    @asynccontextmanager
    async def activate(
        self,
        username: str,
        scope: ChatScope,
        turn_id: str,
        emit: ChatEventSink,
        persist: DecisionEventSink,
    ) -> AsyncIterator[None]:
        """Bind one live chat turn so plugin HTTP calls can pause inside it."""

        context = _DecisionContext(
            scope=scope,
            turn_id=str(turn_id or "").strip(),
            emit=emit,
            persist=persist,
        )
        key = self._context_key(username, scope)
        async with self._lock:
            if self._contexts.get(key) is not None:
                location = "当前项目" if scope.kind == "project" else "当前主页"
                raise ChatDecisionUnavailable(f"{location}已有一轮正在执行")
            self._contexts[key] = context
        try:
            yield
        finally:
            await self._deactivate(key, context)

    async def ask(
        self,
        username: str,
        *,
        project_id: str | None,
        title: str,
        questions: list[dict[str, Any]],
        source: str = "question",
    ) -> dict[str, Any]:
        """Emit and persist a request, then wait until the browser resolves it."""

        async with self._lock:
            requested_project = str(project_id or "").strip()
            key = (
                (username, "project", requested_project)
                if requested_project
                else (username, "home", "")
            )
            context = self._contexts.get(key)
            if context is None:
                if any(item[0] == username for item in self._contexts):
                    raise ChatDecisionUnavailable(
                        "提问项目与当前聊天项目不一致"
                    )
                raise ChatDecisionUnavailable("当前没有可接收提问的聊天轮次")

            decision_id = f"decision-{uuid.uuid4().hex}"
            request = {
                "id": decision_id,
                "title": str(title or "").strip() or "需要你的确认",
                "source": str(source or "question").strip() or "question",
                "status": "pending",
                "turn_id": context.turn_id,
                "scope": context.scope.to_dict(),
                "questions": questions,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            pending = _PendingDecision(
                username=username,
                context=context,
                request=request,
                future=asyncio.get_running_loop().create_future(),
            )
            self._pending[decision_id] = pending
            context.pending_ids.add(decision_id)

        event = {
            "type": "decision_required",
            "turn_id": context.turn_id,
            "scope": context.scope.to_dict(),
            "decision": request,
        }
        await self._deliver(context, event)
        answers = await asyncio.shield(pending.future)
        return {
            "decision_id": decision_id,
            "status": "resolved",
            "answers": answers,
        }

    async def resolve(
        self,
        username: str,
        decision_id: str,
        answers: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Validate one browser answer and resume the blocked tool call."""

        normalized_id = str(decision_id or "").strip()
        async with self._lock:
            pending = self._pending.get(normalized_id)
            if pending is None:
                resolved = self._resolved.get(normalized_id)
                if resolved is not None and resolved[0] == username:
                    return {
                        "decision_id": normalized_id,
                        "status": "resolved",
                        "answers": resolved[1],
                    }
                raise ChatDecisionNotFound("待确认问题不存在或已失效")
            if pending.username != username:
                raise ChatDecisionNotFound("待确认问题不存在或已失效")
            normalized_answers = self._validate_answers(pending.request, answers)
            self._pending.pop(normalized_id, None)
            pending.context.pending_ids.discard(normalized_id)
            self._resolved[normalized_id] = (username, normalized_answers)
            while len(self._resolved) > 256:
                self._resolved.pop(next(iter(self._resolved)))

        event = {
            "type": "decision_resolved",
            "turn_id": pending.context.turn_id,
            "scope": pending.context.scope.to_dict(),
            "decision_id": normalized_id,
            "status": "resolved",
            "answers": normalized_answers,
        }
        await self._deliver(pending.context, event)
        if not pending.future.done():
            pending.future.set_result(normalized_answers)
        return {
            "decision_id": normalized_id,
            "status": "resolved",
            "answers": normalized_answers,
        }

    async def cancel_for_user(
        self,
        username: str,
        reason: str = "聊天轮次已取消",
    ) -> int:
        async with self._lock:
            contexts = [
                context
                for key, context in self._contexts.items()
                if key[0] == username
            ]
        cancelled = 0
        for context in contexts:
            cancelled += await self._cancel_context(context, reason)
        return cancelled

    def pending_for_scope(
        self,
        username: str,
        scope: ChatScope,
    ) -> list[dict[str, Any]]:
        """Return live pending requests for reconnect/scope reconciliation."""

        return [
            dict(pending.request)
            for pending in self._pending.values()
            if pending.username == username and pending.context.scope == scope
        ]

    async def _deactivate(
        self,
        key: tuple[str, str, str],
        context: _DecisionContext,
    ) -> None:
        async with self._lock:
            if self._contexts.get(key) is context:
                self._contexts.pop(key, None)
        await self._cancel_context(context, "聊天轮次已结束")

    @staticmethod
    def _context_key(
        username: str,
        scope: ChatScope,
    ) -> tuple[str, str, str]:
        scope_id = str(scope.id or "").strip() if scope.kind == "project" else ""
        return username, scope.kind, scope_id

    async def _cancel_context(
        self,
        context: _DecisionContext,
        reason: str,
    ) -> int:
        async with self._lock:
            pending = [
                self._pending.pop(decision_id)
                for decision_id in tuple(context.pending_ids)
                if decision_id in self._pending
            ]
            context.pending_ids.clear()
        for item in pending:
            await self._deliver(
                context,
                {
                    "type": "decision_resolved",
                    "turn_id": context.turn_id,
                    "scope": context.scope.to_dict(),
                    "decision_id": str(item.request["id"]),
                    "status": "cancelled",
                    "answers": [],
                    "reason": reason,
                },
            )
            if not item.future.done():
                item.future.set_exception(ChatDecisionCancelled(reason))
        return len(pending)

    @staticmethod
    def _validate_answers(
        request: dict[str, Any],
        answers: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        questions = {
            str(question.get("id") or "").strip(): question
            for question in request.get("questions") or []
            if isinstance(question, dict) and str(question.get("id") or "").strip()
        }
        submitted = {
            str(answer.get("question_id") or "").strip(): answer
            for answer in answers
            if isinstance(answer, dict)
            and str(answer.get("question_id") or "").strip()
        }
        if set(submitted) != set(questions):
            raise ChatDecisionInvalid("必须回答本次确认中的全部问题")

        normalized: list[dict[str, Any]] = []
        for question_id, question in questions.items():
            answer = submitted[question_id]
            option_id = str(answer.get("option_id") or "").strip()
            custom_text = str(answer.get("custom_text") or "").strip()
            if bool(option_id) == bool(custom_text):
                raise ChatDecisionInvalid("每个问题必须且只能选择一个选项或填写自定义答案")
            if option_id:
                options = {
                    str(option.get("id") or "").strip(): option
                    for option in question.get("options") or []
                    if isinstance(option, dict)
                }
                selected = options.get(option_id)
                if selected is None:
                    raise ChatDecisionInvalid(f"问题 {question_id} 的选项无效")
                normalized.append(
                    {
                        "question_id": question_id,
                        "option_id": option_id,
                        "label": str(selected.get("label") or option_id),
                        "value": option_id,
                    }
                )
                continue
            if not bool(question.get("allow_custom")):
                raise ChatDecisionInvalid(f"问题 {question_id} 不接受自定义答案")
            if len(custom_text) > 500:
                raise ChatDecisionInvalid("自定义答案不能超过 500 个字符")
            normalized.append(
                {
                    "question_id": question_id,
                    "option_id": None,
                    "label": custom_text,
                    "value": custom_text,
                    "custom_text": custom_text,
                }
            )
        return normalized

    @staticmethod
    async def _deliver(
        context: _DecisionContext,
        event: dict[str, Any],
    ) -> None:
        try:
            await context.persist(event)
        except Exception:  # noqa: BLE001
            logger.warning("failed to persist chat decision event", exc_info=True)
        try:
            await context.emit(event)
        except Exception:  # noqa: BLE001
            # The request remains recoverable through the next scope snapshot.
            logger.debug("failed to emit chat decision event", exc_info=True)


__all__ = [
    "ChatDecisionCancelled",
    "ChatDecisionInvalid",
    "ChatDecisionNotFound",
    "ChatDecisionUnavailable",
    "ChatDecisions",
]
