"""Pure projections for display-tool fallback responses."""

from __future__ import annotations

from typing import Any, Mapping


def display_episode(args: dict[str, Any]) -> int:
    return int(args.get("episode") or 1)


def display_candidate_beat(args: dict[str, Any]) -> int:
    try:
        return int(
            args.get("beat") or args.get("beat_num") or args.get("beat_number") or 0
        )
    except (TypeError, ValueError):
        return 0


def _limit_items(
    items: list[dict[str, Any]],
    args: dict[str, Any],
    default: int,
) -> list[dict[str, Any]]:
    try:
        limit = int(args.get("limit")) if args.get("limit") is not None else default
    except (TypeError, ValueError):
        limit = default
    try:
        offset = int(args.get("offset") or 0)
    except (TypeError, ValueError):
        offset = 0
    offset = max(0, offset)
    limit = max(1, min(limit, default))
    return items[offset : offset + limit]


def _requested_beats(args: dict[str, Any]) -> set[int] | None:
    raw = args.get("beat_indices") or args.get("beats")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    for key in ("beat", "beat_num", "beat_number", "index"):
        if args.get(key) is not None:
            values.append(args[key])
    beats: set[int] = set()
    for value in values:
        try:
            beat = int(value)
        except (TypeError, ValueError):
            continue
        if beat > 0:
            beats.add(beat)
    return beats or None


def _requested_names(args: dict[str, Any]) -> set[str] | None:
    raw = args.get("names")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    for key in ("name", "character"):
        if args.get(key) is not None:
            values.append(args[key])
    names = {str(value).strip() for value in values if str(value or "").strip()}
    return names or None


def _requested_queries(args: dict[str, Any]) -> set[str] | None:
    raw = args.get("queries") or args.get("keywords")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    for key in ("query", "search", "keyword", "text", "identity_name"):
        if args.get(key) is not None:
            values.append(args[key])
    queries = {str(value).strip() for value in values if str(value or "").strip()}
    return queries or None


def _requested_scene_names(args: dict[str, Any]) -> set[str] | None:
    raw = args.get("names") or args.get("scene_names")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    for key in ("name", "scene_name"):
        if args.get(key) is not None:
            values.append(args[key])
    names = {str(value).strip() for value in values if str(value or "").strip()}
    return names or None


def _requested_scene_indices(args: dict[str, Any]) -> set[int] | None:
    raw = args.get("scene_indices") or args.get("indices")
    values: list[Any] = []
    if isinstance(raw, list):
        values.extend(raw)
    elif raw is not None:
        values.append(raw)
    if args.get("index") is not None:
        values.append(args["index"])
    indices: set[int] = set()
    for value in values:
        try:
            index = int(value)
        except (TypeError, ValueError):
            continue
        if index > 0:
            indices.add(index)
    return indices or None


def _matches_scene_name(scene_name: str, requested_names: set[str] | None) -> bool:
    if requested_names is None:
        return True
    haystack = str(scene_name or "").casefold()
    return any(needle.casefold() in haystack for needle in requested_names if needle)


def _flatten_text_fields(fields: list[Any]) -> list[str]:
    values: list[str] = []
    for field in fields:
        if isinstance(field, dict):
            values.extend(_flatten_text_fields(list(field.values())))
        elif isinstance(field, list):
            values.extend(_flatten_text_fields(field))
        elif field is not None:
            text = str(field).strip()
            if text:
                values.append(text)
    return values


def _matches_text(fields: list[Any], queries: set[str] | None) -> bool:
    if queries is None:
        return True
    haystack = "\n".join(_flatten_text_fields(fields)).casefold()
    return any(query.casefold() in haystack for query in queries if query)


