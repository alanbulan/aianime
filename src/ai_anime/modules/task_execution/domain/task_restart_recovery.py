"""Task lifecycle rules for recovering work interrupted by a process restart."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


ACTIVE_PROJECT_TASK_STATUSES = frozenset({"submitting", "queued", "running"})
TERMINAL_TASK_STATUSES = frozenset({"completed", "failed", "cancelled"})
PROJECT_TASK_CHILD_PROCESS_ENV = "AI_ANIME_PROJECT_TASK_CHILD_PROCESS"


@dataclass(frozen=True)
class InterruptedTaskRecoveryPlan:
    active_statuses: tuple[str, ...]
    backend: str
    status: str
    error: str
    updated_before: str
    recovered_at: str
    expires_at: str


def _utc_iso(value: datetime) -> str:
    normalized = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return (
        normalized.astimezone(timezone.utc)
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z")
    )


def build_interrupted_inline_recovery_plan(
    *,
    process_started_at: datetime,
    recovered_at: datetime,
    terminal_ttl_seconds: int,
) -> InterruptedTaskRecoveryPlan:
    return InterruptedTaskRecoveryPlan(
        active_statuses=tuple(sorted(ACTIVE_PROJECT_TASK_STATUSES)),
        backend="inline",
        status="failed",
        error="服务重启,任务已中断,请重新发起",
        updated_before=_utc_iso(process_started_at),
        recovered_at=_utc_iso(recovered_at),
        expires_at=_utc_iso(recovered_at + timedelta(seconds=terminal_ttl_seconds)),
    )


__all__ = [
    "ACTIVE_PROJECT_TASK_STATUSES",
    "InterruptedTaskRecoveryPlan",
    "PROJECT_TASK_CHILD_PROCESS_ENV",
    "TERMINAL_TASK_STATUSES",
    "build_interrupted_inline_recovery_plan",
]
