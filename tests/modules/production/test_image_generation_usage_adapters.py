from __future__ import annotations

from pathlib import Path

from ai_anime.modules.production.infrastructure import image_generation_usage
from ai_anime.modules.production.infrastructure.image_generation_usage import (
    ConfiguredOperatorPasswordVerifier,
    SqliteProductionImageUsage,
)


def test_usage_adapter_delegates_summary_and_scope_count(monkeypatch) -> None:
    calls: list[tuple[str, dict]] = []

    def fake_summary(**kwargs):
        calls.append(("summary", kwargs))
        return {"total_requests": 2, "today_requests": 1}

    def fake_count(**kwargs):
        calls.append(("count", kwargs))
        return 4

    monkeypatch.setattr(image_generation_usage, "get_image_usage_summary", fake_summary)
    monkeypatch.setattr(image_generation_usage, "count_image_scope_attempts", fake_count)
    adapter = SqliteProductionImageUsage()

    summary = adapter.summary(
        Path("project"),
        task_types=("sketch_grid",),
        episode=2,
    )
    count = adapter.count_scope_attempts(
        Path("project"),
        task_type="sketch_grid",
        scope="grid:1",
        episode=2,
    )

    assert summary == {"total_requests": 2, "today_requests": 1}
    assert count == 4
    assert calls == [
        (
            "summary",
            {
                "project_output_dir": Path("project"),
                "task_types": ("sketch_grid",),
                "episode": 2,
            },
        ),
        (
            "count",
            {
                "project_output_dir": Path("project"),
                "task_type": "sketch_grid",
                "scope": "grid:1",
                "episode": 2,
            },
        ),
    ]


def test_password_adapter_fails_closed_and_matches_configured_value(monkeypatch) -> None:
    verifier = ConfiguredOperatorPasswordVerifier()
    monkeypatch.setattr(
        image_generation_usage,
        "get_prompt_export_password",
        lambda: None,
    )
    assert verifier.verify("") is False

    monkeypatch.setattr(
        image_generation_usage,
        "get_prompt_export_password",
        lambda: "secret",
    )
    assert verifier.verify("wrong") is False
    assert verifier.verify("secret") is True
