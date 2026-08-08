import pytest

from ai_anime.modules.project_workspace.application.errors import (
    ProjectAlreadyExists,
)
from ai_anime.modules.project_workspace.infrastructure.local_registry import (
    SQLiteProjectRegistry,
)


@pytest.fixture
def local_registry(monkeypatch, tmp_path):
    state = tmp_path / "state"
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(state))
    import ai_anime.modules.project_workspace.infrastructure.local_registry as registry_module

    monkeypatch.setattr(registry_module, "STATE_DIR", str(state))
    return SQLiteProjectRegistry()


@pytest.mark.asyncio
async def test_purge_deletes_registry_row_and_releases_owner_name(local_registry):
    first = await local_registry.create_project(
        owner_user_id="local",
        owner_username="alice",
        name="agent",
    )
    await local_registry.update_project_status(first.id, "deleted")
    purged = await local_registry.mark_project_purged(first.id)

    second = await local_registry.create_project(
        owner_user_id="local",
        owner_username="alice",
        name="agent",
    )
    resolved = await local_registry.get_project_by_owner_name("local", "agent")

    assert purged is not None
    assert purged.id == first.id
    assert purged.purged_at is not None
    assert await local_registry.get_project(first.id) is None
    assert second.id != first.id
    assert resolved is not None
    assert resolved.id == second.id


@pytest.mark.asyncio
async def test_duplicate_name_raises_application_conflict(local_registry):
    await local_registry.create_project(
        owner_user_id="local",
        owner_username="alice",
        name="agent",
    )

    with pytest.raises(ProjectAlreadyExists) as exc:
        await local_registry.create_project(
            owner_user_id="local",
            owner_username="alice",
            name="agent",
        )

    assert str(exc.value) == "Project 'agent' already exists"
