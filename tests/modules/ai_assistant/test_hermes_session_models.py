import pytest

from ai_anime.modules.ai_assistant.application import HermesSessionModels
from ai_anime.modules.ai_assistant.application.ports import (
    SessionModelRouteRejected,
)
from ai_anime.modules.ai_assistant.public import ChatScope


class RecordingThread:
    def __init__(self, route=(None, None), rejected_selector=None):
        self.route = route
        self.rejected_selector = rejected_selector
        self.set_calls = []

    async def get_model_route(self):
        return self.route

    async def set_model_route(self, selector, reasoning_effort=None):
        self.set_calls.append((selector, reasoning_effort))
        if (
            self.rejected_selector is not None
            and selector == self.rejected_selector
        ):
            raise SessionModelRouteRejected("route unavailable")
        self.route = (selector, reasoning_effort)
        return self.route


class MemoryModelRoutes:
    def __init__(self, route=None):
        self.route = route
        self.saved = []
        self.cleared = []
        self.paths = []

    def load_model_route(
        self,
        _username,
        _scope,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        self.paths.append((project_dir, project_state_dir))
        return self.route

    def save_model_route(
        self,
        _username,
        _scope,
        selector,
        reasoning_effort,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        self.route = (selector, reasoning_effort)
        self.saved.append(self.route)
        self.paths.append((project_dir, project_state_dir))

    def clear_model_route(
        self,
        _username,
        _scope,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        self.route = None
        self.cleared.append((_scope, project_dir, project_state_dir))


@pytest.mark.asyncio
async def test_current_reads_disabled_reasoning_without_starting_runtime() -> None:
    routes = MemoryModelRoutes((None, "none"))
    models = HermesSessionModels(routes)

    current = await models.current("alice", ChatScope(kind="home"))

    assert current == (None, "none")


@pytest.mark.asyncio
async def test_select_persists_the_route_without_starting_runtime(tmp_path) -> None:
    routes = MemoryModelRoutes()
    models = HermesSessionModels(routes)
    project_state_dir = tmp_path / "project-state"

    selected = await models.select(
        "alice",
        ChatScope(kind="project", id="show-1"),
        "cloud:text-model",
        "none",
        project_dir=tmp_path / "project-output",
        project_state_dir=project_state_dir,
    )

    assert selected == ("cloud:text-model", "none")
    assert routes.saved == [("cloud:text-model", "none")]
    assert routes.paths == [(tmp_path / "project-output", project_state_dir)]


@pytest.mark.asyncio
async def test_apply_to_restores_disabled_reasoning_before_streaming() -> None:
    thread = RecordingThread()
    routes = MemoryModelRoutes((None, "none"))
    models = HermesSessionModels(routes)

    selected = await models.apply_to(
        thread,
        "alice",
        ChatScope(kind="project", id="show-1"),
    )

    assert selected == (None, "none")
    assert thread.set_calls == [(None, "none")]


@pytest.mark.asyncio
async def test_apply_to_keeps_runtime_default_without_a_stored_route() -> None:
    thread = RecordingThread()
    models = HermesSessionModels(MemoryModelRoutes())

    selected = await models.apply_to(thread, "alice", ChatScope(kind="home"))

    assert selected is None
    assert thread.set_calls == []


@pytest.mark.asyncio
async def test_apply_to_clears_a_rejected_stored_route_and_uses_automatic() -> None:
    scope = ChatScope(kind="project", id="show-1")
    routes = MemoryModelRoutes(("cloud:removed-model", "high"))
    thread = RecordingThread(rejected_selector="cloud:removed-model")
    models = HermesSessionModels(routes)

    selected = await models.apply_to(thread, "alice", scope)

    assert selected == (None, None)
    assert thread.set_calls == [("cloud:removed-model", "high"), (None, None)]
    assert routes.route is None
    assert routes.cleared == [(scope, None, None)]


@pytest.mark.asyncio
async def test_apply_to_does_not_clear_transient_runtime_failures() -> None:
    class FailingThread(RecordingThread):
        async def set_model_route(self, selector, reasoning_effort=None):
            raise RuntimeError("切换当前对话模型超时")

    routes = MemoryModelRoutes(("cloud:text-model", "high"))
    models = HermesSessionModels(routes)

    with pytest.raises(RuntimeError, match="超时"):
        await models.apply_to(FailingThread(), "alice", ChatScope(kind="home"))

    assert routes.route == ("cloud:text-model", "high")
    assert routes.cleared == []
