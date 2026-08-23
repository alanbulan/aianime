"""Built-in Creative Canvas style-template catalog."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_BUILTIN_MANIFEST = Path(__file__).with_name("style_templates.json")
_REQUIRED_TEXT_FIELDS = ("id", "label", "category", "cover", "style_prompt")


class InvalidCreativeCanvasStyleManifest(ValueError):
    pass


@lru_cache(maxsize=1)
def _load_builtin_manifest() -> tuple[dict[str, Any], ...]:
    try:
        raw = json.loads(_BUILTIN_MANIFEST.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RuntimeError(
            f"内置风格清单不可用: {_BUILTIN_MANIFEST}"
        ) from exc

    templates = raw.get("templates") if isinstance(raw, dict) else None
    if not isinstance(templates, list) or not templates:
        raise InvalidCreativeCanvasStyleManifest("templates 必须是非空数组")

    parsed: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(templates):
        if not isinstance(item, dict):
            raise InvalidCreativeCanvasStyleManifest(
                f"第 {index} 条风格模板不是对象"
            )
        for field in _REQUIRED_TEXT_FIELDS:
            value = item.get(field)
            if not isinstance(value, str) or not value.strip():
                raise InvalidCreativeCanvasStyleManifest(
                    f"第 {index} 条风格模板缺少字段 {field}"
                )
        template_id = str(item["id"]).strip()
        if template_id in seen:
            raise InvalidCreativeCanvasStyleManifest(
                f"风格模板 id 重复: {template_id}"
            )
        samples = item.get("samples", [])
        if not isinstance(samples, list) or any(
            not isinstance(sample, str) or not sample.strip()
            for sample in samples
        ):
            raise InvalidCreativeCanvasStyleManifest(
                f"风格模板 {template_id} 的 samples 必须是字符串数组"
            )
        seen.add(template_id)
        parsed.append(
            {
                "id": template_id,
                "label": str(item["label"]).strip(),
                "category": str(item["category"]).strip(),
                "cover": str(item["cover"]).strip(),
                "samples": [str(sample).strip() for sample in samples],
                "style_prompt": str(item["style_prompt"]).strip(),
                "author": "builtin",
            }
        )

    if len(parsed) != 45:
        raise InvalidCreativeCanvasStyleManifest(
            f"内置风格模板应为 45 套，实际为 {len(parsed)} 套"
        )
    return tuple(parsed)


def creative_canvas_builtin_style_templates() -> list[dict[str, Any]]:
    return [
        {**item, "samples": list(item["samples"])}
        for item in _load_builtin_manifest()
    ]
