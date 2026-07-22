# Copyright (c) 2026 AI anime

from pathlib import Path

import pytest

from ai_anime.desktop_server import (
    DesktopOptions,
    configure_environment,
    create_listening_socket,
    parse_options,
)


def test_desktop_server_rejects_non_loopback_host(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="loopback"):
        parse_options(
            ["--host", "0.0.0.0", "--data-root", str(tmp_path)]
        )


def test_desktop_environment_uses_isolated_local_directories(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_ANIME_DESKTOP_TOKEN", "desktop-test-token")
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "postgresql://should-be-removed")
    options = DesktopOptions(
        host="127.0.0.1",
        port=0,
        data_root=tmp_path,
        frontend_dist=None,
        ffmpeg_path=None,
    )

    configure_environment(options)

    assert (tmp_path / "state").is_dir()
    assert (tmp_path / "output").is_dir()
    assert (tmp_path / "runtime").is_dir()
    assert __import__("os").environ["AI_ANIME_EDITION"] == "ce"
    assert __import__("os").environ["AI_ANIME_CLOUD_ADAPTER"] == "mock"
    assert "AI_ANIME_CONTROL_PLANE_DSN" not in __import__("os").environ


def test_desktop_socket_uses_an_available_port() -> None:
    listener = create_listening_socket("127.0.0.1", 0)
    try:
        assert int(listener.getsockname()[1]) > 0
    finally:
        listener.close()
