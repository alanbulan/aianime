from pathlib import Path
from types import SimpleNamespace

import asyncio
import json

import pytest

from ai_anime.modules.ai_assistant.infrastructure.hermes.hermes_sdk import (
    HermesSdkThread,
)


@pytest.mark.asyncio
async def test_null_session_load_result_falls_back_to_new_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    thread = HermesSdkThread(
        cli_path=tmp_path / "hermes-acp.exe",
        cwd=tmp_path,
        env={},
        model=None,
        username="alice",
        session_id="stale-session",
    )
    calls: list[tuple[str, dict]] = []
    responses = iter(
        [
            ({"jsonrpc": "2.0", "id": 1, "result": None}, []),
            (
                {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "result": {"sessionId": "fresh-session"},
                },
                [],
            ),
        ]
    )

    async def fake_send(method: str, params: dict) -> int:
        calls.append((method, params))
        return len(calls)

    async def fake_read_until_id(_target_id: int, _timeout: float):
        return next(responses)

    monkeypatch.setattr(thread, "_send", fake_send)
    monkeypatch.setattr(thread, "_read_until_id", fake_read_until_id)

    await thread._ensure_session()

    assert [method for method, _params in calls] == ["session/load", "session/new"]
    assert thread.id == "fresh-session"


@pytest.mark.asyncio
async def test_warm_waits_for_an_active_stream_turn(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    thread = HermesSdkThread(
        cli_path=tmp_path / "hermes-acp.exe",
        cwd=tmp_path,
        env={},
        model=None,
        username="alice",
        session_id=None,
    )
    prepare_calls = 0

    async def fake_prepare() -> None:
        nonlocal prepare_calls
        prepare_calls += 1
        thread._proc = SimpleNamespace(stdout=object())

    monkeypatch.setattr(thread, "_prepare", fake_prepare)

    stream = thread.stream("hello")
    first_event = await anext(stream)
    assert first_event.type == "thread_started"

    warm_task = asyncio.create_task(thread.warm())
    await asyncio.sleep(0)
    assert not warm_task.done()
    assert prepare_calls == 1

    await stream.aclose()
    await asyncio.wait_for(warm_task, timeout=1)
    assert prepare_calls == 2


@pytest.mark.asyncio
async def test_second_stream_waits_for_the_first_stream_turn(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    thread = HermesSdkThread(
        cli_path=tmp_path / "hermes-acp.exe",
        cwd=tmp_path,
        env={},
        model=None,
        username="alice",
        session_id=None,
    )

    async def fake_prepare() -> None:
        thread._proc = SimpleNamespace(stdout=object())

    monkeypatch.setattr(thread, "_prepare", fake_prepare)

    first_stream = thread.stream("first")
    assert (await anext(first_stream)).type == "thread_started"

    second_stream = thread.stream("second")
    second_event_task = asyncio.create_task(anext(second_stream))
    await asyncio.sleep(0)
    assert not second_event_task.done()

    await first_stream.aclose()
    second_event = await asyncio.wait_for(second_event_task, timeout=1)
    assert second_event.type == "thread_started"
    await second_stream.aclose()


@pytest.mark.asyncio
async def test_context_chunk_error_retries_once_with_fresh_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    thread = HermesSdkThread(
        cli_path=tmp_path / "hermes-acp.exe",
        cwd=tmp_path,
        env={},
        model=None,
        username="alice",
        session_id="oversized-session",
    )
    prepare_calls = 0
    send_calls = 0
    reset_reasons: list[str] = []

    class _Stdout:
        def __init__(self, frame: dict) -> None:
            self._frames = [json.dumps(frame).encode("utf-8") + b"\n"]

        async def readline(self) -> bytes:
            return self._frames.pop(0) if self._frames else b""

    async def fake_prepare() -> None:
        nonlocal prepare_calls
        prepare_calls += 1
        thread.id = f"session-{prepare_calls}"
        frame = (
            {
                "jsonrpc": "2.0",
                "id": 1,
                "error": {
                    "message": "Separator is found, but chunk is longer than limit"
                },
            }
            if prepare_calls == 1
            else {"jsonrpc": "2.0", "id": 2, "result": {}}
        )
        thread._proc = SimpleNamespace(stdout=_Stdout(frame))

    async def fake_send(_method: str, _params: dict) -> int:
        nonlocal send_calls
        send_calls += 1
        return send_calls

    async def fake_reset(reason: str) -> None:
        reset_reasons.append(reason)
        thread._proc = None
        thread.id = ""

    monkeypatch.setattr(thread, "_prepare", fake_prepare)
    monkeypatch.setattr(thread, "_send", fake_send)
    monkeypatch.setattr(thread, "_reset_for_fresh_session", fake_reset)

    events = [event async for event in thread.stream("继续", current_project="p1")]

    assert prepare_calls == 2
    assert len(reset_reasons) == 1
    assert "chunk is longer than limit" in reset_reasons[0]
    assert [event.thread_id for event in events if event.type == "thread_started"] == [
        "session-1",
        "session-2",
    ]
    assert events[-1].type == "complete"
    assert events[-1].text == ""


@pytest.mark.asyncio
async def test_context_chunk_error_does_not_retry_after_tool_call(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    thread = HermesSdkThread(
        cli_path=tmp_path / "hermes-acp.exe",
        cwd=tmp_path,
        env={},
        model=None,
        username="alice",
        session_id=None,
    )
    reset_calls = 0

    class _Stdout:
        def __init__(self) -> None:
            self._frames = [
                {
                    "jsonrpc": "2.0",
                    "method": "session/update",
                    "params": {
                        "update": {
                            "sessionUpdate": "tool_call",
                            "toolCallId": "call-1",
                            "title": "ai_anime_pipeline_status",
                        }
                    },
                },
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "error": {
                        "message": "Separator is found, but chunk is longer than limit"
                    },
                },
            ]

        async def readline(self) -> bytes:
            if not self._frames:
                return b""
            return json.dumps(self._frames.pop(0)).encode("utf-8") + b"\n"

    async def fake_prepare() -> None:
        thread.id = "session-1"
        thread._proc = SimpleNamespace(stdout=_Stdout())

    async def fake_send(_method: str, _params: dict) -> int:
        return 1

    async def fake_reset(_reason: str) -> None:
        nonlocal reset_calls
        reset_calls += 1

    monkeypatch.setattr(thread, "_prepare", fake_prepare)
    monkeypatch.setattr(thread, "_send", fake_send)
    monkeypatch.setattr(thread, "_reset_for_fresh_session", fake_reset)

    events = [event async for event in thread.stream("继续")]

    assert reset_calls == 0
    assert any(event.type == "tool_update" for event in events)
    assert events[-1].type == "complete"
    assert "Separator is found" in str(events[-1].text)


def test_skill_view_title_keeps_canonical_name_for_result_event(tmp_path: Path) -> None:
    thread = HermesSdkThread(
        cli_path=tmp_path / "hermes-acp.exe",
        cwd=tmp_path,
        env={},
        model=None,
        username="alice",
        session_id="session-1",
    )
    call = thread._translate_notification(
        {
            "method": "session/update",
            "params": {
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "call-1",
                    "title": "skill view ai-anime",
                }
            },
        },
        "turn-1",
    )
    result = thread._translate_notification(
        {
            "method": "session/update",
            "params": {
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "call-1",
                    "status": "failed",
                    "result": "Skill view failed: Skill 'ai-anime' not found.",
                }
            },
        },
        "turn-1",
    )

    assert call is not None and call.name == "skill_view"
    assert result is not None and result.name == "skill_view"
