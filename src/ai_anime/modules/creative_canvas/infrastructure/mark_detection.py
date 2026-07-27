"""Creative Canvas mark detection adapters."""

from pathlib import Path

from ai_anime.freezone.mark_node import detect_freezone_mark
from ai_anime.modules.creative_canvas.application.mark_detection import (
    DetectedCreativeCanvasMark,
)
from ai_anime.modules.creative_canvas.domain import CreativeCanvasMarkSelection


class FreezoneVisionMarkDetector:
    async def detect(
        self,
        image_path: Path,
        selection: CreativeCanvasMarkSelection,
    ) -> DetectedCreativeCanvasMark:
        result = await detect_freezone_mark(
            image_path=image_path,
            point_x=selection.point_x,
            point_y=selection.point_y,
            box_x=selection.box_x,
            box_y=selection.box_y,
            box_width=selection.box_width,
            box_height=selection.box_height,
        )
        return DetectedCreativeCanvasMark(
            label=str(result["label"]),
            note=str(result.get("note", "")),
            provider=str(result["provider"]),
            model=str(result["model"]),
        )
