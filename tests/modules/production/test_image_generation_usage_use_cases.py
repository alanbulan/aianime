from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.image_generation_usage import (
    ImageGenerationGuardQuery,
    ImageGenerationUsageUseCases,
)


class _Usage:
    def __init__(self) -> None:
        self.summary_calls: list[dict[str, Any]] = []
        self.count_calls: list[dict[str, Any]] = []

    def summary(
        self,
        project_output_dir: Path,
        **kwargs: Any,
    ) -> dict[str, int]:
        self.summary_calls.append(
            {"project_output_dir": project_output_dir, **kwargs}
        )
        return {"total_requests": 7, "today_requests": 3}

    def count_scope_attempts(
        self,
        project_output_dir: Path,
        **kwargs: Any,
    ) -> int:
        self.count_calls.append(
            {"project_output_dir": project_output_dir, **kwargs}
        )
        return 4


class _Passwords:
    def __init__(self) -> None:
        self.candidates: list[str] = []

    def verify(self, candidate: str) -> bool:
        self.candidates.append(candidate)
        return candidate == "secret"


def test_sketch_usage_reads_only_sketch_grid_attempts_for_episode() -> None:
    usage = _Usage()
    use_cases = ImageGenerationUsageUseCases(usage, _Passwords())

    result = use_cases.sketch_usage(Path("project"), 2)

    assert result == {"total_requests": 7, "today_requests": 3}
    assert usage.summary_calls == [
        {
            "project_output_dir": Path("project"),
            "task_types": ("sketch_grid",),
            "episode": 2,
        }
    ]


def test_guard_counts_exact_scope_and_applies_domain_level() -> None:
    usage = _Usage()
    use_cases = ImageGenerationUsageUseCases(usage, _Passwords())

    result = use_cases.guard(
        ImageGenerationGuardQuery(
            project_dir=Path("project"),
            episode_num=2,
            task_type="sketch_grid",
            scope="grid:1",
            subject="Beat 3",
        )
    )

    assert result.level == "locked"
    assert result.next_attempt == 5
    assert usage.count_calls == [
        {
            "project_output_dir": Path("project"),
            "task_type": "sketch_grid",
            "scope": "grid:1",
            "episode": 2,
        }
    ]


def test_password_verification_delegates_to_configured_verifier() -> None:
    passwords = _Passwords()
    use_cases = ImageGenerationUsageUseCases(_Usage(), passwords)

    assert use_cases.verify_operator_password("wrong") is False
    assert use_cases.verify_operator_password("secret") is True
    assert passwords.candidates == ["wrong", "secret"]
