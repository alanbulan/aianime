"""Provider-neutral dialogue parsing helpers for video voice references."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

_SPEAKER_PREFIX_RE = re.compile(
    r"(?P<speaker>[\w\u4e00-\u9fff·]{1,40})"
    r"(?:（(?P<action>[^）]{0,120})）|\((?P<action_ascii>[^)]{0,120})\))?"
    r"\s*[：:]"
)
_LEADING_PERFORMANCE_NOTE_RE = re.compile(
    r"^\s*(?:（[^）]{1,120}）|\([^)]{1,120}\))\s*"
)
_QUOTE_DIALOGUE_PATTERNS = (
    re.compile(r"“([^”]+)”"),
    re.compile(r"「([^」]+)」"),
    re.compile(r'"([^"]+)"'),
)


@dataclass(frozen=True)
class VideoSpokenLine:
    speaker: str
    text: str
    action: str = ""


def _text(value: Any) -> str:
    return str(value or "").strip()


def _spoken_source(beat: dict[str, Any]) -> str:
    return _text(
        beat.get("dialogue")
        or beat.get("narration_segment")
        or beat.get("narration")
        or ""
    )


def dialogue_text(beat: dict[str, Any]) -> str:
    raw_text = _spoken_source(beat)
    quoted_parts: list[str] = []
    for pattern in _QUOTE_DIALOGUE_PATTERNS:
        for match in pattern.finditer(raw_text):
            quoted = match.group(1).strip()
            if quoted:
                quoted_parts.append(quoted)
    return " ".join(quoted_parts) if quoted_parts else raw_text


def dialogue_emotion_prompt(beat: dict[str, Any]) -> str:
    raw_text = _spoken_source(beat)
    if not raw_text or not any(
        pattern.search(raw_text) for pattern in _QUOTE_DIALOGUE_PATTERNS
    ):
        return ""

    emotion_text = raw_text
    for pattern in _QUOTE_DIALOGUE_PATTERNS:
        emotion_text = pattern.sub(" ", emotion_text)
    return re.sub(r"\s+", " ", emotion_text).strip(" ：:，,。.;；、 \t\r\n")


def normalize_video_audio_type(beat: dict[str, Any]) -> str:
    """Return the video-reference audio route from beat metadata."""

    audio_type = _text(beat.get("audio_type"))
    if audio_type:
        return audio_type
    return "dialogue" if _text(beat.get("speaker")) else "narration"


def dialogue_voice_key(beat: dict[str, Any]) -> str:
    if normalize_video_audio_type(beat) != "dialogue" or not dialogue_text(beat):
        return ""
    return _text(beat.get("speaker"))


def same_voice_dialogue_beats(
    beats: list[dict[str, Any]], speaker: str
) -> list[tuple[int, dict[str, Any]]]:
    voice_key = _text(speaker)
    if not voice_key:
        return []
    grouped: list[tuple[int, dict[str, Any]]] = []
    for beat in beats:
        if dialogue_voice_key(beat) != voice_key:
            continue
        beat_num = int(beat.get("beat_number") or 0)
        if beat_num > 0:
            grouped.append((beat_num, beat))
    return grouped


def narration_beat_text(beat: dict[str, Any]) -> str:
    return _text(
        beat.get("narration_segment")
        or beat.get("narration")
        or beat.get("dialogue")
    )


def parse_video_spoken_lines(beat: dict[str, Any]) -> list[VideoSpokenLine]:
    """Parse dialogue text into speaker/action/text lines.

    Only parses explicit literal-script lines such as ``角色（动作）：台词``.
    Ambiguous beat-level prose is left intact for the AI prompt composer.
    """

    if normalize_video_audio_type(beat) != "dialogue":
        return []

    raw = _spoken_source(beat)
    if not raw:
        return []

    matches = list(_SPEAKER_PREFIX_RE.finditer(raw))
    lines: list[VideoSpokenLine] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(raw)
        text = raw[start:end].strip(" \t\r\n，,。；;")
        if not text:
            continue
        lines.append(
            VideoSpokenLine(
                speaker=_text(match.group("speaker")),
                action=_text(match.group("action") or match.group("action_ascii")),
                text=text,
            )
        )
    if lines:
        return lines

    return []


def required_video_dialogue_texts(beat: dict[str, Any]) -> list[str]:
    """Return verbatim dialogue that must remain in the final prompt."""

    lines = parse_video_spoken_lines(beat)
    if lines:
        return [line.text for line in lines if line.text]

    text = dialogue_text(beat).strip(" \t\r\n，,。；;")
    if not text:
        return []
    leading_note = _LEADING_PERFORMANCE_NOTE_RE.match(text)
    if leading_note:
        spoken_text = text[leading_note.end() :].strip(" \t\r\n，,。；;")
        if spoken_text:
            text = spoken_text
    return [text]


def unique_video_dialogue_speakers(beat: dict[str, Any]) -> list[str]:
    """Return dialogue speakers in first-spoken order."""

    seen: set[str] = set()
    speakers: list[str] = []
    for line in parse_video_spoken_lines(beat):
        if line.speaker in seen:
            continue
        seen.add(line.speaker)
        speakers.append(line.speaker)
    if not speakers:
        speaker = _text(beat.get("speaker"))
        if speaker:
            speakers.append(speaker)
    return speakers


def speaker_display_name(value: str) -> str:
    text = _text(value)
    if "_" in text:
        return text.split("_", 1)[0]
    return text
