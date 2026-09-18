from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.api.routes.model_usage import gateway
from ai_anime.modules.task_execution.domain.execution_policy import (
    ManagedExecutionPolicy,
)
from ai_anime.modules.task_execution.domain.admission import (
    GlobalLaneQueueLimitExceeded,
)
from ai_anime.modules.task_execution.infrastructure import admission_policy as policy
from ai_anime.modules.task_execution.infrastructure.inline_backend import (
    InlineTaskBackend,
    _InlineLaneJob,
)


def wire(**updates):
    return {
        "desktopGeneralConcurrency": 4,
        "desktopGeneralQueue": 32,
        "desktopVideoConcurrency": 2,
        "desktopVideoQueue": 1,
        "version": 1,
        **updates,
    }


@pytest.fixture(autouse=True)
def reset_policy():
    policy.configure_managed_policy(None)
    yield
    policy.configure_managed_policy(None)


def test_managed_policy_does_not_reduce_single_user_to_one_video():
    policy.configure_managed_policy(ManagedExecutionPolicy.from_wire(wire()))
    assert (
        policy.project_lane_effective_active_limit("video", eligible_user_count=1) == 3
    )
    assert policy.project_user_lane_active_limit("video") == 3
    assert policy.global_lane_concurrency("video") == 2
    assert policy.global_lane_queue_limit("video") == 1
    policy.configure_managed_policy(
        ManagedExecutionPolicy.from_wire(wire(desktopVideoQueue=0))
    )
    assert policy.global_lane_queue_limit("video") == 0
    for value in (0, 9, "2", True, -1, 1.5):
        with pytest.raises(ValueError):
            ManagedExecutionPolicy.from_wire(wire(desktopVideoConcurrency=value))
    with pytest.raises(ValueError):
        ManagedExecutionPolicy.from_wire({**wire(), "unknown": 1})


@pytest.mark.asyncio
async def test_actual_scheduler_applies_running_waiting_and_hot_changes(monkeypatch):
    backend = InlineTaskBackend(
        execute_project_task=lambda *a, **kw: {},
        cancellation_store_provider=lambda: None,
        process_killer=lambda _: 0,
    )
    gates = {str(i): asyncio.Event() for i in range(4)}
    started = []
    failed = []

    async def run(lane, job):
        started.append(job.run_task_id)
        await gates[job.run_task_id].wait()

    monkeypatch.setattr(backend, "_run_inline", run)
    backend.configure_execution_policy(ManagedExecutionPolicy.from_wire(wire()))
    manager = SimpleNamespace(fail_task_for_project=lambda *a, **kw: failed.append(kw))

    def job(i):
        return _InlineLaneJob(
            envelope={
                "project_id": "project",
                "task_type": "video",
                "queue_kind": "video",
            },
            ctx=SimpleNamespace(project_id="project"),
            manager=manager,
            run_task_id=str(i),
            metadata={},
        )

    try:
        for i in range(3):
            await backend._submit_lane_job(job(i))
        await asyncio.sleep(0)
        assert backend.lane_snapshot()["video"] == {
            "active": 2,
            "queued": 1,
            "concurrency": 2,
        }
        with pytest.raises(GlobalLaneQueueLimitExceeded):
            await backend._submit_lane_job(job(3))
        assert len(failed) == 1
        backend.configure_execution_policy(
            ManagedExecutionPolicy.from_wire(wire(desktopVideoConcurrency=1, version=2))
        )
        assert backend.lane_snapshot()["video"]["active"] == 2
        gates["0"].set()
        for _ in range(5):
            await asyncio.sleep(0)
        assert backend.lane_snapshot()["video"] == {
            "active": 1,
            "queued": 1,
            "concurrency": 1,
        }
        backend.configure_execution_policy(
            ManagedExecutionPolicy.from_wire(wire(desktopVideoConcurrency=2, version=3))
        )
        await asyncio.sleep(0)
        assert started == ["0", "1", "2"]
        assert backend.lane_snapshot()["video"]["queued"] == 0
    finally:
        for gate in gates.values():
            gate.set()
        await asyncio.gather(*backend._background_tasks)
        for lane in backend._lanes.values():
            lane.executor.shutdown(wait=True)


def test_local_policy_route_rejects_renderer_without_admin_token(monkeypatch):
    from ai_anime.modules.task_execution import public

    applied = []
    monkeypatch.setenv("AI_ANIME_MODEL_ADMIN_TOKEN", "policy-contract-test")
    monkeypatch.setattr(public, "configure_desktop_execution_policy", applied.append)
    app = FastAPI()
    app.include_router(gateway.router, prefix="/api/v1")
    client = TestClient(app)
    url = "/api/v1/model-gateway/internal/execution-policy"
    headers = {"X-AI-Anime-Model-Admin-Token": "policy-contract-test"}
    assert client.post(url, json=wire()).status_code == 403
    assert (
        client.post(
            url, json={**wire(), "billingVersion": "METERED_V2"}, headers=headers
        ).status_code
        == 422
    )
    assert (
        client.post(
            url, json=wire(desktopVideoConcurrency=True), headers=headers
        ).status_code
        == 422
    )
    assert client.post(url, json=wire(), headers=headers).status_code == 200
    assert applied == [wire()]
    assert (
        client.post(
            url, content="null", headers={**headers, "Content-Type": "application/json"}
        ).status_code
        == 200
    )
    assert applied[-1] is None
