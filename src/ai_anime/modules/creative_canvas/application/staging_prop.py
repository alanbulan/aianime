"""AI staging prop generation use cases for Creative Canvas."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Protocol


class CreativeCanvasStagingPropRejected(RuntimeError):
    """The staging prop generator rejected or failed the request."""


@dataclass(frozen=True)
class GenerateCreativeCanvasStagingPropCommand:
    request: Mapping[str, object]


class CreativeCanvasStagingPropGenerator(Protocol):
    async def generate(self, request: dict[str, object]) -> dict[str, Any]: ...


class CreativeCanvasStagingPropUseCases:
    def __init__(self, generator: CreativeCanvasStagingPropGenerator) -> None:
        self._generator = generator

    async def generate(
        self,
        command: GenerateCreativeCanvasStagingPropCommand,
    ) -> dict[str, Any]:
        request = dict(command.request)
        request.pop("api_key", None)
        request.pop("base_url", None)
        try:
            result = await self._generator.generate(request)
        except RuntimeError as exc:
            raise CreativeCanvasStagingPropRejected(str(exc)) from exc
        if not result.get("ok"):
            raise CreativeCanvasStagingPropRejected(
                str(result.get("error") or "AI staging prop failed")
            )
        return result
