import pytest

from ai_anime.modules.ai_assistant.application import HermesRuntimePrewarmer
from ai_anime.modules.ai_assistant.public import get_hermes_runtime_prewarmer


class StubHermesRuntime:
    def __init__(self, *, error=None):
        self.error = error
        self.calls = []

    async def prewarm(self, username, *, scope_kind, project_id, conversation_id):
        self.calls.append((username, scope_kind, project_id, conversation_id))
        if self.error is not None:
            raise self.error


def test_hermes_runtime_prewarmer_composition_returns_one_process_instance():
    assert get_hermes_runtime_prewarmer() is get_hermes_runtime_prewarmer()


@pytest.mark.anyio
async def test_hermes_runtime_prewarmer_warms_project_scope():
    runtime = StubHermesRuntime()

    await HermesRuntimePrewarmer(runtime).prewarm(
        "alice",
        project="project-a",
    )

    assert runtime.calls == [("alice", "project", "project-a", "main")]


@pytest.mark.anyio
async def test_hermes_runtime_prewarmer_warms_home_scope():
    runtime = StubHermesRuntime()

    await HermesRuntimePrewarmer(runtime).prewarm("alice")

    assert runtime.calls == [("alice", "home", None, "main")]


@pytest.mark.anyio
async def test_hermes_runtime_prewarmer_ignores_runtime_failure():
    runtime = StubHermesRuntime(error=RuntimeError("prewarm failed"))

    await HermesRuntimePrewarmer(runtime).prewarm(
        "alice",
        project="project-a",
    )

    assert runtime.calls == [("alice", "project", "project-a", "main")]
