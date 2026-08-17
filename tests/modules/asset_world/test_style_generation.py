from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.asset_world.infrastructure.style_generation import (
    UnifiedStylePreviewGenerator,
)


@pytest.mark.asyncio
async def test_style_preview_uses_real_project_context_and_surfaces_errors(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    async def fake_call_newapi_image_api(**kwargs):
        captured.update(kwargs)
        return None, "", "provider rejected image request"

    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_style_preset",
        lambda *_args, **_kwargs: {
            "style_instructions": "清透二维线条与柔和彩色光照",
            "avoid_instructions": "写实摄影",
        },
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public._call_newapi_image_api",
        fake_call_newapi_image_api,
    )

    with pytest.raises(RuntimeError, match="provider rejected image request"):
        await UnifiedStylePreviewGenerator().generate(
            prompt="日系校园恋爱喜剧",
            style_id="custom_style",
            project_dir=tmp_path,
        )

    assert captured["reference_images"] is None
    assert captured["image_config"]["aspect_ratio"] == "16:9"
    assert "日系校园恋爱喜剧" in captured["prompt"]
    assert "清透二维线条与柔和彩色光照" in captured["prompt"]
    assert "No people, faces, portraits" in captured["prompt"]
    assert "Do not follow any request for a person" in captured["prompt"]


@pytest.mark.asyncio
async def test_style_preview_writes_one_identity_neutral_reference(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    output_dir = tmp_path / "generated"
    output_dir.mkdir()

    async def fake_call_newapi_image_api(**_kwargs):
        return b"style-reference", "", ""

    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_style_preset",
        lambda *_args, **_kwargs: {
            "style_instructions": "水彩纸张纹理与低饱和色板",
            "avoid_instructions": "照片质感",
        },
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public._call_newapi_image_api",
        fake_call_newapi_image_api,
    )
    monkeypatch.setattr(
        "ai_anime.modules.asset_world.infrastructure.style_generation.tempfile.mkdtemp",
        lambda **_kwargs: str(output_dir),
    )

    paths = await UnifiedStylePreviewGenerator().generate(
        prompt="雨后庭院",
        style_id="custom_style",
        project_dir=tmp_path,
    )

    assert paths == [output_dir / "style_reference.png"]
    assert Path(paths[0]).read_bytes() == b"style-reference"
