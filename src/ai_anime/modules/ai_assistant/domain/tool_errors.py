"""Tool failure projection into user-visible chat errors."""

from __future__ import annotations

import json
import re
from typing import Any

from ai_anime.modules.ai_assistant.domain.chat_presentation import (
    json_loads_with_trailing_repair,
)
from ai_anime.shared.utils.error_redaction import redact_secrets


_READ_ONLY_AGENT_TOOLS = {
    "ai_anime_get",
    "ai_anime_pipeline_status",
    "ai_anime_list_tasks",
    "ai_anime_get_task",
    "ai_anime_get_episode_script",
}


def _normalize_error_text(text: object) -> str:
    raw = redact_secrets(str(text or "")).strip()
    raw = re.sub(r"\s+", " ", raw)
    raw = re.sub(
        r"provider_response_id[\"']?\s*[:=]\s*[\"']?[^\"'\s,;}]+",
        "provider_response_id=[redacted]",
        raw,
        flags=re.IGNORECASE,
    )
    raw = re.sub(
        r"response_id[\"']?\s*[:=]\s*[\"']?[^\"'\s,;}]+",
        "response_id=[redacted]",
        raw,
        flags=re.IGNORECASE,
    )
    if len(raw) > 1200:
        raw = raw[:1200].rstrip() + "..."
    return raw


def _business_chat_error_from_text(text: object) -> str | None:
    raw = _normalize_error_text(text)
    if not raw:
        return None
    if "Render 模式需要草图" in raw or "未生成可用图片" in raw:
        return (
            "Render 任务没有生成可用图片：当前缺少必要草图前置。"
            "请先在「资产库」生成或确认对应 Beat 的草图后，再重新生成 Render。"
            f"\n\n错误原因：{raw[:1200]}"
        )
    return None


def _generic_chat_error_from_text(text: object) -> str | None:
    raw = _normalize_error_text(text)
    if not raw:
        return None
    lowered = raw.casefold()
    if "provider_response_id" in lowered and "content_filter" in lowered:
        return None
    return f"任务执行失败：{raw}"


def _parse_jsonish(text: str) -> Any | None:
    raw = str(text or "").strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    try:
        return json_loads_with_trailing_repair(raw)
    except ValueError:
        return None


def tool_chat_error(value: Any, *, tool_name: str | None = None) -> str | None:
    suppress_domain_failures = str(tool_name or "").strip() in _READ_ONLY_AGENT_TOOLS

    def visit(node: Any) -> str | None:
        if isinstance(node, str):
            decoded = _parse_jsonish(node)
            if decoded is not None:
                return visit(decoded)
            return None
        if isinstance(node, list):
            for child in node:
                found = visit(child)
                if found:
                    return found
            return None
        if not isinstance(node, dict):
            return None

        chat_error = node.get("chat_error")
        if isinstance(chat_error, str) and chat_error.strip():
            return chat_error.strip()

        status_code = node.get("status_code")
        if (
            suppress_domain_failures
            and isinstance(status_code, int)
            and 200 <= status_code < 300
        ):
            return None
        if suppress_domain_failures and node.get("ok") is True:
            return None

        for key in ("error", "detail", "message"):
            mapped = _business_chat_error_from_text(node.get(key))
            if mapped:
                return mapped

        status = str(node.get("status") or "").strip().lower()
        failed_status = status in {"failed", "error", "cancelled", "canceled"}
        ok_false = node.get("ok") is False
        if failed_status or ok_false:
            for key in ("result", "content", "data", "output"):
                nested = node.get(key)
                found = visit(nested)
                if found:
                    return found
                if isinstance(nested, str):
                    generic = _generic_chat_error_from_text(nested)
                    if generic:
                        return generic
            for key in ("error", "detail", "message"):
                generic = _generic_chat_error_from_text(node.get(key))
                if generic:
                    return generic
            if failed_status:
                return f"任务执行失败：当前状态为 {status}。"
            return "任务执行失败：接口返回 ok=false，但没有提供具体错误原因。"

        for key in ("result", "message", "content", "data", "output"):
            found = visit(node.get(key))
            if found:
                return found
        for child in node.values():
            found = visit(child)
            if found:
                return found
        return None

    return visit(value)


__all__ = ["tool_chat_error"]
