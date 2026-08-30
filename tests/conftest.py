from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def create_directory_link():
    """Create a directory link, using an unprivileged junction on Windows."""

    def create(link: Path, target: Path) -> None:
        try:
            link.symlink_to(target, target_is_directory=True)
        except OSError:
            if os.name != "nt":
                raise
            completed = subprocess.run(
                ["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(target)],
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if completed.returncode != 0:
                raise AssertionError(
                    "failed to create Windows directory junction: "
                    f"{completed.stderr or completed.stdout}"
                )
        assert link.is_dir()
        assert link.resolve() == target.resolve()

    return create


@pytest.fixture(autouse=True)
def restore_ports_registry_globals():
    from ai_anime.shared.ports import registry

    ports_snapshot = dict(registry._PORTS)
    bootstrapped_snapshot = registry._BOOTSTRAPPED
    try:
        yield
    finally:
        registry._PORTS.clear()
        registry._PORTS.update(ports_snapshot)
        registry._BOOTSTRAPPED = bootstrapped_snapshot


@pytest.fixture(autouse=True)
def restore_model_access_globals():
    from ai_anime.modules.model_usage.infrastructure import model_access_policy as policy

    names = (
        "_byok_allowed",
        "_selected_mode",
        "_model_assignments",
        "_model_capabilities",
        "_cloud_base_url_override",
        "_cloud_api_key_override",
    )
    snapshot = {name: getattr(policy, name) for name in names}
    try:
        yield
    finally:
        for name, value in snapshot.items():
            setattr(policy, name, value)


@pytest.fixture(autouse=True)
async def close_sqlite_stores_created_by_test(monkeypatch):
    from ai_anime.sqlite_store import SQLiteStore

    stores = []
    original_init = SQLiteStore.__init__

    def tracked_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        stores.append(self)

    monkeypatch.setattr(SQLiteStore, "__init__", tracked_init)
    yield
    for store in reversed(stores):
        if not store.is_closed():
            await store.close()


@pytest.fixture(scope="session", autouse=True)
def api_coverage_testclient_patch():
    if not os.environ.get("AI_ANIME_API_COVERAGE_FILE"):
        yield
        return

    from ai_anime.shared.api_coverage import (
        install_httpx_asgi_transport_api_coverage_patch,
        install_testclient_api_coverage_patch,
    )

    restore_testclient_patch = install_testclient_api_coverage_patch()
    restore_asgi_transport_patch = install_httpx_asgi_transport_api_coverage_patch()
    try:
        yield
    finally:
        restore_asgi_transport_patch()
        restore_testclient_patch()


@pytest.fixture(params=("ce", pytest.param("ee", marks=pytest.mark.ee)))
def app_client(request, monkeypatch):
    """Testing.md dual-mode fixture skeleton.

    T1 uses this only as a mode anchor; full app assembly starts in later slices.
    CE delenv does not affect an already-instantiated control_plane.config.settings
    singleton. Full app assembly (L2 from T3 onward) must rebuild via the app
    factory or a subprocess; do not use this fixture to assert settings behavior.
    """
    mode = str(request.param)
    if mode == "ce":
        monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
        monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    return {"mode": mode}
