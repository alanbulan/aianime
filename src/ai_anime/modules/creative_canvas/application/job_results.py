"""Creative Canvas asynchronous job result queries."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Mapping, Protocol

from ai_anime.modules.project_workspace.public import ProjectContext

CreativeCanvasJobType = Literal[
    "freezone_gen",
    "freezone_edit",
    "freezone_upscale",
    "freezone_extract",
    "freezone_analyze",
    "freezone_video_story",
    "freezone_video_gen",
    "freezone_mask_edit",
    "freezone_video_erase",
    "freezone_video_upscale",
    "freezone_audio_separate",
    "freezone_audio_speech",
    "freezone_audio_music",
    "freezone_video_compose",
    "freezone_image_reverse_prompt",
    "freezone_image_to_3gs",
    "freezone_text_translate",
    "freezone_story_script",
]


@dataclass(frozen=True)
class GetCreativeCanvasJobResultQuery:
    context: ProjectContext
    project_dir: Path
    task_type: CreativeCanvasJobType
    job_id: str


class CreativeCanvasJobResultReader(Protocol):
    def read(self, query: GetCreativeCanvasJobResultQuery) -> dict[str, Any]: ...


class CreativeCanvasJobResultQueries:
    def __init__(self, reader: CreativeCanvasJobResultReader) -> None:
        self._reader = reader

    def get_result(self, query: GetCreativeCanvasJobResultQuery) -> dict[str, Any]:
        return self._reader.read(query)


def public_creative_canvas_video_story_result(
    result: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        key: value
        for key, value in result.items()
        if key not in {"output_path", "frame_paths"}
    }
