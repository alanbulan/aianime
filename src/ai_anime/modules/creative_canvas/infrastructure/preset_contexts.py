"""Project-backed context builders for Creative Canvas presets."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ai_anime.config import IMAGE_DEFAULT_STYLE as PROP_REF_DEFAULT_STYLE
from ai_anime.generators.nanobanana_prop import build_prop_reference_prompt
from ai_anime.modules.asset_world.public import NovelScene, build_scene_effective_prompt
from ai_anime.modules.narrative_planning.public import build_prop_menu
from ai_anime.modules.creative_canvas.domain import (
    PresetRef,
    as_preset_list as _as_list,
    extract_preset_visual_markers as _visual_markers,
    normalize_preset_scene_name as _normalize_scene_name,
    preset_identity_character as _identity_character,
    preset_identity_id as _identity_id_from_item,
    preset_identity_name as _identity_name,
    preset_prop_id as _prop_id_from_item,
    project_preset_sketch_aspect_ratio as _project_sketch_aspect_ratio,
    real_preset_identity_ids as _real_identity_ids,
    real_preset_prop_ids as _real_prop_ids,
)
from ai_anime.modules.creative_canvas.infrastructure.preset_references import (
    _add_character_identity_ref,
    _add_character_refs,
    _add_file_ref,
    _add_mainline_identity_ref,
    _add_prop_refs,
    _add_scene_refs,
    _add_selected_background_ref,
    _aspect_ratio_for_ref,
    _make_url,
    _media_type_for_path,
    _path_rel_if_inside,
    _rel,
)
from ai_anime.utils.path_resolver import (
    PathResolver,
    canonical_identity_costume_path,
    canonical_identity_portrait_path,
    canonical_portrait_path,
    canonical_scene_master_path,
    compute_identity_costume_path,
    compute_identity_portrait_path,
)


def _jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    return value


async def build_beat_preset_context(
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    store: Any,
    episode: int,
    beat: int,
    primary_slot: str = "render",
) -> dict[str, Any]:
    beats = await store.get_beats_as_dicts(episode)
    target = next(
        (b for b in beats if int(b.get("beat_number") or -1) == int(beat)), None
    )
    if not target:
        raise ValueError(f"beat not found: ep{episode} beat{beat}")

    episode_obj = await store.get_episode_from_graph(episode)
    prop_menu = [
        item.model_dump()
        for item in build_prop_menu(
            prop_menu=getattr(episode_obj, "prop_menu", []) or []
        )
    ]
    try:
        from ai_anime.modules.asset_world.public import (
            runtime_prop_menu_with_cached_global_props,
        )

        prop_menu = runtime_prop_menu_with_cached_global_props(
            prop_menu=prop_menu,
            beats=[target],
            store=store,
        )
    except Exception:
        pass
    scene_menu = [
        item.model_dump() if hasattr(item, "model_dump") else _jsonable(item)
        for item in (getattr(episode_obj, "scene_menu", []) or [])
    ]
    prop_by_id = {item["prop_id"]: item for item in prop_menu if item.get("prop_id")}
    known_characters = list(getattr(store, "_characters", {}).keys())

    refs: list[PresetRef] = []
    ep_dir = f"ep{episode:03d}"
    beat_dir = f"beat_{beat:02d}"
    control_base = f"director_control_frames/{ep_dir}/{beat_dir}"
    paths = PathResolver(str(project_dir), episode)

    def _project_rel(path: Path) -> str:
        return path.relative_to(project_dir).as_posix()

    canonical_sketch_path = paths.sketch(beat)
    for rel_path, kind, role, label in [
        (_project_rel(canonical_sketch_path), "sketch", "current_sketch", "当前草图"),
        (_project_rel(paths.frame(beat)), "frame", "current_frame", "当前分镜"),
        (
            _project_rel(paths.video(beat)),
            "video",
            "current_video",
            "当前视频",
        ),
        (_project_rel(paths.audio(beat)), "audio", "current_audio", "当前音频"),
        (f"{control_base}/combined.png", "director", "director_combined", "导演合成图"),
    ]:
        _add_file_ref(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            kind=kind,
            role=role,
            label=label,
            rel_path=rel_path,
            meta={"episode": episode, "beat": beat, "primary_slot": primary_slot},
        )

    scene_name = _normalize_scene_name(target.get("scene_ref"))

    # selected_background 不走 _add_file_ref(那个函数会在文件缺失时直接跳过) ——
    # 这个 slot 必须有站位节点,用户才知道往哪 commit 选定背景图。文件存在时
    # 走正常 asset node 渲染;缺失时 emit 一个 url=None 的 placeholder ref,
    # 让画布上 generic ref loop 给它建一个空 imageGenNode 占位。
    selected_bg_rel = f"{control_base}/selected_background.png"
    selected_bg_path = project_dir / selected_bg_rel
    selected_bg_exists = selected_bg_path.exists()
    fallback_bg_rel: str | None = None
    fallback_bg_path: Path | None = None
    if not selected_bg_exists and scene_name:
        scene_master_path = canonical_scene_master_path(project_dir, scene_name)
        if scene_master_path.exists():
            fallback_bg_rel = _path_rel_if_inside(project_dir, scene_master_path)
            fallback_bg_path = scene_master_path if fallback_bg_rel else None
    preview_bg_path = selected_bg_path if selected_bg_exists else fallback_bg_path
    preview_bg_rel = selected_bg_rel if selected_bg_exists else fallback_bg_rel
    preview_bg_exists = selected_bg_exists or bool(fallback_bg_path)
    selected_bg_meta = {
        "episode": episode,
        "beat": beat,
        "primary_slot": primary_slot,
        "scene_id": scene_name,
    }
    if fallback_bg_rel:
        selected_bg_meta.update(
            {
                "fallback_source": "scene_master",
                "fallback_rel_path": fallback_bg_rel,
            }
        )
    refs.append(
        PresetRef(
            kind="director",
            role="selected_background",
            label=f"当前背景 · Beat {beat}",
            rel_path=selected_bg_rel,
            url=(
                _make_url(project_id, project_dir, preview_bg_rel)
                if preview_bg_rel and preview_bg_exists
                else None
            ),
            exists=preview_bg_exists,
            media_type=_media_type_for_path(preview_bg_path)
            if preview_bg_path
            else "image",
            aspect_ratio=_aspect_ratio_for_ref(preview_bg_path)
            if preview_bg_path
            else "16:9",
            meta=selected_bg_meta,
        )
    )

    visual_description = str(target.get("visual_description") or "")
    marker_identities, marker_props = _visual_markers(visual_description)
    detected_identities = [
        _identity_id_from_item(x) for x in _as_list(target.get("detected_identities"))
    ]
    identity_ids = _real_identity_ids([*marker_identities, *detected_identities])
    seen_identities: set[str] = set()
    for identity_id in identity_ids:
        if identity_id in seen_identities:
            continue
        seen_identities.add(identity_id)
        character = _identity_character(identity_id, known_characters)
        _add_mainline_identity_ref(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            character=character,
            identity_id=identity_id,
        )

    detected_props = [
        _prop_id_from_item(x) for x in _as_list(target.get("detected_props"))
    ]
    prop_ids = _real_prop_ids([*marker_props, *detected_props])
    seen_props: set[str] = set()
    for prop_id in prop_ids:
        if prop_id in seen_props:
            continue
        seen_props.add(prop_id)
        _add_prop_refs(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            prop_id=prop_id,
            meta=prop_by_id.get(prop_id, {"prop_id": prop_id}),
        )

    # Beat canvas does not project scene assets as nodes. Scene master /
    # reverse / 360 / 3GS remain available through the set-selected-background
    # SkillNode's embedded source picker.

    sketch_colors: dict[str, str] = {}
    get_sketch_colors = getattr(store, "get_sketch_colors", None)
    if callable(get_sketch_colors):
        try:
            sketch_colors = get_sketch_colors(episode) or {}
        except Exception:
            sketch_colors = {}
    if not sketch_colors:
        try:
            from ai_anime.modules.production.public import (
                assign_identity_sketch_colors,
            )

            sketch_colors = assign_identity_sketch_colors(
                [
                    {
                        "name": getattr(character_obj, "name", ""),
                        "identities": [
                            (
                                identity.model_dump()
                                if hasattr(identity, "model_dump")
                                else _jsonable(identity)
                            )
                            for identity in (
                                getattr(character_obj, "identities", []) or []
                            )
                        ],
                    }
                    for character_obj in getattr(
                        store, "get_all_characters", lambda: []
                    )()
                ],
                episode_beats=beats,
            )
        except Exception:
            sketch_colors = {}

    try:
        from ai_anime.project_config import load_project_config_file

        project_config = load_project_config_file(username, project) if project else {}
    except Exception:
        project_config = {}
    sketch_aspect_ratio = _project_sketch_aspect_ratio(project_config, episode)

    prop_marker_colors: dict[str, str] = {}
    try:
        from ai_anime.modules.production.public import global_prop_marker_colors

        prop_marker_colors = global_prop_marker_colors(
            [target],
            prop_menu=prop_menu,
            sketch_colors=sketch_colors,
        )
    except Exception:
        prop_marker_colors = {}

    character_profiles: dict[str, Any] = {}
    for character_obj in getattr(store, "get_all_characters", lambda: [])():
        character_name = str(getattr(character_obj, "name", "") or "").strip()
        if not character_name:
            continue
        character_profiles[character_name] = {
            "name": character_name,
            "gender": str(getattr(character_obj, "gender", "") or "").strip(),
            "body_type": str(getattr(character_obj, "body_type", "") or "").strip(),
            "appearance_details": str(
                getattr(character_obj, "appearance_details", "") or ""
            ).strip(),
            "identities": [
                identity.model_dump()
                if hasattr(identity, "model_dump")
                else _jsonable(identity)
                for identity in (getattr(character_obj, "identities", []) or [])
            ],
        }

    return {
        "scope": "beat",
        "username": username,
        "project": project,
        "project_id": project_id,
        "project_dir": str(project_dir),
        "episode": episode,
        "beat": beat,
        "primary_slot": primary_slot,
        "sketch_aspect_ratio": sketch_aspect_ratio,
        "beat_data": {
            "beat_number": target.get("beat_number"),
            "narration_segment": target.get("narration_segment"),
            "visual_description": visual_description,
            "video_prompt": target.get("video_prompt"),
            "keyframe_prompt": target.get("keyframe_prompt"),
            "scene_ref": target.get("scene_ref"),
            "detected_identities": target.get("detected_identities"),
            "detected_props": target.get("detected_props"),
        },
        "prop_menu": prop_menu,
        "scene_menu": scene_menu,
        "sketch_context": {
            "sketch_colors": sketch_colors,
            "prop_marker_colors": prop_marker_colors,
            "characters": character_profiles,
        },
        "refs": [ref.to_payload() for ref in refs],
    }


async def build_episode_preset_context(
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    store: Any,
    episode: int,
) -> dict[str, Any]:
    beats = await store.get_beats_as_dicts(episode)
    try:
        episode_obj = await store.get_episode_from_graph(episode)
    except Exception:
        episode_obj = None

    episode_title = str(getattr(episode_obj, "title", "") or f"EP{episode}").strip()
    known_characters = list(getattr(store, "_characters", {}).keys())
    scene_ids: set[str] = set()
    identity_ids: set[str] = set()
    prop_ids: set[str] = set()
    beat_items: list[dict[str, Any]] = []
    background_items: list[dict[str, Any]] = []

    for beat in beats:
        try:
            beat_number = int(beat.get("beat_number") or 0)
        except (TypeError, ValueError):
            beat_number = 0
        if beat_number <= 0:
            continue
        visual_description = str(beat.get("visual_description") or "")
        marker_identities, marker_props = _visual_markers(visual_description)
        detected_identities = [
            _identity_id_from_item(x) for x in _as_list(beat.get("detected_identities"))
        ]
        detected_props = [
            _prop_id_from_item(x) for x in _as_list(beat.get("detected_props"))
        ]
        scene_id = _normalize_scene_name(beat.get("scene_ref"))
        if scene_id:
            scene_ids.add(scene_id)
        for identity_id in _real_identity_ids(
            [*marker_identities, *detected_identities]
        ):
            identity_ids.add(identity_id)
        for prop_id in _real_prop_ids([*marker_props, *detected_props]):
            prop_ids.add(prop_id)
        beat_items.append(
            {
                "beat_number": beat_number,
                "visual_description": visual_description,
                "narration_segment": beat.get("narration_segment"),
                "scene_id": scene_id,
                "detected_identities": _real_identity_ids(
                    [*marker_identities, *detected_identities]
                ),
                "detected_props": _real_prop_ids([*marker_props, *detected_props]),
            }
        )
        background_items.append({"beat_number": beat_number, "scene_id": scene_id})

    identity_items = [
        {
            "identity_id": identity_id,
            "character": _identity_character(identity_id, known_characters),
        }
        for identity_id in sorted(identity_ids)
    ]
    prop_items = [{"prop_id": prop_id} for prop_id in sorted(prop_ids)]
    scene_items = [{"scene_id": scene_id} for scene_id in sorted(scene_ids)]

    refs: list[PresetRef] = []
    for item in identity_items:
        # EP canvas:不走 portrait/reference_front fallback。canonical identity
        # 缺失就不发 ref(用户看不到 portrait 替身,避免被误读为"该 identity 已生成")。
        # Beat 工作台保留 fallback(default include_portrait_fallback=True)。
        _add_mainline_identity_ref(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            character=str(item.get("character") or ""),
            identity_id=str(item.get("identity_id") or ""),
            include_portrait_fallback=False,
        )
    for item in prop_items:
        prop_id = str(item.get("prop_id") or "")
        _add_prop_refs(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            prop_id=prop_id,
            meta={"prop_id": prop_id},
        )
    for item in background_items:
        beat_number = int(item.get("beat_number") or 0)
        if beat_number <= 0:
            continue
        _add_selected_background_ref(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            episode=episode,
            beat=beat_number,
            scene_id=str(item.get("scene_id") or ""),
        )

    return {
        "scope": "episode",
        "username": username,
        "project": project,
        "project_id": project_id,
        "project_dir": str(project_dir),
        "episode": episode,
        "episode_title": episode_title,
        "beats": sorted(beat_items, key=lambda item: int(item["beat_number"])),
        "scenes": scene_items,
        "backgrounds": background_items,
        "identities": identity_items,
        "props": prop_items,
        "refs": [ref.to_payload() for ref in refs],
    }


def _project_style_meta(
    username: str, project: str, project_dir: Path
) -> dict[str, str]:
    try:
        from ai_anime.config import IMAGE_DEFAULT_STYLE, get_style_preset
        from ai_anime.project_config import load_project_config

        project_config = load_project_config(username, project)
        style_id = str(
            project_config.get("visual_style") or IMAGE_DEFAULT_STYLE
        ).strip()
        preset = get_style_preset(
            style_id, username=username, project=project, project_dir=str(project_dir)
        )
        label = str(preset.get("label") or style_id).strip()
        style_name = (
            f"{label} ({style_id})" if label and label != style_id else style_id
        )
        return {
            "style_name": style_name,
            "style_prompt": str(preset.get("style_instructions") or "").strip(),
            "avoid_instructions": str(preset.get("avoid_instructions") or "").strip(),
        }
    except Exception:
        return {}


async def build_asset_preset_context(
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    store: Any,
    asset_kind: str,
    character: str | None = None,
    identity_id: str | None = None,
    asset_id: str | None = None,
    example_beat_limit: int = 0,
) -> dict[str, Any]:
    refs: list[PresetRef] = []
    asset_kind = (asset_kind or "").strip()
    generation_context: dict[str, Any] = {}
    if asset_kind in {"identity", "portrait", "character"}:
        if not character:
            raise ValueError(f"{asset_kind} preset requires character")
        if asset_kind == "identity" and not identity_id:
            raise ValueError("identity preset requires identity_id")
        char = store.get_character(character)
        if char is None:
            raise ValueError(f"character not found: {character}")
        generation_context["character_profile"] = {
            "name": str(getattr(char, "name", "") or character).strip(),
            "aliases": list(getattr(char, "aliases", None) or []),
            "role": str(getattr(char, "role", "") or "").strip(),
            "is_main": bool(getattr(char, "is_main", False)),
            "gender": str(getattr(char, "gender", "") or "").strip(),
            "age_group": str(getattr(char, "age_group", "") or "").strip(),
            "body_type": str(getattr(char, "body_type", "") or "").strip(),
            "description": str(getattr(char, "description", "") or "").strip(),
            "face_prompt": str(getattr(char, "face_prompt", "") or "").strip(),
        }
        char_identity_ids = [
            str(getattr(item, "identity_id", "") or "").strip()
            for item in (getattr(char, "identities", None) or [])
        ]
        portrait_prompt = str(getattr(char, "face_prompt", "") or "").strip()
        char_age_group = str(getattr(char, "age_group", "") or "youth")
        try:
            from ai_anime.config import IMAGE_DEFAULT_STYLE, get_style_preset
            from ai_anime.generators.nanobanana_character import (
                NanoBananaCharacterGenerator,
            )
            from ai_anime.project_config import load_project_config

            project_config = load_project_config(username, project)
            project_style = str(
                project_config.get("visual_style") or IMAGE_DEFAULT_STYLE
            )
            project_ethnicity = str(project_config.get("ethnicity") or "Chinese")
            style_preset = get_style_preset(
                project_style,
                username=username,
                project=project,
                project_dir=str(project_dir),
            )
            style_keywords = style_preset.get("style_instructions", "")
            negative_keywords = style_preset.get("avoid_instructions", "")
            character_prompt_builder = NanoBananaCharacterGenerator.__new__(
                NanoBananaCharacterGenerator
            )
        except Exception:
            project_style = ""
            project_ethnicity = "Chinese"
            style_keywords = ""
            negative_keywords = ""
            character_prompt_builder = None

        def _ai_anime_portrait_full_prompt(prompt_text: str) -> str:
            if character_prompt_builder is None:
                return prompt_text
            character_tag = character_prompt_builder._generate_character_tag(character)
            return character_prompt_builder._build_character_prompt(
                character_name=character,
                character_prompt=prompt_text,
                character_tag=character_tag,
                style_name=project_style,
                project_dir=str(project_dir),
                style_keywords=style_keywords,
                negative_keywords=negative_keywords,
                ethnicity=project_ethnicity,
            )

        generation_context["portrait"] = {
            "character": character,
            "prompt": _ai_anime_portrait_full_prompt(portrait_prompt)
            if portrait_prompt
            else "",
            "display_name": f"{character} portrait prompt",
        }

        def _ai_anime_identity_full_prompt(
            *,
            identity_name: str,
            identity_prompt: str,
            has_costume_image: bool,
        ) -> str:
            if character_prompt_builder is None:
                return identity_prompt
            character_tag = character_prompt_builder._generate_character_tag(character)
            return character_prompt_builder._build_identity_locked_prompt(
                character_name=character,
                character_prompt=identity_prompt,
                character_tag=character_tag,
                target_view="front",
                style_name=project_style,
                project_dir=str(project_dir),
                style_keywords=style_keywords,
                negative_keywords=negative_keywords,
                ethnicity=project_ethnicity,
                has_costume_reference=has_costume_image,
            )

        def _build_identity_generation_context(identity_obj: Any) -> dict[str, Any]:
            current_identity_id = str(
                getattr(identity_obj, "identity_id", "") or ""
            ).strip()
            identity_name = str(
                getattr(identity_obj, "identity_name", "")
                or _identity_name(current_identity_id, character)
            ).strip()
            appearance_details = str(
                getattr(identity_obj, "appearance_details", "") or ""
            ).strip()
            face_override = str(getattr(identity_obj, "face_prompt", "") or "").strip()
            identity_age = str(getattr(identity_obj, "age_group", "") or "").strip()
            is_age_variant = bool(identity_age and identity_age != char_age_group)
            costume_image = compute_identity_costume_path(
                project_dir, character, identity_name
            ) or (str(getattr(identity_obj, "costume_image", "") or "").strip())
            if is_age_variant:
                identity_portrait = compute_identity_portrait_path(
                    project_dir, character, identity_name
                ) or (str(getattr(identity_obj, "portrait_image", "") or "").strip())
            else:
                identity_portrait = ""
            identity_costume_path = costume_image or str(
                canonical_identity_costume_path(project_dir, character, identity_name)
            )
            if is_age_variant:
                identity_portrait_path = identity_portrait or str(
                    canonical_identity_portrait_path(
                        project_dir, character, identity_name
                    )
                )
            else:
                identity_portrait_path = ""
            has_costume_image = bool(costume_image and Path(costume_image).exists())
            has_identity_portrait = bool(
                is_age_variant
                and identity_portrait
                and Path(identity_portrait).exists()
            )
            if is_age_variant:
                prompt = (
                    ""
                    if has_identity_portrait and has_costume_image
                    else (
                        appearance_details
                        if has_identity_portrait
                        else (
                            face_override
                            if has_costume_image
                            else (
                                f"{face_override}\n{appearance_details}"
                                if appearance_details
                                else face_override
                            )
                        )
                    )
                )
            else:
                prompt = "" if has_costume_image else appearance_details
            prompt = prompt.strip()
            full_prompt = _ai_anime_identity_full_prompt(
                identity_name=identity_name,
                identity_prompt=prompt,
                has_costume_image=has_costume_image,
            )
            identity_portrait_prompt = (
                face_override or appearance_details or prompt
            ).strip()
            full_identity_portrait_prompt = (
                _ai_anime_portrait_full_prompt(identity_portrait_prompt)
                if identity_portrait_prompt
                else ""
            )
            return {
                "character": character,
                "identity_id": current_identity_id,
                "identity_name": identity_name,
                "prompt": full_prompt.strip(),
                "identity_portrait_prompt": full_identity_portrait_prompt.strip(),
                "identity_prompt": prompt,
                "appearance_details": appearance_details,
                "face_prompt": face_override,
                "is_age_variant": is_age_variant,
                "has_costume_image": has_costume_image,
                "has_identity_portrait": has_identity_portrait,
                "identity_costume_path": identity_costume_path,
                "identity_portrait_path": identity_portrait_path,
                "style": project_style,
                "ethnicity": project_ethnicity,
                "display_name": f"{identity_name} identity prompt",
            }

        identity_generation_contexts: list[dict[str, Any]] = []
        for identity_obj in getattr(char, "identities", None) or []:
            current_identity_id = str(
                getattr(identity_obj, "identity_id", "") or ""
            ).strip()
            if not current_identity_id:
                continue
            if asset_kind == "identity" and current_identity_id != identity_id:
                continue
            identity_generation_contexts.append(
                _build_identity_generation_context(identity_obj)
            )
        generation_context["identities"] = identity_generation_contexts
        if asset_kind == "character":
            _add_file_ref(
                refs,
                project_id=project_id,
                username=username,
                project=project,
                project_dir=project_dir,
                kind="identity",
                role="character_portrait",
                label=f"{character} portrait",
                rel_path=_rel(
                    project_dir, canonical_portrait_path(project_dir, character)
                ),
                meta={"character": character},
            )
            for existing_identity_id in char_identity_ids:
                _add_character_identity_ref(
                    refs,
                    project_id=project_id,
                    username=username,
                    project=project,
                    project_dir=project_dir,
                    character=character,
                    identity_id=existing_identity_id,
                )
            for identity_ctx in identity_generation_contexts:
                identity_name = str(identity_ctx.get("identity_name") or "").strip()
                portrait_path = str(
                    identity_ctx.get("identity_portrait_path") or ""
                ).strip()
                if portrait_path:
                    _add_file_ref(
                        refs,
                        project_id=project_id,
                        username=username,
                        project=project,
                        project_dir=project_dir,
                        kind="identity",
                        role="identity_portrait",
                        label=f"{identity_name} portrait",
                        rel_path=_rel(project_dir, Path(portrait_path)),
                        required=True,
                        meta={
                            "character": character,
                            "identity_id": identity_ctx.get("identity_id"),
                            "identity_name": identity_name,
                        },
                    )
                costume_path = str(
                    identity_ctx.get("identity_costume_path") or ""
                ).strip()
                if costume_path:
                    _add_file_ref(
                        refs,
                        project_id=project_id,
                        username=username,
                        project=project,
                        project_dir=project_dir,
                        kind="identity",
                        role="identity_costume",
                        label=f"{identity_name} costume",
                        rel_path=_rel(project_dir, Path(costume_path)),
                        required=True,
                        meta={
                            "character": character,
                            "identity_id": identity_ctx.get("identity_id"),
                            "identity_name": identity_name,
                        },
                    )
        else:
            _add_character_refs(
                refs,
                project_id=project_id,
                username=username,
                project=project,
                project_dir=project_dir,
                character=character,
                identity_id=identity_id,
            )
            target_identity_ctx = next(
                (
                    item
                    for item in identity_generation_contexts
                    if str(item.get("identity_id") or "").strip()
                    == (identity_id or "").strip()
                ),
                None,
            )
            if target_identity_ctx:
                identity_name = str(
                    target_identity_ctx.get("identity_name") or ""
                ).strip()
                portrait_path = str(
                    target_identity_ctx.get("identity_portrait_path") or ""
                ).strip()
                if portrait_path:
                    _add_file_ref(
                        refs,
                        project_id=project_id,
                        username=username,
                        project=project,
                        project_dir=project_dir,
                        kind="identity",
                        role="identity_portrait",
                        label=f"{identity_name} portrait",
                        rel_path=_rel(project_dir, Path(portrait_path)),
                        required=True,
                        meta={
                            "character": character,
                            "identity_id": target_identity_ctx.get("identity_id"),
                            "identity_name": identity_name,
                        },
                    )
            if target_identity_ctx:
                identity_name = str(
                    target_identity_ctx.get("identity_name") or ""
                ).strip()
                costume_path = str(
                    target_identity_ctx.get("identity_costume_path") or ""
                ).strip()
                if costume_path:
                    _add_file_ref(
                        refs,
                        project_id=project_id,
                        username=username,
                        project=project,
                        project_dir=project_dir,
                        kind="identity",
                        role="identity_costume",
                        label=f"{identity_name} costume",
                        rel_path=_rel(project_dir, Path(costume_path)),
                        required=True,
                        meta={
                            "character": character,
                            "identity_id": target_identity_ctx.get("identity_id"),
                            "identity_name": identity_name,
                        },
                    )
        if example_beat_limit > 0:
            matches: list[tuple[int, int]] = []
            try:
                visual_beats = await store.list_visual_beats()
            except Exception:
                visual_beats = []
            visual_beats = sorted(
                visual_beats,
                key=lambda b: (
                    int(getattr(b, "episode_number", 0)),
                    int(getattr(b, "beat_number", 0)),
                ),
                reverse=True,
            )
            for beat in visual_beats:
                visual = str(getattr(beat, "visual_description", "") or "")
                try:
                    detected = json.loads(
                        getattr(beat, "detected_identities_json", "[]") or "[]"
                    )
                except Exception:
                    detected = []
                detected_ids = [_identity_id_from_item(x) for x in _as_list(detected)]
                mentions_character = character in visual
                mentions_identity = bool(
                    identity_id
                    and (identity_id in visual or identity_id in detected_ids)
                )
                mentions_any_known_identity = bool(
                    asset_kind == "character"
                    and any(
                        existing_id
                        and (existing_id in visual or existing_id in detected_ids)
                        for existing_id in char_identity_ids
                    )
                )
                if (
                    mentions_identity
                    or mentions_any_known_identity
                    or (not identity_id and mentions_character)
                ):
                    matches.append(
                        (
                            int(getattr(beat, "episode_number", 0)),
                            int(getattr(beat, "beat_number", 0)),
                        )
                    )
                if len(matches) >= example_beat_limit * 10:
                    break
            added_examples = 0
            for ep_num, beat_num in matches:
                ep_dir = f"ep{ep_num:03d}"
                before_example = len(refs)
                for rel_path, kind, role, label in [
                    (
                        f"sketches/{ep_dir}/beat_{beat_num:02d}.png",
                        "sketch",
                        "related_sketch",
                        f"EP{ep_num} Beat {beat_num} sketch",
                    ),
                    (
                        f"freezone/director_control_frames/{ep_dir}/beat_{beat_num:02d}/combined.png",
                        "director",
                        "related_director_combined",
                        f"EP{ep_num} Beat {beat_num} director",
                    ),
                ]:
                    _add_file_ref(
                        refs,
                        project_id=project_id,
                        username=username,
                        project=project,
                        project_dir=project_dir,
                        kind=kind,
                        role=role,
                        label=label,
                        rel_path=rel_path,
                        meta={"episode": ep_num, "beat": beat_num},
                    )
                if len(refs) > before_example:
                    added_examples += 1
                if added_examples >= example_beat_limit:
                    break
    elif asset_kind in {
        "scene",
        "scene_master",
        "scene_reverse_master",
        "scene_spatial_layout",
        "scene_360",
    }:
        scene_name = asset_id or identity_id or character or ""
        if not scene_name:
            raise ValueError("scene preset requires asset_id")
        scene_obj = await store.get_scene(scene_name)
        scene_info = (
            scene_obj.model_dump()
            if scene_obj is not None and hasattr(scene_obj, "model_dump")
            else _jsonable(scene_obj)
            if scene_obj is not None
            else {}
        )
        base_scene_id = str(scene_info.get("base_scene_id") or "").strip()
        base_scene_info: dict[str, Any] = {}
        if base_scene_id:
            try:
                base_scene_obj = await store.get_scene(base_scene_id)
                base_scene_info = (
                    base_scene_obj.model_dump()
                    if base_scene_obj is not None
                    and hasattr(base_scene_obj, "model_dump")
                    else _jsonable(base_scene_obj)
                    if base_scene_obj is not None
                    else {}
                )
            except Exception:
                base_scene_info = {}
        if scene_info:
            scene_model = NovelScene(
                name=str(
                    scene_info.get("name") or scene_info.get("scene_id") or scene_name
                ),
                scene_type=str(scene_info.get("scene_type") or "interior")
                or "interior",
                base_scene_id=base_scene_id,
                variant_id=str(scene_info.get("variant_id") or "").strip(),
                time_of_day=str(scene_info.get("time_of_day") or "").strip(),
                environment_prompt=str(
                    scene_info.get("environment_prompt") or ""
                ).strip(),
                variant_prompt=str(scene_info.get("variant_prompt") or "").strip(),
                description=str(scene_info.get("description") or "").strip(),
            )
            base_scene_model = None
            if base_scene_info:
                base_scene_model = NovelScene(
                    name=str(
                        base_scene_info.get("name")
                        or base_scene_info.get("scene_id")
                        or base_scene_id
                    ),
                    scene_type=str(base_scene_info.get("scene_type") or "interior")
                    or "interior",
                    environment_prompt=str(
                        base_scene_info.get("environment_prompt") or ""
                    ).strip(),
                    description=str(base_scene_info.get("description") or "").strip(),
                )
            scene_info["effective_environment_prompt"] = build_scene_effective_prompt(
                scene_model,
                base_scene_model,
            )
            scene_info["base_environment_prompt"] = str(
                base_scene_info.get("environment_prompt") or ""
            ).strip()
            scene_info["base_description"] = str(
                base_scene_info.get("description") or ""
            ).strip()
            scene_info["base_scene_type"] = str(
                base_scene_info.get("scene_type") or ""
            ).strip()
            if base_scene_id:
                base_master_path = canonical_scene_master_path(
                    project_dir, base_scene_id
                )
                if base_master_path.exists():
                    base_master_rel_path = _rel(project_dir, base_master_path)
                    scene_info["base_master_rel_path"] = base_master_rel_path
                    scene_info["base_master_url"] = _make_url(
                        project_id,
                        project_dir,
                        base_master_rel_path,
                    )
        scene_info = {
            **scene_info,
            **_project_style_meta(username, project, project_dir),
        }
        _add_scene_refs(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            scene_name=scene_name,
            scene_info=scene_info,
        )
    elif asset_kind in {"prop", "prop_ref"}:
        prop_id = asset_id or identity_id or character or ""
        if not prop_id:
            raise ValueError("prop preset requires asset_id")
        prop_obj = None
        get_prop = getattr(store, "get_prop", None)
        if callable(get_prop):
            prop_obj = await get_prop(prop_id)
        if prop_obj is None:
            get_cached_prop = getattr(store, "get_cached_prop", None)
            if callable(get_cached_prop):
                prop_obj = get_cached_prop(prop_id)
        episode_props: list[dict[str, Any]] = []
        for ep in getattr(store, "_episodes", {}).values():
            for item in build_prop_menu(prop_menu=getattr(ep, "prop_menu", []) or []):
                if item.prop_id == prop_id:
                    episode_props.append(item.model_dump())
        prop_profile = {
            "name": str(getattr(prop_obj, "name", "") or prop_id).strip(),
            "aliases": list(getattr(prop_obj, "aliases", None) or []),
            "prop_type": str(getattr(prop_obj, "prop_type", "") or "").strip(),
            "visual_prompt": str(getattr(prop_obj, "visual_prompt", "") or "").strip(),
            "description": str(getattr(prop_obj, "description", "") or "").strip(),
            "owner": str(getattr(prop_obj, "owner", "") or "").strip(),
            "notes": str(getattr(prop_obj, "notes", "") or "").strip(),
        }
        meta = (
            episode_props[0]
            if episode_props
            else {
                "prop_id": prop_id,
                "prop_type": prop_profile["prop_type"] or "object",
                "visual_prompt": prop_profile["visual_prompt"]
                or prop_profile["description"],
                "description": prop_profile["description"],
            }
        )
        effective_visual_prompt = str(
            meta.get("visual_prompt") or prop_profile["visual_prompt"] or ""
        ).strip()
        effective_description = str(
            meta.get("description") or prop_profile["description"] or ""
        ).strip()
        effective_prompt = effective_visual_prompt or effective_description
        if effective_visual_prompt:
            prop_profile["visual_prompt"] = effective_visual_prompt
        if effective_description:
            prop_profile["description"] = effective_description
        try:
            from ai_anime.project_config import load_project_config_file

            project_config = (
                load_project_config_file(username, project) if project else {}
            )
        except Exception:
            project_config = {}
        project_style = str(
            project_config.get("visual_style")
            or project_config.get("project_style")
            or PROP_REF_DEFAULT_STYLE
        )
        reference_prompt = (
            build_prop_reference_prompt(
                visual_prompt=effective_prompt,
                style=project_style,
                project_dir=str(project_dir),
            )
            if effective_prompt
            else ""
        )
        generation_context["prop"] = {
            "prop_id": prop_id,
            "profile": prop_profile,
            "prompt": reference_prompt,
            "visual_prompt": effective_prompt,
            "display_name": f"{prop_id} reference prompt",
        }
        _add_prop_refs(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            prop_id=prop_id,
            meta=meta,
        )
    else:
        raise ValueError(f"unsupported asset preset: {asset_kind}")

    return {
        "scope": "asset",
        "username": username,
        "project": project,
        "project_id": project_id,
        "project_dir": str(project_dir),
        "asset_kind": asset_kind,
        "character": character,
        "identity_id": identity_id,
        "asset_id": asset_id,
        "refs": [ref.to_payload() for ref in refs],
        "generation_context": generation_context,
    }
