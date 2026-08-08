"""Connection lifecycle for the project-scoped SQLite unit of work."""

from __future__ import annotations

import asyncio
import contextlib
import functools
import inspect
import logging
from pathlib import Path
from typing import Any

import aiosqlite
from rich.console import Console

from ai_anime.shared.infrastructure.project_sqlite_schema import (
    SQLITE_SCHEMA_SQL,
    _add_column_if_missing,
)
from ai_anime.shared.infrastructure.sqlite_pragmas import (
    configure_sqlite_connection_async,
)

console = Console()
logger = logging.getLogger(__name__)


class StoreClosedError(RuntimeError):
    """Raised when a project SQLite store is used after close()."""

    def __init__(self, project_dir: str):
        super().__init__(f"SQLiteStore is closed: {project_dir}")
        self.project_dir = project_dir


def _leased(method):
    @functools.wraps(method)
    async def wrapper(self, *args, **kwargs):
        async with self._lease():
            return await method(self, *args, **kwargs)

    return wrapper


def auto_lease_public_async_methods(cls):
    """Lease public async methods contributed by every repository mixin."""
    methods = {}
    for base in reversed(cls.__mro__):
        methods.update(vars(base))
    for name, attr in methods.items():
        if name.startswith("_") or name == "close":
            continue
        if inspect.iscoroutinefunction(attr):
            setattr(cls, name, _leased(attr))
    return cls


