from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from ai_anime.modules.project_workspace.application.dto import RequesterIdentity
from ai_anime.modules.project_workspace.application.errors import (
    InvalidProjectName,
    ProjectLifecycleConflict,
)
from ai_anime.modules.project_workspace.application.use_cases import ProjectWorkspaces
from ai_anime.modules.project_workspace.public import (
    Principal,
    ProjectContext,
    ProjectLifecycleAction,
    ProjectRecord,
    ProjectSummaryData,
)


def _record(tmp_path: Path, *, status: str = "active", purged_at: str | None = None):
    return ProjectRecord(
        id="project-1",
        owner_type="user",
        owner_id="user-1",
        owner_username="alice",
        name="demo",
        home_node_id="local",
        output_dir=str(tmp_path / "output"),
        state_dir=str(tmp_path / "state"),
        runtime_dir=str(tmp_path / "runtime"),
        status=status,
        purged_at=purged_at,
    )


def _context(tmp_path: Path) -> ProjectContext:
    record = _record(tmp_path)
    return ProjectContext(
        project_id=record.id,
        project_name=record.name,
        owner_type=record.owner_type,
        owner_id=record.owner_id,
        owner_username=record.owner_username,
        requester_user_id="user-1",
        requester_username="alice",
        requester_principals=(("user", "user-1"),),
        effective_role="owner",
        home_node_id=record.home_node_id,
        output_dir=Path(record.output_dir),
        state_dir=Path(record.state_dir),
        runtime_dir=Path(record.runtime_dir),
        is_home_node=True,
    )


class FakeRegistry:
    def __init__(self, record: ProjectRecord) -> None:
        self.record = record
        self.status_updates: list[str] = []
        self.deleted_uncommitted: list[str] = []
        self.deleted_homes: list[str] = []

    async def create_project(self, **_kwargs) -> ProjectRecord:
        return self.record

    async def delete_uncommitted_project(self, project_id: str) -> None:
        self.deleted_uncommitted.append(project_id)

    async def get_project(self, project_id: str) -> ProjectRecord | None:
        return self.record if project_id == self.record.id else None

    async def update_project_status(
        self,
        project_id: str,
        status: str,
    ) -> ProjectRecord | None:
        if project_id != self.record.id:
            return None
        self.status_updates.append(status)
        self.record = replace(self.record, status=status)
        return self.record

    async def mark_project_purged(self, project_id: str) -> ProjectRecord | None:
        if project_id != self.record.id:
            return None
        self.record = replace(self.record, purged_at="2026-07-23T12:00:00+00:00")
        return self.record

    async def delete_project_home(self, project_id: str) -> None:
        self.deleted_homes.append(project_id)


class FakeAccess:
    async def resolve_requester_principals(self, _user_id: str):
        return [Principal("user", "user-1")]

    async def effective_project_role(self, _project, _principals):
        return "owner"

    async def count_project_task_eligible_users(self, **_kwargs):
        return 1


class FakeResolver:
    def __init__(self, context: ProjectContext) -> None:
        self.context = context

    async def user_id_from_requester(self, requester: RequesterIdentity) -> str:
        return requester.user_id

    async def resolve(self, **_kwargs) -> ProjectContext:
        return self.context


class FakeStorage:
    def __init__(self, *, fail_initialize: bool = False) -> None:
        self.fail_initialize = fail_initialize
        self.initialized: list[str] = []
        self.cleaned: list[str] = []
        self.saved: list[dict] = []
        self.purged: list[str] = []

    def initialize(self, project: ProjectRecord, *, username: str) -> None:
        self.initialized.append(f"{username}/{project.name}")
        if self.fail_initialize:
            raise OSError("disk full")

    def cleanup_uncommitted(self, project: ProjectRecord) -> None:
        self.cleaned.append(project.id)

    def load_config(self, _ctx: ProjectContext) -> dict:
        return {}

    def save_config(self, _ctx: ProjectContext, updates: dict) -> None:
        self.saved.append(updates)

    def summarize(
        self,
        project: ProjectRecord,
        *,
        effective_role: str,
    ) -> ProjectSummaryData:
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
        )

    def purge_files(self, ctx: ProjectContext) -> None:
        self.purged.append(ctx.project_id)


