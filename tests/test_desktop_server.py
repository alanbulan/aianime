# Copyright (c) 2026 AI anime

from pathlib import Path

import pytest

from ai_anime.desktop_server import (
    DesktopOptions,
    configure_environment,
    configure_local_api_environment,
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
    assert "AI_ANIME_CLOUD_ADAPTER" not in __import__("os").environ
    assert "AI_ANIME_RELEASE_FEED_ADAPTER" not in __import__("os").environ
    assert "AI_ANIME_CONTROL_PLANE_DSN" not in __import__("os").environ


def test_desktop_socket_uses_an_available_port() -> None:
    listener = create_listening_socket("127.0.0.1", 0)
    try:
        assert int(listener.getsockname()[1]) > 0
    finally:
        listener.close()


def test_desktop_dynamic_port_is_visible_before_agent_composition(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for name in ("AI_ANIME_API_HOST", "AI_ANIME_API_PORT", "AI_ANIME_API_URL"):
        monkeypatch.delenv(name, raising=False)

    configure_local_api_environment("127.0.0.1", 52903)

    env = __import__("os").environ
    assert env["AI_ANIME_API_HOST"] == "127.0.0.1"
    assert env["AI_ANIME_API_PORT"] == "52903"
    assert env["AI_ANIME_API_URL"] == "http://127.0.0.1:52903"
