import pytest

from ai_anime.modules.ai_assistant.application import AgentBackendPrewarmer
from ai_anime.modules.ai_assistant.public import get_agent_backend_prewarmer


class StubBackend:
    def __init__(self, name="hermes", *, error=None):
        self.backend_name = name
        self.error = error
        self.calls = 0

    def name(self):
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.backend_name


class StubHermesRuntime:
    def __init__(self, *, error=None):
        self.error = error
        self.calls = []

    async def prewarm(self, username, *, scope_kind, project_id):
        self.calls.append((username, scope_kind, project_id))
        if self.error is not None:
            raise self.error


def test_agent_backend_prewarmer_composition_returns_one_process_instance():
    assert get_agent_backend_prewarmer() is get_agent_backend_prewarmer()


@pytest.mark.anyio
async def test_agent_backend_prewarmer_warms_project_scope_for_hermes():
    backend = StubBackend()
    runtime = StubHermesRuntime()

    await AgentBackendPrewarmer(backend, runtime).prewarm(
        "alice",
        project="project-a",
    )

    assert backend.calls == 1
    assert runtime.calls == [("alice", "project", "project-a")]


@pytest.mark.anyio
async def test_agent_backend_prewarmer_warms_home_scope_for_hermes():
    runtime = StubHermesRuntime()

    await AgentBackendPrewarmer(StubBackend(), runtime).prewarm("alice")

    assert runtime.calls == [("alice", "home", None)]


@pytest.mark.anyio
async def test_agent_backend_prewarmer_skips_other_backends():
    runtime = StubHermesRuntime()

    await AgentBackendPrewarmer(StubBackend("codex"), runtime).prewarm(
        "alice",
        project="project-a",
    )

    assert runtime.calls == []


@pytest.mark.anyio
async def test_agent_backend_prewarmer_ignores_backend_detection_failure():
    runtime = StubHermesRuntime()
    backend = StubBackend(error=RuntimeError("backend unavailable"))

    await AgentBackendPrewarmer(backend, runtime).prewarm("alice")

    assert runtime.calls == []


@pytest.mark.anyio
async def test_agent_backend_prewarmer_ignores_runtime_failure():
    runtime = StubHermesRuntime(error=RuntimeError("prewarm failed"))

    await AgentBackendPrewarmer(StubBackend(), runtime).prewarm(
        "alice",
        project="project-a",
    )

    assert runtime.calls == [("alice", "project", "project-a")]
