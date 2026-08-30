"""Project config helpers with atomic read-modify-write semantics."""

from __future__ import annotations

import json
import logging
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

import portalocker

from ai_anime.shared.runtime_paths import STATE_DIR
from ai_anime.shared.utils.atomic_files import replace_text_atomically

_log = logging.getLogger(__name__)

NARRATION_STYLE_KEY = "narration_style"
NARRATOR_AUDIO_PATH_KEY = "narrator_reference_audio_path"
NARRATOR_AUDIO_SHA256_KEY = "narrator_reference_audio_sha256"
NARRATOR_AUDIO_UPDATED_AT_KEY = "narrator_reference_audio_updated_at"
DEFAULT_NARRATION_STYLE = "third_person"
_VALID_NARRATION_STYLES = {"first_person", "third_person"}
DEFAULT_ASPECT_RATIO = "2:3"


def default_aspect_ratio_for_spine_template(spine_template: str | None) -> str:
    """Return the project aspect ratio implied by the screenplay spine."""
    return "16:9" if spine_template == "narrated" else DEFAULT_ASPECT_RATIO

def get_project_config_path(username: str, project: str) -> Path:
    from ai_anime.shared.utils.project_paths import ProjectPaths

    ProjectPaths(username, project).bootstrap_from_legacy_output()
    return Path(STATE_DIR) / username / project / "project_config.json"


def get_project_config_path_from_state_dir(state_dir: str | Path) -> Path:
    return Path(state_dir) / "project_config.json"


def load_project_config_file(username: str, project: str) -> dict:
    config_path = get_project_config_path(username, project)
    return load_project_config_file_from_path(config_path)


def load_project_config_file_from_path(config_path: str | Path) -> dict:
    config_path = Path(config_path)
    if not config_path.exists():
        return {}
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        return config if isinstance(config, dict) else {}
    except Exception:
        return {}


def load_project_config_file_from_state_dir(state_dir: str | Path) -> dict:
    return load_project_config_file_from_path(get_project_config_path_from_state_dir(state_dir))


def _default_project_config() -> dict:
    from ai_anime.modules.production.public import (
        DEFAULT_VIDEO_RESOLUTION,
    )

    return {
        "spine_template": "drama",
        "aspect_ratio": DEFAULT_ASPECT_RATIO,
        "visual_style": "chinese_period_drama",
        "ethnicity": "Chinese",
        "scene_grouping": False,
        "character_grouping": False,
        "video_model": "",
        "video_resolution": DEFAULT_VIDEO_RESOLUTION,
        "use_director_render": False,
        "sketch_image_selection": "",
        "render_image_selection": "",
        "current_episode": 1,
        "user_grid_plan": {},
        "regen_file_map": {},
    }


def _available_style_labels_for_config(
    *,
    username: str | None = None,
) -> dict[str, str]:
    from ai_anime.modules.asset_world.public import StyleService

    return StyleService.get_style_labels(username=username)


def _effective_project_config(
    config: dict,
    *,
    username: str | None,
) -> dict:
    default_config = _default_project_config()
    if not config:
        return default_config

    result = {**default_config, **config}

    available = _available_style_labels_for_config(
        username=username,
    )
    if result.get("visual_style") not in available:
        print(
            f"[load_project_config] visual_style '{result['visual_style']}' 无效，回退默认",
            flush=True,
        )
        result["visual_style"] = default_config["visual_style"]

    return result


