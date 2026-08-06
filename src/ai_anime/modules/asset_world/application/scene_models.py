"""Scene models owned by the Asset & World application layer."""

from typing import Any, List

from pydantic import BaseModel, Field

from ai_anime.time_of_day import is_time_of_day_token, time_of_day_name_candidates
from ai_anime.shared.utils.derived_scenes import compose_derived_scene_name


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


def resolve_scene_record_name(
    scene_id: str,
    variant_id: str | None = "",
    known_names: list[str] | set[str] | tuple[str, ...] | None = None,
) -> str:
    """Resolve a canonical scene ref to the concrete scene record name.

    Writes should use canonical {base scene_id, variant_id}; reads stay lenient:
    when variant_id is empty, scene_id is already the concrete record name.
    """

    base = str(scene_id or "").strip()
    variant = str(variant_id or "").strip()
    if not base:
        return ""
    if not variant:
        return base
    derived = compose_derived_scene_name(base, variant)
    names = {str(name or "").strip() for name in known_names or []}
    if not names or derived in names:
        return derived
    return base


def _time_of_day_name_candidates(time_of_day: str) -> list[str]:
    return time_of_day_name_candidates(time_of_day)


def _is_time_of_day_token(value: str) -> bool:
    return is_time_of_day_token(value)


def _split_scene_ref_time_suffix(
    scene_id: str,
    variant_id: str,
    *,
    split_base_time_suffix: bool = False,
) -> tuple[str, str, str]:
    base = str(scene_id or "").strip()
    variant = str(variant_id or "").strip()

    if variant:
        if _is_time_of_day_token(variant):
            return base, "", variant
        if "_" in variant:
            variant_head, variant_tail = variant.rsplit("_", 1)
            if variant_head and _is_time_of_day_token(variant_tail):
                return base, variant_head, variant_tail
        return base, variant, ""

    if split_base_time_suffix and "_" in base:
        base_head, base_tail = base.rsplit("_", 1)
        if base_head and _is_time_of_day_token(base_tail):
            return base_head, "", base_tail
    return base, variant, ""


def resolve_scene_plate(
    scene_id: str,
    variant_id: str | None = "",
    time_of_day: str | None = "",
    known_names: list[str] | set[str] | tuple[str, ...] | None = None,
) -> tuple[str, bool]:
    """Resolve scene ref + time into a concrete plate name.

    The returned bool is True only when an existing time-of-day plate was found.
    Unknown names never imply that a time plate exists; they fall back to the
    existing scene/variant resolution with ``time_baked=False``.
    """

    base, variant, _legacy_ref_time = _split_scene_ref_time_suffix(
        str(scene_id or "").strip(),
        str(variant_id or "").strip(),
        split_base_time_suffix=bool(str(time_of_day or "").strip()),
    )
    if not base:
        return "", False

    names = {str(name or "").strip() for name in known_names or [] if str(name or "").strip()}
    if not names:
        return resolve_scene_record_name(base, variant, known_names), False

    # Beat.time_of_day is the only target time.  Any time suffix found in
    # scene_id/variant_id is legacy compatibility data and is only stripped out
    # so it cannot force the wrong plate.
    target_time = str(time_of_day or "").strip()
    time_candidates = _time_of_day_name_candidates(target_time)
    if time_candidates:
        if variant:
            variant_name = compose_derived_scene_name(base, variant)
            for time_name in time_candidates:
                plate_name = compose_derived_scene_name(variant_name, time_name)
                if plate_name in names:
                    return plate_name, True
            if variant_name in names:
                return variant_name, False
            return base, False

        for time_name in time_candidates:
            plate_name = compose_derived_scene_name(base, time_name)
            if plate_name in names:
                return plate_name, True
        return base, False

    return resolve_scene_record_name(base, variant, known_names), False


def resolve_scene_plate_from_records(
    scene_id: str,
    variant_id: str | None = "",
    time_of_day: str | None = "",
    scene_records: list[Any] | tuple[Any, ...] | None = None,
) -> tuple[str, bool]:
    base, variant, _legacy_ref_time = _split_scene_ref_time_suffix(
        str(scene_id or "").strip(),
        str(variant_id or "").strip(),
        split_base_time_suffix=bool(str(time_of_day or "").strip()),
    )
    if not base:
        return "", False

    by_key: dict[tuple[str, str, str], str] = {}
    names: set[str] = set()
    for scene in scene_records or []:
        name = str(getattr(scene, "name", "") or "").strip()
        if not name:
            continue
        names.add(name)
        record_base = str(getattr(scene, "base_scene_id", "") or "").strip() or name
        record_variant = str(getattr(scene, "variant_id", "") or "").strip()
        record_time = str(getattr(scene, "time_of_day", "") or "").strip()
        by_key[(record_base, record_variant, record_time)] = name

    time_candidates = _time_of_day_name_candidates(str(time_of_day or ""))
    if time_candidates:
        for time_name in time_candidates:
            found = by_key.get((base, variant, time_name))
            if found:
                return found, True
        fallback_name, fallback_baked = resolve_scene_plate(base, variant, time_of_day, names)
        if fallback_name != base or fallback_baked:
            return fallback_name, fallback_baked
        found = by_key.get((base, variant, ""))
        if found:
            return found, False
        found = by_key.get((base, "", ""))
        if found:
            return found, False
        return fallback_name, fallback_baked

    fallback_name, fallback_baked = resolve_scene_plate(base, variant, "", names)
    if fallback_name != base or fallback_baked:
        return fallback_name, fallback_baked
    found = by_key.get((base, variant, ""))
    if found:
        return found, False
    found = by_key.get((base, "", ""))
    if found:
        return found, False
    return fallback_name, fallback_baked


__all__ = [
    "NovelScene",
    "build_scene_effective_prompt",
    "resolve_scene_plate",
    "resolve_scene_plate_from_records",
    "resolve_scene_record_name",
]
