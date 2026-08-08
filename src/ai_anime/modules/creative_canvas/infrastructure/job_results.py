"""Local task and artifact projection for Creative Canvas job results."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_anime.modules.creative_canvas.infrastructure.audio_generation import (
    freezone_audio_eleven_music_output_path,
    freezone_audio_speech_output_path,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_static_urls import (
    migrate_canvas_static_urls_in_memory,
)
from ai_anime.modules.creative_canvas.application.job_results import (
    GetCreativeCanvasJobResultQuery,
    public_creative_canvas_video_story_result,
)
from ai_anime.modules.creative_canvas.infrastructure.paths import (
    output_path_for_job,
    outputs_dir,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.project_media import make_static_url_for_context
from ai_anime.modules.task_execution.public import get_task_manager

TaskManagerFactory = Callable[[], Any]
StaticUrlBuilder = Callable[[ProjectContext, str, str | Path | None], str]


class LocalCreativeCanvasJobResultReader:
    def __init__(
        self,
        task_manager_factory: TaskManagerFactory | None = None,
        static_url_builder: StaticUrlBuilder | None = None,
    ) -> None:
        self._task_manager_factory = task_manager_factory
        self._static_url_builder = static_url_builder

    def read(self, query: GetCreativeCanvasJobResultQuery) -> dict[str, Any]:
        context = query.context
        project_dir = query.project_dir
        task_type = query.task_type
        job_id = query.job_id
        task = (self._task_manager_factory or get_task_manager)().get_task_for_project(
            context,
            task_type,
            0,
            scope=job_id,
        )
        if task_type == "freezone_image_to_3gs":
            return self._image_to_three_gs_result(
                context=context,
                project_dir=project_dir,
                job_id=job_id,
                task=task,
            )

        out = output_path_for_job(project_dir, task_type, job_id)
        if task_type == "freezone_image_reverse_prompt":
            out = _json_output_path(project_dir, task_type, job_id)
        if task_type == "freezone_video_erase":
            out = _video_output_path(project_dir, task_type, job_id)
        if task_type == "freezone_video_upscale":
            out = _video_output_path(project_dir, task_type, job_id)
        if task_type == "freezone_audio_separate":
            return self._audio_separation_result(
                context=context,
                project_dir=project_dir,
                job_id=job_id,
                task=task,
            )
        if task_type == "freezone_audio_speech":
            out = freezone_audio_speech_output_path(project_dir, job_id)
        if task_type == "freezone_audio_eleven_music":
            out = freezone_audio_eleven_music_output_path(project_dir, job_id)
        if task_type == "freezone_video_compose":
            out = _video_output_path(project_dir, task_type, job_id)
        if task_type in {"freezone_text_translate", "freezone_story_script"}:
            out = _json_output_path(project_dir, task_type, job_id)
        if task_type in {"freezone_analyze", "freezone_video_story"}:
            analysis_result = self._analysis_result(
                project_dir=project_dir,
                job_id=job_id,
                task_type=task_type,
                task=task,
            )
            if analysis_result is not None:
                return analysis_result

        out = _existing_output_variant(out)
        if not out.exists():
            return _missing_artifact_result(task)
        if task_type in {
            "freezone_image_reverse_prompt",
            "freezone_text_translate",
            "freezone_story_script",
        }:
            return {"ok": True, "data": _read_json(out)}

        relative_path = out.relative_to(project_dir).as_posix()
        return {
            "ok": True,
            "data": {
                "url": self._static_url(context, relative_path, out),
                "size": out.stat().st_size,
                **_push_metadata(task),
            },
        }

    def _image_to_three_gs_result(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        job_id: str,
        task: Any | None,
    ) -> dict[str, Any]:
        if task is not None:
            status_result = _unfinished_task_result(task, missing_info="job result not yet available")
            if status_result is not None:
                return status_result
            if isinstance(task.result, dict):
                data = (
                    migrate_canvas_static_urls_in_memory(
                        task.result,
                        project_id=context.project_id,
                        owner_username=context.owner_username,
                        project_name=context.project_name,
                        project_dir=project_dir,
                    )
                    or task.result
                )
                splat_url = (
                    data.get("splat_url")
                    or data.get("ply_url")
                    or data.get("output_url")
                    or data.get("url")
                )
                for key in ("ply_path", "sog_path"):
                    value = data.get(key)
                    if isinstance(value, str) and value.startswith(str(project_dir)):
                        try:
                            relative_path = Path(value).relative_to(project_dir).as_posix()
                        except ValueError:
                            continue
                        splat_url = self._static_url(context, relative_path, value)
                        data[key] = splat_url
                if splat_url:
                    data.setdefault("output_url", splat_url)
                    data.setdefault("url", splat_url)
                    data.setdefault("ply_url", splat_url)
                    data.setdefault("splat_url", splat_url)
                    data.setdefault("media_type", "file")
                return {"ok": True, "data": data}

        artifact_dir = outputs_dir(project_dir, "freezone_image_to_3gs") / job_id
        candidates = sorted(artifact_dir.glob("*.sog")) or sorted(artifact_dir.glob("*.ply"))
        if not candidates:
            return {"ok": False, "info": "job result not yet on disk", "status": "unknown"}
        out = candidates[0]
        relative_path = out.relative_to(project_dir).as_posix()
        url = self._static_url(context, relative_path, out)
        suffix = out.suffix.lower().lstrip(".")
        return {
            "ok": True,
            "data": {
                "url": url,
                "output_url": url,
                "ply_url": url,
                "splat_url": url,
                "ply_path": url,
                "splat_format": suffix if suffix in {"ply", "sog"} else "unknown",
                "media_type": "file",
                "size": out.stat().st_size,
            },
        }

    def _audio_separation_result(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        job_id: str,
        task: Any | None,
    ) -> dict[str, Any]:
        audio_out = outputs_dir(project_dir, "freezone_audio_separate") / f"{job_id}.m4a"
        mute_video_out = (
            outputs_dir(project_dir, "freezone_audio_separate") / f"{job_id}_mute.mp4"
        )
        if not mute_video_out.exists():
            return _missing_artifact_result(task)
        audio_relative = (
            audio_out.relative_to(project_dir).as_posix() if audio_out.exists() else None
        )
        mute_relative = mute_video_out.relative_to(project_dir).as_posix()
        return {
            "ok": True,
            "data": {
                "audio_url": (
                    self._static_url(context, audio_relative, None)
                    if audio_relative
                    else None
                ),
                "audio_size": audio_out.stat().st_size if audio_out.exists() else 0,
                "mute_video_url": self._static_url(context, mute_relative, None),
                "mute_video_size": mute_video_out.stat().st_size,
                **_push_metadata(task),
            },
        }

    @staticmethod
    def _analysis_result(
        *,
        project_dir: Path,
        job_id: str,
        task_type: str,
        task: Any | None,
    ) -> dict[str, Any] | None:
        if task is not None:
            if task.status == "failed":
                return {
                    "ok": False,
                    "error": task.error or "job failed",
                    "status": task.status,
                    "logs": task.logs[-10:],
                }
            if task.status != "completed":
                return {
                    "ok": False,
                    "info": "job result not yet available",
                    "status": task.status,
                    "current_task": task.current_task,
                }
        task_result = getattr(task, "result", None) if task is not None else None
        if isinstance(task_result, dict):
            data = (
                public_creative_canvas_video_story_result(task_result)
                if task_type == "freezone_video_story"
                else task_result
            )
            return {"ok": True, "data": data}
        analysis_out = outputs_dir(project_dir, "freezone_analyze") / job_id / "analysis.json"
        if not analysis_out.exists():
            return None
        data = _read_json(analysis_out)
        if task_type == "freezone_video_story" and isinstance(data, dict):
            data = public_creative_canvas_video_story_result(data)
        return {"ok": True, "data": data}

    def _static_url(
        self,
        context: ProjectContext,
        relative_path: str,
        local_path: str | Path | None,
    ) -> str:
        return (self._static_url_builder or make_static_url_for_context)(
            context,
            relative_path,
            local_path,
        )


def _json_output_path(project_dir: Path, task_type: str, job_id: str) -> Path:
    return outputs_dir(project_dir, task_type) / f"{job_id}.json"


def _video_output_path(project_dir: Path, task_type: str, job_id: str) -> Path:
    return outputs_dir(project_dir, task_type) / f"{job_id}.mp4"


def _existing_output_variant(out: Path) -> Path:
    if out.exists():
        return out
    for suffix in (".webp", ".mp4", ".mov", ".webm"):
        candidate = out.with_suffix(suffix)
        if candidate.exists():
            return candidate
    return out


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _unfinished_task_result(
    task: Any,
    *,
    missing_info: str,
) -> dict[str, Any] | None:
    if task.status == "failed":
        return {
            "ok": False,
            "error": task.error or "job failed",
            "status": task.status,
            "logs": task.logs[-10:],
        }
    if task.status in {"pending", "starting", "running"}:
        return {
            "ok": False,
            "info": missing_info,
            "status": task.status,
            "current_task": task.current_task,
        }
    return None


def _missing_artifact_result(task: Any | None) -> dict[str, Any]:
    if task is not None:
        status_result = _unfinished_task_result(task, missing_info="job result not yet on disk")
        if status_result is not None:
            return status_result
    return {"ok": False, "info": "job result not yet on disk", "status": "unknown"}


def _push_metadata(task: Any | None) -> dict[str, Any]:
    task_result = getattr(task, "result", None) if task is not None else None
    if not isinstance(task_result, dict):
        return {}
    metadata: dict[str, Any] = {}
    if task_result.get("pushable"):
        metadata["pushable"] = True
    if isinstance(task_result.get("slot_target"), dict):
        metadata["slot_target"] = task_result["slot_target"]
    return metadata
