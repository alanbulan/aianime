import asyncio

import pytest

from ai_anime.modules.ai_assistant.application import (
    ChatDecisionCancelled,
    ChatDecisionInvalid,
    ChatDecisionUnavailable,
    ChatDecisions,
)
from ai_anime.modules.ai_assistant.public import ChatScope


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _questions() -> list[dict]:
    return [
        {
            "id": "resolution",
            "header": "分辨率",
            "question": "本次视频使用哪种分辨率？",
            "options": [
                {
                    "id": "1080p",
                    "label": "1080p",
                    "description": "画质更高，生成成本也更高。",
                },
                {
                    "id": "720p",
                    "label": "720p",
                    "description": "速度与画质更均衡。",
                },
            ],
            "recommended_option_id": "1080p",
            "allow_custom": False,
        }
    ]


@pytest.mark.anyio
async def test_decision_waits_for_answer_and_emits_persistent_lifecycle() -> None:
    decisions = ChatDecisions()
    scope = ChatScope(kind="project", id="project-1")
    emitted: list[dict] = []
    persisted: list[dict] = []
    required = asyncio.Event()

    async def emit(event: dict) -> None:
        emitted.append(event)
        if event["type"] == "decision_required":
            required.set()

    async def persist(event: dict) -> None:
        persisted.append(event)

    async with decisions.activate("alice", scope, "turn-1", emit, persist):
        task = asyncio.create_task(
            decisions.ask(
                "alice",
                project_id="project-1",
                title="生成前确认",
                questions=_questions(),
            )
        )
        await asyncio.wait_for(required.wait(), timeout=1)

        pending = decisions.pending_for_scope("alice", scope)
        assert len(pending) == 1
        assert pending[0]["questions"] == _questions()
        assert not task.done()

        decision_id = pending[0]["id"]
        resolved = await decisions.resolve(
            "alice",
            decision_id,
            [{"question_id": "resolution", "option_id": "1080p"}],
        )
        result = await task

    assert resolved == result
    assert result["answers"] == [
        {
            "question_id": "resolution",
            "option_id": "1080p",
            "label": "1080p",
            "value": "1080p",
        }
    ]
    assert [event["type"] for event in emitted] == [
        "decision_required",
        "decision_resolved",
    ]
    assert persisted == emitted
    assert decisions.pending_for_scope("alice", scope) == []


@pytest.mark.anyio
async def test_decision_rejects_incomplete_or_invalid_answers() -> None:
    decisions = ChatDecisions()
    scope = ChatScope(kind="home")
    required = asyncio.Event()

    async def emit(event: dict) -> None:
        if event["type"] == "decision_required":
            required.set()

    async def persist(_event: dict) -> None:
        return None

    async with decisions.activate("alice", scope, "turn-1", emit, persist):
        task = asyncio.create_task(
            decisions.ask(
                "alice",
                project_id=None,
                title="确认",
                questions=_questions(),
            )
        )
        await asyncio.wait_for(required.wait(), timeout=1)
        decision_id = decisions.pending_for_scope("alice", scope)[0]["id"]

        with pytest.raises(ChatDecisionInvalid, match="全部问题"):
            await decisions.resolve("alice", decision_id, [])
        with pytest.raises(ChatDecisionInvalid, match="选项无效"):
            await decisions.resolve(
                "alice",
                decision_id,
                [{"question_id": "resolution", "option_id": "4k"}],
            )

        await decisions.resolve(
            "alice",
            decision_id,
            [{"question_id": "resolution", "option_id": "720p"}],
        )
        await task


@pytest.mark.anyio
async def test_decision_cancellation_resumes_blocked_request_with_error() -> None:
    decisions = ChatDecisions()
    scope = ChatScope(kind="home")
    emitted: list[dict] = []
    required = asyncio.Event()

    async def emit(event: dict) -> None:
        emitted.append(event)
        if event["type"] == "decision_required":
            required.set()

    async def persist(_event: dict) -> None:
        return None

    async with decisions.activate("alice", scope, "turn-1", emit, persist):
        task = asyncio.create_task(
            decisions.ask(
                "alice",
                project_id=None,
                title="确认",
                questions=_questions(),
            )
        )
        await asyncio.wait_for(required.wait(), timeout=1)

        assert await decisions.cancel_for_user("alice") == 1
        with pytest.raises(ChatDecisionCancelled, match="已取消"):
            await task

    assert emitted[-1]["type"] == "decision_resolved"
    assert emitted[-1]["status"] == "cancelled"


@pytest.mark.anyio
async def test_decision_requires_matching_live_project_context() -> None:
    decisions = ChatDecisions()
    scope = ChatScope(kind="project", id="project-1")

    async def sink(_event: dict) -> None:
        return None

    with pytest.raises(ChatDecisionUnavailable, match="聊天轮次"):
        await decisions.ask(
            "alice",
            project_id="project-1",
            title="确认",
            questions=_questions(),
        )

    async with decisions.activate("alice", scope, "turn-1", sink, sink):
        with pytest.raises(ChatDecisionUnavailable, match="项目不一致"):
            await decisions.ask(
                "alice",
                project_id="project-2",
                title="确认",
                questions=_questions(),
            )


@pytest.mark.anyio
async def test_home_and_project_decision_contexts_do_not_block_each_other() -> None:
    decisions = ChatDecisions()

    async def sink(_event: dict) -> None:
        return None

    home = ChatScope(kind="home")
    project = ChatScope(kind="project", id="project-1")
    async with decisions.activate("alice", home, "home-turn", sink, sink):
        async with decisions.activate(
            "alice",
            project,
            "project-turn",
            sink,
            sink,
        ):
            with pytest.raises(ChatDecisionUnavailable, match="当前项目"):
                async with decisions.activate(
                    "alice",
                    project,
                    "duplicate-project-turn",
                    sink,
                    sink,
                ):
                    pass