class ProjectSQLiteCore:
    """只负责 SQLite 数据读写的轻量存储。

    Store instances are one-shot lifecycle objects: after close(), create a new
    SQLiteStore instead of calling initialize() again.
    """

    def __init__(
        self,
        project_name: str,
        output_dir: str | None = None,
        state_dir: str | None = None,
    ):
        self.project_name = project_name
        self._db: aiosqlite.Connection | None = None
        self._characters: dict[str, Any] = {}
        self._episodes: dict[int, Any] = {}
        self._props: dict[str, Any] = {}
        self._alias_index: dict[str, str] = {}
        self._closing = False
        self._closed = False
        self._inflight = 0
        self._drained = asyncio.Event()
        self._drained.set()
        self._lease_depth_by_task: dict[Any, int] = {}

        if output_dir:
            self.project_dir = output_dir
            Path(output_dir).mkdir(parents=True, exist_ok=True)
        else:
            from ai_anime.modules.project_workspace.public import ensure_project_dirs

            self.project_dir = ensure_project_dirs(project_name)["base"]

        parts = project_name.split("/", 1)
        if len(parts) == 2:
            from ai_anime.shared.utils.project_paths import ProjectPaths

            paths = ProjectPaths(parts[0], parts[1])
            paths.bootstrap_from_legacy_output()
            default_state_dir = paths.state_dir
        else:
            default_state_dir = Path(self.project_dir)

        if state_dir:
            resolved_state_dir = Path(state_dir)
        else:
            resolved_state_dir = default_state_dir

        resolved_state_dir.mkdir(parents=True, exist_ok=True)
        self.state_dir = str(resolved_state_dir)
        self.db_path = str(resolved_state_dir / "data.db")

    async def _ensure_db(self) -> aiosqlite.Connection:
        if self._closed or (self._closing and self._current_task_lease_depth() <= 0):
            raise StoreClosedError(self.project_dir)
        if self._db is None:
            if self._closing:
                raise StoreClosedError(self.project_dir)
            self._db = await aiosqlite.connect(self.db_path)
            self._db.row_factory = aiosqlite.Row
            await configure_sqlite_connection_async(self._db)
            await self._db.executescript(SQLITE_SCHEMA_SQL)
            await self._ensure_episode_planning_columns(self._db)
            await self._ensure_beat_current_columns(self._db)
            await self._ensure_scene_columns(self._db)
            await self._ensure_indextts2_columns(self._db)
            await self._db.commit()
            # Phase 2 DB split: failure-mode *definitions* live in the
            # user-shared verification.db (not this project DB). They are
            # seeded lazily by `failure_registry.load_negative_clause_for_project`
            # / `open_defs_db_for_project` the first time any caller needs
            # them. This project DB holds only per-project hits +
            # convergence facts — the schema above already creates
            # `sketch_failure_mode_hits`, which stays project-local.
        return self._db

    async def _ensure_scene_columns(self, db: aiosqlite.Connection) -> None:
        await _add_column_if_missing(
            db,
            "scenes",
            "spatial_layout_image",
            "TEXT DEFAULT ''",
        )
        for name in ("base_scene_id", "variant_id", "time_of_day", "variant_prompt"):
            await _add_column_if_missing(db, "scenes", name, "TEXT DEFAULT ''")

    async def _ensure_indextts2_columns(self, db: aiosqlite.Connection) -> None:
        """Add IndexTTS2 / Seedance 2.0 voice columns introduced in Stage A."""
        await _add_column_if_missing(
            db,
            "beats",
            "seedance2_config_json",
            "TEXT NOT NULL DEFAULT '{}'",
        )

        char_columns = {
            "reference_audio_path": "TEXT DEFAULT ''",
            "reference_audio_sha256": "TEXT DEFAULT ''",
            "reference_audio_updated_at": "TEXT DEFAULT ''",
            "voice_samples_by_age_group_json": "TEXT DEFAULT '{}'",
        }
        for name, definition in char_columns.items():
            await _add_column_if_missing(db, "characters", name, definition)

    async def _ensure_episode_planning_columns(self, db: aiosqlite.Connection) -> None:
        """Add episode columns introduced after early project databases were created."""
        columns = {
            "beat_source_text": "TEXT DEFAULT ''",
            "adapted_content": "TEXT DEFAULT ''",
            "scene_menu_json": "TEXT DEFAULT '[]'",
            "prop_menu_json": "TEXT DEFAULT '[]'",
            "identity_default_map_json": "TEXT DEFAULT '{}'",
        }
        for name, definition in columns.items():
            await _add_column_if_missing(db, "episodes", name, definition)

    async def _ensure_beat_current_columns(self, db: aiosqlite.Connection) -> None:
        """Add beat columns required by the current script/render pipeline."""
        columns = {
            "detected_identities_json": "TEXT DEFAULT '[]'",
            "detected_props_json": "TEXT DEFAULT '[]'",
            "scene_ref_json": "TEXT DEFAULT ''",
            "audio_type": "TEXT DEFAULT 'narration'",
            "speaker": "TEXT DEFAULT ''",
            "speaker_kind": "TEXT DEFAULT 'character'",
            "time_of_day": "TEXT DEFAULT ''",
            "video_mode": "TEXT DEFAULT 'first_frame'",
            "video_prompt": "TEXT DEFAULT ''",
            "keyframe_prompt": "TEXT DEFAULT ''",
            "shot_order": "INTEGER",
            "duration_seconds": "REAL",
            "is_manual_shot": "INTEGER DEFAULT 0",
        }
        for name, definition in columns.items():
            await _add_column_if_missing(db, "beats", name, definition)

    async def initialize(self) -> None:
        await self._ensure_db()
        console.print(f"[dim]SQLite 存储已初始化 (db: {self.db_path})[/dim]")

    def is_closed(self) -> bool:
        return self._closing or self._closed

    def _current_task_lease_depth(self) -> int:
        try:
            task = asyncio.current_task()
        except RuntimeError:
            return 0
        if task is None:
            return 0
        return self._lease_depth_by_task.get(task, 0)

    @contextlib.asynccontextmanager
    async def _lease(self):
        """Track in-flight async store operations so close() can drain safely."""
        try:
            task = asyncio.current_task()
        except RuntimeError:
            task = None

        if task is not None:
            depth = self._lease_depth_by_task.get(task, 0)
            if depth > 0:
                self._lease_depth_by_task[task] = depth + 1
                try:
                    yield self
                finally:
                    next_depth = self._lease_depth_by_task.get(task, 1) - 1
                    if next_depth <= 0:
                        self._lease_depth_by_task.pop(task, None)
                    else:
                        self._lease_depth_by_task[task] = next_depth
                return

        if self._closing or self._closed:
            raise StoreClosedError(self.project_dir)

        self._inflight += 1
        self._drained.clear()
        if task is not None:
            self._lease_depth_by_task[task] = 1
        try:
            yield self
        finally:
            if task is not None:
                self._lease_depth_by_task.pop(task, None)
            self._inflight = max(0, self._inflight - 1)
            if self._inflight == 0:
                self._drained.set()

    async def close(self) -> None:
        if self._closed or self._closing:
            return
        self._closing = True
        if self._inflight > 0 and self._current_task_lease_depth() <= 0:
            try:
                await asyncio.wait_for(self._drained.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                logger.warning(
                    "SQLiteStore close drain timeout; force closing project_dir=%s inflight=%s",
                    self.project_dir,
                    self._inflight,
                )
        db = self._db
        self._db = None
        if db is not None:
            try:
                await db.close()
            except Exception:
                logger.exception(
                    "failed to close SQLiteStore db for project_dir=%s",
                    self.project_dir,
                )
        self._closed = True


__all__ = ["ProjectSQLiteCore", "StoreClosedError", "auto_lease_public_async_methods"]
