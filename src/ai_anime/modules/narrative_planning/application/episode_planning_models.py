"""Episode planning models owned by Narrative Planning."""

import json
from typing import Any, List

from pydantic import BaseModel, Field, model_validator


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


class NovelEvent(BaseModel):
    """小说事件（场景级）。"""

    event_id: str = Field(..., description="唯一ID，如 ch1_e1")
    chapter_num: int = Field(..., description="所属章节")
    description: str = Field(..., description="事件描述（20字以内）")
    location: str = Field(default="", description="地点")
    time_marker: str = Field(default="", description="时间标记（如：傍晚、第二天）")
    characters: List[str] = Field(default_factory=list, description="参与角色")
    text_start: int = Field(default=0, description="原文起始位置（字符偏移）")
    text_end: int = Field(default=0, description="原文结束位置")
    content: str = Field(default="", description="事件对应的原文")
    causes: List[str] = Field(default_factory=list, description="因果关系（前置事件ID）")


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


__all__ = [
    "NovelEpisode",
    "NovelEvent",
    "PropMenuItem",
    "SceneMenuItem",
    "build_prop_menu",
    "build_scene_menu",
]
