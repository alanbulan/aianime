from __future__ import annotations

import json
from pathlib import Path

from openapi_contract import contract_snapshot, operation_fingerprints


SNAPSHOT_PATH = Path(__file__).with_name("openapi-contract.json")
DESKTOP_ONLY_OPERATIONS = {
    "POST /api/v1/auth/authorize",
    "POST /api/v1/auth/login",
}


def _openapi(*, desktop_mode: bool, monkeypatch):
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    if desktop_mode:
        monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")
        monkeypatch.setenv("AI_ANIME_DESKTOP_TOKEN", "openapi-contract-test")
    else:
        monkeypatch.delenv("AI_ANIME_DESKTOP_MODE", raising=False)
        monkeypatch.delenv("AI_ANIME_DESKTOP_TOKEN", raising=False)

    from ai_anime.api.app import create_app

    return create_app().openapi()


def test_openapi_contract_matches_the_refactoring_checkpoint(monkeypatch) -> None:
    expected = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))

    browser = _openapi(desktop_mode=False, monkeypatch=monkeypatch)
    desktop = _openapi(desktop_mode=True, monkeypatch=monkeypatch)

    assert contract_snapshot(browser) == expected["browser"]
    assert contract_snapshot(desktop) == expected["desktop"]


def test_only_desktop_auth_is_hidden_from_the_browser_api(monkeypatch) -> None:
    browser = set(
        operation_fingerprints(
            _openapi(desktop_mode=False, monkeypatch=monkeypatch)
        )
    )
    desktop = set(
        operation_fingerprints(
            _openapi(desktop_mode=True, monkeypatch=monkeypatch)
        )
    )

    assert desktop - browser == DESKTOP_ONLY_OPERATIONS
    assert browser - desktop == set()
