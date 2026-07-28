"""AI chat service with project-scoped history and user-level agent sessions."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse
from urllib.request import Request, urlopen

from ai_anime.chat.backend_sdk import (
    ClaudeSdkClient,
    CodexClient,
    _codex_item_completed_trace,
    _codex_item_started_trace,
    _codex_unwrap_item,
    interrupt_live_claude_client,
    interrupt_live_codex_turn,
)
from ai_anime.chat.runtime_config import load_api_url
from ai_anime.modules.ai_assistant.public import (
    append_tool_ui_specs,
    build_agent_prompt_context,
    completion_text_or_existing,
    create_page_agent_session_token,
    dedupe_tool_ui_specs,
    display_tool_call_key,
    extract_display_tool_call,
    extract_tool_ui_specs,
    filter_tool_ui_specs_for_prompt,
    get_agent_backend,
    get_agent_thread_sessions,
    get_agent_tool_configuration,
    get_agent_workspace,
    get_chat_history,
    get_chat_run_locks,
    is_hidden_chat_tool_event,
    infer_display_tool_call_from_text,
    is_display_tool_name,
    merge_stream_text,
    normalize_json_render_reply,
    reingest_confirmation_reply,
    redact_local_filesystem_paths,
    script_creation_guidance_prompt,
    split_trace_contents,
    strip_replayed_chat_response,
    strip_streamed_assistant_replay,
    tool_chat_error,
)
from ai_anime.utils.static_urls import project_static_url

logger = logging.getLogger("ai_anime.chat.service")
agent_backend = get_agent_backend()
agent_thread_sessions = get_agent_thread_sessions()
agent_tool_configuration = get_agent_tool_configuration()
agent_workspace = get_agent_workspace()
chat_history = get_chat_history()
chat_run_locks = get_chat_run_locks()

_MEDIA_EXTENSIONS = {
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".gif": "image",
    ".mp4": "video",
    ".mov": "video",
    ".webm": "video",
    ".wav": "audio",
    ".mp3": "audio",
    ".m4a": "audio",
}
_URL_RE = re.compile(r"(https?://[^\s)>\"]+|/static/[^\s)>\"]+)")
_REL_PATH_RE = re.compile(
    r"(?P<path>(?:assets|videos|audio|images|frames|sketches|grids|uploads|scripts)/[^\s)>\"]+\.(?:png|jpg|jpeg|webp|gif|mp4|mov|webm|wav|mp3|m4a))"
)
_MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
_REINGEST_CANCELLED_BLOCK_RE = re.compile(
    r"\[AI_ANIME_REINGEST_CANCELLED\](.*?)\[/AI_ANIME_REINGEST_CANCELLED\]",
    re.DOTALL,
)


def _media_path_from_static_url(url: str) -> str | None:
    parsed = urlparse(url)
    path = parsed.path if parsed.scheme in {"http", "https"} else url.split("?", 1)[0]
    if not path.startswith("/static/"):
        return None
    rel = path[len("/static/") :]
    parts = rel.split("/", 2)
    if len(parts) == 3:
        return unquote(parts[2])
    return unquote(rel)


def _canonical_project_static_media_url(
    project_id: str,
    project_dir: Path,
    url_or_path: str,
) -> tuple[str, str] | None:
    media_path = _media_path_from_static_url(url_or_path)
    if media_path is None:
        media_path = url_or_path.strip().split("?", 1)[0].lstrip("./")
    if not media_path:
        return None
    local_path = project_dir / media_path
    return project_static_url(project_id, media_path, local_path=local_path), media_path


def _media_project_dir(
    username: str,
    project: str,
    project_dir: str | Path | None = None,
) -> Path:
    return (
        Path(project_dir)
        if project_dir is not None
        else _project_dir(username, project)
    )


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _output_root() -> Path:
    configured = os.environ.get("AI_ANIME_OUTPUT_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return _repo_root() / "output"


def _state_root() -> Path:
    configured = os.environ.get("AI_ANIME_STATE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return _repo_root() / "state"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_dir(username: str, project: str) -> Path:
    base_dir = _output_root() / username / project
    for path in (
        base_dir,
        base_dir / "graph",
        base_dir / "assets",
        base_dir / "assets" / "characters",
        base_dir / "scripts",
        base_dir / "images",
        base_dir / "audio",
        base_dir / "videos",
        base_dir / "uploads",
    ):
        path.mkdir(parents=True, exist_ok=True)
    return base_dir


def _project_state_dir(username: str, project: str) -> Path:
    base_dir = _state_root() / username / project
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir


def _chat_input_history_path(username: str, project: str) -> Path:
    return _project_state_dir(username, project) / "chat_input_history.json"


def load_chat_input_history(username: str, project: str) -> list[str]:
    if not username or not project:
        return []
    path = _chat_input_history_path(username, project)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(payload, list):
        return []
    history: list[str] = []
    for item in payload:
        text = str(item or "").strip()
        if text:
            history.append(text)
    return history


def save_chat_input_history(
    username: str, project: str, history: list[str], *, limit: int = 200
) -> None:
    if not username or not project:
        return
    cleaned: list[str] = []
    for item in history:
        text = str(item or "").strip()
        if text:
            cleaned.append(text)
    if limit > 0:
        cleaned = cleaned[-limit:]
    path = _chat_input_history_path(username, project)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps(cleaned, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_path.replace(path)


def _get_setting(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute(
        "SELECT value FROM chat_settings WHERE key = ?", (key,)
    ).fetchone()
    return str(row["value"]) if row else None


def _set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        """
        INSERT INTO chat_settings(key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        """,
        (key, value, _now_iso()),
    )
    conn.commit()


async def _emit_chat_event_best_effort(on_event, event: dict[str, Any]) -> bool:
    """Emit to the connected client without making persistence depend on it."""
    try:
        await on_event(event)
        return True
    except Exception:
        return False


def _limit_display_items(
    items: list[dict[str, Any]], args: dict[str, Any], default: int
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


def _requested_display_beats(args: dict[str, Any]) -> set[int] | None:
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


def _requested_display_names(args: dict[str, Any]) -> set[str] | None:
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


def _requested_display_queries(args: dict[str, Any]) -> set[str] | None:
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


def _requested_display_scene_names(args: dict[str, Any]) -> set[str] | None:
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


def _requested_display_scene_indices(args: dict[str, Any]) -> set[int] | None:
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


def _matches_any_display_scene_name(
    scene_name: str, requested_names: set[str] | None
) -> bool:
    if requested_names is None:
        return True
    haystack = str(scene_name or "").casefold()
    return any(needle.casefold() in haystack for needle in requested_names if needle)


def _flatten_display_text_fields(fields: list[Any]) -> list[str]:
    values: list[str] = []
    for field in fields:
        if isinstance(field, dict):
            values.extend(_flatten_display_text_fields(list(field.values())))
        elif isinstance(field, list):
            values.extend(_flatten_display_text_fields(field))
        elif field is not None:
            text = str(field).strip()
            if text:
                values.append(text)
    return values


def _matches_any_display_text(fields: list[Any], queries: set[str] | None) -> bool:
    if queries is None:
        return True
    haystack = "\n".join(_flatten_display_text_fields(fields)).casefold()
    return any(query.casefold() in haystack for query in queries if query)


def _media_ui_spec(
    spec_type: str, component_type: str, items: list[dict[str, Any]]
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


def _project_static_url_from_path(
    project_id: str, rel_path: str, local_path: Path | None = None
) -> str:
    return project_static_url(project_id, rel_path, local_path=local_path)


def _api_response_items(resp: Any, *keys: str) -> list[Any]:
    if not isinstance(resp, dict):
        return []
    for key in keys:
        value = resp.get(key)
        if isinstance(value, list):
            return value
    data = resp.get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in keys:
            value = data.get(key)
            if isinstance(value, list):
                return value
    return []


def _backend_api_get(path: str, token: str) -> dict[str, Any]:
    base_url = load_api_url()
    url = f"{base_url.rstrip('/')}{path}"
    req = Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "ai-anime-chat-fallback/0.1.0",
        },
        method="GET",
    )
    with urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return {"ok": False, "error": text[:500]}
    return value if isinstance(value, dict) else {"ok": True, "data": value}


async def _fallback_display_tool_ui_specs(
    username: str,
    project: str,
    tool_name: str,
    args: dict[str, Any],
    *,
    token: str,
    project_dir: str | Path | None = None,
) -> list[dict[str, Any]]:
    if not project or not is_display_tool_name(tool_name):
        return []

    def build() -> list[dict[str, Any]]:
        api_project = str(
            args.get("project_id") or args.get("project") or project
        ).strip()
        project_q = quote(api_project, safe="")
        if tool_name in {"ai_anime_get_sketches", "ai_anime_get_first_frames"}:
            episode = int(args.get("episode") or 1)
            media_kind = (
                "frame" if tool_name == "ai_anime_get_first_frames" else "sketch"
            )
            resp = _backend_api_get(
                f"/api/v1/projects/{project_q}/episodes/{episode}/beats",
                token,
            )
            media_items: list[dict[str, Any]] = []
            requested_beats = _requested_display_beats(args)
            for beat in _api_response_items(resp, "beats", "items"):
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
            limited = _limit_display_items(media_items, args, 12)
            return (
                [_media_ui_spec("sketch_gallery", "Image", limited)] if limited else []
            )

        if tool_name == "ai_anime_get_sketch_candidates":
            episode = int(args.get("episode") or 1)
            try:
                beat = int(
                    args.get("beat")
                    or args.get("beat_num")
                    or args.get("beat_number")
                    or 0
                )
            except (TypeError, ValueError):
                beat = 0
            if beat <= 0:
                return []
            resp = _backend_api_get(
                f"/api/v1/projects/{project_q}/episodes/{episode}/beats/{beat}/sketch-candidates",
                token,
            )
            data = resp.get("data") if isinstance(resp, dict) else None
            candidates = data.get("candidates") if isinstance(data, dict) else []
            media_items = []
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
                        "description": "过期候选"
                        if candidate.get("stale")
                        else "草图候选",
                        "aspectRatio": "3/4",
                    }
                )
            limited = _limit_display_items(media_items, args, 12)
            return (
                [_media_ui_spec("sketch_gallery", "Image", limited)] if limited else []
            )

        if tool_name == "ai_anime_get_scene_images":
            resp = _backend_api_get(f"/api/v1/projects/{project_q}/scenes", token)
            media_items = []
            include_reverse = bool(args.get("include_reverse", True))
            include_pano = bool(args.get("include_pano", False))
            include_custom = bool(args.get("include_custom", False))
            requested_names = _requested_display_scene_names(args)
            requested_indices = _requested_display_scene_indices(args)
            requested_type = str(args.get("scene_type") or "").strip()
            for scene_index, scene in enumerate(
                _api_response_items(resp, "scenes", "items"), start=1
            ):
                if not isinstance(scene, dict):
                    continue
                scene_name = str(scene.get("name") or "").strip()
                scene_type = str(scene.get("scene_type") or "").strip()
                if (
                    requested_indices is not None
                    and scene_index not in requested_indices
                ):
                    continue
                if not _matches_any_display_scene_name(scene_name, requested_names):
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
            limited = _limit_display_items(media_items, args, 12)
            return (
                [_media_ui_spec("sketch_gallery", "Image", limited)] if limited else []
            )

        if tool_name == "ai_anime_get_character_media":
            resp = _backend_api_get(f"/api/v1/projects/{project_q}/characters", token)
            media_kind = (
                str(args.get("media_kind") or args.get("kind") or "all").strip().lower()
            )
            if media_kind not in {"all", "portrait", "identity"}:
                media_kind = "all"
            include_identities = (
                bool(args.get("include_identities", True)) and media_kind != "portrait"
            )
            media_items = []
            requested_names = _requested_display_names(args)
            requested_queries = _requested_display_queries(args)
            for character in _api_response_items(resp, "characters", "items"):
                if not isinstance(character, dict):
                    continue
                name = str(character.get("name") or "").strip()
                role = str(
                    character.get("role") or character.get("description") or ""
                ).strip()
                character_name_match = _matches_any_display_text(
                    [name, character.get("aliases")],
                    requested_names,
                )
                character_query_match = _matches_any_display_text(
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
                if portrait_url and character_match:
                    if media_kind in {"all", "portrait"}:
                        media_items.append(
                            {
                                "src": portrait_url,
                                "title": name or "角色肖像",
                                "description": role,
                                "aspectRatio": "3/4",
                            }
                        )
                identities = (
                    character.get("identities")
                    or character.get("identity_images")
                    or []
                )
                if include_identities:
                    try:
                        identities_resp = _backend_api_get(
                            f"/api/v1/projects/{project_q}/characters/{quote(name, safe='')}/identities",
                            token,
                        )
                        for key in ("data", "identities", "items"):
                            value = (
                                identities_resp.get(key)
                                if isinstance(identities_resp, dict)
                                else None
                            )
                            if isinstance(value, list):
                                identities = value
                                break
                        data = (
                            identities_resp.get("data")
                            if isinstance(identities_resp, dict)
                            else None
                        )
                        if isinstance(data, dict):
                            value = data.get("identities")
                            if isinstance(value, list):
                                identities = value
                    except Exception:
                        pass
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
                        if src:
                            title = str(
                                identity.get("identity_name")
                                or identity.get("name")
                                or identity.get("identity_id")
                                or name
                                or "身份图"
                            )
                            identity_name_match = _matches_any_display_text(
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
                            identity_query_match = _matches_any_display_text(
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
                            identity_match = (
                                identity_name_match and identity_query_match
                            )
                            if not identity_match:
                                continue
                            media_items.append(
                                {
                                    "src": src,
                                    "title": f"{name} · {title}" if name else title,
                                    "description": role,
                                    "aspectRatio": "3/4",
                                }
                            )
            limited = _limit_display_items(media_items, args, 12)
            return (
                [_media_ui_spec("character_showcase", "Image", limited)]
                if limited
                else []
            )

        if tool_name == "ai_anime_get_episode_media":
            episode = int(args.get("episode") or 1)
            media_type = str(args.get("media_type") or "video").strip().lower()
            resp = _backend_api_get(
                f"/api/v1/projects/{project_q}/episodes/{episode}/beats",
                token,
            )
            video_items: list[dict[str, Any]] = []
            audio_items: list[dict[str, Any]] = []
            requested_beats = _requested_display_beats(args)
            requested_queries = _requested_display_queries(args)
            for beat in _api_response_items(resp, "beats", "items"):
                if not isinstance(beat, dict):
                    continue
                beat_number = beat.get("beat_number")
                try:
                    beat_int = int(beat_number)
                except (TypeError, ValueError):
                    beat_int = None
                if requested_beats is not None and beat_int not in requested_beats:
                    continue
                if not _matches_any_display_text(
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
                frame_url = str(
                    beat.get("frame_url") or beat.get("sketch_url") or ""
                ).strip()
                if video_url:
                    video_items.append(
                        {
                            "src": video_url,
                            "poster": frame_url,
                            "title": f"Beat {beat_number} 视频",
                        }
                    )
                if audio_url:
                    audio_items.append(
                        {"src": audio_url, "title": f"Beat {beat_number} 音频"}
                    )
            if media_type == "audio":
                limited = _limit_display_items(audio_items, args, 20)
                return (
                    [_media_ui_spec("audio_list", "Audio", limited)] if limited else []
                )
            limited = _limit_display_items(video_items, args, 6)
            return (
                [_media_ui_spec("keyframe_video", "Video", limited)] if limited else []
            )

        return []

    try:
        return await asyncio.to_thread(build)
    except Exception as exc:
        logger.info(
            "display fallback failed project=%s tool=%s args=%s error=%s",
            project,
            tool_name,
            json.dumps(args, ensure_ascii=False, sort_keys=True, default=str)[:1000],
            exc,
        )
        return []


def _assistant_history_contents(
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> list[str]:
    return [
        str(message.get("content") or "")
        for message in list_messages(
            username,
            project,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if message.get("role") == "assistant"
    ]


def _trace_history_contents(
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> list[str]:
    return chat_history.list_project_trace_contents(
        username,
        project,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def _extract_codex_user_message_text(item: Any) -> str:
    thread_item = _codex_unwrap_item(item)
    parts: list[str] = []
    for content in getattr(thread_item, "content", []) or []:
        item_type = str(getattr(content, "type", "") or "")
        if item_type == "text":
            text = str(getattr(content, "text", "") or "").strip()
            if text:
                parts.append(text)
        elif item_type == "skill":
            name = str(getattr(content, "name", "") or "").strip()
            if name:
                parts.append(f"[skill] {name}")
        elif item_type == "mention":
            name = str(getattr(content, "name", "") or "").strip()
            path = str(getattr(content, "path", "") or "").strip()
            parts.append(f"[mention] {name or path}".strip())
        elif item_type == "image":
            url = str(getattr(content, "url", "") or "").strip()
            if url:
                parts.append(f"[image] {url}")
        elif item_type == "localImage":
            path = str(getattr(content, "path", "") or "").strip()
            if path:
                parts.append(f"[image] {path}")
    return "\n".join(part for part in parts if part).strip()


def _extract_codex_history_trace(item: Any) -> str:
    from openai_codex.generated.v2_all import CommandExecutionThreadItem

    thread_item = _codex_unwrap_item(item)
    started = _codex_item_started_trace(thread_item) or ""
    completed = _codex_item_completed_trace(thread_item) or ""
    body = ""
    if isinstance(thread_item, CommandExecutionThreadItem):
        aggregated = str(thread_item.aggregated_output or "")
        if aggregated:
            body = aggregated
            if not body.endswith("\n"):
                body += "\n"
    return (started + body + completed).strip()


def _load_codex_thread_history(username: str, project: str) -> list[dict[str, Any]]:
    from openai_codex import Codex, CodexConfig
    from openai_codex.generated.v2_all import (
        AgentMessageThreadItem,
        UserMessageThreadItem,
    )

    thread_id = agent_thread_sessions.get_active(username, "codex")
    if not thread_id:
        return []

    workspace = agent_workspace.ensure_codex(username)
    codex_bin = agent_backend.codex_bin_path()
    config = CodexConfig(
        codex_bin=str(codex_bin) if codex_bin is not None else None,
        cwd=str(workspace),
        env=agent_workspace.build_environment(username, project),
        config_overrides=agent_tool_configuration.codex_config_overrides(),
    )

    with Codex(config=config) as codex:
        read_response = codex._client.thread_read(thread_id, include_turns=True)
        thread = read_response.thread
        turns = list(getattr(thread, "turns", []) or [])
        if not turns or not any(getattr(turn, "items", None) for turn in turns):
            resumed = codex._client.thread_resume(
                thread_id,
                {
                    "cwd": str(workspace),
                    "model": agent_backend.codex_model(),
                },
            )
            turns = list(getattr(resumed.thread, "turns", []) or [])

    history: list[dict[str, Any]] = []
    for turn_index, turn in enumerate(turns):
        for item_index, item in enumerate(getattr(turn, "items", []) or []):
            thread_item = _codex_unwrap_item(item)
            created_at = _now_iso()
            if isinstance(thread_item, UserMessageThreadItem):
                content = _extract_codex_user_message_text(thread_item)
                if content:
                    history.append(
                        {
                            "id": turn_index * 1000 + item_index,
                            "role": "user",
                            "content": content,
                            "media": _filter_markdown_duplicate_images(
                                content,
                                _extract_media(content, username, project),
                            ),
                            "created_at": created_at,
                        }
                    )
                continue
            if isinstance(thread_item, AgentMessageThreadItem):
                content = str(thread_item.text or "").strip()
                if content:
                    media = _extract_media(content, username, project)
                    history.append(
                        {
                            "id": turn_index * 1000 + item_index,
                            "role": "assistant",
                            "content": content,
                            "media": _filter_markdown_duplicate_images(content, media),
                            "created_at": created_at,
                        }
                    )
                continue

            trace = _extract_codex_history_trace(thread_item)
            if trace:
                for block_index, block in enumerate(split_trace_contents(trace)):
                    history.append(
                        {
                            "id": turn_index * 10000 + item_index * 10 + block_index,
                            "role": "trace",
                            "content": block,
                            "media": [],
                            "created_at": created_at,
                        }
                    )

    return history


def _sync_codex_history_cache(
    username: str,
    project: str,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> None:
    history = [
        message
        for message in _load_codex_thread_history(username, project)
        if message.get("role") == "trace"
    ]
    if not history:
        return
    chat_history.replace_project_trace_messages(
        username,
        project,
        history,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def list_messages(
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    stored_messages = chat_history.list_project_messages(
        username,
        project,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
        limit=limit,
    )
    messages: list[dict[str, Any]] = []
    previous_assistants: list[str] = []
    for message in stored_messages:
        content = str(message["content"])
        role = str(message["role"])
        if role == "assistant":
            raw_content = content
            content = strip_streamed_assistant_replay(content, previous_assistants)
            previous_assistants.append(raw_content)
        stored_media = _normalize_media_items(
            message.get("media") or [],
            username,
            project,
            project_dir=project_dir,
        )
        extracted_media = _extract_media(
            content, username, project, project_dir=project_dir
        )
        merged_media = _merge_media_items(stored_media, extracted_media)
        messages.append(
            {
                "id": int(message["id"]),
                "role": role,
                "content": content,
                "media": _filter_markdown_duplicate_images(content, merged_media),
                "created_at": str(message["created_at"]),
            }
        )
    return messages


def add_user_message(
    username: str,
    project: str,
    content: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    return chat_history.append_project_message(
        username,
        project,
        "user",
        content,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def add_assistant_message(
    username: str,
    project: str,
    content: str,
    media: list[dict[str, Any]] | None = None,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    content = redact_local_filesystem_paths(content)
    return chat_history.append_project_message(
        username,
        project,
        "assistant",
        content,
        media,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def add_trace_message(
    username: str,
    project: str,
    content: str,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    return chat_history.append_project_message(
        username,
        project,
        "trace",
        content,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def add_trace_messages(
    username: str,
    project: str,
    contents: list[str],
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> list[dict[str, Any]]:
    return chat_history.append_project_trace_messages(
        username,
        project,
        contents,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )


def _extract_media(
    content: str,
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
) -> list[dict[str, str]]:
    media_project_dir = _media_project_dir(username, project, project_dir)
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    markdown_images = _collect_markdown_image_refs(content)

    def add_item(raw_url: str, path: str | None = None) -> None:
        candidate = raw_url.strip(".,;)]}")
        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.path.startswith("/static/"):
            candidate = parsed.path
        if candidate.startswith("/static/"):
            canonical = _canonical_project_static_media_url(
                project, media_project_dir, candidate
            )
            if canonical is None:
                return
            candidate, path = canonical
        ext = Path(urlparse(candidate).path).suffix.lower()
        kind = _MEDIA_EXTENSIONS.get(ext)
        if not kind:
            return
        if kind == "image" and (
            candidate in markdown_images
            or (path and path in markdown_images)
            or (path and path.lstrip("./") in markdown_images)
        ):
            return
        effective_path = path or ""
        if not effective_path:
            effective_path = _media_path_from_static_url(candidate) or ""
        key = f"{kind}:{effective_path or candidate}"
        if key in seen:
            return
        seen.add(key)
        items.append(
            {
                "kind": kind,
                "url": candidate,
                "path": effective_path,
                "label": Path(effective_path or candidate).name,
            }
        )

    for match in _URL_RE.finditer(content):
        url = match.group(1)
        if url.startswith("/static/"):
            add_item(url)
        else:
            add_item(url)

    for match in _REL_PATH_RE.finditer(content):
        rel_path = match.group("path")
        full_path = media_project_dir / rel_path
        if full_path.exists():
            static_url = project_static_url(project, rel_path, local_path=full_path)
            add_item(static_url, rel_path)

    return items


def _collect_markdown_image_refs(content: str) -> set[str]:
    refs: set[str] = set()

    for match in _MARKDOWN_IMAGE_RE.finditer(content):
        raw = (match.group(1) or "").strip().strip("<>").strip(".,;)]}")
        if not raw:
            continue
        refs.add(raw)
        parsed = urlparse(raw)
        path = (
            parsed.path if parsed.scheme in {"http", "https"} else raw.split("?", 1)[0]
        )
        if path:
            refs.add(path)
        static_path = _media_path_from_static_url(raw)
        if static_path:
            refs.add(static_path)
            refs.add(static_path.lstrip("./"))
        elif parsed.scheme in {"http", "https"} and parsed.path.startswith("/static/"):
            refs.add(parsed.path)
        elif raw.startswith("/static/"):
            refs.add(raw.split("?", 1)[0])
        else:
            refs.add(path.lstrip("./") if path else raw.lstrip("./"))

    return refs


def _normalize_media_items(
    media: list[dict[str, Any]],
    username: str,
    project: str,
    *,
    project_dir: str | Path | None = None,
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    seen: set[str] = set()
    media_project_dir = _media_project_dir(username, project, project_dir)

    for item in media:
        if not isinstance(item, dict):
            continue

        candidate = str(item.get("url", "") or "").strip()
        path = str(item.get("path", "") or "").strip()
        if not candidate and not path:
            continue

        if not candidate and path:
            canonical = _canonical_project_static_media_url(
                project, media_project_dir, path
            )
            if canonical is None:
                continue
            candidate, path = canonical

        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.path.startswith("/static/"):
            candidate = parsed.path
        if candidate.startswith("/static/"):
            canonical = _canonical_project_static_media_url(
                project, media_project_dir, candidate
            )
            if canonical is None:
                continue
            candidate, path = canonical

        ext = Path(urlparse(candidate).path).suffix.lower()
        kind = _MEDIA_EXTENSIONS.get(ext)
        if not kind:
            continue

        if not path:
            path = _media_path_from_static_url(candidate) or ""

        key = f"{kind}:{path or candidate}"
        if key in seen:
            continue
        seen.add(key)

        normalized.append(
            {
                "kind": kind,
                "url": candidate,
                "path": path,
                "label": str(item.get("label", "") or Path(path or candidate).name),
            }
        )

    return normalized


def _merge_media_items(*groups: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    seen: set[str] = set()

    for group in groups:
        for item in group:
            kind = str(item.get("kind", "") or "").strip()
            url = str(item.get("url", "") or "").strip()
            path = str(item.get("path", "") or "").strip()
            if not kind or not url:
                continue
            key = f"{kind}:{path or url}"
            if key in seen:
                continue
            seen.add(key)
            merged.append(
                {
                    "kind": kind,
                    "url": url,
                    "path": path,
                    "label": str(item.get("label", "") or Path(path or url).name),
                }
            )

    return merged


def _filter_markdown_duplicate_images(
    content: str, media: list[dict[str, str]]
) -> list[dict[str, str]]:
    markdown_images = _collect_markdown_image_refs(content)
    if not markdown_images:
        return media

    filtered: list[dict[str, str]] = []
    for item in media:
        kind = str(item.get("kind", "") or "").strip()
        if kind != "image":
            filtered.append(item)
            continue

        url = str(item.get("url", "") or "").strip()
        path = str(item.get("path", "") or "").strip()
        if (
            url in markdown_images
            or (path and path in markdown_images)
            or (path and path.lstrip("./") in markdown_images)
        ):
            continue
        filtered.append(item)

    return filtered


def _build_claude_thread(username: str, project: str, agent_token: str):
    workspace = agent_workspace.ensure_claude(username, project, agent_token)
    client = ClaudeSdkClient(
        cli_path=agent_backend.claude_cli_path(),
        cwd=workspace,
        env=agent_workspace.build_environment(username, project, agent_token),
        model=agent_backend.claude_model(),
    )
    session_id = agent_thread_sessions.get_active(username, "claude")
    return client.thread_resume(session_id) if session_id else client.thread_start()


def _build_codex_thread(username: str, project: str, agent_token: str):
    workspace = agent_workspace.ensure_codex(username)
    client = CodexClient(
        codex_bin=agent_backend.codex_bin_path(),
        cwd=workspace,
        env=agent_workspace.build_environment(username, project, agent_token),
        model=agent_backend.codex_model(),
        config_overrides=agent_tool_configuration.codex_config_overrides(),
    )
    thread_id = agent_thread_sessions.get_active(username, "codex")
    return client.thread_resume(thread_id) if thread_id else client.thread_start()


async def interrupt_chat_turn(
    username: str, project: str, thread_id: str, turn_id: str
) -> bool:
    thread_id = str(thread_id or "").strip()
    turn_id = str(turn_id or "").strip()
    backend = agent_backend.name()
    if backend == "claude":
        if not thread_id:
            return False
        try:
            return await interrupt_live_claude_client(thread_id)
        except Exception as exc:
            if "closed stdout" in str(exc):
                return True
            raise
    if backend == "codex":
        if not thread_id or not turn_id:
            return False
        try:
            return await asyncio.to_thread(
                interrupt_live_codex_turn, thread_id, turn_id
            )
        except Exception as exc:
            if "app-server closed stdout" in str(exc):
                return True
            raise
    return False


async def stream_assistant_reply(
    username: str,
    project: str,
    prompt: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    run_lock_id = chat_run_locks.acquire(username, project)
    heartbeat_task = asyncio.create_task(
        chat_run_locks.maintain(username, project, run_lock_id)
    )
    try:
        deterministic = reingest_confirmation_reply(prompt)
        if deterministic is not None:
            return await _stream_deterministic_assistant_reply(
                username,
                project,
                deterministic,
                on_event,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        model_prompt = script_creation_guidance_prompt(prompt) or prompt
        backend = agent_backend.name()
        if backend == "codex":
            return await _stream_assistant_reply_codex(
                username,
                project,
                model_prompt,
                on_event,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        if backend == "hermes":
            return await _stream_assistant_reply_hermes(
                username,
                project,
                model_prompt,
                on_event,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        if backend != "claude":
            raise RuntimeError(f"Unsupported chat backend: {backend}")
        return await _stream_assistant_reply_claude(
            username,
            project,
            model_prompt,
            on_event,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        chat_run_locks.release(username, project, run_lock_id)


async def _stream_deterministic_assistant_reply(
    username: str,
    project: str,
    content: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    content = redact_local_filesystem_paths(content)
    message = add_assistant_message(
        username,
        project,
        content,
        [],
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )
    await _emit_chat_event_best_effort(
        on_event, {"type": "assistant_delta", "text": content}
    )
    await _emit_chat_event_best_effort(on_event, {"type": "done", "message": message})
    return message


async def prewarm_chat_backend(username: str, *, project: str | None = None) -> None:
    """Best-effort pre-warm of the per-user agent worker.

    Called when the user opens a chat / switches project so the first real
    message doesn't pay the full cold-start (spawn → initialize → session/new
    with startup probes). No-op unless the hermes backend is active; never
    raises — pre-warming is purely an optimization.
    """
    try:
        if agent_backend.name() != "hermes":
            return
        from ai_anime.chat.hermes_pool import pool as _hermes_pool

        await _hermes_pool.prewarm(
            username,
            scope_kind="project" if project else "home",
            project_id=project or None,
        )
    except Exception:
        return


async def _stream_assistant_reply_hermes(
    username: str,
    project: str,
    prompt: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Stream via Hermes ACP subprocess (per-user, sandboxed).

    Differs from claude/codex paths:
    - Hermes is per-USER not per-(user, project). Project context is injected
      as a prompt prefix via `current_project=project`.
    - No per-project chat.db session id; HermesPool owns the thread lifecycle.
    """
    from ai_anime.chat.hermes_pool import pool as _hermes_pool

    agent_prompt = build_agent_prompt_context(username, project, prompt)
    thread = await _hermes_pool.get_for_user(
        username,
        scope_kind="project" if project else "home",
        project_id=project or None,
    )
    previous_assistant = (
        _assistant_history_contents(
            username,
            project,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if project
        else []
    )
    previous_trace = (
        _trace_history_contents(
            username,
            project,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        if project
        else []
    )
    assistant_text = ""
    tool_text = ""
    tool_ui_specs: list[dict[str, Any]] = []
    fallback_tool_ui_specs: list[dict[str, Any]] = []
    fallback_token: str | None = None
    current_tool_name: str | None = None
    current_tool_hidden = False
    persisted_message: dict[str, Any] | None = None
    seen_display_calls: set[str] = set()
    seen_tool_chat_errors: set[str] = set()

    def persist_partial_reply() -> dict[str, Any] | None:
        nonlocal persisted_message, assistant_text, tool_text
        if persisted_message is not None:
            return persisted_message
        final_text = strip_replayed_chat_response(
            assistant_text, previous_assistant, prompt
        ).strip()
        all_tool_ui_specs = dedupe_tool_ui_specs(
            [*tool_ui_specs, *fallback_tool_ui_specs]
        )
        all_tool_ui_specs = filter_tool_ui_specs_for_prompt(prompt, all_tool_ui_specs)
        final_text = append_tool_ui_specs(final_text, all_tool_ui_specs)
        if not final_text:
            return None
        final_text = normalize_json_render_reply(final_text)
        final_tool_text = strip_streamed_assistant_replay(tool_text, previous_trace)
        if final_tool_text.strip():
            add_trace_messages(
                username,
                project,
                split_trace_contents(final_tool_text),
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        media = _extract_media(final_text, username, project, project_dir=project_dir)
        persisted_message = add_assistant_message(
            username,
            project,
            final_text,
            media,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        return persisted_message

    try:
        async for event in thread.stream(agent_prompt, current_project=project or None):
            if event.type == "thread_started":
                await _emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "thread_started",
                        "thread_id": str(event.thread_id or "").strip() or None,
                        "turn_id": str(event.turn_id or "").strip() or None,
                    },
                )
                continue
            if event.type == "assistant_delta":
                assistant_text = merge_stream_text(assistant_text, event.text)
                streamed_text = strip_replayed_chat_response(
                    assistant_text,
                    previous_assistant,
                    prompt,
                    suppress_partial_replay=True,
                )
                streamed_text = redact_local_filesystem_paths(streamed_text)
                await _emit_chat_event_best_effort(
                    on_event,
                    {
                        "type": "assistant_delta",
                        "text": streamed_text,
                    },
                )
                continue
            if event.type == "tool_update":
                if event.raw is not None:
                    mapped_chat_error = tool_chat_error(event.raw)
                    if (
                        mapped_chat_error
                        and mapped_chat_error not in seen_tool_chat_errors
                    ):
                        seen_tool_chat_errors.add(mapped_chat_error)
                        assistant_text = merge_stream_text(
                            assistant_text,
                            ("\n\n" if assistant_text.strip() else "")
                            + mapped_chat_error,
                        )
                        await _emit_chat_event_best_effort(
                            on_event,
                            {
                                "type": "assistant_delta",
                                "text": redact_local_filesystem_paths(
                                    mapped_chat_error
                                ),
                            },
                        )
                    tool_ui_specs.extend(extract_tool_ui_specs(event.raw))
                    display_call = extract_display_tool_call(event.raw)
                    if display_call is not None:
                        tool_name, tool_args = display_call
                        display_call_key = display_tool_call_key(tool_name, tool_args)
                        if display_call_key in seen_display_calls:
                            logger.info(
                                "filtered duplicate hermes display fallback "
                                "turn_id=%s project=%s tool=%s args=%s raw_kind=%s",
                                event.turn_id,
                                project,
                                tool_name,
                                json.dumps(
                                    tool_args,
                                    ensure_ascii=False,
                                    sort_keys=True,
                                    default=str,
                                )[:1000],
                                event.raw.get("sessionUpdate")
                                if isinstance(event.raw, dict)
                                else None,
                            )
                        else:
                            seen_display_calls.add(display_call_key)
                            if fallback_token is None:
                                fallback_token = await create_page_agent_session_token(
                                    username,
                                    project,
                                    agent_kind="hermes-display-fallback",
                                )
                            fallback_tool_ui_specs.extend(
                                await _fallback_display_tool_ui_specs(
                                    username,
                                    project,
                                    tool_name,
                                    tool_args,
                                    token=fallback_token,
                                    project_dir=project_dir,
                                )
                            )
                if event.name:
                    current_tool_name = event.name
                    current_tool_hidden = is_hidden_chat_tool_event(
                        event.name, event.text
                    )
                if current_tool_hidden or is_hidden_chat_tool_event(
                    current_tool_name, event.text
                ):
                    continue
                tool_text += str(event.text or "") + "\n"
                display_tool_text = strip_streamed_assistant_replay(
                    tool_text, previous_trace
                )
                if display_tool_text.strip():
                    await _emit_chat_event_best_effort(
                        on_event,
                        {
                            "type": "tool_update",
                            "text": display_tool_text,
                            "name": current_tool_name,
                        },
                    )
                continue
            if event.type == "complete":
                if seen_tool_chat_errors and assistant_text.strip():
                    continue
                assistant_text = completion_text_or_existing(
                    event.text, assistant_text
                )

        if not assistant_text.strip():
            assistant_text = "(hermes returned no content)"
        if not tool_ui_specs and not fallback_tool_ui_specs:
            inferred_display_call = infer_display_tool_call_from_text(
                prompt,
                assistant_text,
                previous_assistant,
            )
            if inferred_display_call is not None:
                tool_name, tool_args = inferred_display_call
                if fallback_token is None:
                    fallback_token = await create_page_agent_session_token(
                        username,
                        project,
                        agent_kind="hermes-display-fallback",
                    )
                fallback_tool_ui_specs.extend(
                    await _fallback_display_tool_ui_specs(
                        username,
                        project,
                        tool_name,
                        tool_args,
                        token=fallback_token,
                        project_dir=project_dir,
                    )
                )
        result_message = persist_partial_reply()
        if result_message is None:
            result_message = add_assistant_message(
                username,
                project,
                "(hermes returned no content)",
                [],
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
            persisted_message = result_message
        await _emit_chat_event_best_effort(
            on_event,
            {"type": "assistant_message", "message": result_message},
        )
        await _emit_chat_event_best_effort(
            on_event, {"type": "done", "message": result_message}
        )
        return result_message
    except Exception:
        raise
    finally:
        persist_partial_reply()


async def _stream_assistant_reply_claude(
    username: str,
    project: str,
    prompt: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    try:
        agent_token = await create_page_agent_session_token(
            username,
            project,
            agent_kind="claude",
        )
        thread = _build_claude_thread(username, project, agent_token)
        agent_prompt = build_agent_prompt_context(username, project, prompt)
        assistant_text = ""
        tool_text = ""
        async for event in thread.stream(agent_prompt):
            if event.type == "thread_started":
                thread_id = str(event.thread_id or "").strip() or None
                if thread_id:
                    agent_thread_sessions.set_active(username, "claude", thread_id)
                await on_event(
                    {
                        "type": "thread_started",
                        "thread_id": thread_id,
                        "turn_id": str(event.turn_id or "").strip() or None,
                    }
                )
                continue
            if event.type == "assistant_delta":
                assistant_text = merge_stream_text(assistant_text, event.text)
                streamed_text = redact_local_filesystem_paths(assistant_text)
                await on_event(
                    {
                        "type": "assistant_delta",
                        "text": streamed_text,
                    }
                )
                continue
            if event.type == "tool_update":
                tool_text = str(event.text or "")
                await on_event({"type": "tool_update", "text": tool_text})
                continue
            if event.type == "complete":
                thread_id = str(event.thread_id or "").strip() or None
                if thread_id:
                    agent_thread_sessions.set_active(username, "claude", thread_id)
                assistant_text = completion_text_or_existing(
                    event.text, assistant_text
                )

        assistant_text = assistant_text.strip() or "已执行，但没有返回正文。"
        assistant_text = normalize_json_render_reply(assistant_text)
        if tool_text.strip():
            add_trace_messages(
                username,
                project,
                split_trace_contents(tool_text),
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        media = _extract_media(
            assistant_text, username, project, project_dir=project_dir
        )
        result_message = add_assistant_message(
            username,
            project,
            assistant_text,
            media,
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
        await on_event({"type": "done", "message": result_message})
        return result_message
    except Exception:
        raise


async def _stream_assistant_reply_codex(
    username: str,
    project: str,
    prompt: str,
    on_event,
    *,
    project_dir: str | Path | None = None,
    project_state_dir: str | Path | None = None,
) -> dict[str, Any]:
    assistant_text = ""
    tool_text = ""
    agent_token = await create_page_agent_session_token(
        username,
        project,
        agent_kind="codex",
    )
    thread = _build_codex_thread(username, project, agent_token)
    agent_prompt = build_agent_prompt_context(username, project, prompt)
    async for event in thread.stream(agent_prompt):
        if event.type == "thread_started":
            thread_id = str(event.thread_id or "").strip() or None
            if thread_id:
                agent_thread_sessions.set_active(username, "codex", thread_id)
            await on_event(
                {
                    "type": "thread_started",
                    "thread_id": thread_id,
                    "turn_id": str(event.turn_id or "").strip() or None,
                }
            )
            continue
        if event.type == "assistant_delta":
            assistant_text = merge_stream_text(assistant_text, event.text)
            streamed_text = redact_local_filesystem_paths(assistant_text)
            await on_event(
                {
                    "type": "assistant_delta",
                    "text": streamed_text,
                }
            )
            continue
        if event.type == "tool_update":
            tool_text += str(event.text or "")
            await on_event({"type": "tool_update", "text": tool_text})
            continue
        if event.type == "complete":
            thread_id = str(event.thread_id or "").strip() or None
            if thread_id:
                agent_thread_sessions.set_active(username, "codex", thread_id)
            assistant_text = completion_text_or_existing(event.text, assistant_text)

    assistant_text = assistant_text.strip() or "已执行，但没有返回正文。"
    assistant_text = normalize_json_render_reply(assistant_text)
    if tool_text.strip():
        add_trace_messages(
            username,
            project,
            split_trace_contents(tool_text),
            project_dir=project_dir,
            project_state_dir=project_state_dir,
        )
    media = _extract_media(assistant_text, username, project, project_dir=project_dir)
    result_message = add_assistant_message(
        username,
        project,
        assistant_text,
        media,
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )
    await on_event({"type": "done", "message": result_message})
    return result_message


async def generate_assistant_reply(
    username: str, project: str, prompt: str
) -> dict[str, Any]:
    async def _ignore(_event: dict[str, Any]) -> None:
        return None

    return await stream_assistant_reply(username, project, prompt, _ignore)
