"""Pure chat text and event projection rules."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

_USER_TURN_LABEL_RE = re.compile(r"(?im)^\s*(?:user|human|用户|我)\s*[:：]\s*")
_ASSISTANT_TURN_LABEL_RE = re.compile(
    r"(?i)^\s*(?:assistant|ai|助手|助理|模型)\s*[:：]\s*"
)
_COMPLETION_NOTICES = frozenset(
    {
        "当前任务已开始处理。请稍后让我查看当前任务进度，或在任务完成后再继续下一步。",
        "当前步骤已提交或完成。为避免重复操作，本轮没有继续执行后续写入；请确认当前结果后再推进下一步。",
        "刚才这一步没有成功启动任务。请先根据返回的错误补齐前置条件；如果是配音缺少声线，可以到「资产库」上传或录制缺失声线后再继续。",
    }
)
_HIDDEN_TOOL_MARKERS = (
    "skill_view",
    "skills_list",
    "skill view",
    "skills list",
    "loading skill",
    "→ skill view",
    "→ skills list",
)


def split_trace_contents(content: str) -> list[str]:
    raw_lines = str(content or "").rstrip().splitlines()
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in raw_lines:
        if not line.strip():
            if current:
                blocks.append(current)
                current = []
            continue
        current.append(line)
    if current:
        blocks.append(current)
    return ["\n".join(block) for block in blocks if block]


def is_hidden_chat_tool_event(name: object, text: object) -> bool:
    haystack = f"{name or ''}\n{text or ''}".lower()
    return any(marker in haystack for marker in _HIDDEN_TOOL_MARKERS)


def completion_text_or_existing(event_text: object, existing: str) -> str:
    final_text = str(event_text or "").strip()
    if not final_text or final_text.startswith("stop="):
        return existing
    if existing.strip() and final_text in _COMPLETION_NOTICES:
        if final_text in existing:
            return existing
        return f"{existing.rstrip()}\n\n{final_text}"
    return final_text


def merge_stream_text(existing: str, incoming: object) -> str:
    chunk = str(incoming or "")
    if not chunk:
        return existing
    if chunk.startswith(existing):
        return chunk
    if existing.endswith(chunk):
        return existing
    return existing + chunk


def _assistant_prefix_candidates(
    previous_assistant: object,
    *,
    include_separated_suffixes: bool,
) -> list[str]:
    if isinstance(previous_assistant, (list, tuple)):
        items = [
            str(item or "").strip()
            for item in previous_assistant
            if str(item or "").strip()
        ]
        candidates: list[str] = []
        for index in range(len(items)):
            suffix = items[index:]
            candidates.append("".join(suffix))
            if include_separated_suffixes:
                candidates.append("\n".join(suffix))
                candidates.append("\n\n".join(suffix))
        candidates.extend(items)
        return sorted(set(candidates), key=len, reverse=True)
    prefix = str(previous_assistant or "").strip()
    return [prefix] if prefix else []


def _strip_one_assistant_prefix(
    text: str, candidates: Sequence[str]
) -> tuple[str, bool]:
    for prefix in candidates:
        if text.startswith(prefix):
            return text[len(prefix) :].lstrip(), True
        compact_prefix = "".join(prefix.split())
        if not compact_prefix:
            continue
        matched = 0
        end_index = 0
        for index, char in enumerate(text):
            if char.isspace():
                continue
            if matched >= len(compact_prefix) or char != compact_prefix[matched]:
                break
            matched += 1
            end_index = index + 1
            if matched == len(compact_prefix):
                return text[end_index:].lstrip(), True
    return text, False


def strip_stored_assistant_replay(
    content: str,
    previous_assistant: object,
) -> str:
    text = str(content or "")
    candidates = _assistant_prefix_candidates(
        previous_assistant,
        include_separated_suffixes=False,
    )
    stripped, _matched = _strip_one_assistant_prefix(text, candidates)
    return stripped


def strip_streamed_assistant_replay(
    content: str,
    previous_assistant: object,
    *,
    suppress_partial_replay: bool = False,
) -> str:
    text = str(content or "")
    original_text = text
    candidates = _assistant_prefix_candidates(
        previous_assistant,
        include_separated_suffixes=True,
    )
    while text and candidates:
        stripped, matched = _strip_one_assistant_prefix(text, candidates)
        if not matched:
            break
        text = stripped
    if suppress_partial_replay and not text.strip() and original_text.strip():
        return ""
    if not suppress_partial_replay and not text.strip() and original_text.strip():
        return original_text
    return text


def _compact_chat_text(content: object) -> str:
    return "".join(str(content or "").split())


def _strip_leading_assistant_label(content: str) -> str:
    return _ASSISTANT_TURN_LABEL_RE.sub("", str(content or ""), count=1).lstrip()


def _looks_like_labeled_transcript_replay(content: str) -> bool:
    text = str(content or "").lstrip()
    if not text:
        return False
    if _USER_TURN_LABEL_RE.match(text):
        return True
    return bool(
        _USER_TURN_LABEL_RE.search(text) and _ASSISTANT_TURN_LABEL_RE.search(text)
    )


def _strip_replayed_turn_transcript(
    content: str,
    current_prompt: object,
    *,
    suppress_partial_replay: bool = False,
) -> str:
    text = str(content or "")
    prompt = str(current_prompt or "").strip()
    if not text or not prompt:
        return text

    compact_prompt = _compact_chat_text(prompt)
    best_end = -1
    for match in _USER_TURN_LABEL_RE.finditer(text):
        start = match.end()
        line_end = text.find("\n", start)
        if line_end < 0:
            line_end = len(text)
        line = text[start:line_end]

        prompt_index = line.rfind(prompt)
        if prompt_index >= 0:
            best_end = max(best_end, start + prompt_index + len(prompt))
            continue

        if len(compact_prompt) >= 4 and compact_prompt in _compact_chat_text(line):
            best_end = max(best_end, line_end)

    if best_end < 0:
        if suppress_partial_replay and _looks_like_labeled_transcript_replay(text):
            return ""
        return text
    remainder = _strip_leading_assistant_label(text[best_end:])
    if suppress_partial_replay and not remainder.strip():
        return ""
    return remainder


def strip_replayed_chat_response(
    content: str,
    previous_assistant: object,
    current_prompt: object,
    *,
    suppress_partial_replay: bool = False,
) -> str:
    text = _strip_replayed_turn_transcript(
        content,
        current_prompt,
        suppress_partial_replay=suppress_partial_replay,
    )
    return strip_streamed_assistant_replay(
        text,
        previous_assistant,
        suppress_partial_replay=suppress_partial_replay,
    )


def message_content(message: object) -> str:
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    text = message.get("text")
    if isinstance(text, str):
        return text.strip()
    return ""


def _attachment_context_block(
    attachments: Sequence[Mapping[str, object]],
) -> str:
    if not attachments:
        return ""
    lines = [
        "[CHAT_ATTACHMENTS]",
        "The browser sent these attachment records with the user message. "
        "A project-relative path may be passed only to an ai_anime tool that "
        "explicitly accepts an attachment path.",
    ]
    for index, attachment in enumerate(attachments, 1):
        lines.append("")
        lines.append(f"{index}. fileName={attachment.get('fileName') or ''}")
        lines.append(f"   type={attachment.get('type') or ''}")
        lines.append(f"   mimeType={attachment.get('mimeType') or ''}")
        file_size = attachment.get("fileSize")
        if file_size is not None:
            lines.append(f"   fileSize={file_size}")
        if attachment.get("url"):
            lines.append(f"   url={attachment['url']}")
        if attachment.get("path"):
            lines.append(f"   path={attachment['path']}")
        if attachment.get("content"):
            lines.append("   content=present")
    lines.append("[/CHAT_ATTACHMENTS]")
    return "\n".join(lines)


def text_with_attachment_context(
    text: str,
    attachments: Sequence[Mapping[str, object]],
) -> str:
    block = _attachment_context_block(attachments)
    return f"{text}\n\n{block}" if block else text


def should_emit_final_text(final_text: str, last_sent_text: str) -> bool:
    final = " ".join(str(final_text or "").split())
    last = " ".join(str(last_sent_text or "").split())
    return bool(final) and final != last


def tool_display_payload(text: object, name: object = None) -> tuple[str, str]:
    raw = str(text or "").strip()
    tool_name = str(name or "").strip()
    lines = raw.splitlines()
    if lines and lines[0].lstrip().startswith("→ "):
        first = lines[0].lstrip()[2:].strip()
        head, separator, tail = first.partition(":")
        if separator and head.strip():
            tool_name = tool_name or head.strip()
            lines[0] = tail.strip()
        else:
            tool_name = tool_name or (first.split()[0].strip() if first else "")
            lines = lines[1:]
    body = "\n".join(line for line in lines if line.strip()).strip()
    return tool_name or "agent.tool", body


def should_prewarm_scope(scope_kind: str) -> bool:
    return scope_kind != "home"
