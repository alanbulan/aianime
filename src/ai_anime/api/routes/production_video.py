"""Production episode video endpoints."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.production_video_schemas import (
    GlobalOptimizeRequest,
    Seedance2AssetAudioTrimRequest,
    Seedance2AssetCropRequest,
    Seedance2AssetDeleteRequest,
    SingleVideoRequest,
    VideoComposeRequest,
)
from ai_anime.modules.production.public import (
    ComposeEpisodeVideoCommand,
    CropSeedance2AssetCommand,
    EpisodeBeatsMissing,
    GlobalVideoOptimizationBeatsMissing,
    GlobalVideoOptimizationSketchesMissing,
    GenerateSingleVideoCommand,
    OptimizeEpisodeVideoCommand,
    RemoveSeedance2AssetCommand,
    Seedance2PanelBeatMissing,
    Seedance2PanelOperationRejected,
    Seedance2PanelQuery,
    SingleVideoRejected,
    TrimSeedance2AudioAssetCommand,
    UploadSeedance2AssetCommand,
    episode_video_use_cases,
    global_video_optimization_use_cases,
    seedance2_panel_use_cases,
    single_video_use_cases,
    video_backend_catalog_use_cases,
)

router = APIRouter()


@router.get(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/seedance2-status"
)
async def get_seedance2_beat_status(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Return NiceGUI-aligned read-only Seedance 2.0 status for one Beat."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    try:
        return await seedance2_panel_use_cases().status(
            resolved.ctx,
            Seedance2PanelQuery(
                project=project,
                episode_num=episode_num,
                beat_num=beat_num,
            ),
        )
    except Seedance2PanelBeatMissing as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/seedance2/assets/upload"
)
async def upload_seedance2_asset(
    project: str,
    episode_num: int,
    beat_num: int,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """Upload a manual Seedance 2.0 reference asset."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    content = await file.read()
    try:
        return await seedance2_panel_use_cases().upload(
            resolved.ctx,
            UploadSeedance2AssetCommand(
                project=project,
                episode_num=episode_num,
                beat_num=beat_num,
                filename=file.filename or "seedance2_asset",
                content=content,
                content_type=file.content_type or "",
            ),
        )
    except Seedance2PanelBeatMissing as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Seedance2PanelOperationRejected as exc:
        return {"ok": False, "error": str(exc)}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/seedance2/assets/delete"
)
async def delete_seedance2_asset(
    project: str,
    episode_num: int,
    beat_num: int,
    body: Seedance2AssetDeleteRequest,
    user: dict = Depends(get_api_user),
):
    """Remove a manually attached Seedance 2.0 reference asset."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    try:
        return await seedance2_panel_use_cases().remove(
            resolved.ctx,
            RemoveSeedance2AssetCommand(
                project=project,
                episode_num=episode_num,
                beat_num=beat_num,
                media_kind=body.media_kind,
                path=body.path,
            ),
        )
    except Seedance2PanelBeatMissing as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Seedance2PanelOperationRejected as exc:
        return {"ok": False, "error": str(exc)}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/seedance2/assets/crop"
)
async def crop_seedance2_asset(
    project: str,
    episode_num: int,
    beat_num: int,
    body: Seedance2AssetCropRequest,
    user: dict = Depends(get_api_user),
):
    """Crop an existing Seedance 2.0 image reference into a manual reference."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    try:
        return await seedance2_panel_use_cases().crop(
            resolved.ctx,
            CropSeedance2AssetCommand(
                project=project,
                episode_num=episode_num,
                beat_num=beat_num,
                asset_key=body.asset_key,
                source_path=body.source_path,
                crop_data=body.model_dump(),
            ),
        )
    except Seedance2PanelBeatMissing as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Seedance2PanelOperationRejected as exc:
        return {"ok": False, "error": str(exc)}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/seedance2/assets/audio-trim"
)
async def trim_seedance2_audio_asset(
    project: str,
    episode_num: int,
    beat_num: int,
    body: Seedance2AssetAudioTrimRequest,
    user: dict = Depends(get_api_user),
):
    """Trim an existing Seedance 2.0 audio reference into a 3-5 second clip."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    try:
        return await seedance2_panel_use_cases().trim_audio(
            resolved.ctx,
            TrimSeedance2AudioAssetCommand(
                project=project,
                episode_num=episode_num,
                beat_num=beat_num,
                asset_key=body.asset_key,
                source_path=body.source_path,
                start_seconds=body.start_seconds,
                duration_seconds=body.duration_seconds,
            ),
        )
    except Seedance2PanelBeatMissing as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}


@router.get("/projects/{project}/video-backends")
async def get_video_backend_options(
    project: str,
    user: dict = Depends(get_api_user),
):
    """Return the available video generation backends."""
    await resolve_project_scope(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": [
            item.as_dict()
            for item in video_backend_catalog_use_cases().list_options()
        ],
    }


@router.post("/projects/{project}/episodes/{episode_num}/optimize/video-global")
async def global_optimize_video(
    project: str,
    episode_num: int,
    body: GlobalOptimizeRequest = GlobalOptimizeRequest(),
    user: dict = Depends(get_api_user),
):
    """Queue global video prompt optimization for an episode."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await global_video_optimization_use_cases().schedule(
            resolved.ctx,
            OptimizeEpisodeVideoCommand(
                episode_num=episode_num,
                language=body.language,
            ),
        )
    except (
        GlobalVideoOptimizationBeatsMissing,
        GlobalVideoOptimizationSketchesMissing,
    ) as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/video")
async def generate_single_video(
    project: str,
    episode_num: int,
    beat_num: int,
    body: SingleVideoRequest,
    user: dict = Depends(get_api_user),
):
    """Queue video generation for one Beat."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await single_video_use_cases().generate(
            resolved.ctx,
            GenerateSingleVideoCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                video_backend=body.video_backend,
                resolution=body.resolution,
                use_director_render=body.use_director_render,
                seedance2_config_json=body.seedance2_config_json,
                mode=body.mode,
                duration=body.duration,
                ratio=body.ratio,
                generate_audio=body.generate_audio,
                return_last_frame=body.return_last_frame,
                human_review=body.human_review,
                scene_optimize=body.scene_optimize,
                final_prompt=body.final_prompt,
                audio_setting=body.audio_setting,
                prompt_guidance=body.prompt_guidance,
                text_overlay=body.text_overlay,
                provided_fields=frozenset(body.model_fields_set),
            ),
        )
    except SingleVideoRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/videos/compose")
async def compose_video(
    project: str,
    episode_num: int,
    body: VideoComposeRequest,
    user: dict = Depends(get_api_user),
):
    """Queue final episode video composition."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await episode_video_use_cases().compose(
            resolved.ctx,
            ComposeEpisodeVideoCommand(
                episode_num=episode_num,
                add_subtitles=body.add_subtitles,
                add_bgm=body.add_bgm,
                resolution=body.resolution,
            ),
        )
    except EpisodeBeatsMissing as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.get("/projects/{project}/episodes/{episode_num}/final")
async def get_final_video(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Return the composed episode video status."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    status_data = episode_video_use_cases().final_status(
        resolved.ctx,
        episode_num,
    )
    return {"ok": True, "data": status_data.as_dict()}


__all__ = ["router"]
