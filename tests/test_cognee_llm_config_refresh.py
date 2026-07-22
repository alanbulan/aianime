"""Cognee keeps startup credentials until the CE process restarts."""

import pytest


def test_first_ce_gateway_configuration_does_not_require_restart(monkeypatch):
    from ai_anime.cognee import config as nv_config

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setattr(nv_config, "_active_gateway_fingerprint", None)
    monkeypatch.setattr(nv_config, "_current_gateway_fingerprint", lambda: "configured")

    assert nv_config.cognee_gateway_restart_required() is False


def test_init_cognee_rejects_gateway_change_until_restart(monkeypatch):
    from ai_anime.cognee import config as nv_config

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setattr(nv_config, "_active_gateway_fingerprint", "old")
    monkeypatch.setattr(nv_config, "_current_gateway_fingerprint", lambda: "new")

    assert nv_config.cognee_gateway_restart_required() is True
    with pytest.raises(RuntimeError, match="请重启 AI anime"):
        nv_config.init_cognee()