class FakeAudit:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def emit(self, **event) -> None:
        self.events.append(event)


def _service(
    tmp_path: Path,
    *,
    record: ProjectRecord | None = None,
    storage: FakeStorage | None = None,
):
    context = _context(tmp_path)
    registry = FakeRegistry(record or _record(tmp_path))
    workspace_storage = storage or FakeStorage()
    audit = FakeAudit()
    service = ProjectWorkspaces(
        registry=registry,
        access=FakeAccess(),
        resolver=FakeResolver(context),
        storage=workspace_storage,
        audit=audit,
        now=lambda: "2026-07-23T10:00:00+00:00",
    )
    return service, registry, workspace_storage, audit


@pytest.mark.asyncio
async def test_create_rejects_invalid_name_before_writing(tmp_path):
    service, registry, storage, _audit = _service(tmp_path)

    with pytest.raises(InvalidProjectName):
        await service.create(
            RequesterIdentity(user_id="user-1", username="alice"),
            name="invalid name",
        )

    assert storage.initialized == []
    assert registry.deleted_uncommitted == []


@pytest.mark.asyncio
async def test_create_compensates_registry_and_files_when_initialization_fails(
    tmp_path,
):
    storage = FakeStorage(fail_initialize=True)
    service, registry, _storage, _audit = _service(tmp_path, storage=storage)

    with pytest.raises(OSError, match="disk full"):
        await service.create(
            RequesterIdentity(user_id="user-1", username="alice"),
            name="demo",
        )

    assert registry.deleted_uncommitted == ["project-1"]
    assert storage.cleaned == ["project-1"]


@pytest.mark.asyncio
async def test_create_initializes_storage_with_canonical_owner_username(tmp_path):
    service, _registry, storage, _audit = _service(tmp_path)

    await service.create(
        RequesterIdentity(user_id="user-1", username=""),
        name="demo",
    )

    assert storage.initialized == ["alice/demo"]


@pytest.mark.asyncio
async def test_archive_owns_status_config_and_audit_event(tmp_path):
    service, registry, storage, audit = _service(tmp_path)

    summary = await service.change_status(
        RequesterIdentity(user_id="user-1", username="alice"),
        project_id="project-1",
        action=ProjectLifecycleAction.ARCHIVE,
    )

    assert summary.status == "archived"
    assert registry.status_updates == ["archived"]
    assert storage.saved == [
        {"archived_at": "2026-07-23T10:00:00+00:00", "deleted_at": ""}
    ]
    assert audit.events == [
        {
            "action": "project.archive",
            "ctx": _context(tmp_path),
            "metadata": {"status": "archived"},
        }
    ]


@pytest.mark.asyncio
async def test_purge_rejects_active_project_without_side_effects(tmp_path):
    service, registry, storage, audit = _service(tmp_path)

    with pytest.raises(ProjectLifecycleConflict, match="Soft-delete first"):
        await service.purge(
            RequesterIdentity(user_id="user-1", username="alice"),
            project_id="project-1",
        )

    assert storage.purged == []
    assert registry.deleted_homes == []
    assert audit.events == []


@pytest.mark.asyncio
async def test_purge_removes_deleted_workspace_and_emits_audit(tmp_path):
    service, registry, storage, audit = _service(
        tmp_path,
        record=_record(tmp_path, status="deleted"),
    )

    purged = await service.purge(
        RequesterIdentity(user_id="user-1", username="alice"),
        project_id="project-1",
    )

    assert purged.purged_at == "2026-07-23T12:00:00+00:00"
    assert storage.purged == ["project-1"]
    assert registry.deleted_homes == ["project-1"]
    assert audit.events[0]["action"] == "project.purge"
    assert audit.events[0]["metadata"] == {"status": "deleted"}
