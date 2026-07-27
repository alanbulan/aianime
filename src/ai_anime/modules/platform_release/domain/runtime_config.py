"""Runtime configuration rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

RuntimeEdition = Literal["ce", "ee"]


@dataclass(frozen=True)
class RuntimeConfig:
    edition: RuntimeEdition
    auth_required: bool
    instance_id: str


def build_runtime_config(
    *,
    edition: RuntimeEdition,
    desktop_mode: bool,
    instance_id: str,
) -> RuntimeConfig:
    return RuntimeConfig(
        edition=edition,
        auth_required=edition == "ee" or desktop_mode,
        instance_id=instance_id,
    )
