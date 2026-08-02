import os
import time
from pathlib import Path

import pytest

from ai_anime.modules.identity_access.public import AgentSessionToken

pytestmark = pytest.mark.m08


class _FakeAuthService:
    def __init__(self) -> None:
        self.created = 0
        self.updated: list[tuple[str, dict]] = []
        self.revoked: list[str] = []

    async def create_agent_session(self, **kwargs):
        self.created += 1
        return AgentSessionToken(
            value=f"token-{self.created}",
            session_id=f"agent-session-{self.created}",
            user=str(kwargs["username"]),
            scopes=tuple(kwargs["scopes"]),
            exp=int(time.time()) + 3600,
            worker_id=str(kwargs["worker_id"]),
            agent_kind=str(kwargs["agent_kind"]),
        )

    async def revoke_agent_session(self, raw_token: str) -> bool:
        self.revoked.append(raw_token)
        return True

    async def update_agent_session_scope(self, raw_token: str, **kwargs) -> bool:
        self.updated.append((raw_token, kwargs))
        return True


class _FakeThread:
    def __init__(self, session_id: str) -> None:
        self.id = session_id
        self.closed = False

    async def close(self) -> None:
        self.closed = True

    @property
    def is_closed(self) -> bool:
        return self.closed


def _patch_fake_hermes_pool(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    from ai_anime.chat import hermes_pool
    from ai_anime.ports import registry

    calls: list[tuple[str, str | None]] = []
    started_count = 0
    fake_auth = _FakeAuthService()
    gateway = {"fingerprint": "gateway-1"}
    fake_cli = tmp_path / "hermes"
    fake_cli.write_text("#!/bin/sh\n", encoding="utf-8")

    class FakeHermesSdkClient:
        def __init__(self, **_kwargs) -> None:
            pass

        def thread_start(self) -> _FakeThread:
            nonlocal started_count
            started_count += 1
            calls.append(("start", None))
            return _FakeThread(f"session-{started_count}")

        def thread_resume(self, session_id: str) -> _FakeThread:
            calls.append(("resume", session_id))
            return _FakeThread(session_id)

    monkeypatch.setattr(registry, "_PORTS", dict(registry._PORTS))
    registry.register_port("auth_session", fake_auth)
    monkeypatch.setattr(hermes_pool, "_hermes_cli_path", lambda: fake_cli)
    monkeypatch.setattr(hermes_pool, "ensure_user_hermes_workspace", lambda _user: tmp_path)
    monkeypatch.setattr(
        hermes_pool,
        "effective_gateway_fingerprint",
        lambda: gateway["fingerprint"],
    )
    monkeypatch.setattr(hermes_pool, "HermesSdkClient", FakeHermesSdkClient)

    pool = hermes_pool.HermesPool(max_workers=5)

    async def fake_project_env(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(pool, "_project_env", fake_project_env)
    return pool, calls, fake_auth, gateway


def test_hermes_worker_receives_effective_newapi_key_without_mutating_host_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.chat import hermes_pool

    monkeypatch.delenv("NEWAPI_API_KEY", raising=False)
    monkeypatch.setattr(
        hermes_pool,
        "effective_gateway_credentials",
        lambda: ("worker-only-key", "https://newapi.example/v1"),
    )
    token = AgentSessionToken(
        value="agent-token",
        session_id="agent-session",
        user="alice",
        scopes=("projects:read",),
        exp=int(time.time()) + 3600,
        worker_id="worker-1",
        agent_kind="hermes",
    )

    pool = hermes_pool.HermesPool(max_workers=1)
    cli_path = tmp_path / "hermes.exe"
    env = pool._build_env(
        tmp_path,
        "alice",
        token,
        cli_path=cli_path,
        project_id=None,
    )

    assert env["NEWAPI_API_KEY"] == "worker-only-key"
    assert "NEWAPI_API_KEY" not in os.environ
    if os.name == "nt":
        assert env["HERMES_HOME"] == str(tmp_path)
        assert env["USERPROFILE"] == str(tmp_path)
        assert env["TEMP"] == str(tmp_path / "tmp")
        assert str(cli_path.parent) in env["PATH"]


def test_hermes_runtime_does_not_fall_back_to_a_system_install(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.chat import hermes_pool

    monkeypatch.delenv("HERMES_CLI_PATH", raising=False)

    assert hermes_pool._hermes_cli_path() is None


@pytest.mark.asyncio
async def test_hermes_pool_requires_the_desktop_bundled_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.chat import hermes_pool

    monkeypatch.delenv("HERMES_CLI_PATH", raising=False)
    pool = hermes_pool.HermesPool(max_workers=1)

    with pytest.raises(RuntimeError) as exc_info:
        await pool.get_for_user("alice")

    assert "bundled Hermes ACP runtime" in str(exc_info.value)
    assert "uv tool install" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_hermes_pool_uses_separate_sessions_per_project(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool, calls, fake_auth, _gateway = _patch_fake_hermes_pool(tmp_path, monkeypatch)

    try:
        first = await pool.get_for_user("alice", scope_kind="project", project_id="project_a")
        second = await pool.get_for_user("alice", scope_kind="project", project_id="project_b")
        third = await pool.get_for_user("alice", scope_kind="project", project_id="project_a")
        fourth = await pool.get_for_user("alice", scope_kind="project", project_id="project_a")
    finally:
        await pool.close_all()

    assert first.id == "session-1"
    assert second.id == "session-2"
    assert third.id == "session-1"
    assert fourth.id == "session-1"
    assert calls == [("start", None), ("start", None), ("resume", "session-1")]
    assert fake_auth.created == 3
    assert fake_auth.updated == [
        ("token-3", {"scope_kind": "project", "project_id": "project_a"}),
    ]
    assert fake_auth.revoked == ["token-1", "token-2", "token-3"]


@pytest.mark.asyncio
async def test_hermes_pool_resumes_current_project_session_when_renewing_token(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool, calls, fake_auth, _gateway = _patch_fake_hermes_pool(tmp_path, monkeypatch)

    try:
        first = await pool.get_for_user("alice", scope_kind="project", project_id="project_a")
        pool._slots["alice"].token = AgentSessionToken(
            value="expired-token",
            session_id="expired-agent-session",
            user="alice",
            scopes=("projects:read",),
            exp=0,
            worker_id="expired-worker",
            agent_kind="hermes",
        )
        second = await pool.get_for_user("alice", scope_kind="project", project_id="project_a")
    finally:
        await pool.close_all()

    assert first.id == "session-1"
    assert second.id == "session-1"
    assert calls == [("start", None), ("resume", "session-1")]
    assert fake_auth.created == 2
    assert fake_auth.revoked == ["expired-token", "token-2"]


@pytest.mark.asyncio
async def test_hermes_pool_rotates_closed_thread(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool, calls, fake_auth, _gateway = _patch_fake_hermes_pool(tmp_path, monkeypatch)

    try:
        first = await pool.get_for_user("alice", scope_kind="project", project_id="project_a")
        await first.close()
        second = await pool.get_for_user("alice", scope_kind="project", project_id="project_a")
    finally:
        await pool.close_all()

    assert first.closed is True
    assert second is not first
    assert second.id == "session-1"
    assert calls == [("start", None), ("resume", "session-1")]
    assert fake_auth.created == 2
    assert fake_auth.revoked == ["token-1", "token-2"]


@pytest.mark.asyncio
async def test_hermes_pool_rotates_and_resumes_when_gateway_changes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool, calls, fake_auth, gateway = _patch_fake_hermes_pool(tmp_path, monkeypatch)

    try:
        first = await pool.get_for_user(
            "alice", scope_kind="project", project_id="project_a"
        )
        gateway["fingerprint"] = "gateway-2"
        second = await pool.get_for_user(
            "alice", scope_kind="project", project_id="project_a"
        )
    finally:
        await pool.close_all()

    assert second is not first
    assert second.id == first.id == "session-1"
    assert calls == [("start", None), ("resume", "session-1")]
    assert fake_auth.created == 2
    assert fake_auth.revoked == ["token-1", "token-2"]
