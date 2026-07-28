import pytest

from ai_anime.modules.ai_assistant.infrastructure import LocalHermesRuntime
from ai_anime.modules.ai_assistant.public import get_hermes_runtime


class StubHermesPool:
    def __init__(self):
        self.thread = object()
        self.calls = []

    async def get_for_user(self, username, *, scope_kind, project_id):
        self.calls.append(("get", username, scope_kind, project_id))
        return self.thread

    async def prewarm(self, username, *, scope_kind, project_id):
        self.calls.append(("prewarm", username, scope_kind, project_id))

    async def set_scope_for_user(self, username, *, scope_kind, project_id):
        self.calls.append(("set_scope", username, scope_kind, project_id))
        return True

    async def close_user(self, username):
        self.calls.append(("close", username))
        return True


def test_hermes_runtime_composition_returns_one_process_instance():
    assert get_hermes_runtime() is get_hermes_runtime()


@pytest.mark.anyio
async def test_local_hermes_runtime_delegates_worker_lifecycle():
    pool = StubHermesPool()
    runtime = LocalHermesRuntime(pool)

    thread = await runtime.get_for_user(
        "alice",
        scope_kind="project",
        project_id="project-a",
    )
    await runtime.prewarm(
        "alice",
        scope_kind="project",
        project_id="project-a",
    )
    scope_updated = await runtime.set_scope_for_user(
        "alice",
        scope_kind="home",
        project_id=None,
    )
    closed = await runtime.close_user("alice")

    assert thread is pool.thread
    assert scope_updated is True
    assert closed is True
    assert pool.calls == [
        ("get", "alice", "project", "project-a"),
        ("prewarm", "alice", "project", "project-a"),
        ("set_scope", "alice", "home", None),
        ("close", "alice"),
    ]
