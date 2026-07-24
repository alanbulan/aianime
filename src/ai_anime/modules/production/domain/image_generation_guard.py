"""Image generation guard domain rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

ImageGenerationGuardLevel = Literal["none", "confirm", "locked"]


@dataclass(frozen=True)
class ImageGenerationGuard:
    attempt_count: int
    next_attempt: int
    level: ImageGenerationGuardLevel
    message: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "attempt_count": self.attempt_count,
            "next_attempt": self.next_attempt,
            "level": self.level,
            "message": self.message,
        }


def image_generation_guard(
    attempt_count: int,
    subject: str,
) -> ImageGenerationGuard:
    next_attempt = attempt_count + 1
    if next_attempt >= 5:
        return ImageGenerationGuard(
            attempt_count=attempt_count,
            next_attempt=next_attempt,
            level="locked",
            message=(
                f"{subject} 已连续生成 {next_attempt} 次，"
                "请输入管理员密码继续本次生成。"
            ),
        )
    if next_attempt >= 3:
        return ImageGenerationGuard(
            attempt_count=attempt_count,
            next_attempt=next_attempt,
            level="confirm",
            message=f"{subject} 已连续生成 {next_attempt} 次，确认继续生成吗？",
        )
    return ImageGenerationGuard(
        attempt_count=attempt_count,
        next_attempt=next_attempt,
        level="none",
        message="",
    )
