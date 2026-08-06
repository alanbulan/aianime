from __future__ import annotations

import pytest

from ai_anime.shared.ports import registry
from ai_anime.modules.project_workspace.infrastructure.local_registry import (
    AllowAllProjectAccess,
)


class FakeProjectAccess:
    async def count_project_task_eligible_users(self, **kwargs):
        return 999


@pytest.mark.asyncio
async def test_01_port_registry_isolation_probe_registers_fake_after_bootstrap(
    monkeypatch,
):
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)

    registry.ensure_bootstrap()
    registry.register_port("project_access", FakeProjectAccess())

    access = registry.get_port("project_access")
    assert (
        await access.count_project_task_eligible_users(
            project_id="proj",
            owner_type="user",
            owner_id="owner",
        )
        == 999
    )
    assert registry._BOOTSTRAPPED is True


@pytest.mark.asyncio
async def test_02_port_registry_isolation_probe_restores_default_and_bootstrap_flag(
    monkeypatch,
):
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)

    registry.ensure_bootstrap()
    project_access = registry.get_port("project_access")

    assert isinstance(project_access, AllowAllProjectAccess)
    assert (
        await project_access.count_project_task_eligible_users(
            project_id="proj",
            owner_type="user",
            owner_id="owner",
        )
        == 1
    )
    assert registry._BOOTSTRAPPED is True
