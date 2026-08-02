"""Creative Canvas audio-generation endpoints."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ai_anime.api.auth import get_api_user
from ai_anime.api.canvas_audio_schemas import (
    FreezoneAudioMusicRequest,
    FreezoneAudioSpeechRequest,
)
from ai_anime.api.canvas_job_schemas import FreezoneJobAcceptedResponse
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreateCreativeCanvasAudioVoiceCommand,
    CreativeCanvasAudioVoiceMissing,
    CreativeCanvasTaskReceipt,
    GetCreativeCanvasAudioVoiceQuery,
    InvalidCreativeCanvasAudioGenerationRequest,
    InvalidCreativeCanvasAudioLibraryRequest,
    ListCreativeCanvasAudioReferencesQuery,
    StartCreativeCanvasMusicGenerationCommand,
    StartCreativeCanvasSpeechGenerationCommand,
    creative_canvas_audio_generation_use_cases,
    creative_canvas_audio_library_use_cases,
)
from ai_anime.modules.task_execution.public import (
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
)

logger = logging.getLogger("ai_anime.api.freezone")
router = APIRouter()


@router.get(
    "/projects/{project}/freezone/audio/references",
    tags=["freezone-audio"],
)
async def freezone_audio_references(
    project: str,
    user: dict = Depends(get_api_user),
):
    """获取账号级音色、项目解说人与角色参考音频。"""
    resolved = await _resolve_viewer_project(project, user)
    data = await creative_canvas_audio_library_use_cases().list_references(
        ListCreativeCanvasAudioReferencesQuery(
            context=resolved.ctx,
            project_dir=resolved.project_dir,
        )
    )
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/freezone/audio/voices",
    tags=["freezone-audio"],
)
async def create_freezone_audio_voice(
    project: str,
    file: Annotated[
        UploadFile,
        File(description="参考音频文件，支持 mp3/wav/m4a/aac/ogg/webm"),
    ],
    name: Annotated[str, Form(description="音色名称，用于音色选择弹窗展示")] = "",
    user: dict = Depends(get_api_user),
):
    """创建账号级“我的音色”。"""
    resolved = await _resolve_editor_project(project, user)
    try:
        voice = creative_canvas_audio_library_use_cases().create_voice(
            CreateCreativeCanvasAudioVoiceCommand(
                context=resolved.ctx,
                name=name,
                filename=file.filename,
                content=await file.read(),
                mime_type=file.content_type or "",
            )
        )
    except InvalidCreativeCanvasAudioLibraryRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "data": voice}


@router.get(
    "/projects/{project}/freezone/audio/voices/{voice_id}/media",
    tags=["freezone-audio"],
)
async def get_freezone_audio_voice_media(
    project: str,
    voice_id: str,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_viewer_project(project, user)
    try:
        media_path = creative_canvas_audio_library_use_cases().get_voice(
            GetCreativeCanvasAudioVoiceQuery(
                context=resolved.ctx,
                voice_id=voice_id,
            )
        )
    except CreativeCanvasAudioVoiceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    return FileResponse(path=str(media_path))


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
                    model=body.model,
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


async def _resolve_viewer_project(project: str, user: dict):
    return await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )


__all__ = ["router"]
