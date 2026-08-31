"""Resolve persisted model selections into API model and local route selector."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelRoute:
    model: str
    selector: str = ""


def resolve_model_route(selection: str | None) -> ModelRoute:
    """Decode an explicit catalog selector or a direct runtime model ID."""

    value = str(selection or "").strip()
    if value.startswith("cloud:"):
        model = value.removeprefix("cloud:").strip()
        return ModelRoute(model=model, selector=value if model else "")
    if value.startswith("byok:"):
        parts = value.split(":", 2)
        model = parts[2].strip() if len(parts) == 3 else ""
        return ModelRoute(model=model, selector=value if model else "")
    return ModelRoute(model=value)


__all__ = ["ModelRoute", "resolve_model_route"]