def _media_ui_spec(
    spec_type: str,
    component_type: str,
    items: list[dict[str, Any]],
) -> dict[str, Any]:
    elements: dict[str, Any] = {
        "root": {
            "type": "Stack",
            "props": {
                "direction": "row",
                "wrap": "wrap",
                "spacing": 16,
                "alignItems": "flex-start",
                "width": "100%",
            },
            "children": [],
        }
    }
    for index, item in enumerate(items, start=1):
        src = str(item.get("src") or item.get("url") or "").strip()
        if not src:
            continue
        key = f"media_{index}"
        title = str(item.get("title") or item.get("label") or f"媒体 {index}").strip()
        description = str(item.get("description") or "").strip()
        props: dict[str, Any] = {"src": src, "alt": title, "title": title}
        if description:
            props["description"] = description
        if component_type == "Image":
            props.update(
                {
                    "fit": item.get("fit") or "cover",
                    "aspectRatio": item.get("aspectRatio") or "3/4",
                    "overlayTitle": title,
                }
            )
            if description:
                props["overlayDescription"] = description
        elif component_type == "Video":
            poster = str(item.get("poster") or item.get("thumbnail") or "").strip()
            if poster:
                props["poster"] = poster
            props["controls"] = True
        elif component_type == "Audio":
            props["controls"] = True

        elements[key] = {"type": component_type, "props": props, "children": []}
        elements["root"]["children"].append(key)
    return {"type": spec_type, "root": "root", "elements": elements}


def _response_items(response: Any, *keys: str) -> list[Any]:
    if not isinstance(response, dict):
        return []
    for key in keys:
        value = response.get(key)
        if isinstance(value, list):
            return value
    data = response.get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in keys:
            value = data.get(key)
            if isinstance(value, list):
                return value
    return []


def project_beat_image_specs(
    tool_name: str,
    args: dict[str, Any],
    response: Any,
) -> list[dict[str, Any]]:
    media_kind = "frame" if tool_name == "ai_anime_get_first_frames" else "sketch"
    media_items: list[dict[str, Any]] = []
    requested_beats = _requested_beats(args)
    for beat in _response_items(response, "beats", "items"):
        if not isinstance(beat, dict):
            continue
        beat_number = beat.get("beat_number")
        try:
            beat_int = int(beat_number)
        except (TypeError, ValueError):
            beat_int = None
        if requested_beats is not None and beat_int not in requested_beats:
            continue
        sketch_url = str(beat.get("sketch_url") or "").strip()
        frame_url = str(beat.get("frame_url") or "").strip()
        if sketch_url and media_kind == "sketch":
            media_items.append(
                {
                    "src": sketch_url,
                    "title": f"Beat {beat_number} 草图",
                    "description": "草图",
                    "aspectRatio": "3/4",
                }
            )
        if frame_url and media_kind == "frame":
            media_items.append(
                {
                    "src": frame_url,
                    "title": f"Beat {beat_number} 首帧",
                    "description": "首帧",
                    "aspectRatio": "3/4",
                }
            )
    limited = _limit_items(media_items, args, 12)
    return [_media_ui_spec("sketch_gallery", "Image", limited)] if limited else []


def project_sketch_candidate_specs(
    args: dict[str, Any],
    response: Any,
) -> list[dict[str, Any]]:
    beat = display_candidate_beat(args)
    data = response.get("data") if isinstance(response, dict) else None
    candidates = data.get("candidates") if isinstance(data, dict) else []
    media_items: list[dict[str, Any]] = []
    for candidate in candidates if isinstance(candidates, list) else []:
        if not isinstance(candidate, dict):
            continue
        src = str(candidate.get("url") or "").strip()
        if not src:
            continue
        media_items.append(
            {
                "src": src,
                "title": f"Beat {beat} 草图候选",
                "description": "过期候选" if candidate.get("stale") else "草图候选",
                "aspectRatio": "3/4",
            }
        )
    limited = _limit_items(media_items, args, 12)
    return [_media_ui_spec("sketch_gallery", "Image", limited)] if limited else []


