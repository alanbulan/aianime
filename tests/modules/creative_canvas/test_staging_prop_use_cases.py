from __future__ import annotations

from typing import Any

import pytest

from ai_anime.modules.creative_canvas.application.staging_prop import (
    CreativeCanvasStagingPropRejected,
    CreativeCanvasStagingPropUseCases,
    GenerateCreativeCanvasStagingPropCommand,
)


class _Generator:
    def __init__(
        self,
        result: dict[str, Any] | None = None,
        error: RuntimeError | None = None,
    ) -> None:
        self.result = result or {"ok": True, "prop": {"prop_id": "horse"}}
        self.error = error
        self.requests: list[dict[str, object]] = []

    async def generate(self, request: dict[str, object]) -> dict[str, Any]:
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        return self.result


@pytest.mark.asyncio
async def test_generate_staging_prop_strips_http_credential_overrides() -> None:
    generator = _Generator()
    use_cases = CreativeCanvasStagingPropUseCases(generator)

    result = await use_cases.generate(
        GenerateCreativeCanvasStagingPropCommand(
            request={
                "scene_id": "面馆",
                "user_hint": "放一匹马",
                "api_key": "must-not-reach-generator",
                "base_url": "https://bypass.example/v1",
            }
        )
    )

    assert result == {"ok": True, "prop": {"prop_id": "horse"}}
    assert generator.requests == [{"scene_id": "面馆", "user_hint": "放一匹马"}]


@pytest.mark.asyncio
async def test_generate_staging_prop_translates_runtime_failure() -> None:
    use_cases = CreativeCanvasStagingPropUseCases(
        _Generator(error=RuntimeError("missing AI api key"))
    )

    with pytest.raises(CreativeCanvasStagingPropRejected, match="missing AI api key"):
        await use_cases.generate(GenerateCreativeCanvasStagingPropCommand(request={}))


@pytest.mark.asyncio
async def test_generate_staging_prop_rejects_unsuccessful_result() -> None:
    use_cases = CreativeCanvasStagingPropUseCases(
        _Generator(result={"ok": False, "error": "provider unavailable"})
    )

    with pytest.raises(CreativeCanvasStagingPropRejected, match="provider unavailable"):
        await use_cases.generate(GenerateCreativeCanvasStagingPropCommand(request={}))
