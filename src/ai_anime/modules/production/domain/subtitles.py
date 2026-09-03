"""Sentence segmentation and clip-relative timing shared by subtitle exports."""

from __future__ import annotations

import re
from dataclasses import dataclass


_SENTENCE_END = re.compile(r"(?:[。！？!?；;…]+|\.+(?!\d)|\r?\n+)[\"'”’」』）)\]】]*")
_CLOSING_PUNCTUATION = "，。！？；：、,.!?;:)]）】》”’…\"'"
_MAX_CUE_CHARACTERS = 36


@dataclass(frozen=True)
class SubtitleCue:
    start: float
    end: float
    text: str


def split_subtitle_text(text: str) -> list[str]:
    """Keep sentence punctuation, then shorten long sentences at clause boundaries."""
    sentences: list[str] = []
    start = 0
    for match in _SENTENCE_END.finditer(text):
        sentence = text[start:match.end()].strip()
        if sentence:
            sentences.append(sentence)
        start = match.end()
    remainder = text[start:].strip()
    if remainder:
        sentences.append(remainder)

    parts: list[str] = []
    for sentence in sentences:
        while len(sentence) > _MAX_CUE_CHARACTERS:
            boundaries = [
                index + 1
                for index, character in enumerate(sentence[:_MAX_CUE_CHARACTERS])
                if character in "，、,：: \t"
            ]
            cut = boundaries[-1] if boundaries else _MAX_CUE_CHARACTERS
            while cut < len(sentence) and sentence[cut] in _CLOSING_PUNCTUATION:
                cut += 1
            parts.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if sentence:
            parts.append(sentence)
    return parts


def build_subtitle_cues(captions: list[tuple[float, list[str]]]) -> list[SubtitleCue]:
    """Allocate each clip's duration by text length without cumulative cue drift."""
    cues: list[SubtitleCue] = []
    elapsed = 0.0
    for duration, parts in captions:
        clip_start = elapsed
        elapsed += duration
        weights = [max(1, sum(not char.isspace() for char in part)) for part in parts]
        total_weight = sum(weights)
        passed_weight = 0
        start = clip_start
        for index, (part, weight) in enumerate(zip(parts, weights, strict=True)):
            passed_weight += weight
            end = (
                elapsed
                if index == len(parts) - 1
                else clip_start + duration * passed_weight / total_weight
            )
            cues.append(SubtitleCue(start=start, end=end, text=part))
            start = end
    return cues
