"""Scene models owned by the Asset & World application layer."""

from typing import List

from pydantic import BaseModel, Field


class NovelScene(BaseModel):
    """场景实体 — 故事中的地点/环境。"""

    name: str = Field(description="场景名称，如 '皇宫·大殿'")
    aliases: List[str] = Field(default_factory=list, description="别名")
    scene_type: str = Field(default="interior", description="interior/exterior/nature")
    base_scene_id: str = Field(default="", description="派生场景所属基础场景 ID；基础场景为空")
    variant_id: str = Field(default="", description="派生场景状态/外观标签；基础场景为空")
    time_of_day: str = Field(default="", description="场景参考图自身时间；为空表示通用时间")

    environment_prompt: str = Field(default="", description="环境描述 prompt（用于生成参考图）")
    variant_prompt: str = Field(default="", description="派生场景相对基础场景的增量视觉描述")
    description: str = Field(default="", description="场景叙述性描述")
    spatial_layout_image: str = Field(default="", description="场景级空间布局参考图路径")
    notes: str = Field(default="")
    updated_at: str = Field(default="", description="场景资产最后一次内容变化时间 ISO 字符串")


def build_scene_effective_prompt(
    scene: NovelScene,
    base_scene: NovelScene | None = None,
) -> str:
    """Build the display/generation fallback prompt for a scene record.

    New derived scenes store only sparse deltas in variant_prompt.  Old derived
    scenes may still carry a fused environment_prompt; keep that readable.
    """

    own_prompt = str(
        getattr(scene, "environment_prompt", "") or getattr(scene, "description", "") or ""
    ).strip()
    variant_prompt = str(getattr(scene, "variant_prompt", "") or "").strip()
    base_scene_id = str(getattr(scene, "base_scene_id", "") or "").strip()
    variant_id = str(getattr(scene, "variant_id", "") or "").strip()
    time_of_day = str(getattr(scene, "time_of_day", "") or "").strip()
    if not base_scene_id:
        return own_prompt or str(scene.name or "").strip()
    if own_prompt and not variant_prompt and not time_of_day:
        return own_prompt

    base_prompt = ""
    if base_scene is not None:
        base_prompt = str(
            getattr(base_scene, "environment_prompt", "")
            or getattr(base_scene, "description", "")
            or ""
        ).strip()

    lines: list[str] = []
    if base_prompt:
        lines.extend(["[Base Scene Prompt]", base_prompt])
    else:
        lines.extend(["[Base Scene]", base_scene_id])
    if variant_id:
        lines.extend(["", f"[Variant] {variant_id}"])
    if variant_prompt:
        lines.extend(["", "[Variant Delta]", variant_prompt])
    if time_of_day:
        lines.extend(
            [
                "",
                "[Time-of-Day Plate]",
                f"整体光照为{time_of_day}时段；未声明改变的结构、陈设和材质继承基础场景。",
            ]
        )
    if own_prompt and own_prompt != base_prompt and not variant_prompt:
        lines.extend(["", "[Stored Scene Prompt]", own_prompt])
    return "\n".join(part for part in lines if part is not None).strip()


__all__ = ["NovelScene", "build_scene_effective_prompt"]
