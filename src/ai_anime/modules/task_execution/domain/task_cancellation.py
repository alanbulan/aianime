"""Task cancellation and timeout control-flow signals."""

from __future__ import annotations


class TaskCancelled(Exception):
    """Raised when cooperative cancellation is observed during task execution."""


class TaskTimedOut(Exception):
    """Raised when a task exceeds its cooperative execution deadline."""

    def __init__(self, *, timeout_seconds: int | None = None) -> None:
        self.timeout_seconds = timeout_seconds or 30 * 60
        super().__init__(self.timeout_seconds)


__all__ = ["TaskCancelled", "TaskTimedOut"]
