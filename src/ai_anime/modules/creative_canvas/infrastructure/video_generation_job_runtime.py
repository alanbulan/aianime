"""Commercial video execution adapter for Creative Canvas jobs."""

from __future__ import annotations

from pathlib import Path

from ai_anime.modules.creative_canvas.application.job_execution import (
    GenerateCreativeCanvasVideoJobCommand,
)
from ai_anime.modules.creative_canvas.application.job_workspace import (
    CreativeCanvasJobWorkspace,
)


class CommercialCreativeCanvasVideoGenerationJobRuntime:
    def __init__(self, workspace: CreativeCanvasJobWorkspace) -> None:
        self._workspace = workspace

    async def generate(
        self,
        command: GenerateCreativeCanvasVideoJobCommand,
    ) -> Path:
        output_path = (
            self._workspace.output_directory(
                command.project_dir,
                "freezone_video_gen",
            )
            / f"{command.job_id}.mp4"
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)

        from ai_anime.modules.production.public import (
            ShotReference,
            create_video_generator,
        )

        references = [
            ShotReference(
                type=str(item.get("type") or "image"),
                path=str(item.get("path") or ""),
                role=str(item.get("role") or ""),
                field=str(item.get("field") or ""),
            )
            for item in command.reference_items
            if str(item.get("path") or "").strip()
        ]
        generator = create_video_generator(
            model_role=command.model_role,
            model=command.model,
            model_selector=command.model_selector,
            resolution=command.resolution,
            generate_audio=command.generate_audio,
        )
        first_input = next(
            (
                reference
                for reference in references
                if reference.field == "input_reference"
            ),
            None,
        )
        extra_options: dict[str, object] = {
            "human_review": bool(command.human_review)
        }
        if command.audio_setting:
            extra_options["audio_setting"] = command.audio_setting
        video_options: dict[str, object] = dict(command.extra_params or {})
        video_options["resolution"] = command.resolution
        if command.scene_optimize:
            video_options["scene_optimize"] = command.scene_optimize

        result = await generator.generate(
            image_path=first_input.path if first_input else None,
            prompt=command.prompt,
            output_path=str(output_path),
            aspect_ratio=command.aspect_ratio,
            duration=float(command.duration_seconds),
            last_frame_path=command.last_frame_path,
            references=references,
            video_config=video_options,
            **extra_options,
        )
        if not result or result.status.value != "done":
            error = result.error if result else "unknown error"
            raise RuntimeError(f"freezone video generation failed: {error}")
        if not output_path.exists():
            raise RuntimeError(
                "video generation returned success but no output file was written"
            )
        return output_path
