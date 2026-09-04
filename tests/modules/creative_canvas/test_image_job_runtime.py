"""Creative Canvas image runtime compatibility with the upstream Freezone flow."""

from pathlib import Path

import pytest
from PIL import Image

from ai_anime.modules.creative_canvas.application.job_execution import (
    EditCreativeCanvasImageJobCommand,
    GenerateCreativeCanvasImageJobCommand,
    MaskEditCreativeCanvasImageJobCommand,
)
from ai_anime.modules.creative_canvas.infrastructure.image_job_runtime import (
    CommercialCreativeCanvasImageJobRuntime,
)


class _Workspace:
    def image_output_path(
        self,
        project_dir: Path,
        task_type: str,
        job_id: str,
    ) -> Path:
        return project_dir / "freezone" / "_outputs" / task_type / f"{job_id}.png"


async def _capture_generation(**kwargs: object) -> None:
    output_path = Path(str(kwargs["output_path"]))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(b"png")


@pytest.mark.asyncio
@pytest.mark.parametrize("reference_paths", [(), ("reference.png",)])
async def test_generate_does_not_inject_the_project_style(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    reference_paths: tuple[str, ...],
) -> None:
    captured: dict[str, object] = {}

    async def capture(**kwargs: object) -> None:
        captured.update(kwargs)
        await _capture_generation(**kwargs)

    monkeypatch.setattr(
        "ai_anime.modules.production.public.generate_text_to_image",
        capture,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.generate_reference_edit_image",
        capture,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_grid_generation_config",
        lambda **_kwargs: {},
    )

    runtime = CommercialCreativeCanvasImageJobRuntime(_Workspace())
    await runtime.generate(
        GenerateCreativeCanvasImageJobCommand(
            project_dir=tmp_path,
            job_id="generate",
            prompt="prompt",
            reference_paths=reference_paths,
        )
    )

    assert "project_dir" not in captured


@pytest.mark.asyncio
async def test_edit_does_not_inject_the_project_style(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    base_path = tmp_path / "base.png"
    Image.new("RGB", (1024, 1024), "white").save(base_path)

    async def capture(**kwargs: object) -> None:
        captured.update(kwargs)
        await _capture_generation(**kwargs)

    monkeypatch.setattr(
        "ai_anime.modules.production.public.generate_reference_edit_image",
        capture,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_grid_generation_config",
        lambda **_kwargs: {},
    )

    runtime = CommercialCreativeCanvasImageJobRuntime(_Workspace())
    await runtime.edit(
        EditCreativeCanvasImageJobCommand(
            project_dir=tmp_path,
            job_id="edit",
            prompt="prompt",
            base_path=str(base_path),
            aspect_ratio="1:1",
            image_size="original",
        )
    )

    assert "project_dir" not in captured


@pytest.mark.asyncio
@pytest.mark.parametrize("masked", [False, True])
async def test_original_edit_size_uses_a_provider_tier_and_restores_source_pixels(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    masked: bool,
) -> None:
    base_path = tmp_path / "base.png"
    mask_path = tmp_path / "mask.png"
    Image.new("RGB", (928, 1664), "white").save(base_path)
    Image.new("RGB", (928, 1664), "red").save(mask_path)
    captured: dict[str, object] = {}
    config_overrides: dict[str, object] = {}

    async def capture(**kwargs: object) -> None:
        captured.update(kwargs)
        output_path = Path(str(kwargs["output_path"]))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (1152, 2048), "blue").save(output_path)

    def capture_config(**kwargs: object) -> dict[str, object]:
        config_overrides.update(kwargs)
        return {}

    monkeypatch.setattr(
        "ai_anime.modules.production.public.generate_reference_edit_image",
        capture,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_grid_generation_config",
        capture_config,
    )

    runtime = CommercialCreativeCanvasImageJobRuntime(_Workspace())
    if masked:
        output_path = await runtime.mask_edit(
            MaskEditCreativeCanvasImageJobCommand(
                project_dir=tmp_path,
                job_id="mask-edit-original",
                base_path=str(base_path),
                mask_path=str(mask_path),
                prompt="erase",
                aspect_ratio="9:16",
                image_size="original",
                preserve_source_dimensions=True,
            )
        )
    else:
        output_path = await runtime.edit(
            EditCreativeCanvasImageJobCommand(
                project_dir=tmp_path,
                job_id="edit-original",
                prompt="relight",
                base_path=str(base_path),
                aspect_ratio="9:16",
                image_size="original",
                preserve_source_dimensions=True,
            )
        )

    assert captured["image_size"] == "2K"
    assert config_overrides["image_size_override"] == "2K"
    with Image.open(output_path) as output:
        assert output.size == (928, 1664)


@pytest.mark.asyncio
async def test_explicit_aspect_ratio_does_not_restore_source_pixels(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_path = tmp_path / "base.png"
    Image.new("RGB", (928, 1664), "white").save(base_path)

    async def capture(**kwargs: object) -> None:
        output_path = Path(str(kwargs["output_path"]))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (2048, 1152), "blue").save(output_path)

    monkeypatch.setattr(
        "ai_anime.modules.production.public.generate_reference_edit_image",
        capture,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_grid_generation_config",
        lambda **_kwargs: {},
    )

    output_path = await CommercialCreativeCanvasImageJobRuntime(_Workspace()).edit(
        EditCreativeCanvasImageJobCommand(
            project_dir=tmp_path,
            job_id="edit-explicit-ratio",
            prompt="widen",
            base_path=str(base_path),
            aspect_ratio="16:9",
            image_size="original",
            preserve_source_dimensions=False,
        )
    )

    with Image.open(output_path) as output:
        assert output.size == (2048, 1152)
