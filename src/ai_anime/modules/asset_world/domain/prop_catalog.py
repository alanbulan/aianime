"""Prop catalog scope rules."""

from typing import Literal

PropCatalogScope = Literal["global", "local", "all"]


def includes_global_props(scope: str) -> bool:
    return scope in {"global", "all"}


def includes_local_props(scope: str) -> bool:
    return scope in {"local", "all"}
