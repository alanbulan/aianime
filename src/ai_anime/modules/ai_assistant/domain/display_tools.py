"""Display tool call recognition and recovery rules."""

from __future__ import annotations

import json
import re
from typing import Any

_DISPLAY_TOOL_NAMES = frozenset(
    {
        "ai_anime_get_sketches",
        "ai_anime_get_sketch_candidates",
        "ai_anime_get_first_frames",
        "ai_anime_get_scene_images",
        "ai_anime_get_character_media",
        "ai_anime_get_episode_media",
    }
)


def is_display_tool_name(tool_name: str) -> bool:
    return str(tool_name or "").strip() in _DISPLAY_TOOL_NAMES


def _decode_tool_args(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return decoded if isinstance(decoded, dict) else {}
    return {}


def extract_display_tool_call(raw: Any) -> tuple[str, dict[str, Any]] | None:
    if not isinstance(raw, dict):
        return None
    title = str(
        raw.get("title")
        or raw.get("kind")
        or raw.get("name")
        or raw.get("tool_name")
        or ""
    ).strip()
    tool_name = title.partition(":")[0].split()[0].strip()
    if not is_display_tool_name(tool_name):
        for key in ("name", "tool", "toolName", "tool_name"):
            candidate = str(raw.get(key) or "").strip()
            if is_display_tool_name(candidate):
                tool_name = candidate
                break
    if not is_display_tool_name(tool_name):
        function = raw.get("function")
        if isinstance(function, dict):
            candidate = str(function.get("name") or "").strip()
            if is_display_tool_name(candidate):
                tool_name = candidate
    if not is_display_tool_name(tool_name):
        return None
    for key in ("arguments", "args", "input", "params"):
        args = _decode_tool_args(raw.get(key))
        if args:
            return tool_name, args
    content = raw.get("content")
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            nested = item.get("content")
            if isinstance(nested, dict):
                args = _decode_tool_args(nested.get("text"))
                if args:
                    return tool_name, args
    return tool_name, {}


def display_tool_call_key(tool_name: str, args: dict[str, Any]) -> str:
    try:
        encoded_args = json.dumps(args, ensure_ascii=False, sort_keys=True, default=str)
    except TypeError:
        encoded_args = repr(args)
    return f"{tool_name}:{encoded_args}"


def infer_display_tool_call_from_text(
    prompt: str,
    assistant_text: str,
    previous_assistant: list[str],
) -> tuple[str, dict[str, Any]] | None:
    prompt_text = str(prompt or "")
    prompt_lower = prompt_text.casefold()
    recent_context = "\n".join(previous_assistant[-2:] if previous_assistant else [])
    context_text = "\n".join([prompt_text, str(assistant_text or ""), recent_context])
    context_lower = context_text.casefold()
    progress_terms = ("进度", "状态", "任务", "做到哪", "做到哪儿", "当前情况")
    if any(term in prompt_text for term in progress_terms):
        return None
    display_terms = (
        "展示",
        "显示",
        "查看",
        "看",
        "全部显示",
        "show",
        "display",
        "view",
    )
    if not any(term in prompt_lower for term in display_terms):
        return None
    prompt_mentions_sketch = "草图" in prompt_text or "sketch" in prompt_lower
    context_mentions_sketch = "草图" in context_text or "sketch" in context_lower
    short_followup = len(prompt_text.strip()) <= 20 and any(
        term in prompt_text for term in ("全部", "继续", "下一页", "更多")
    )
    if not prompt_mentions_sketch and not (short_followup and context_mentions_sketch):
        return None

    episode = 1
    episode_match = re.search(
        r"(?:第\s*(\d+)\s*集|ep(?:isode)?\s*\.?\s*(\d+))",
        context_text,
        re.IGNORECASE,
    )
    if episode_match:
        raw_episode = episode_match.group(1) or episode_match.group(2)
        try:
            episode = max(1, int(raw_episode))
        except (TypeError, ValueError):
            episode = 1
    wants_sketch_candidates = any(
        term in context_text for term in ("草图候选", "候选草图", "图池", "备选草图")
    )
    if wants_sketch_candidates:
        beat_match = re.search(
            r"(?:beat|Beat|BEAT)\s*\.?\s*(\d+)|第\s*(\d+)\s*(?:个|张)?\s*beat|Beat\s*(\d+)",
            context_text,
            re.IGNORECASE,
        )
        raw_beat = None
        if beat_match:
            raw_beat = next((group for group in beat_match.groups() if group), None)
        if raw_beat:
            try:
                beat = max(1, int(raw_beat))
            except (TypeError, ValueError):
                beat = 0
            if beat > 0:
                return "ai_anime_get_sketch_candidates", {
                    "episode": episode,
                    "beat": beat,
                }
        return None
    return "ai_anime_get_sketches", {"episode": episode}


__all__ = [
    "display_tool_call_key",
    "extract_display_tool_call",
    "infer_display_tool_call_from_text",
    "is_display_tool_name",
]
