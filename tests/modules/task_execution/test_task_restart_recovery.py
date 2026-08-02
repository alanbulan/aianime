from datetime import datetime, timezone

from ai_anime.modules.task_execution.domain.task_restart_recovery import (
    ACTIVE_PROJECT_TASK_STATUSES,
    TERMINAL_TASK_STATUSES,
    build_interrupted_inline_recovery_plan,
)


def test_interrupted_inline_recovery_plan_owns_task_lifecycle_rules() -> None:
    plan = build_interrupted_inline_recovery_plan(
        process_started_at=datetime(2026, 8, 1, 8, 0, tzinfo=timezone.utc),
        recovered_at=datetime(2026, 8, 1, 8, 5, tzinfo=timezone.utc),
        terminal_ttl_seconds=3600,
    )

    assert set(plan.active_statuses) == ACTIVE_PROJECT_TASK_STATUSES
    assert TERMINAL_TASK_STATUSES == {"completed", "failed", "cancelled"}
    assert plan.backend == "inline"
    assert plan.status == "failed"
    assert "重启" in plan.error
    assert plan.updated_before == "2026-08-01T08:00:00.000000Z"
    assert plan.recovered_at == "2026-08-01T08:05:00.000000Z"
    assert plan.expires_at == "2026-08-01T09:05:00.000000Z"


def test_interrupted_inline_recovery_normalizes_naive_process_timestamp() -> None:
    plan = build_interrupted_inline_recovery_plan(
        process_started_at=datetime(2026, 8, 1, 8, 0),
        recovered_at=datetime(2026, 8, 1, 8, 5, tzinfo=timezone.utc),
        terminal_ttl_seconds=60,
    )

    assert plan.updated_before == "2026-08-01T08:00:00.000000Z"
