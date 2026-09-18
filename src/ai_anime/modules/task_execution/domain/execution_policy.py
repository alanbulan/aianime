"""Validated tenant settings for the two managed local task lanes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ManagedExecutionPolicy:
    general_concurrency: int
    general_queue: int
    video_concurrency: int
    video_queue: int
    version: int

    @classmethod
    def from_wire(cls, value: dict[str, Any]) -> ManagedExecutionPolicy:
        bounds = {
            "desktopGeneralConcurrency": (1, 16),
            "desktopGeneralQueue": (0, 256),
            "desktopVideoConcurrency": (1, 8),
            "desktopVideoQueue": (0, 256),
            "version": (0, 9_007_199_254_740_991),
        }
        if not isinstance(value, dict) or set(value) != set(bounds):
            raise ValueError("任务调度策略字段不完整或包含未知字段")
        for name, (minimum, maximum) in bounds.items():
            item = value[name]
            if type(item) is not int or not minimum <= item <= maximum:
                raise ValueError("任务调度策略必须使用范围内的整数")
        return cls(
            value["desktopGeneralConcurrency"],
            value["desktopGeneralQueue"],
            value["desktopVideoConcurrency"],
            value["desktopVideoQueue"],
            value["version"],
        )

    def lane(self, name: str) -> tuple[int, int] | None:
        if name == "default":
            return self.general_concurrency, self.general_queue
        if name == "video":
            return self.video_concurrency, self.video_queue
        return None
