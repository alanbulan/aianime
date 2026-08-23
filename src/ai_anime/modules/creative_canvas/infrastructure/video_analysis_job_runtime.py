"""Frame extraction and vision-analysis adapters for Creative Canvas jobs."""

from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

from ai_anime.modules.creative_canvas.application.job_execution import (
    AnalyzeCreativeCanvasShotsJobCommand,
    ExtractCreativeCanvasFramesJobCommand,
)
from ai_anime.modules.creative_canvas.application.job_workspace import (
    CreativeCanvasJobWorkspace,
)
from ai_anime.modules.creative_canvas.application.vision_analysis import (
    AnalyzeCreativeCanvasVisionCommand,
    CreativeCanvasVisionAnalysisUseCases,
    CreativeCanvasVisionInput,
    creative_canvas_image_media_type,
)
from ai_anime.modules.creative_canvas.domain.video_analysis import (
    build_creative_canvas_video_analysis_prompt,
)
from ai_anime.modules.creative_canvas.infrastructure.media_process import (
    require_media_binary,
)


class FfmpegCreativeCanvasVideoAnalysisJobRuntime:
    def __init__(
        self,
        workspace: CreativeCanvasJobWorkspace,
        vision: CreativeCanvasVisionAnalysisUseCases,
    ) -> None:
        self._workspace = workspace
        self._vision = vision

    async def extract_frames(
        self,
        command: ExtractCreativeCanvasFramesJobCommand,
    ) -> list[Path]:
        output_dir = (
            self._workspace.output_directory(
                command.project_dir,
                "freezone_extract",
            )
            / command.job_id
        )
        output_dir.mkdir(parents=True, exist_ok=True)
        require_media_binary("ffmpeg")
        if not command.video_path.exists():
            raise FileNotFoundError(f"video not found: {command.video_path}")

        pattern = str(output_dir / "scene_%03d.png")
        process = await asyncio.to_thread(
            subprocess.run,
            [
                "ffmpeg",
                "-y",
                "-i",
                str(command.video_path),
                "-vf",
                f"select='gt(scene,{command.scene_threshold})'",
                "-vsync",
                "vfr",
                "-frames:v",
                str(command.max_frames),
                "-frame_pts",
                "true",
                pattern,
            ],
            capture_output=True,
            text=True,
            timeout=600,
        )
        if process.returncode != 0:
            raise RuntimeError(
                f"ffmpeg scene detect failed: {process.stderr[-500:]}"
            )

        scene_files = sorted(output_dir.glob("scene_*.png"), key=_frame_sequence_key)
        if len(scene_files) < 3:
            for path in scene_files:
                path.unlink(missing_ok=True)
            scene_files = await self._sample_evenly(
                command.video_path,
                output_dir,
                command.max_frames,
            )
        return scene_files

    async def analyze_shots(
        self,
        command: AnalyzeCreativeCanvasShotsJobCommand,
    ) -> dict[str, object]:
        if not command.frame_paths:
            raise ValueError("no frames to analyze")

        output_dir = (
            self._workspace.output_directory(
                command.project_dir,
                "freezone_analyze",
            )
            / command.job_id
        )
        output_dir.mkdir(parents=True, exist_ok=True)
        mode = (command.analysis_mode or "shots").strip().lower()
        prompt = build_creative_canvas_video_analysis_prompt(
            analysis_mode=mode,
            frame_count=len(command.frame_paths),
            duration_sec=command.duration_sec,
        )
        vision_model, text = await self._vision.analyze(
            AnalyzeCreativeCanvasVisionCommand(
                prompt=prompt,
                images=tuple(
                    CreativeCanvasVisionInput(
                        data=Path(path).read_bytes(),
                        media_type=creative_canvas_image_media_type(path),
                    )
                    for path in command.frame_paths
                    if Path(path).exists()
                ),
            )
        )
        if not text:
            raise RuntimeError("Vision model returned no text")

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = "\n".join(
                line
                for line in cleaned.splitlines()
                if not line.strip().startswith("```")
            ).strip()
        try:
            analyses = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            (output_dir / "raw_response.txt").write_text(text, encoding="utf-8")
            raise RuntimeError(
                f"Vision model returned non-JSON: {exc}; raw saved"
            ) from exc

        if mode == "video_story":
            if not isinstance(analyses, dict):
                raise RuntimeError("Vision model response is not an object")
        elif not isinstance(analyses, list):
            raise RuntimeError("Vision model response is not a list")

        payload: dict[str, object] = {
            "model": vision_model,
            "analysis_mode": mode,
            "frame_count": len(command.frame_paths),
        }
        if mode == "video_story":
            payload["video_story"] = analyses
            payload["analyses"] = analyses.get("shots", [])
        else:
            payload["analyses"] = analyses
        output_path = output_dir / "analysis.json"
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        payload["output_path"] = str(output_path)
        return payload

    async def _sample_evenly(
        self,
        video_path: Path,
        output_dir: Path,
        max_frames: int,
    ) -> list[Path]:
        probe = await asyncio.to_thread(
            subprocess.run,
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=duration,nb_frames",
                "-of",
                "json",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        duration = 60.0
        if probe.returncode == 0:
            try:
                probe_payload = json.loads(probe.stdout)
                duration = float(
                    probe_payload["streams"][0].get("duration") or 60.0
                )
            except (json.JSONDecodeError, KeyError, IndexError, ValueError):
                pass

        frame_count = min(max(3, max_frames // 2), max_frames)
        fps_expression = f"1/{max(1.0, duration / frame_count)}"
        await asyncio.to_thread(
            subprocess.run,
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video_path),
                "-vf",
                f"fps={fps_expression}",
                "-frames:v",
                str(frame_count),
                str(output_dir / "even_%03d.png"),
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        return sorted(output_dir.glob("even_*.png"), key=_frame_sequence_key)


def _frame_sequence_key(path: Path) -> tuple[int, str]:
    try:
        return int(path.stem.rsplit("_", 1)[-1]), path.name
    except ValueError:
        return 0, path.name
