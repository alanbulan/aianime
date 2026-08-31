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

_PROJECT_DATA_READ_TOOLS = {
    "ai_anime_get",
    "ai_anime_get_character_media",
    "ai_anime_get_episode_media",
    "ai_anime_get_episode_script",
    "ai_anime_get_final_video",
    "ai_anime_get_first_frames",
    "ai_anime_get_scene_images",
    "ai_anime_get_sketch_candidates",
    "ai_anime_get_sketches",
    "ai_anime_list_ingest_uploads",
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
    if "AI 配音模型缺失" in raw:
        return (
            "配音任务没有启动：当前没有可用的 AI 配音模型。"
            "请在模型设置中启用 AUDIO_VOICE_CLONE 云端模型或配置对应 BYOK。"
            f"\n\n缺失项：{raw[:1200]}"
        )
    if "model_prereq_required" in raw or "模型缺失：当前未配置可用" in raw:
        return (
            "生产任务没有进入模型调用：当前缺少必要模型能力。"
            "请在模型设置中补齐返回内容列出的云端或 BYOK 模型角色。"
            f"\n\n缺失项：{raw[:1200]}"
        )
    if any(
        marker in raw
        for marker in (
            "voice_prereq_required",
            "voice_design_model_unavailable",
            "voice_design_failed",
            "声线缺失",
            "声线生成失败",
        )
    ):
        return (
            "配音任务没有启动：系统已按当前云端/BYOK 优先级尝试自动设计并绑定缺失声线，"
            "但仍有未满足的模型或声线前置。"
            f"\n\n缺失项：{raw[:1200]}"
        )
    if "最终视频提示词为空" in raw or "缺少视频提示词" in raw:
        return (
            "视频任务没有启动：当前 Beat 缺少最终视频提示词。"
            "完整生产工作流会自动生成；局部生成前请先完成提示词生成。"
            f"\n\n错误原因：{raw[:1200]}"
        )
    return None


def _generic_chat_error_from_text(
    text: object,
    *,
    prefix: str = "任务执行失败",
) -> str | None:
    raw = _normalize_error_text(text)
    if not raw:
        return None
    lowered = raw.casefold()
    if "provider_response_id" in lowered and "content_filter" in lowered:
        return None
    if prefix == "读取失败":
        raw = re.sub(r"^ai_anime_[a-z0-9_]+\s+failed:\s*", "", raw, flags=re.IGNORECASE)
    return f"{prefix}：{raw}"


def _nested_failure_reason(value: Any) -> str | None:
    if isinstance(value, str):
        decoded = _parse_jsonish(value)
        if decoded is not None:
            return _nested_failure_reason(decoded)
        raw = _normalize_error_text(value)
        if raw.casefold() in {"", "failed", "error", "cancelled", "canceled"}:
            return None
        return raw
    if isinstance(value, list):
        for item in value:
            reason = _nested_failure_reason(item)
            if reason:
                return reason
        return None
    if not isinstance(value, dict):
        return None
    for key in ("chat_error", "error", "detail", "message", "text", "result", "content", "data", "output"):
        reason = _nested_failure_reason(value.get(key))
        if reason:
            return reason
    return None


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
    normalized_tool_name = str(tool_name or "").strip()
    read_only_tool = normalized_tool_name in _READ_ONLY_AGENT_TOOLS
    failure_prefix = (
        "读取失败"
        if normalized_tool_name in _PROJECT_DATA_READ_TOOLS
        else "任务执行失败"
    )

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

        code = str(node.get("code") or "").strip()
        if code in {"voice_design_model_unavailable", "voice_design_failed"}:
            reason = node.get("error") or node.get("detail") or code
            return _business_chat_error_from_text(f"{code}: {reason}")

        status_code = node.get("status_code")
        if (
            read_only_tool
            and isinstance(status_code, int)
            and 200 <= status_code < 300
        ):
            return None
        if read_only_tool and node.get("ok") is True:
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
                reason = _nested_failure_reason(nested)
                generic = _generic_chat_error_from_text(
                    reason,
                    prefix=failure_prefix,
                )
                if generic:
                    return generic
            for key in ("error", "detail", "message"):
                generic = _generic_chat_error_from_text(
                    node.get(key),
                    prefix=failure_prefix,
                )
                if generic:
                    return generic
            if failed_status:
                return f"{failure_prefix}：当前状态为 {status}。"
            return f"{failure_prefix}：接口返回 ok=false，但没有提供具体错误原因。"

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
