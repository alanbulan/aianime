"""Creative Canvas audio-generation endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import (
    FreezoneAudioMusicRequest,
    FreezoneAudioSpeechRequest,
    FreezoneJobAcceptedResponse,
)
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasTaskReceipt,
    InvalidCreativeCanvasAudioGenerationRequest,
    StartCreativeCanvasMusicGenerationCommand,
    StartCreativeCanvasSpeechGenerationCommand,
    creative_canvas_audio_generation_use_cases,
)
from ai_anime.task_backend.limits import (
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
)

logger = logging.getLogger("ai_anime.api.freezone")
router = APIRouter()


@router.post(
    "/projects/{project}/freezone/audio/speech",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-audio"],
)
async def freezone_audio_speech(
    project: str,
    body: FreezoneAudioSpeechRequest,
    user: dict = Depends(get_api_user),
):
    """Freezone 音频节点：文本生成语音。"""
    resolved = await _resolve_editor_project(project, user)
    try:
        result = (
            await creative_canvas_audio_generation_use_cases().start_speech_generation(
                StartCreativeCanvasSpeechGenerationCommand(
                    context=resolved.ctx,
                    project_dir=resolved.project_dir,
                    text=body.text,
                    emotion_prompt=body.emotion_prompt,
                    voice_ref=body.voice_ref.model_dump() if body.voice_ref else None,
                    target_episode=body.target_episode,
                    target_beat=body.target_beat,
                )
            )
        )
    except InvalidCreativeCanvasAudioGenerationRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
        raise
    except RuntimeError as exc:
        logger.warning(
            "failed to start freezone audio speech task: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            503,
            f"failed to start freezone audio speech task: {exc}",
        ) from exc
    return _audio_generation_response(result)


@router.post(
    "/projects/{project}/freezone/audio/eleven-music",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-audio"],
)
async def freezone_audio_eleven_music(
    project: str,
    body: FreezoneAudioMusicRequest,
    user: dict = Depends(get_api_user),
):
    """Freezone 音频节点：文本生成音乐。"""
    resolved = await _resolve_editor_project(project, user)
    try:
        result = (
            await creative_canvas_audio_generation_use_cases().start_music_generation(
                StartCreativeCanvasMusicGenerationCommand(
                    context=resolved.ctx,
                    project_dir=resolved.project_dir,
                    input_text=body.input,
                    model=body.model,
                    response_format=body.response_format,
                    music_length_ms=body.music_length_ms,
                    force_instrumental=body.force_instrumental,
                    respect_sections_durations=body.respect_sections_durations,
                    output_format=body.output_format,
                )
            )
        )
    except InvalidCreativeCanvasAudioGenerationRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
        raise
    except RuntimeError as exc:
        logger.warning(
            "failed to start freezone audio music task: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            503,
            f"failed to start freezone audio music task: {exc}",
        ) from exc
    return _audio_generation_response(result)


def _audio_generation_response(result: CreativeCanvasTaskReceipt) -> dict:
    data = {
        "task_type": result.task_type,
        "job_id": result.job_id,
        "task_key": result.task_key,
        "task_episode": result.task_episode,
        "task_scope": result.task_scope,
        "backend": result.backend,
        "queue": result.queue,
    }
    if result.task_id:
        data["task_id"] = result.task_id
    return {"ok": True, "data": data}


async def _resolve_editor_project(project: str, user: dict):
    return await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )


__all__ = ["router"]
