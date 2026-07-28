"""AI anime 数据模型。

扩展 SuperScript 的图谱模型，添加视频生成专用节点。
"""

import json
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ai_anime.time_of_day import is_time_of_day_token, time_of_day_name_candidates
from ai_anime.utils.derived_scenes import compose_derived_scene_name


NO_CHARACTER_MARKER = "__NO_CHARACTER__"
NO_PROP_MARKER = "__NO_PROP__"


def _dedupe_non_empty(values: list[Any] | tuple[Any, ...] | None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def normalize_detected_identities(values: list[Any] | tuple[Any, ...] | None) -> list[str]:
    """Normalize detected identity IDs, preserving the explicit no-character marker."""
    result = _dedupe_non_empty(values)
    real_ids = [item for item in result if item != NO_CHARACTER_MARKER]
    return real_ids or ([NO_CHARACTER_MARKER] if NO_CHARACTER_MARKER in result else [])


def normalize_detected_props(values: list[Any] | tuple[Any, ...] | None) -> list[str]:
    """Normalize detected prop IDs, preserving the explicit no-prop marker."""
    result = _dedupe_non_empty(values)
    real_ids = [item for item in result if item != NO_PROP_MARKER]
    return real_ids or ([NO_PROP_MARKER] if NO_PROP_MARKER in result else [])


def real_detected_identities(values: list[Any] | tuple[Any, ...] | None) -> list[str]:
    """Return only concrete identity IDs from a detected_identities payload."""
    return [item for item in normalize_detected_identities(values) if item != NO_CHARACTER_MARKER]


def real_detected_props(values: list[Any] | tuple[Any, ...] | None) -> list[str]:
    """Return only concrete prop IDs from a detected_props payload."""
    return [item for item in normalize_detected_props(values) if item != NO_PROP_MARKER]


def _extract_identity_marker_ids(visual_description: str) -> list[str]:
    return list(extract_char_identities_from_markers(visual_description, strict=False).values())


def complete_detected_refs_from_visual_description(
    *,
    visual_description: str,
    detected_identities: list[Any] | tuple[Any, ...] | None = None,
    detected_props: list[Any] | tuple[Any, ...] | None = None,
    allowed_identity_ids: set[str] | list[str] | tuple[str, ...] | None = None,
    allowed_prop_ids: set[str] | list[str] | tuple[str, ...] | None = None,
) -> tuple[list[str], list[str]]:
    identity_ids = {str(item or "").strip() for item in (allowed_identity_ids or [])}
    prop_ids = {str(item or "").strip() for item in (allowed_prop_ids or [])}

    completed_identities = real_detected_identities(detected_identities)
    for identity_id in _extract_identity_marker_ids(visual_description):
        if identity_ids and identity_id not in identity_ids:
            continue
        if identity_id and identity_id not in completed_identities:
            completed_identities.append(identity_id)

    completed_props = real_detected_props(detected_props)
    for prop_id in extract_prop_ids_from_markers(visual_description, strict=False):
        if prop_ids and prop_id not in prop_ids:
            continue
        if prop_id and prop_id not in completed_props:
            completed_props.append(prop_id)

    return (
        normalize_detected_identities(completed_identities or [NO_CHARACTER_MARKER]),
        normalize_detected_props(completed_props or [NO_PROP_MARKER]),
    )


def extract_char_identities_from_markers(
    visual_desc: str, *, strict: bool = True
) -> dict[str, str]:
    """从 visual_description 的 {{}} marker 提取 {角色名: identity_id}。

    Args:
        strict: True 时遇到无身份后缀的 marker 抛 ValueError
    """
    result = {}
    for marker in re.findall(r"\{\{([^}]+)\}\}", visual_desc):
        if "_" in marker:
            char_name = marker.split("_", 1)[0]
            result[char_name] = marker
        elif strict:
            raise ValueError(
                f"marker '{{{{{marker}}}}}' 缺少身份后缀，" f"应为 '{{{{{marker}_身份名}}}}' 格式"
            )
    return result


def extract_prop_ids_from_markers(visual_desc: str, *, strict: bool = False) -> list[str]:
    """从 visual_description 的 [[prop_id]] marker 提取 prop_id 列表。"""
    result: list[str] = []
    seen: set[str] = set()
    for marker in re.findall(r"\[\[([^\]]+)\]\]", visual_desc):
        prop_id = str(marker or "").strip()
        if not prop_id:
            if strict:
                raise ValueError("marker '[[ ]]' 不能为空")
            continue
        if prop_id in seen:
            continue
        seen.add(prop_id)
        result.append(prop_id)
    return result


class SceneRef(BaseModel):
    """Beat 内引用的场景资产。"""

    scene_id: str = Field(default="", description="场景 ID")
    variant_id: str = Field(default="", description="场景外观/状态选择器；为空表示基础场景")
    render_anchor_id: str = Field(
        default="",
        description="Beat 实际 render 背景槽位；为空表示默认场景图，selected_background 表示使用 beat 冻结背景",
    )
    render_anchor_source_id: str = Field(
        default="",
        description="当 render_anchor_id=selected_background 时记录截图来源，如 master/reverse/director_env_only",
    )


class SceneMenuItem(BaseModel):
    """Episode 级场景菜单项。"""

    scene_id: str = Field(default="", description="场景菜单项 ID；派生场景可为完整派生场景名")
    base_scene_id: str = Field(default="", description="派生场景所属基础场景 ID；基础场景为空")
    variant_id: str = Field(default="", description="派生场景外观/状态标签；基础场景为空")
    time_of_day: str = Field(default="", description="派生场景时间标签；基础场景或非时间版为空")


class PropMenuItem(BaseModel):
    """Episode 级道具菜单项。"""

    prop_id: str = Field(default="", description="基础道具 ID")
    prop_type: str = Field(default="object", description="道具类型")
    visual_prompt: str = Field(default="", description="本集道具视觉提示词")
    description: str = Field(default="", description="本集道具叙述描述")
    owner_identity_id: str = Field(default="", description="所属角色身份 ID，可为空")
    marker_color: str = Field(default="", description="草图阶段道具身份标记颜色")


def _coerce_scene_ref(value: Any) -> SceneRef | None:
    if isinstance(value, SceneRef):
        return value if value.scene_id else None
    if isinstance(value, dict):
        scene_id = str(value.get("scene_id", "") or value.get("base_id", "")).strip()
        variant_id = str(value.get("variant_id", "") or "").strip()
        render_anchor_id = str(
            value.get("render_anchor_id", "")
            or value.get("anchor_id", "")
            or value.get("background_ref_id", "")
            or value.get("shot_id", "")
            or ""
        ).strip()
        render_anchor_source_id = str(
            value.get("render_anchor_source_id", "")
            or value.get("anchor_source_id", "")
            or value.get("background_ref_source_id", "")
            or ""
        ).strip()
        return (
            SceneRef(
                scene_id=scene_id,
                variant_id=variant_id,
                render_anchor_id=render_anchor_id,
                render_anchor_source_id=render_anchor_source_id,
            )
            if scene_id
            else None
        )
    return None


def build_scene_ref(
    scene_id: str = "",
    variant_id: str = "",
) -> SceneRef | None:
    scene_id = (scene_id or "").strip()
    variant_id = (variant_id or "").strip()
    return SceneRef(scene_id=scene_id, variant_id=variant_id) if scene_id else None


def beat_scene_ref(value: Any) -> SceneRef | None:
    if isinstance(value, dict):
        scene_ref = _coerce_scene_ref(value.get("scene_ref"))
        if scene_ref:
            return scene_ref
        return build_scene_ref(
            str(value.get("scene_id", "") or ""),
            str(value.get("scene_variant_id", "") or ""),
        )
    scene_ref = _coerce_scene_ref(getattr(value, "scene_ref", None))
    if scene_ref:
        return scene_ref
    return build_scene_ref(
        str(getattr(value, "scene_id", "") or ""),
        str(getattr(value, "scene_variant_id", "") or ""),
    )


def beat_scene_id(value: Any) -> str:
    scene_ref = beat_scene_ref(value)
    return scene_ref.scene_id if scene_ref else ""


def beat_scene_variant_id(value: Any) -> str:
    scene_ref = beat_scene_ref(value)
    return scene_ref.variant_id if scene_ref else ""


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


def collect_prop_marker_ids_from_beat(value: Any) -> list[str]:
    """从单个 beat 收集出场道具 marker key。

    道具锚点和身份锚点保持一致：只读取 visual_description 里的 [[prop_id]]。
    """
    if isinstance(value, dict):
        visual_desc = str(value.get("visual_description", "") or "")
    else:
        visual_desc = str(getattr(value, "visual_description", "") or "")
    return extract_prop_ids_from_markers(visual_desc, strict=False)


def build_scene_menu(
    scene_ids: list[str] | None = None,
    scene_menu: list[Any] | None = None,
) -> list[SceneMenuItem]:
    normalized: list[SceneMenuItem] = []
    seen: set[str] = set()
    for item in scene_menu or []:
        if isinstance(item, SceneMenuItem):
            scene_id = item.scene_id.strip()
            base_scene_id = item.base_scene_id.strip()
            variant_id = item.variant_id.strip()
            time_of_day = item.time_of_day.strip()
        elif isinstance(item, dict):
            scene_id = str(item.get("scene_id", "") or item.get("base_id", "")).strip()
            base_scene_id = str(item.get("base_scene_id", "") or "").strip()
            variant_id = str(item.get("variant_id", "") or "").strip()
            time_of_day = str(item.get("time_of_day", "") or "").strip()
        else:
            continue
        if not scene_id or scene_id in seen:
            continue
        seen.add(scene_id)
        normalized.append(
            SceneMenuItem(
                scene_id=scene_id,
                base_scene_id=base_scene_id,
                variant_id=variant_id,
                time_of_day=time_of_day,
            )
        )
    if normalized:
        return normalized
    for scene_id in scene_ids or []:
        scene_id = str(scene_id or "").strip()
        if not scene_id or scene_id in seen:
            continue
        seen.add(scene_id)
        normalized.append(SceneMenuItem(scene_id=scene_id))
    return normalized


def build_prop_menu(
    prop_ids: list[str] | None = None,
    prop_menu: list[Any] | None = None,
) -> list[PropMenuItem]:
    def _coerce_prop_menu_item(item: Any) -> PropMenuItem | None:
        if isinstance(item, PropMenuItem):
            prop_id = item.prop_id.strip()
            if not prop_id:
                return None
            return PropMenuItem(
                prop_id=prop_id,
                prop_type=(item.prop_type or "object").strip() or "object",
                visual_prompt=item.visual_prompt.strip(),
                description=item.description.strip(),
                owner_identity_id=item.owner_identity_id.strip(),
                marker_color=item.marker_color.strip(),
            )
        if isinstance(item, dict):
            prop_id = str(item.get("prop_id", "") or item.get("base_id", "")).strip()
            if not prop_id:
                return None
            return PropMenuItem(
                prop_id=prop_id,
                prop_type=str(item.get("prop_type", "") or "object").strip() or "object",
                visual_prompt=str(
                    item.get("visual_prompt", "") or item.get("description", "") or ""
                ).strip(),
                description=str(item.get("description", "") or "").strip(),
                owner_identity_id=str(item.get("owner_identity_id", "") or "").strip(),
                marker_color=str(item.get("marker_color") or "").strip(),
            )
        return None

    normalized: list[PropMenuItem] = []
    seen: set[str] = set()
    for item in prop_menu or []:
        menu_item = _coerce_prop_menu_item(item)
        if not menu_item:
            continue
        prop_id = menu_item.prop_id
        if not prop_id or prop_id in seen:
            continue
        seen.add(prop_id)
        normalized.append(menu_item)
    if normalized:
        return normalized
    for prop_id in prop_ids or []:
        prop_id = str(prop_id or "").strip()
        if not prop_id or prop_id in seen:
            continue
        seen.add(prop_id)
        normalized.append(PropMenuItem(prop_id=prop_id))
    return normalized


def sync_beat_asset_refs(beat: dict[str, Any]) -> dict[str, Any]:
    """规范化 beat 中的场景引用字段。

    规范结构：
    - scene_ref.scene_id: 场景 ID
    - scene_ref.render_anchor_id: Beat 实际 render 背景槽位；空或 selected_background
    - scene_ref.render_anchor_source_id: selected_background 的来源，仅用于 UI 显示/追踪
    """

    scene_ref = _coerce_scene_ref(beat.get("scene_ref"))
    if not scene_ref:
        scene_ref = build_scene_ref(str(beat.get("scene_id", "") or ""))
    beat["scene_ref"] = scene_ref.model_dump() if scene_ref else None
    beat.pop("scene_id", None)

    return beat


# =============================================================================
# Cognee 业务实体（从 cognee/pipeline.py 迁出）
# =============================================================================


class CharacterIdentity(BaseModel):
    """角色身份 - 代表角色的一个特定形态。

    核心理念：身份才是本质。同一角色可以有多个身份，
    每个身份有独立的外貌、服装、Prompt、参考图。

    例如：
    - 谢铮的"和尚"身份：光头、僧袍、佛珠
    - 谢铮的"皇帝"身份：龙袍、高冠、帝王威仪
    """

    identity_id: str = Field(..., description="身份唯一ID，如 谢铮_皇帝、谢铮_和尚")
    character_name: str = Field(..., description="关联的主角色名")
    identity_name: str = Field(..., description="身份名称，如 '皇帝'、'和尚'")

    # 角色唯一短标签（用于 Nano Banana Pro Identity Locking）
    character_tag: str = Field(
        default="",
        description="角色唯一短标签，如 '[JiangSN]'、'[XieZ]'，用于 Prompt 中的身份锁定",
    )

    # 服装描述（该身份特有）
    appearance_details: str = Field(
        default="",
        description="该身份的服装、配饰、发型造型（不含动作和表情）",
    )

    # 参考图（该身份独有）
    reference_images: List[str] = Field(
        default_factory=list,
        description="该身份的参考图路径列表",
    )

    # 面部特征（年龄变体等需要不同脸的身份）
    face_prompt: str = Field(
        default="",
        description="身份级面部特征（用于幼年/老年等面部差异大的身份），fallback 到角色级 face_prompt",
    )

    # 年龄段（仅年龄变体身份填写，用于自动映射声音预设）
    age_group: str = Field(
        default="",
        description="该身份的年龄段: child/youth/middle/elder（仅年龄变体填写）",
    )

    # 体型（年龄变体等需要不同体型的身份）
    body_type: str = Field(
        default="",
        description="身份级体型描述（用于幼年/老年等体型差异大的身份），fallback 到角色级 body_type",
    )

    # 声音（用户手动指定，优先级最高）
    fish_voice_id: str = Field(
        default="",
        description="DEPRECATED — Fish Audio voice ID. IndexTTS2 cutover uses reference_audio_path instead; field retained until magnetic data migration completes.",
    )
    reference_audio_path: str = Field(
        default="",
        description="身份级 IndexTTS2 参考音频路径（项目相对路径），优先级高于角色级 reference_audio_path",
    )
    reference_audio_updated_at: str = Field(
        default="",
        description="身份级声线最后一次内容变化时间 ISO 字符串",
    )
    reference_audio_sha256: str = Field(
        default="",
        description="身份级参考音频内容 SHA256，用于 IndexTTS2 voice provenance 校验",
    )

    # 身份级 portrait（用户上传或 AI 生成）
    portrait_image: str = Field(
        default="",
        description="身份级脸部参考图路径（当 face_prompt 非空时使用）",
    )

    # 服装参考图（用户上传，生成四视图时用于服装锚定）
    costume_image: str = Field(
        default="",
        description="服装参考图路径（用户上传，生成四视图时用于服装锚定）",
    )

    # 来源
    source: str = Field(
        default="extracted",
        description="来源: 'extracted'（小说提取）或 'user_created'（手动创建）",
    )
    updated_at: str = Field(default="", description="身份资产最后一次内容变化时间 ISO 字符串")

    @model_validator(mode="after")
    def sanitize_names(self):
        """清理身份名称中的文件系统不安全字符。"""
        self.identity_name = re.sub(r'[/\\:*?"<>|]', "_", self.identity_name)
        self.identity_id = re.sub(r'[/\\:*?"<>|]', "_", self.identity_id)
        return self

    @field_validator("age_group", mode="before")
    @classmethod
    def normalize_age_group(cls, value):
        """兼容历史 null，并统一为字符串。"""
        if value is None:
            return ""
        return str(value)

    def __setattr__(self, name, value):
        if name == "age_group" and value is None:
            value = ""
        super().__setattr__(name, value)


class NovelCharacter(BaseModel):
    """小说角色实体。

    双层参考架构（Portrait + Identity）：
    - 第一层 Portrait（必需）：纯面部特写，中性背景，用于锁定面部身份
    - 第二层 Identity（可选）：完整角色图含服装，用于固定服装

    使用策略：
    - 有激活的 identity → 双参考模式（锁脸 + 锁服装）
    - 无激活的 identity → 单参考模式（锁脸，服装由文字描述控制）

    核心理念（Prompt 分离）：
    - face_prompt: 纯面部特征（发型、眼睛、肤色），用于 Portrait 生成
    - identity.appearance_details: 服装造型，用于 Identity 生成
    - 默认所有身份共用同一个 face_prompt，确保面部一致性
    - 年龄变体（幼年/老年等）可通过 identity.face_prompt 提供独立面部特征

    identities 存储为 JSON 字符串。
    使用 get_identities() / set_identities() 方法访问。
    """

    name: str = Field(..., description="角色全名")
    aliases: List[str] = Field(default_factory=list, description="别名列表")
    role: str = Field(default="", description="角色定位（主角/配角/反派）")
    is_main: bool = Field(default=False, description="是否为主角/核心角色")
    gender: str = Field(default="", description="性别")
    age_group: str = Field(default="youth", description="年龄段: child/youth/middle/elder")
    body_type: str = Field(default="", description="体型描述，如'纤细高挑'、'健壮魁梧'")
    fish_voice_id: str = Field(
        default="",
        description="DEPRECATED — Fish Audio voice ID. IndexTTS2 cutover uses reference_audio_path / voice_samples_by_age_group instead; field retained until magnetic data migration completes.",
    )
    reference_audio_path: str = Field(
        default="",
        description="角色级 IndexTTS2 参考音频路径（项目相对路径，default slot）",
    )
    reference_audio_sha256: str = Field(
        default="",
        description="角色级参考音频内容 SHA256",
    )
    reference_audio_updated_at: str = Field(
        default="",
        description="角色级默认声线最后一次内容变化时间 ISO 字符串",
    )
    voice_samples_by_age_group_json: str = Field(
        default="{}",
        description="按年龄段（child/youth/middle/elder）划分的 IndexTTS2 声线样本 JSON：{slot: {path, sha256, updated_at}}",
    )
    description: str = Field(default="", description="角色描述")

    # ============================================================
    # 第一层：Portrait（必需）- 纯面部特写
    # ============================================================

    # 纯面部特征（用于 Portrait 生成）
    face_prompt: str = Field(
        default="",
        description="纯面部特征描述（发型、眼睛、肤色、骨骼轮廓），用于 Portrait 生成",
    )

    appearance_details: str = Field(
        default="",
        description="默认服装描述（文字），当无激活身份时使用",
    )

    # ============================================================
    # 第二层：Identity（可选）- 完整角色图（含服装）
    # ============================================================
    # 身份系统 - 存储为 JSON 字符串以兼容 Neo4j
    identities_json: str = Field(
        default="[]",
        description="身份列表的 JSON 字符串",
    )
    updated_at: str = Field(default="", description="角色资产最后一次内容变化时间 ISO 字符串")

    model_config = ConfigDict(arbitrary_types_allowed=True)

    @model_validator(mode="before")
    @classmethod
    def _coerce_voice_samples_kwarg(cls, data):
        """Accept ``voice_samples_by_age_group=dict(...)`` kwarg and stash to JSON.

        Source-branch voice_clone tests construct ``NovelCharacter(...,
        voice_samples_by_age_group={...})`` directly. We persist the field as
        ``voice_samples_by_age_group_json`` (mirrors ``identities_json``), so
        this pre-validator translates the dict kwarg into the JSON column.
        """
        if isinstance(data, dict) and "voice_samples_by_age_group" in data:
            samples = data.pop("voice_samples_by_age_group") or {}
            if isinstance(samples, dict):
                import json as _json

                data.setdefault(
                    "voice_samples_by_age_group_json",
                    _json.dumps(samples, ensure_ascii=False),
                )
        return data

    @model_validator(mode="after")
    def sanitize_name(self):
        """清理角色名称中的文件系统不安全字符。"""
        self.name = re.sub(r'[/\\:*?"<>|]', "_", self.name)
        return self

    @property
    def identities(self) -> List[CharacterIdentity]:
        """获取身份列表（从 JSON 解析，不使用缓存）。"""
        if not self.identities_json or self.identities_json == "[]":
            return []

        import json

        try:
            data = json.loads(self.identities_json)
            return [CharacterIdentity(**item) for item in data]
        except (json.JSONDecodeError, TypeError):
            return []

    @property
    def voice_samples_by_age_group(self) -> dict[str, dict]:
        """按年龄段划分的 IndexTTS2 声线样本（dict 视图，从 JSON 字段解析）。"""
        if not self.voice_samples_by_age_group_json:
            return {}
        import json

        try:
            data = json.loads(self.voice_samples_by_age_group_json)
            return data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    @voice_samples_by_age_group.setter
    def voice_samples_by_age_group(self, value: dict[str, dict]) -> None:
        import json

        self.voice_samples_by_age_group_json = json.dumps(value or {}, ensure_ascii=False)

    @identities.setter
    def identities(self, value: List[CharacterIdentity]):
        """设置身份列表（序列化为 JSON）。"""
        import json

        if not value:
            self.identities_json = "[]"
        else:
            self.identities_json = json.dumps(
                [item.model_dump() for item in value],
                ensure_ascii=False,
            )

    def get_identity(self, identity_name: str) -> Optional[CharacterIdentity]:
        """按身份名称获取身份。"""
        for identity in self.identities:
            if identity.identity_name == identity_name:
                return identity
        return None

    def migrate_to_identity_format(self) -> None:
        """将旧格式数据迁移到身份格式。"""
        if self.identities:
            return

        from ai_anime.utils.identity_resolver import compute_char_tag

        default_id = f"{self.name}_默认"
        default_identity = CharacterIdentity(
            identity_id=default_id,
            character_name=self.name,
            identity_name="默认",
            character_tag=compute_char_tag(self.name, identity_id=default_id),
            appearance_details=self.appearance_details or self.description,
        )
        self.identities = [default_identity]

    def ensure_tag(self) -> None:
        """确保每个 identity 有独立的 tag。"""
        from ai_anime.utils.identity_resolver import compute_char_tag

        identities = self.identities
        if identities:
            for identity in identities:
                if not identity.character_tag:
                    identity.character_tag = compute_char_tag(
                        self.name,
                        identity_id=identity.identity_id,
                    )
            self.identities = identities


class NovelEpisode(BaseModel):
    """剧集实体。"""

    number: int = Field(..., description="集数")
    title: str = Field(..., description="标题")
    chapter_start: int = Field(default=0, description="起始章节")
    chapter_end: int = Field(default=0, description="结束章节")
    raw_content: str = Field(default="", description="本集原文")
    adapted_content: str = Field(default="", description="改写后的工作副本")
    beat_source_text: str = Field(default="", description="逐行分镜生成使用的工作文本")
    content_summary: str = Field(default="", description="内容摘要")
    main_conflict: str = Field(default="", description="主要冲突")
    cliffhanger: str = Field(default="", description="悬念/钩子")
    key_events: List[str] = Field(default_factory=list, description="关键事件")
    character_names: List[str] = Field(default_factory=list, description="出场角色名称")
    identity_ids: List[str] = Field(
        default_factory=list, description="本集规划的身份ID列表，如 ['苏清晏_嫡女日常']"
    )
    sketch_colors_json: str = Field(
        default="{}",
        description='草图颜色映射 JSON 字符串，如 {"苏清晏_嫡女日常": "red"}',
    )

    # 事件级规划支持（AI 规划模式）
    event_ids: List[str] = Field(default_factory=list, description="关联的事件ID列表")
    scene_menu_json: str = Field(default="[]", description="JSON: SceneMenuItem 列表")
    prop_menu_json: str = Field(default="[]", description="JSON: PropMenuItem 列表")
    identity_default_map_json: str = Field(
        default="{}",
        description='JSON: 本集角色默认身份映射，如 {"杜晨": "杜晨_中年时期"}',
    )
    updated_at: str = Field(default="", description="剧集规划最后一次内容变化时间 ISO 字符串")

    @model_validator(mode="before")
    @classmethod
    def _migrate_episode_asset_menu(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        if not payload.get("scene_menu_json"):
            payload["scene_menu_json"] = json.dumps(
                [
                    item.model_dump()
                    for item in build_scene_menu(
                        scene_menu=payload.get("scene_menu") or [],
                    )
                ],
                ensure_ascii=False,
            )
        if not payload.get("prop_menu_json"):
            payload["prop_menu_json"] = json.dumps(
                [
                    item.model_dump()
                    for item in build_prop_menu(
                        prop_menu=payload.get("prop_menu") or [],
                    )
                ],
                ensure_ascii=False,
            )
        if not payload.get("identity_default_map_json"):
            payload["identity_default_map_json"] = json.dumps(
                payload.get("identity_default_map") or {},
                ensure_ascii=False,
            )
        return payload

    @property
    def scene_menu(self) -> List[SceneMenuItem]:
        if not self.scene_menu_json or self.scene_menu_json == "[]":
            return []
        try:
            data = json.loads(self.scene_menu_json)
            return build_scene_menu(scene_menu=data)
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    @scene_menu.setter
    def scene_menu(self, value: List[SceneMenuItem] | List[dict]):
        self.scene_menu_json = (
            json.dumps(
                [item.model_dump() for item in build_scene_menu(scene_menu=value)],
                ensure_ascii=False,
            )
            if value
            else "[]"
        )

    @property
    def prop_menu(self) -> List[PropMenuItem]:
        if not self.prop_menu_json or self.prop_menu_json == "[]":
            return []
        try:
            data = json.loads(self.prop_menu_json)
            return build_prop_menu(prop_menu=data)
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    @prop_menu.setter
    def prop_menu(self, value: List[PropMenuItem] | List[dict]):
        self.prop_menu_json = (
            json.dumps(
                [item.model_dump() for item in build_prop_menu(prop_menu=value)],
                ensure_ascii=False,
            )
            if value
            else "[]"
        )

    @property
    def identity_default_map(self) -> dict[str, str]:
        if not self.identity_default_map_json or self.identity_default_map_json == "{}":
            return {}
        try:
            data = json.loads(self.identity_default_map_json)
            if not isinstance(data, dict):
                return {}
            return {
                str(name or "").strip(): str(identity_id or "").strip()
                for name, identity_id in data.items()
                if str(name or "").strip() and str(identity_id or "").strip()
            }
        except (json.JSONDecodeError, TypeError, ValueError):
            return {}

    @identity_default_map.setter
    def identity_default_map(self, value: dict[str, str] | None):
        normalized = {
            str(name or "").strip(): str(identity_id or "").strip()
            for name, identity_id in (value or {}).items()
            if str(name or "").strip() and str(identity_id or "").strip()
        }
        self.identity_default_map_json = (
            json.dumps(normalized, ensure_ascii=False) if normalized else "{}"
        )


class NovelVisualBeat(BaseModel):
    """视觉节拍实体。"""

    beat_number: int = Field(..., description="节拍序号（1-based）")
    episode_number: int = Field(..., description="所属集数")
    narration: str = Field(default="", description="TTS 文本（旁白或台词，用于嵌入索引）")
    visual_description: str = Field(default="", description="画面描述（创意意图）")

    time_of_day: str = Field(
        default="",
        description="时间段（清晨/上午/正午/午后/白天/黄昏/夜晚）；为空表示不指定",
    )

    # 草图颜色检测
    detected_identities_json: str = Field(
        default="[]", description="草图颜色检测到的出场身份ID列表（JSON 序列化）"
    )
    detected_props_json: str = Field(
        default="[]", description="草图颜色检测到的出场全局道具ID列表（JSON 序列化）"
    )
    scene_ref_json: str = Field(
        default="",
        description="当前 beat 的规范化场景引用 JSON",
    )
    # 视频生成参数（Beat 层）
    video_mode: str = Field(default="first_frame", description="first_frame / keyframe")
    video_prompt: str = Field(default="", description="视频运动提示词")
    keyframe_prompt: str = Field(default="", description="首尾帧过渡提示词")

    # Seedance 2.0 per-beat config overrides (Stage B; Stage A persists '{}' default)
    seedance2_config_json: str = Field(
        default="{}",
        description="Seedance 2.0 per-beat 覆写 JSON（Stage B 真正使用，Stage A 仅落库占位）",
    )

    # 对话支持
    audio_type: str = Field(default="narration", description="silence/narration/dialogue")
    speaker: str = Field(default="", description="说话人标签")
    speaker_kind: str = Field(
        default="character",
        description="speaker 类型：character/non_character",
    )

    # 手工分镜插入支持
    shot_order: Optional[int] = Field(
        default=None, description="显示/叙事顺序（fractional ordering）"
    )
    duration_seconds: Optional[float] = Field(default=None, description="用户指定目标时长（秒）")
    is_manual_shot: bool = Field(default=False, description="是否为用户手工插入的分镜")

    @model_validator(mode="after")
    def ensure_fields_not_empty(self) -> "NovelVisualBeat":
        """确保关键字段不为空。"""
        scene_ref = None
        if self.scene_ref_json:
            try:
                scene_ref = _coerce_scene_ref(json.loads(self.scene_ref_json))
            except (TypeError, ValueError, json.JSONDecodeError):
                scene_ref = None
        self.scene_ref_json = (
            json.dumps(scene_ref.model_dump(), ensure_ascii=False) if scene_ref else ""
        )

        if not self.narration or not self.narration.strip():
            if not self.is_manual_shot and self.audio_type not in {"silence", "action"}:
                self.narration = "(empty)"
        if not self.visual_description or not self.visual_description.strip():
            if not self.is_manual_shot:
                self.visual_description = f"场景画面：{self.narration[:50]}"
        return self

    @property
    def scene_ref(self) -> SceneRef | None:
        if not self.scene_ref_json:
            return None
        try:
            return _coerce_scene_ref(json.loads(self.scene_ref_json))
        except (TypeError, ValueError, json.JSONDecodeError):
            return None

    @property
    def scene_id(self) -> str:
        scene_ref = self.scene_ref
        return scene_ref.scene_id if scene_ref else ""


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


def build_scene_effective_prompt(scene: NovelScene, base_scene: NovelScene | None = None) -> str:
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


class NovelProp(BaseModel):
    """道具实体 — 故事中的重要物件/武器/信物。"""

    name: str = Field(description="道具名称，如 '七星剑'")
    aliases: List[str] = Field(default_factory=list, description="别名")
    prop_type: str = Field(
        default="object", description="weapon/accessory/artifact/document/furniture"
    )

    visual_prompt: str = Field(default="", description="道具视觉 prompt（用于生成参考图）")
    description: str = Field(default="", description="道具叙述性描述（材质、尺寸、用途）")

    owner: str = Field(default="", description="所属角色名")
    notes: str = Field(default="")
    updated_at: str = Field(default="", description="道具资产最后一次内容变化时间 ISO 字符串")
