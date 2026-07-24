"""Pure rules for scene generation prompts and source selection."""

from __future__ import annotations

from typing import Any


def resolve_scene_pano_source(requested_source: str, *, has_master: bool) -> str:
    source = str(requested_source or "master").strip().lower()
    if source == "master" and not has_master:
        return "text"
    return source


def scene_360_description(scene: Any) -> str:
    environment_prompt = str(
        scene.environment_prompt or scene.description or scene.name
    ).strip()
    return "\n".join(
        [
            f"场景名称：{scene.name}",
            f"场景类型：{scene.scene_type}",
            "环境描述是完整场景空间合同：应说明正面、背面、左侧、右侧、天花/天空、地面和固定物件关系。",
            "master 图代表正面半区：正面中心 + 左侧一半 + 右侧一半，并提供视觉风格锚点。",
            "reverse 图应代表背面半区：背面中心 + 左侧另一半 + 右侧另一半。",
            "360 需要把 environment_prompt 的四向空间合同展开成完整连续空间。",
            "如果某些方向没有明确写出，请基于场景类型和 master 视觉风格合理补全，"
            "但不要把正面物件机械复制到每个方向。",
            "环境描述：",
            environment_prompt,
        ]
    )