def project_scene_image_specs(
    args: dict[str, Any],
    response: Any,
) -> list[dict[str, Any]]:
    media_items: list[dict[str, Any]] = []
    include_reverse = bool(args.get("include_reverse", True))
    include_pano = bool(args.get("include_pano", False))
    include_custom = bool(args.get("include_custom", False))
    requested_names = _requested_scene_names(args)
    requested_indices = _requested_scene_indices(args)
    requested_type = str(args.get("scene_type") or "").strip()
    for scene_index, scene in enumerate(
        _response_items(response, "scenes", "items"), start=1
    ):
        if not isinstance(scene, dict):
            continue
        scene_name = str(scene.get("name") or "").strip()
        scene_type = str(scene.get("scene_type") or "").strip()
        if requested_indices is not None and scene_index not in requested_indices:
            continue
        if not _matches_scene_name(scene_name, requested_names):
            continue
        if requested_type and scene_type != requested_type:
            continue
        for kind, field, enabled in (
            ("master", "master_url", True),
            ("reverse_master", "reverse_master_url", include_reverse),
            ("pano", "pano_url", include_pano),
            ("custom_scene", "custom_scene_url", include_custom),
        ):
            src = str(scene.get(field) or "").strip()
            if enabled and src:
                media_items.append(
                    {
                        "src": src,
                        "title": f"{scene_name or '场景'} · {kind}",
                        "description": scene.get("description")
                        or scene.get("environment_prompt")
                        or "",
                        "aspectRatio": "16/9" if kind == "pano" else "3/4",
                    }
                )
    limited = _limit_items(media_items, args, 12)
    return [_media_ui_spec("sketch_gallery", "Image", limited)] if limited else []


def character_identity_requests(
    args: dict[str, Any],
    response: Any,
) -> list[tuple[int, str]]:
    media_kind = (
        str(args.get("media_kind") or args.get("kind") or "all").strip().lower()
    )
    if media_kind not in {"all", "portrait", "identity"}:
        media_kind = "all"
    include_identities = (
        bool(args.get("include_identities", True)) and media_kind != "portrait"
    )
    if not include_identities:
        return []
    return [
        (index, str(character.get("name") or "").strip())
        for index, character in enumerate(
            _response_items(response, "characters", "items")
        )
        if isinstance(character, dict)
    ]


def _resolved_identities(
    character: dict[str, Any],
    identity_response: Any | None,
) -> Any:
    identities = character.get("identities") or character.get("identity_images") or []
    if not isinstance(identity_response, dict):
        return identities
    for key in ("data", "identities", "items"):
        value = identity_response.get(key)
        if isinstance(value, list):
            identities = value
            break
    data = identity_response.get("data")
    if isinstance(data, dict):
        value = data.get("identities")
        if isinstance(value, list):
            identities = value
    return identities


