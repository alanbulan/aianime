"""Local Creative Canvas task-output workspace adapter."""

from __future__ import annotations

from pathlib import Path

from ai_anime.modules.creative_canvas.infrastructure.paths import (
    output_path_for_job,
    outputs_dir,
)


class LocalCreativeCanvasJobWorkspace:
    def initialize(self, project_dir: Path) -> None:
        (project_dir / "freezone" / "_uploads").mkdir(parents=True, exist_ok=True)
        for task_type in (
            "freezone_gen",
            "freezone_edit",
            "freezone_upscale",
            "freezone_video_gen",
            "freezone_video_compose",
            "freezone_extract",
            "freezone_analyze",
            "freezone_mask_edit",
            "freezone_video_erase",
            "freezone_video_upscale",
            "freezone_audio_separate",
            "freezone_audio_speech",
            "freezone_audio_music",
            "freezone_image_to_3gs",
        ):
            self.output_directory(project_dir, task_type).mkdir(
                parents=True,
                exist_ok=True,
            )

    def output_directory(self, project_dir: Path, task_type: str) -> Path:
        return outputs_dir(project_dir, task_type)

    def image_output_path(
        self,
        project_dir: Path,
        task_type: str,
        job_id: str,
    ) -> Path:
        return output_path_for_job(project_dir, task_type, job_id)
