from pathlib import Path

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