def project_character_media_specs(
    args: dict[str, Any],
    response: Any,
    identity_responses: Mapping[int, Any] | None = None,
) -> list[dict[str, Any]]:
    media_kind = (
        str(args.get("media_kind") or args.get("kind") or "all").strip().lower()
    )
    if media_kind not in {"all", "portrait", "identity"}:
        media_kind = "all"
    include_identities = (
        bool(args.get("include_identities", True)) and media_kind != "portrait"
    )
    media_items: list[dict[str, Any]] = []
    requested_names = _requested_names(args)
    requested_queries = _requested_queries(args)
    responses = identity_responses or {}
    for character_index, character in enumerate(
        _response_items(response, "characters", "items")
    ):
        if not isinstance(character, dict):
            continue
        name = str(character.get("name") or "").strip()
        role = str(character.get("role") or character.get("description") or "").strip()
        character_name_match = _matches_text(
            [name, character.get("aliases")],
            requested_names,
        )
        character_query_match = _matches_text(
            [
                name,
                role,
                character.get("description"),
                character.get("appearance"),
                character.get("profile"),
                character.get("aliases"),
            ],
            requested_queries,
        )
        character_match = character_name_match and character_query_match
        portrait_url = str(character.get("portrait_url") or "").strip()
        if portrait_url and character_match and media_kind in {"all", "portrait"}:
            media_items.append(
                {
                    "src": portrait_url,
                    "title": name or "角色肖像",
                    "description": role,
                    "aspectRatio": "3/4",
                }
            )
        identities = _resolved_identities(character, responses.get(character_index))
        if include_identities and isinstance(identities, list):
            for identity in identities:
                if not isinstance(identity, dict):
                    continue
                src = str(
                    identity.get("image_url")
                    or identity.get("portrait_image_url")
                    or identity.get("costume_image_url")
                    or ""
                ).strip()
                if not src:
                    continue
                title = str(
                    identity.get("identity_name")
                    or identity.get("name")
                    or identity.get("identity_id")
                    or name
                    or "身份图"
                )
                identity_name_match = _matches_text(
                    [
                        name,
                        character.get("aliases"),
                        title,
                        identity.get("identity_name"),
                        identity.get("name"),
                        identity.get("identity_id"),
                    ],
                    requested_names,
                )
                identity_query_match = _matches_text(
                    [
                        title,
                        identity.get("identity_name"),
                        identity.get("name"),
                        identity.get("identity_id"),
                        identity.get("description"),
                        identity.get("appearance_details"),
                        identity.get("prompt"),
                        identity.get("role"),
                        name,
                        role,
                    ],
                    requested_queries,
                )
                if not identity_name_match or not identity_query_match:
                    continue
                media_items.append(
                    {
                        "src": src,
                        "title": f"{name} · {title}" if name else title,
                        "description": role,
                        "aspectRatio": "3/4",
                    }
                )
    limited = _limit_items(media_items, args, 12)
    return [_media_ui_spec("character_showcase", "Image", limited)] if limited else []


def project_episode_media_specs(
    args: dict[str, Any],
    response: Any,
) -> list[dict[str, Any]]:
    media_type = str(args.get("media_type") or "video").strip().lower()
    video_items: list[dict[str, Any]] = []
    audio_items: list[dict[str, Any]] = []
    requested_beats = _requested_beats(args)
    requested_queries = _requested_queries(args)
    for beat in _response_items(response, "beats", "items"):
        if not isinstance(beat, dict):
            continue
        beat_number = beat.get("beat_number")
        try:
            beat_int = int(beat_number)
        except (TypeError, ValueError):
            beat_int = None
        if requested_beats is not None and beat_int not in requested_beats:
            continue
        if not _matches_text(
            [
                beat.get("title"),
                beat.get("summary"),
                beat.get("description"),
                beat.get("visual_description"),
                beat.get("image_prompt"),
                beat.get("video_prompt"),
                beat.get("narration"),
                beat.get("voiceover"),
                beat.get("dialogue"),
                beat.get("audio_text"),
                beat.get("speaker"),
                beat.get("character_names"),
                beat.get("characters"),
                beat.get("scene_name"),
                beat.get("location"),
            ],
            requested_queries,
        ):
            continue
        video_url = str(beat.get("video_url") or "").strip()
        audio_url = str(beat.get("audio_url") or "").strip()
        frame_url = str(beat.get("frame_url") or beat.get("sketch_url") or "").strip()
        if video_url:
            video_items.append(
                {
                    "src": video_url,
                    "poster": frame_url,
                    "title": f"Beat {beat_number} 视频",
                }
            )
        if audio_url:
            audio_items.append({"src": audio_url, "title": f"Beat {beat_number} 音频"})
    if media_type == "audio":
        limited = _limit_items(audio_items, args, 20)
        return [_media_ui_spec("audio_list", "Audio", limited)] if limited else []
    limited = _limit_items(video_items, args, 6)
    return [_media_ui_spec("keyframe_video", "Video", limited)] if limited else []


__all__ = [
    "character_identity_requests",
    "display_candidate_beat",
    "display_episode",
    "project_beat_image_specs",
    "project_character_media_specs",
    "project_episode_media_specs",
    "project_scene_image_specs",
    "project_sketch_candidate_specs",
]
