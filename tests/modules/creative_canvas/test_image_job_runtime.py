"""Creative Canvas image runtime compatibility with the upstream Freezone flow."""

from pathlib import Path

import pytest

from ai_anime.modules.creative_canvas.application.job_execution import (
    EditCreativeCanvasImageJobCommand,
    GenerateCreativeCanvasImageJobCommand,
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
            base_path="base.png",
        )
    )

    assert "project_dir" not in captured
