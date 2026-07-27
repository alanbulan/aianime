"""Creative Canvas event identity rules."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class CreativeCanvasEventActor:
    kind: str
    id: str
    username: str


def canvas_event_actor(
    user: Mapping[str, object],
) -> CreativeCanvasEventActor:
    return CreativeCanvasEventActor(
        kind="user",
        id=str(user.get("id") or user.get("username") or "unknown"),
        username=str(user.get("username") or ""),
    )


__all__ = ["CreativeCanvasEventActor", "canvas_event_actor"]
