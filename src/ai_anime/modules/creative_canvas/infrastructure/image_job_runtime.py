"""Commercial image execution adapter for Creative Canvas jobs."""

from __future__ import annotations

from pathlib import Path

from ai_anime.modules.creative_canvas.application.job_execution import (
    EditCreativeCanvasImageJobCommand,
    GenerateCreativeCanvasImageJobCommand,
    MaskEditCreativeCanvasImageJobCommand,
)
from ai_anime.modules.creative_canvas.application.job_workspace import (
    CreativeCanvasJobWorkspace,
)


def _resolve_edit_image_size(
    base_path: str | Path,
    requested_image_size: str,
    preserve_source_dimensions: bool,
) -> tuple[str, tuple[int, int] | None]:
    if str(requested_image_size or "").strip().lower() != "original":
        return requested_image_size, None

    from PIL import Image

    with Image.open(base_path) as source:
        source_size = source.size
    longest_side = max(source_size)
    provider_size = (
        "1K" if longest_side <= 1024 else "2K" if longest_side <= 2048 else "4K"
    )
    exact_output_size = source_size if preserve_source_dimensions else None
    return provider_size, exact_output_size


def _restore_edit_image_size(
    output_path: Path,
    exact_output_size: tuple[int, int] | None,
) -> None:
    if exact_output_size is None:
        return

    from PIL import Image

    with Image.open(output_path) as generated:
        if generated.size == exact_output_size:
            return
        restored = generated.resize(exact_output_size, Image.Resampling.LANCZOS)
        restored.load()
    if restored.mode == "CMYK":
        restored = restored.convert("RGB")
    restored.save(output_path, format="PNG")


class CommercialCreativeCanvasImageJobRuntime:
    def __init__(self, workspace: CreativeCanvasJobWorkspace) -> None:
        self._workspace = workspace

    async def generate(
        self,
        command: GenerateCreativeCanvasImageJobCommand,
    ) -> Path:
        output_path = self._workspace.image_output_path(
            command.project_dir,
            command.output_task_type or "freezone_gen",
            command.job_id,
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)

        from ai_anime.modules.production.public import get_grid_generation_config
        from ai_anime.modules.production.public import (
            generate_reference_edit_image,
            generate_text_to_image,
        )

        config = get_grid_generation_config(
            model_override=command.model,
            image_size_override=command.image_size,
            model_selector_override=command.model_selector,
            model_params_override=command.extra_params,
        )
        if command.reference_paths:
            await generate_reference_edit_image(
                prompt=command.prompt,
                reference_images=list(command.reference_paths),
                output_path=str(output_path),
                aspect_ratio=command.aspect_ratio,
                image_size=command.image_size,
                quality=command.quality,
                config=config,
            )
        else:
            await generate_text_to_image(
                prompt=command.prompt,
                output_path=str(output_path),
                aspect_ratio=command.aspect_ratio,
                image_size=command.image_size,
                quality=command.quality,
                config=config,
            )
        return output_path

    async def edit(
        self,
        command: EditCreativeCanvasImageJobCommand,
    ) -> Path:
        output_path = self._workspace.image_output_path(
            command.project_dir,
            command.output_task_type or "freezone_edit",
            command.job_id,
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)

        from ai_anime.modules.production.public import get_grid_generation_config
        from ai_anime.modules.production.public import generate_reference_edit_image

        references = [command.base_path, *command.extra_reference_paths]
        provider_image_size, exact_output_size = _resolve_edit_image_size(
            command.base_path,
            command.image_size,
            command.preserve_source_dimensions,
        )
        config = get_grid_generation_config(
            model_override=command.model,
            image_size_override=provider_image_size,
            model_selector_override=command.model_selector,
            model_params_override=command.extra_params,
        )
        await generate_reference_edit_image(
            prompt=command.prompt,
            reference_images=references,
            output_path=str(output_path),
            aspect_ratio=command.aspect_ratio,
            image_size=provider_image_size,
            quality=command.quality,
            config=config,
        )
        _restore_edit_image_size(output_path, exact_output_size)
        return output_path

    async def mask_edit(
        self,
        command: MaskEditCreativeCanvasImageJobCommand,
    ) -> Path:
        output_path = self._workspace.image_output_path(
            command.project_dir,
            "freezone_mask_edit",
            command.job_id,
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)

        base_path = Path(command.base_path)
        mask_path = Path(command.mask_path)
        if not base_path.exists():
            raise FileNotFoundError(f"base not found: {base_path}")
        if not mask_path.exists():
            raise FileNotFoundError(f"mask not found: {mask_path}")

        from ai_anime.modules.production.public import get_grid_generation_config
        from ai_anime.modules.production.public import generate_reference_edit_image
        from ai_anime.shared.utils.error_redaction import redact_secrets

        provider_image_size, exact_output_size = _resolve_edit_image_size(
            base_path,
            command.image_size,
            command.preserve_source_dimensions,
        )
        config = get_grid_generation_config(
            model_override=command.model,
            image_size_override=provider_image_size,
            model_selector_override=command.model_selector,
        )
        prompt = (
            f"{command.prompt}\n\n"
            "Use Image 1 as the source image. Image 2 is the same image with a "
            "translucent RED highlight painted over the region to edit. Edit ONLY "
            "the red-highlighted region; the red highlight is just an annotation "
            "and must NOT appear in the output. Preserve all pixels outside the "
            "highlighted region, including composition, identity, lighting, and texture."
        ).strip()
        try:
            await generate_reference_edit_image(
                prompt=prompt,
                reference_images=[str(base_path), str(mask_path)],
                output_path=str(output_path),
                aspect_ratio=command.aspect_ratio,
                image_size=provider_image_size,
                quality=command.quality,
                config=config,
            )
        except Exception as exc:
            raise RuntimeError(f"图片擦除失败：{redact_secrets(exc)}") from exc
        if not output_path.exists():
            raise RuntimeError("图片擦除未生成输出文件")
        _restore_edit_image_size(output_path, exact_output_size)
        return output_path
