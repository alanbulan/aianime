"""Prop catalog scope rules."""

from collections.abc import Iterable
from typing import Literal

PropCatalogScope = Literal["global", "local", "all"]


def includes_global_props(scope: str) -> bool:
    return scope in {"global", "all"}


def includes_local_props(scope: str) -> bool:
    return scope in {"local", "all"}


def normalize_prop_lookup(value: object) -> str:
    return " ".join(
        str(value or "").replace("\u3000", " ").strip().lower().split()
    )


def prop_lookup_keys(name: object, aliases: Iterable[object]) -> set[str]:
    return {
        lookup
        for value in (name, *aliases)
        if (lookup := normalize_prop_lookup(value))
    }
