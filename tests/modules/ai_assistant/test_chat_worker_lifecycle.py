import pytest

from ai_anime.modules.ai_assistant.application import ChatWorkerLifecycle
from ai_anime.modules.ai_assistant.public import ChatScope, get_chat_worker_lifecycle


class StubHermesRuntime:
    def __init__(self, *, close_result=True, close_error=None, scope_error=None):
        self.close_result = close_result
        self.close_error = close_error
        self.scope_error = scope_error
        self.closed = []
        self.scopes = []

    async def close_user(self, username):
        self.closed.append(username)
        if self.close_error is not None:
            raise self.close_error
        return self.close_result

    async def set_scope_for_user(self, username, *, scope_kind, project_id):
        self.scopes.append((username, scope_kind, project_id))
        if self.scope_error is not None:
            raise self.scope_error
        return True


class StubRunLocks:
    def __init__(self, *, active=True, force_error=None):
        self.active = active
        self.force_error = force_error
        self.force_released = []
        self.active_calls = []

    def force_release(self, username, project):
        self.force_released.append((username, project))
        if self.force_error is not None:
            raise self.force_error

    def is_active(self, username, project=""):
        self.active_calls.append((username, project))
        return self.active


def test_chat_worker_lifecycle_composition_returns_one_process_instance():
    assert get_chat_worker_lifecycle() is get_chat_worker_lifecycle()


@pytest.mark.anyio
async def test_chat_worker_lifecycle_cancels_worker_and_releases_user_lock():
    runtime = StubHermesRuntime(close_result=True)
    locks = StubRunLocks()

    cancelled = await ChatWorkerLifecycle(runtime, locks).cancel("alice")

    assert cancelled is True
    assert runtime.closed == ["alice"]
    assert locks.force_released == [("alice", "")]


@pytest.mark.anyio
async def test_chat_worker_lifecycle_releases_lock_when_close_fails():
    runtime = StubHermesRuntime(close_error=RuntimeError("close failed"))
    locks = StubRunLocks()

    cancelled = await ChatWorkerLifecycle(runtime, locks).cancel("alice")

    assert cancelled is False
    assert locks.force_released == [("alice", "")]


@pytest.mark.anyio
async def test_chat_worker_lifecycle_ignores_lock_release_failure():
    runtime = StubHermesRuntime(close_result=True)
    locks = StubRunLocks(force_error=RuntimeError("release failed"))

    cancelled = await ChatWorkerLifecycle(runtime, locks).cancel("alice")

    assert cancelled is True
    assert locks.force_released == [("alice", "")]


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("scope", "expected"),
    [
        (ChatScope(kind="home"), ("alice", "home", None)),
        (
            ChatScope(kind="project", id="project-a"),
            ("alice", "project", "project-a"),
        ),
    ],
)
async def test_chat_worker_lifecycle_syncs_scope(scope, expected):
    runtime = StubHermesRuntime()

    await ChatWorkerLifecycle(runtime, StubRunLocks()).sync_scope("alice", scope)

    assert runtime.scopes == [expected]


@pytest.mark.anyio
async def test_chat_worker_lifecycle_ignores_scope_sync_failure():
    runtime = StubHermesRuntime(scope_error=RuntimeError("scope failed"))

    await ChatWorkerLifecycle(runtime, StubRunLocks()).sync_scope(
        "alice",
        ChatScope(kind="project", id="project-a"),
    )

    assert runtime.scopes == [("alice", "project", "project-a")]


def test_chat_worker_lifecycle_reports_busy_state():
    locks = StubRunLocks(active=True)

    busy = ChatWorkerLifecycle(StubHermesRuntime(), locks).is_busy("alice")

    assert busy is True
    assert locks.active_calls == [("alice", "")]
