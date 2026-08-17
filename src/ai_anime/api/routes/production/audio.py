"""Production audio endpoints."""

from fastapi import APIRouter, Depends

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.routes.production.audio_schemas import (
    EpisodeAudioGenerateRequest,
    EpisodeAudioModelRequest,
)
from ai_anime.modules.production.public import (
    AudioVoicePrerequisitesMissing,
    EpisodeAudioBeatMissing,
    EpisodeAudioBeatsMissing,
    GenerateEpisodeAudioCommand,
    episode_audio_use_cases,
    resolve_audio_generation_model,
)

router = APIRouter()


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
                model=resolve_audio_generation_model(body.model),
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
