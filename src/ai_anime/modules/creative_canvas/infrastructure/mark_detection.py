"""Creative Canvas mark detection adapter."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image

from ai_anime.modules.creative_canvas.application.mark_detection import (
    DetectedCreativeCanvasMark,
)
from ai_anime.modules.creative_canvas.application.vision_analysis import (
    CreativeCanvasVisionInput,
    creative_canvas_image_media_type,
)
from ai_anime.modules.creative_canvas.domain import CreativeCanvasMarkSelection
from ai_anime.modules.creative_canvas.infrastructure.vision_model import (
    call_creative_canvas_vision_model,
)
from ai_anime.shared.model_response import parse_model_json_object_response


def build_mark_detection_task(selection: CreativeCanvasMarkSelection) -> str:
    lines = [
        "你是一个画布节点局部元素识别助手。",
        "我会给你一张完整图片，以及一张局部裁剪图。",
        "请识别被点击或框选区域中最重要的可命名视觉元素。",
        '只输出 JSON 对象，不要 markdown，不要解释，例如：{"label":"老人","note":"主体人物"}',
        "规则：",
        '- label 使用简短中文名词，优先 2-6 个字，例如 "老人"、"氧气管"、"病床"、"眼镜"。',
        '- note 可为空；如有必要，只写极短补充，例如 "主体人物"、"重点保持"。',
        "- 如果是人物，优先返回人物类别或身份外观称呼，不要写完整长句。",
    ]
    if selection.has_point:
        lines.append(
            "点击点归一化坐标："
            f"x={float(selection.point_x):.4f}, y={float(selection.point_y):.4f}"
        )
    if selection.has_box:
        lines.append(
            "框选区域归一化坐标："
            f"x={float(selection.box_x):.4f}, y={float(selection.box_y):.4f}, "
            f"w={float(selection.box_width):.4f}, "
            f"h={float(selection.box_height):.4f}"
        )
    return "\n".join(lines)


def crop_mark_focus_image(
    image_path: Path,
    selection: CreativeCanvasMarkSelection,
) -> bytes:
    with Image.open(image_path) as source:
        image = source.convert("RGB")
    width, height = image.size

    if selection.has_box:
        x1 = max(0, int(float(selection.box_x) * width))
        y1 = max(0, int(float(selection.box_y) * height))
        x2 = min(
            width, int((float(selection.box_x) + float(selection.box_width)) * width)
        )
        y2 = min(
            height, int((float(selection.box_y) + float(selection.box_height)) * height)
        )
        pad_x = max(16, int((x2 - x1) * 0.25))
        pad_y = max(16, int((y2 - y1) * 0.25))
        x1 = max(0, x1 - pad_x)
        y1 = max(0, y1 - pad_y)
        x2 = min(width, x2 + pad_x)
        y2 = min(height, y2 + pad_y)
    elif selection.has_point:
        cx = int(float(selection.point_x) * width)
        cy = int(float(selection.point_y) * height)
        radius = max(64, int(min(width, height) * 0.18))
        x1 = max(0, cx - radius)
        y1 = max(0, cy - radius)
        x2 = min(width, cx + radius)
        y2 = min(height, cy + radius)
    else:
        x1, y1, x2, y2 = 0, 0, width, height

    cropped = image.crop((x1, y1, x2, y2))
    buffer = BytesIO()
    cropped.save(buffer, format="PNG")
    return buffer.getvalue()


class PydanticAICreativeCanvasMarkDetector:
    async def detect(
        self,
        image_path: Path,
        selection: CreativeCanvasMarkSelection,
    ) -> DetectedCreativeCanvasMark:
        model, text = await call_creative_canvas_vision_model(
            prompt=build_mark_detection_task(selection),
            images=[
                CreativeCanvasVisionInput(
                    data=image_path.read_bytes(),
                    media_type=creative_canvas_image_media_type(image_path.name),
                ),
                CreativeCanvasVisionInput(
                    data=crop_mark_focus_image(image_path, selection),
                    media_type="image/png",
                ),
            ],
            timeout_seconds=90.0,
        )
        payload = parse_model_json_object_response(text)
        label = str(payload.get("label") or "").strip()
        note = str(payload.get("note") or "").strip()
        if not label:
            raise RuntimeError("mark detector returned empty label")
        return DetectedCreativeCanvasMark(
            label=label,
            note=note,
            model=model,
        )
