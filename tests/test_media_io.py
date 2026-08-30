from __future__ import annotations

import subprocess
import threading
from types import SimpleNamespace

import pytest

from ai_anime.shared.utils import media_io


@pytest.fixture(autouse=True)
def ffprobe_available(monkeypatch) -> None:
    monkeypatch.setattr(media_io.shutil, "which", lambda _name: "ffprobe")


def test_get_audio_duration_rejects_ffprobe_failure(monkeypatch) -> None:
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="invalid media",
        ),
    )

    with pytest.raises(ValueError, match="invalid media"):
        media_io.get_audio_duration("broken.mp3")


def test_get_audio_duration_rejects_invalid_and_non_positive_output(
    monkeypatch,
) -> None:
    result = SimpleNamespace(returncode=0, stdout="not-a-number", stderr="")
    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: result)
    with pytest.raises(ValueError, match="invalid duration"):
        media_io.get_audio_duration("broken.mp3")

    result.stdout = "0"
    with pytest.raises(ValueError, match="non-positive"):
        media_io.get_audio_duration("empty.mp3")


def test_get_audio_duration_uses_bounded_utf8_decoding(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def run(_cmd, **kwargs):
        captured.update(kwargs)
        return SimpleNamespace(returncode=0, stdout="1.25\n", stderr="�诊断")

    monkeypatch.setattr(media_io.subprocess, "run", run)

    assert media_io.get_audio_duration("voice.mp3") == 1.25
    assert captured["encoding"] == "utf-8"
    assert captured["errors"] == "replace"
    assert captured["timeout"] == 30


def test_get_audio_duration_reports_probe_timeout(monkeypatch) -> None:
    def timeout(cmd, **_kwargs):
        raise subprocess.TimeoutExpired(cmd, 30)

    monkeypatch.setattr(media_io.subprocess, "run", timeout)

    with pytest.raises(ValueError, match="timed out after 30 seconds"):
        media_io.get_audio_duration("stuck.mp3")


@pytest.mark.asyncio
async def test_get_audio_duration_async_runs_probe_off_event_loop(monkeypatch) -> None:
    event_loop_thread = threading.get_ident()

    def probe(_audio_path: str) -> float:
        assert threading.get_ident() != event_loop_thread
        return 2.5

    monkeypatch.setattr(media_io, "get_audio_duration", probe)

    assert await media_io.get_audio_duration_async("voice.mp3") == 2.5
