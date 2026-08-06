"""Local project files, summaries, and audit adapters."""

from __future__ import annotations

import logging
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from ai_anime.config import ensure_project_dirs_at_paths
from ai_anime.modules.project_workspace.application.dto import ProjectSummaryData
from ai_anime.modules.project_workspace.application.project_scope import (
    ProjectContext,
    is_record_home_node,
)
from ai_anime.modules.project_workspace.domain import ProjectRecord
from ai_anime.shared.ports.audit import AuditSink
from ai_anime.project_config import (
    load_project_config_file_from_state_dir,
    load_project_config_from_state_dir,
    save_project_config_in_state_dir,
)
from ai_anime.shared.node_identity import resolve_worker_id

logger = logging.getLogger("ai_anime.project_workspace")


def user_output_dir(username: str) -> Path:
    from ai_anime import config

    return Path(config.OUTPUT_DIR) / username


def _updated_at(project: ProjectRecord) -> str | None:
    candidates = [
        Path(project.state_dir) / "project_config.json",
        Path(project.state_dir) / "data.db",
        Path(project.state_dir),
        Path(project.output_dir),
    ]
    latest = 0.0
    for path in candidates:
        try:
            if path.exists():
                latest = max(latest, path.stat().st_mtime)
        except OSError:
            continue
    if latest <= 0:
        return None
    return datetime.fromtimestamp(latest, tz=timezone.utc).isoformat()


def _counts(project: ProjectRecord) -> tuple[int | None, int | None]:
    if project.status == "deleted":
        return None, None
    db_path = Path(project.state_dir) / "data.db"
    if not db_path.exists():
        return None, None
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=1)
        try:
            episode_row = conn.execute("SELECT COUNT(*) FROM episodes").fetchone()
            beat_row = conn.execute("SELECT COUNT(*) FROM beats").fetchone()
            return (
                int(episode_row[0]) if episode_row else 0,
                int(beat_row[0]) if beat_row else 0,
            )
        finally:
            conn.close()
    except sqlite3.Error:
        logger.debug(
            "project count failed: %s/%s",
            project.owner_username,
            project.name,
            exc_info=True,
        )
        return None, None


class LocalProjectWorkspaceStorage:
    def initialize(self, project: ProjectRecord, *, username: str) -> None:
        ensure_project_dirs_at_paths(
            output_dir=project.output_dir,
            state_dir=project.state_dir,
            runtime_dir=project.runtime_dir,
        )
        save_project_config_in_state_dir(project.state_dir, config={"user": username})

    def cleanup_uncommitted(self, project: ProjectRecord) -> None:
        for path in (
            Path(project.output_dir),
            Path(project.state_dir),
            Path(project.runtime_dir),
        ):
            if path.exists():
                shutil.rmtree(path)

    def load_config(self, ctx: ProjectContext) -> dict:
        return load_project_config_from_state_dir(
            ctx.state_dir,
            username=ctx.owner_username,
            project=ctx.project_name,
        )

    def save_config(self, ctx: ProjectContext, updates: dict) -> None:
        save_project_config_in_state_dir(ctx.state_dir, config=updates)

    def summarize(
        self,
        project: ProjectRecord,
        *,
        effective_role: str,
    ) -> ProjectSummaryData:
        if not is_record_home_node(project, resolve_worker_id()):
            return ProjectSummaryData(
                id=project.id,
                name=project.name,
                owner_type=project.owner_type,
                owner_id=project.owner_id,
                owner_username=project.owner_username,
                effective_role=effective_role,
                home_node_id=project.home_node_id,
                status=project.status,
                purged_at=project.purged_at,
                updated_at=project.updated_at or None,
            )

        config = load_project_config_file_from_state_dir(project.state_dir)
        status = project.status or "active"
        episode_count, beat_count = _counts(project)
        return ProjectSummaryData(
            id=project.id,
            name=project.name,
            owner_type=project.owner_type,
            owner_id=project.owner_id,
            owner_username=project.owner_username,
            effective_role=effective_role,
            home_node_id=project.home_node_id,
            status=status,
            archived_at=config.get("archived_at"),
            deleted_at=config.get("deleted_at"),
            purged_at=project.purged_at,
            updated_at=_updated_at(project),
            episode_count=episode_count,
            beat_count=beat_count,
        )

    def purge_files(self, ctx: ProjectContext) -> None:
        for path in (ctx.output_dir, ctx.state_dir, ctx.runtime_dir):
            if path.exists():
                shutil.rmtree(path)


class PortProjectAudit:
    def __init__(self, sink: AuditSink) -> None:
        self._sink = sink

    async def emit(
        self,
        *,
        action: str,
        ctx: ProjectContext,
        metadata: dict,
    ) -> None:
        try:
            await self._sink.emit_audit_event(
                action=action,
                user_id=ctx.requester_user_id,
                actor_type="user",
                project_id=ctx.project_id,
                metadata=metadata,
            )
        except Exception as exc:
            logger.debug("project audit emit failed: %s", exc)
