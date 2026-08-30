"""Tests for the canonical local AI Assistant state root."""

from __future__ import annotations

from ai_anime.modules.ai_assistant.infrastructure import local_state


def test_local_state_prefers_explicit_state_root(monkeypatch, tmp_path):
    expected = tmp_path / "configured-state"
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(expected))
    monkeypatch.setenv("AI_ANIME_DATA_ROOT", str(tmp_path / "data"))

    assert local_state.local_state_root() == expected.resolve()


def test_local_state_falls_back_to_configured_data_root(monkeypatch, tmp_path):
    data_root = tmp_path / "data"
    monkeypatch.delenv("AI_ANIME_STATE_DIR", raising=False)
    monkeypatch.setenv("AI_ANIME_DATA_ROOT", str(data_root))

    assert local_state.local_state_root() == data_root.resolve() / "state"


def test_local_state_falls_back_to_project_root(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_ANIME_STATE_DIR", raising=False)
    monkeypatch.delenv("AI_ANIME_DATA_ROOT", raising=False)
    monkeypatch.setattr(local_state, "project_root", lambda: tmp_path)

    assert local_state.local_state_root() == tmp_path.resolve() / "state"
