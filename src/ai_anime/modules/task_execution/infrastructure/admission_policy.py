"""Environment-backed task admission policy."""

from __future__ import annotations

import os

from ai_anime.modules.task_execution.domain.queue import (
    QUEUE_KINDS,
    normalize_queue_kind,
)

PROJECT_LANE_LIMIT_DEFAULTS = {
    "default": 12,
    "workflow": 1,
    "video": 4,
    "world": 2,
    "ffmpeg": 2,
}
PROJECT_LANE_MIN_DEFAULTS = {
    "default": 3,
    "workflow": 1,
    "video": 1,
    "world": 1,
    "ffmpeg": 1,
}
PROJECT_USER_LANE_LIMIT_DEFAULTS = {
    "default": 8,
    "workflow": 1,
    "video": 1,
    "world": 1,
    "ffmpeg": 1,
}
GLOBAL_LANE_CONCURRENCY_DEFAULTS = {
    "default": 8,
    "workflow": 4,
    "video": 2,
    "world": 1,
    "ffmpeg": 1,
}
GLOBAL_LANE_QUEUE_LIMIT_DEFAULTS = {
    "default": 512,
    "workflow": 128,
    "video": 128,
    "world": 64,
    "ffmpeg": 64,
}


def _lane_active_limit(
    queue_kind: str | None,
    *,
    env_prefix: str,
    defaults: dict[str, int],
) -> int | None:
    lane = normalize_queue_kind(queue_kind)
    env_name = f"{env_prefix}_{lane.upper()}_TASKS"
    raw = os.environ.get(env_name)
    default = defaults[lane]
    if raw is None or not raw.strip():
        return default
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else None


def _positive_lane_int(
    queue_kind: str | None,
    *,
    env_prefix: str,
    defaults: dict[str, int],
) -> int:
    lane = normalize_queue_kind(queue_kind)
    env_name = f"{env_prefix}_{lane.upper()}_TASKS"
    raw = os.environ.get(env_name)
    default = defaults[lane]
    if raw is None or not raw.strip():
        return default
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return default
    return max(parsed, 1)


def project_lane_active_limit(queue_kind: str | None) -> int | None:
    return _lane_active_limit(
        queue_kind,
        env_prefix="AI_ANIME_PROJECT_MAX_ACTIVE",
        defaults=PROJECT_LANE_LIMIT_DEFAULTS,
    )


def project_lane_min_active_limit(queue_kind: str | None) -> int:
    lane = normalize_queue_kind(queue_kind)
    env_name = f"AI_ANIME_PROJECT_MIN_ACTIVE_{lane.upper()}_TASKS"
    raw = os.environ.get(env_name)
    default = PROJECT_LANE_MIN_DEFAULTS[lane]
    if raw is None or not raw.strip():
        return default
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return default
    return max(parsed, 0)


def project_user_lane_active_limit(queue_kind: str | None) -> int | None:
    return _lane_active_limit(
        queue_kind,
        env_prefix="AI_ANIME_PROJECT_USER_MAX_ACTIVE",
        defaults=PROJECT_USER_LANE_LIMIT_DEFAULTS,
    )


def project_lane_effective_active_limit(
    queue_kind: str | None,
    *,
    eligible_user_count: int,
) -> int | None:
    hard_limit = project_lane_active_limit(queue_kind)
    user_limit = project_user_lane_active_limit(queue_kind)
    if hard_limit is None:
        return None
    if user_limit is None:
        return hard_limit
    member_count = max(int(eligible_user_count), 1)
    computed = max(
        project_lane_min_active_limit(queue_kind),
        member_count * user_limit,
    )
    return min(hard_limit, computed)


def global_lane_concurrency(queue_kind: str | None) -> int:
    return _positive_lane_int(
        queue_kind,
        env_prefix="AI_ANIME_CE_GLOBAL_MAX_ACTIVE",
        defaults=GLOBAL_LANE_CONCURRENCY_DEFAULTS,
    )


def global_lane_queue_limit(queue_kind: str | None) -> int:
    return _positive_lane_int(
        queue_kind,
        env_prefix="AI_ANIME_CE_GLOBAL_MAX_QUEUED",
        defaults=GLOBAL_LANE_QUEUE_LIMIT_DEFAULTS,
    )


class EnvironmentTaskAdmissionPolicy:
    @property
    def queue_kinds(self) -> frozenset[str]:
        return QUEUE_KINDS

    def project_effective_active_limit(
        self,
        queue_kind: str,
        *,
        eligible_user_count: int,
    ) -> int | None:
        return project_lane_effective_active_limit(
            queue_kind,
            eligible_user_count=eligible_user_count,
        )

    def project_user_active_limit(self, queue_kind: str) -> int | None:
        return project_user_lane_active_limit(queue_kind)


__all__ = [
    "EnvironmentTaskAdmissionPolicy",
    "global_lane_concurrency",
    "global_lane_queue_limit",
    "project_lane_active_limit",
    "project_lane_effective_active_limit",
    "project_lane_min_active_limit",
    "project_user_lane_active_limit",
]
