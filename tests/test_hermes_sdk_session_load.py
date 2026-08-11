from pathlib import Path
from types import SimpleNamespace

import asyncio

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
