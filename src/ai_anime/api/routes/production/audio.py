"""Production audio endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.routes.production.audio_schemas import (
    EpisodeAudioGenerateRequest,
    EpisodeAudioModelRequest,
    TTSGenerateRequest,
    TTSPreviewRequest,
)
from ai_anime.modules.production.public import (
    AudioVoicePrerequisitesMissing,
    EpisodeAudioBeatMissing,
    EpisodeAudioBeatsMissing,
    GenerateEpisodeAudioCommand,
    episode_audio_use_cases,
)

router = APIRouter()


@router.post("/projects/{project}/episodes/{episode_num}/tts/generate")
async def generate_tts(
    project: str,
    episode_num: int,
    body: TTSGenerateRequest,
    user: dict = Depends(get_api_user),
):
    """Legacy TTS endpoint removed after IndexTTS2 cutover."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Legacy /tts/generate was removed. Use "
            f"/projects/{project}/episodes/{episode_num}/audio/generate for IndexTTS2."
        ),
    )


@router.post("/projects/{project}/tts/preview")
async def preview_tts(
    project: str,
    body: TTSPreviewRequest,
    user: dict = Depends(get_api_user),
):
    """Legacy TTS preview endpoint removed after IndexTTS2 cutover."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Legacy /tts/preview was removed. IndexTTS2 uses configured reference voices.",
    )


@router.get("/projects/{project}/tts/voices")
async def list_tts_voices(project: str, user: dict = Depends(get_api_user)):
    """Legacy voice listing endpoint removed after IndexTTS2 cutover."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Legacy /tts/voices was removed. IndexTTS2 voice options are project assets.",
    )


@router.post("/projects/{project}/episodes/{episode_num}/audio/generate")
async def generate_audio(
    project: str,
    episode_num: int,
    body: EpisodeAudioGenerateRequest,
    user: dict = Depends(get_api_user),
):
    """Generate episode audio with IndexTTS2."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await episode_audio_use_cases().generate(
            resolved.ctx,
            GenerateEpisodeAudioCommand(
                episode_num=episode_num,
                model=body.model,
                mode=body.mode,
                beat_numbers=body.beat_numbers,
            ),
        )
    except EpisodeAudioBeatsMissing as exc:
        return {"ok": False, "error": str(exc)}
    except AudioVoicePrerequisitesMissing as exc:
        return {"ok": False, "code": exc.code, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/audio")
async def regenerate_beat_audio(
    project: str,
    episode_num: int,
    beat_num: int,
    body: EpisodeAudioModelRequest,
    user: dict = Depends(get_api_user),
):
    """Regenerate one Beat's IndexTTS2 audio."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await episode_audio_use_cases().regenerate_beat(
            resolved.ctx,
            episode_num,
            beat_num,
            body.model,
        )
    except EpisodeAudioBeatMissing as exc:
        return {"ok": False, "error": str(exc)}
    except AudioVoicePrerequisitesMissing as exc:
        return {"ok": False, "code": exc.code, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


__all__ = ["router"]
