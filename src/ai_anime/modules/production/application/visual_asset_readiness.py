"""Episode visual-asset closure required before storyboard sketches."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any, Iterable

from ai_anime.modules.narrative_planning.public import (
    beat_scene_id,
    inspect_episode_scene_plan,
)
from ai_anime.shared.utils.path_resolver import (
    canonical_identity_path,
    canonical_portrait_path,
    canonical_prop_reference_path,
    canonical_scene_master_path,
    canonical_scene_reverse_master_path,
)


@dataclass(frozen=True)
class EpisodeVisualAssetReadiness:
    identity_plan_complete: bool
    scene_plan_complete: bool
    prop_plan_complete: bool
    beat_scene_bindings_complete: bool
    identity_images_complete: bool
    scene_images_complete: bool
    prop_images_complete: bool
    issues: tuple[str, ...]

    @property
    def ready_for_sketches(self) -> bool:
        return (
            self.identity_plan_complete
            and self.scene_plan_complete
            and self.prop_plan_complete
            and self.beat_scene_bindings_complete
            and self.identity_images_complete
            and self.scene_images_complete
            and self.prop_images_complete
            and not self.issues
        )

    def rejection_message(self) -> str:
        return "草图生成前置资产未就绪：" + "；".join(self.issues)


def _normalized_asset_name(value: Any) -> str:
    return re.sub(
        r"[\s·._\-—－/\\（）()【】\[\]，,。:：]+",
        "",
        str(value or "").strip().casefold(),
    )


def _unique_alias_lookup(records: Iterable[Any]) -> tuple[dict[str, Any], set[str]]:
    candidates: dict[str, list[Any]] = {}
    for record in records:
        for value in (
            getattr(record, "name", ""),
            *(getattr(record, "aliases", None) or ()),
        ):
            key = _normalized_asset_name(value)
            if key:
                candidates.setdefault(key, []).append(record)
    resolved = {
        key: values[0]
        for key, values in candidates.items()
        if len({id(value) for value in values}) == 1
    }
    ambiguous = {
        key
        for key, values in candidates.items()
        if len({id(value) for value in values}) > 1
    }
    return resolved, ambiguous


def inspect_episode_visual_assets(
    *,
    project_dir: str | Path,
    episode: Any,
    characters: Iterable[Any],
    scenes: Iterable[Any],
    props: Iterable[Any],
    beats: list[dict[str, Any]],
    prop_plan_completed: bool,
) -> EpisodeVisualAssetReadiness:
    project_path = Path(project_dir)
    characters = tuple(characters)
    scenes = tuple(scenes)
    props = tuple(props)
    issues: list[str] = []

    active_identity_ids = tuple(
        dict.fromkeys(
            str(value or "").strip()
            for value in (getattr(episode, "identity_ids", None) or ())
            if str(value or "").strip()
        )
    )
    identity_records: dict[str, tuple[Any, Any]] = {}
    for character in characters:
        for identity in getattr(character, "identities", None) or ():
            identity_id = str(getattr(identity, "identity_id", "") or "").strip()
            if identity_id:
                identity_records[identity_id] = (character, identity)
    missing_identity_records = [
        identity_id
        for identity_id in active_identity_ids
        if identity_id not in identity_records
    ]
    identity_plan_complete = bool(active_identity_ids) and not missing_identity_records
    if not active_identity_ids:
        issues.append("身份规划为空")
    elif missing_identity_records:
        issues.append("身份定义缺失：" + "、".join(missing_identity_records))

    missing_portraits: list[str] = []
    missing_identity_images: list[str] = []
    for identity_id in active_identity_ids:
        resolved = identity_records.get(identity_id)
        if not resolved:
            continue
        character, identity = resolved
        character_name = str(getattr(character, "name", "") or "").strip()
        identity_name = str(getattr(identity, "identity_name", "") or "").strip()
        if not canonical_portrait_path(project_path, character_name).exists():
            missing_portraits.append(character_name)
        if not canonical_identity_path(
            project_path, character_name, identity_name
        ).exists():
            missing_identity_images.append(identity_id)
    missing_portraits = list(dict.fromkeys(missing_portraits))
    identity_images_complete = (
        identity_plan_complete and not missing_portraits and not missing_identity_images
    )
    if missing_portraits:
        issues.append("角色肖像缺失：" + "、".join(missing_portraits))
    if missing_identity_images:
        issues.append("身份图缺失：" + "、".join(missing_identity_images))

    scene_plan = inspect_episode_scene_plan(episode, scenes)
    scene_plan_complete = scene_plan.complete
    if not scene_plan_complete:
        if scene_plan.missing_locations:
            issues.append(
                "场景规划缺少原文地点：" + "、".join(scene_plan.missing_locations)
            )
        else:
            issues.append("场景规划为空")

    scene_lookup, ambiguous_scene_aliases = _unique_alias_lookup(scenes)
    menu_scene_records: dict[str, Any] = {}
    missing_scene_records: list[str] = []
    for item in getattr(episode, "scene_menu", None) or ():
        scene_id = str(getattr(item, "scene_id", "") or "").strip()
        base_scene_id = str(getattr(item, "base_scene_id", "") or "").strip()
        key = _normalized_asset_name(scene_id)
        record = scene_lookup.get(key) or scene_lookup.get(
            _normalized_asset_name(base_scene_id)
        )
        if record is None:
            missing_scene_records.append(scene_id or base_scene_id)
            continue
        menu_scene_records[key] = record
        for value in (
            getattr(record, "name", ""),
            *(getattr(record, "aliases", None) or ()),
        ):
            alias_key = _normalized_asset_name(value)
            if alias_key and alias_key not in ambiguous_scene_aliases:
                menu_scene_records[alias_key] = record
    if missing_scene_records:
        issues.append("场景资产定义缺失：" + "、".join(missing_scene_records))

    unbound_beats: list[str] = []
    invalid_scene_beats: list[str] = []
    for beat in beats:
        beat_number = int(beat.get("beat_number") or 0)
        scene_id = beat_scene_id(beat)
        visual_description = str(beat.get("visual_description", "") or "").strip()
        if not scene_id:
            if not visual_description.startswith(
                ("黑屏", "BLACK SCREEN", "Black screen")
            ):
                unbound_beats.append(str(beat_number))
            continue
        if _normalized_asset_name(scene_id) not in menu_scene_records:
            invalid_scene_beats.append(f"{beat_number}→{scene_id}")
    beat_scene_bindings_complete = (
        bool(beats) and not unbound_beats and not invalid_scene_beats
    )
    if not beats:
        issues.append("分镜脚本为空")
    if unbound_beats:
        issues.append("Beat 未绑定场景：" + "、".join(unbound_beats))
    if invalid_scene_beats:
        issues.append("Beat 场景不在本集菜单：" + "、".join(invalid_scene_beats))

    required_scene_records = list(
        {
            str(getattr(record, "name", "") or ""): record
            for record in menu_scene_records.values()
        }.values()
    )
    missing_scene_master: list[str] = []
    missing_scene_reverse: list[str] = []
    for record in required_scene_records:
        scene_name = str(getattr(record, "name", "") or "").strip()
        if not canonical_scene_master_path(project_path, scene_name).exists():
            missing_scene_master.append(scene_name)
        if not canonical_scene_reverse_master_path(project_path, scene_name).exists():
            missing_scene_reverse.append(scene_name)
    scene_images_complete = (
        scene_plan_complete
        and not missing_scene_records
        and bool(required_scene_records)
        and not missing_scene_master
        and not missing_scene_reverse
    )
    if missing_scene_master:
        issues.append("场景主视图缺失：" + "、".join(missing_scene_master))
    if missing_scene_reverse:
        issues.append("场景反向图缺失：" + "、".join(missing_scene_reverse))

    prop_menu = tuple(getattr(episode, "prop_menu", None) or ())
    prop_plan_complete = bool(prop_menu) or prop_plan_completed
    if not prop_plan_complete:
        issues.append("道具规划尚未完成")
    prop_lookup, _ = _unique_alias_lookup(props)
    missing_prop_records: list[str] = []
    missing_prop_images: list[str] = []
    for item in prop_menu:
        prop_id = str(getattr(item, "prop_id", "") or "").strip()
        record = prop_lookup.get(_normalized_asset_name(prop_id))
        if record is None:
            missing_prop_records.append(prop_id)
            continue
        canonical_name = str(getattr(record, "name", "") or "").strip()
        if not canonical_prop_reference_path(project_path, canonical_name).exists():
            missing_prop_images.append(canonical_name)
    prop_images_complete = (
        prop_plan_complete and not missing_prop_records and not missing_prop_images
    )
    if missing_prop_records:
        issues.append("道具资产定义缺失：" + "、".join(missing_prop_records))
    if missing_prop_images:
        issues.append("道具参考图缺失：" + "、".join(missing_prop_images))

    return EpisodeVisualAssetReadiness(
        identity_plan_complete=identity_plan_complete,
        scene_plan_complete=scene_plan_complete,
        prop_plan_complete=prop_plan_complete,
        beat_scene_bindings_complete=beat_scene_bindings_complete,
        identity_images_complete=identity_images_complete,
        scene_images_complete=scene_images_complete,
        prop_images_complete=prop_images_complete,
        issues=tuple(dict.fromkeys(issues)),
    )
