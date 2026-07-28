"""Local adapters for the sketch pose editor."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.production.domain.detected_refs import real_detected_identities
from ai_anime.modules.production.domain.sketch_pose import SKELETON_EDGES


class ModelSketchPoseIdentitySource:
    def detected_identity_ids(self, beat: dict[str, Any]) -> list[str]:
        return real_detected_identities(beat.get("detected_identities") or [])


class PillowSketchPoseFiles:
    def image_size(self, image_path: Path) -> tuple[int, int]:
        from PIL import Image

        with Image.open(image_path) as image:
            return image.size

    def save_editor_state(
        self,
        image_path: Path,
        editor_state: dict[str, Any],
    ) -> None:
        from PIL import Image, ImageDraw

        image = Image.open(image_path).convert("RGBA")
        draw = ImageDraw.Draw(image)
        self._draw_strokes(draw, editor_state.get("strokes") or [])
        self._draw_props(draw, editor_state.get("props") or [])
        self._draw_skeletons(draw, editor_state.get("skeletons") or [])
        image.save(image_path, format="PNG")

    @staticmethod
    def _draw_strokes(draw: Any, strokes: list[dict[str, Any]]) -> None:
        for stroke in strokes:
            points = stroke.get("points") or []
            if len(points) < 2:
                continue
            width = max(1, int(round(float(stroke.get("width") or 4))))
            color = (
                (255, 255, 255, 255)
                if stroke.get("eraser")
                else _hex_to_rgb(str(stroke.get("colorHex") or "#333333"))
                + (255,)
            )
            for index in range(1, len(points)):
                previous = points[index - 1]
                current = points[index]
                draw.line(
                    (
                        float(previous.get("x") or 0),
                        float(previous.get("y") or 0),
                        float(current.get("x") or 0),
                        float(current.get("y") or 0),
                    ),
                    fill=color,
                    width=width,
                )

    @staticmethod
    def _draw_props(draw: Any, props: list[dict[str, Any]]) -> None:
        for prop in props:
            if not prop.get("visible"):
                continue
            bbox = prop.get("bbox") or {}
            try:
                x = float(bbox.get("x") or 0)
                y = float(bbox.get("y") or 0)
                width = max(2.0, float(bbox.get("width") or 0))
                height = max(2.0, float(bbox.get("height") or 0))
            except (TypeError, ValueError):
                continue
            color = _hex_to_rgb(str(prop.get("colorHex") or "#0D47A1")) + (
                255,
            )
            outline = tuple(max(0, channel - 40) for channel in color[:3]) + (
                255,
            )
            draw.rectangle(
                (x, y, x + width, y + height),
                fill=color,
                outline=outline,
                width=2,
            )

    @staticmethod
    def _draw_skeletons(
        draw: Any,
        skeletons: list[dict[str, Any]],
    ) -> None:
        for skeleton in skeletons:
            if not skeleton.get("visible"):
                continue
            color = _hex_to_rgb(
                str(skeleton.get("colorHex") or "#22d3ee")
            ) + (255,)
            joints = skeleton.get("joints") or {}
            line_width = max(
                1,
                int(round(float(skeleton.get("lineWidth") or 3))),
            )
            for first_key, second_key in SKELETON_EDGES:
                first = joints.get(first_key)
                second = joints.get(second_key)
                if not first or not second:
                    continue
                draw.line(
                    (
                        float(first.get("x") or 0),
                        float(first.get("y") or 0),
                        float(second.get("x") or 0),
                        float(second.get("y") or 0),
                    ),
                    fill=color,
                    width=line_width,
                )

            nose = joints.get("nose")
            neck = joints.get("neck")
            head_radius = int(
                round(float(skeleton.get("headRadius") or 10))
            )
            if nose and neck:
                head_radius = max(
                    6,
                    int(
                        (
                            (
                                float(nose.get("x") or 0)
                                - float(neck.get("x") or 0)
                            )
                            ** 2
                            + (
                                float(nose.get("y") or 0)
                                - float(neck.get("y") or 0)
                            )
                            ** 2
                        )
                        ** 0.5
                        * 0.8
                    ),
                )
            if nose:
                center_x = float(nose.get("x") or 0)
                center_y = float(nose.get("y") or 0)
                draw.ellipse(
                    (
                        center_x - head_radius,
                        center_y - head_radius,
                        center_x + head_radius,
                        center_y + head_radius,
                    ),
                    outline=color,
                    width=max(2, line_width),
                    fill=color,
                )


def _hex_to_rgb(hex_code: str) -> tuple[int, int, int]:
    value = hex_code.strip()
    if not value.startswith("#") or len(value) != 7:
        raise ValueError(f"Invalid color hex: {value}")
    return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))
