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

        from ai_anime.config import get_grid_generation_config
        from ai_anime.generators.nanobanana_grid import (
            generate_reference_edit_image,
            generate_text_to_image,
        )

        config = get_grid_generation_config(
            model_override=command.model,
            image_size_override=command.image_size,
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

        from ai_anime.config import get_grid_generation_config
        from ai_anime.generators.nanobanana_grid import generate_reference_edit_image

        references = [command.base_path, *command.extra_reference_paths]
        config = get_grid_generation_config(
            model_override=command.model,
            image_size_override=command.image_size,
        )
        await generate_reference_edit_image(
            prompt=command.prompt,
            reference_images=references,
            output_path=str(output_path),
            aspect_ratio=command.aspect_ratio,
            image_size=command.image_size,
            quality=command.quality,
            config=config,
        )
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

        from ai_anime.config import get_grid_generation_config
        from ai_anime.generators.nanobanana_grid import generate_reference_edit_image
        from ai_anime.utils.error_redaction import redact_secrets

        config = get_grid_generation_config(
            model_override=command.model,
            image_size_override=command.image_size,
        )
        prompt = (
            f"{command.prompt}\n\n"
            "Use Image 1 as the source image. Use Image 2 as the edit mask "
            "reference. Only modify the masked/transparent marked region; "
            "preserve all unmasked source pixels, composition, identity, "
            "lighting, and texture as much as possible."
        ).strip()
        try:
            await generate_reference_edit_image(
                prompt=prompt,
                reference_images=[str(base_path), str(mask_path)],
                output_path=str(output_path),
                aspect_ratio=command.aspect_ratio,
                image_size=command.image_size,
                quality=command.quality,
                config=config,
            )
        except Exception as exc:
            raise RuntimeError(f"图片擦除失败：{redact_secrets(exc)}") from exc
        if not output_path.exists():
            raise RuntimeError("图片擦除未生成输出文件")
        return output_path