@contextmanager
def _project_config_lock(config_path: Path):
    lock_path = config_path.with_suffix(f"{config_path.suffix}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "a+", encoding="utf-8") as lock_file:
        portalocker.lock(lock_file, portalocker.LOCK_EX)
        try:
            yield
        finally:
            portalocker.unlock(lock_file)


def _write_project_config_atomic(config_path: Path, config: dict) -> None:
    replace_text_atomically(
        config_path,
        json.dumps(config, indent=2, ensure_ascii=False),
        sync_file=True,
        sync_directory=False,
    )


def update_project_config_file(
    username: str,
    project: str,
    updater: Callable[[dict], None],
) -> dict:
    config_path = get_project_config_path(username, project)
    return update_project_config_file_at_path(config_path, updater)


def update_project_config_file_at_path(
    config_path: str | Path,
    updater: Callable[[dict], None],
) -> dict:
    config_path = Path(config_path)
    with _project_config_lock(config_path):
        current = load_project_config_file_from_path(config_path)
        updated = dict(current)
        updater(updated)
        _write_project_config_atomic(config_path, updated)
        return updated


def update_project_config_file_in_state_dir(
    state_dir: str | Path,
    updater: Callable[[dict], None],
) -> dict:
    return update_project_config_file_at_path(
        get_project_config_path_from_state_dir(state_dir),
        updater,
    )


def save_project_config(username: str, project: str, config: dict | None = None, **kwargs) -> dict:
    """Persist project configuration updates with atomic read-modify-write semantics."""

    def _apply(existing_config: dict) -> None:
        if config:
            existing_config.update(config)
        if kwargs:
            existing_config.update(kwargs)

    saved_config = update_project_config_file(username, project, _apply)
    print(
        "[save_project_config] 已保存配置: "
        f"{username}/{project}/project_config.json -> {saved_config}",
        flush=True,
    )
    return saved_config


def save_project_config_in_state_dir(
    state_dir: str | Path,
    config: dict | None = None,
    **kwargs,
) -> dict:
    """Persist project config by registry state_dir without legacy bootstrap."""

    def _apply(existing_config: dict) -> None:
        if config:
            existing_config.update(config)
        if kwargs:
            existing_config.update(kwargs)

    return update_project_config_file_in_state_dir(state_dir, _apply)


def load_project_config(username: str, project: str) -> dict:
    """Load project configuration with runtime defaults applied."""
    config = load_project_config_file(username, project)

    project_uuid = str(config.get("project_uuid", "") or "").strip()
    if config and not project_uuid:
        project_uuid = ensure_project_uuid(username, project)
        config["project_uuid"] = project_uuid

    result = _effective_project_config(
        config,
        username=username,
    )

    _log.debug(
        "[load_project_config] 已加载配置: %s/%s/project_config.json -> %s",
        username,
        project,
        result,
    )
    return result


def ensure_project_uuid_in_state_dir(state_dir: str | Path) -> str:
    """Ensure a stable UUID without resolving legacy username/project paths."""

    def _apply(config: dict) -> None:
        if not str(config.get("project_uuid", "") or "").strip():
            config["project_uuid"] = uuid.uuid4().hex

    updated = update_project_config_file_in_state_dir(state_dir, _apply)
    return str(updated.get("project_uuid", "") or "")


def load_project_config_from_state_dir(
    state_dir: str | Path,
    *,
    username: str | None = None,
    project: str | None = None,
) -> dict:
    """Load effective project configuration from a registry state_dir only."""

    config = load_project_config_file_from_state_dir(state_dir)
    project_uuid = str(config.get("project_uuid", "") or "").strip()
    if config and not project_uuid:
        project_uuid = ensure_project_uuid_in_state_dir(state_dir)
        config["project_uuid"] = project_uuid

    result = _effective_project_config(
        config,
        username=username,
    )
    _log.debug(
        "[load_project_config_from_state_dir] 已加载配置: %s/project_config.json -> %s",
        state_dir,
        result,
    )
    return result


def ensure_project_uuid(username: str, project: str) -> str:
    """Ensure the project has a stable UUID in project_config.json."""

    def _apply(config: dict) -> None:
        if not str(config.get("project_uuid", "") or "").strip():
            config["project_uuid"] = uuid.uuid4().hex

    updated = update_project_config_file(username, project, _apply)
    return str(updated.get("project_uuid", "") or "")


def update_regen_file_map(
    username: str,
    project: str,
    updates: dict[str, str] | None = None,
    remove_keys: Iterable[str] | None = None,
) -> dict[str, str]:
    """Atomically update the persisted regen_file_map."""

    update_items = dict(updates or {})
    delete_keys = set(remove_keys or [])

    def _apply(config: dict) -> None:
        regen_map = dict(config.get("regen_file_map") or {})
        for key in delete_keys:
            regen_map.pop(key, None)
        regen_map.update(update_items)
        config["regen_file_map"] = regen_map

    updated = update_project_config_file(username, project, _apply)
    return dict(updated.get("regen_file_map") or {})


def load_narration_style(username: str, project: str) -> str:
    """Return the project-level narration style ("first_person" / "third_person")."""
    config = load_project_config_file(username, project)
    style = str(config.get(NARRATION_STYLE_KEY) or "").strip()
    return style if style in _VALID_NARRATION_STYLES else DEFAULT_NARRATION_STYLE


def is_narrated_project(username: str, project: str) -> bool:
    """Return whether the project uses the narrated screenplay spine."""
    config = load_project_config_file(username, project)
    return str(config.get("spine_template") or "drama").strip() == "narrated"


def load_effective_narration_style_for_voice(username: str, project: str) -> str:
    """Return the narration style that should drive voice selection.

    Drama projects may carry legacy ``first_person`` values, but narration voice
    resolution for drama must use the project narrator instead of protagonist voice.
    """
    style = load_narration_style(username, project)
    return style if is_narrated_project(username, project) else DEFAULT_NARRATION_STYLE


def load_narrator_reference_audio(username: str, project: str) -> dict[str, str]:
    """Return narrator reference audio descriptor (path/sha256/updated_at).

    Keys are stored as three top-level fields in project_config.json:
    ``narrator_reference_audio_path``, ``..._sha256``, ``..._updated_at``.
    Missing fields come back as empty strings.
    """
    config = load_project_config_file(username, project)
    return {
        "path": str(config.get(NARRATOR_AUDIO_PATH_KEY) or "").strip(),
        "sha256": str(config.get(NARRATOR_AUDIO_SHA256_KEY) or "").strip(),
        "updated_at": str(config.get(NARRATOR_AUDIO_UPDATED_AT_KEY) or "").strip(),
    }


def set_narrator_reference_audio(
    username: str,
    project: str,
    *,
    relative_path: str,
    sha256: str,
    updated_at: str | None = None,
) -> dict[str, str]:
    """Persist narrator reference audio metadata atomically.

    ``updated_at`` is caller-supplied (so tests can pin a deterministic value);
    if omitted, the current UTC time is stamped.
    """
    stamp = updated_at if updated_at is not None else datetime.now(timezone.utc).isoformat()

    def _apply(config: dict) -> None:
        config[NARRATOR_AUDIO_PATH_KEY] = str(relative_path or "").strip()
        config[NARRATOR_AUDIO_SHA256_KEY] = str(sha256 or "").strip()
        config[NARRATOR_AUDIO_UPDATED_AT_KEY] = str(stamp or "").strip()

    updated = update_project_config_file(username, project, _apply)
    return {
        "path": str(updated.get(NARRATOR_AUDIO_PATH_KEY) or ""),
        "sha256": str(updated.get(NARRATOR_AUDIO_SHA256_KEY) or ""),
        "updated_at": str(updated.get(NARRATOR_AUDIO_UPDATED_AT_KEY) or ""),
    }
