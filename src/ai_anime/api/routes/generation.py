"""画面/网格/视频生成端点。"""

import logging
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse

from ai_anime.api.auth import get_api_user, require_scope
from ai_anime.api.deps import (
    make_sqlite_store_for_context,
    make_sqlite_store,
    make_static_url_for_context,
    resolve_project_scope,
)
from ai_anime.api.schemas import (
    GlobalOptimizeRequest,
    VideoComposeRequest,
    TTSGenerateRequest,
    TTSPreviewRequest,
    SketchGenerateRequest,
    GridRegenerateRequest,
    BeatsRegenerateRequest,
    SketchRegenerateRequest,
    SingleVideoRequest,
    PoolSelectRequest,
    VideoPoolSelectRequest,
    GridCutRequest,
    GridSketchPreviewRequest,
    OperatorPasswordVerifyRequest,
    RenderPlanExecuteRequest,
    RenderPlanRequest,
    RenderSettingsUpdate,
    SketchRegenQueueUpdate,
    SketchSettingsUpdate,
    BeatBackgroundAnchorUpdate,
    Seedance2AssetAudioTrimRequest,
    Seedance2AssetCropRequest,
    Seedance2AssetDeleteRequest,
)
from ai_anime.modules.asset_world.public import (
    BackgroundAnchorRejected,
    BeatViewerBeatNotFound,
    BeatViewerQuery,
    CropBeatBackgroundCommand,
    ExportBeatDirectorControlFrameCommand,
    SaveBeatDirectorOverlayCommand,
    SceneCatalogRejected,
    SceneViewerRejected,
    SelectBeatBackgroundCommand,
    UploadBeatBackgroundCommand,
    beat_background_anchor_use_cases,
    beat_director_stage_use_cases,
    beat_viewer_use_cases,
    resolve_beat_scene_name,
)
from ai_anime.modules.production.public import (
    AssignProjectSketchColorsCommand,
    AudioVoicePrerequisitesMissing,
    BuildRenderPlanCommand,
    ComposeEpisodeVideoCommand,
    CropSeedance2AssetCommand,
    CropCurrentSketchCommand,
    CutGridCommand,
    CurrentSketchMissing,
    DetectProjectSketchMarkersCommand,
    DirectorControlSketchUnavailable,
    EpisodeBeatsMissing,
    EpisodeAudioBeatMissing,
    EpisodeAudioBeatsMissing,
    EpisodeScriptBeatsMissing,
    EpisodeSubtitlesMissing,
    ExecuteRenderPlanCommand,
    FinalEpisodeVideoMissing,
    GenerateMissingManualSketchesCommand,
    GenerateDirectorControlSketchCommand,
    GenerateEpisodeAudioCommand,
    GenerateSketchesCommand,
    GenerateSingleVideoCommand,
    GlobalVideoOptimizationBeatsMissing,
    GlobalVideoOptimizationSketchesMissing,
    GridPoolCutRejected,
    GridPoolImageStale,
    GridPoolPreviewRejected,
    GridPoolPromptRejected,
    GridPoolSelectionRejected,
    GridPoolUploadRejected,
    GridRegenerationRejected,
    GridPromptQuery,
    GridSketchPreviewCommand,
    ImageGenerationGuardQuery,
    ManualSketchRegenerationRejected,
    ProductionImageSettingsRejected,
    OptimizeEpisodeVideoCommand,
    RegenerateGridCommand,
    RegenerateSelectedBeatsCommand,
    RenderPlanConflict,
    RenderPlanFeatureDisabled,
    RenderPlanGrid,
    RenderPlanRejected,
    ReplaceSketchRegenQueueCommand,
    RemoveSeedance2AssetCommand,
    SaveSketchEditorCommand,
    SketchBeatMissing,
    SketchCropRejected,
    SketchColorMarkersMissing,
    SketchEpisodeBeatsMissing,
    SketchMarkerDetectionFailed,
    SketchMarkerDetectionRejected,
    SketchPoseCandidatesMissing,
    SketchEditorQuery,
    SketchEditorSaveRejected,
    Seedance2PanelBeatMissing,
    Seedance2PanelOperationRejected,
    Seedance2PanelQuery,
    SelectGridPoolImageCommand,
    SelectedRegenerationKind,
    SelectedRegenerationRejected,
    SketchGenerationRejected,
    SingleVideoRejected,
    TrimSeedance2AudioAssetCommand,
    UpdateRenderImageSettingsCommand,
    UpdateSketchImageSettingsCommand,
    UploadBeatPoolImageCommand,
    UploadGridImageCommand,
    UploadSeedance2AssetCommand,
    VideoPoolEntryUnavailable,
    director_control_sketch_use_cases,
    global_video_optimization_use_cases,
    grid_pool_use_cases,
    grid_regeneration_use_cases,
    manual_sketch_regeneration_use_cases,
    seedance2_panel_use_cases,
    selected_regeneration_use_cases,
    sketch_generation_use_cases,
    single_video_use_cases,
    episode_audio_use_cases,
    episode_export_use_cases,
    episode_video_use_cases,
    production_image_settings_use_cases,
    render_plan_use_cases,
    image_generation_usage_use_cases,
    sketch_editing_use_cases,
    sketch_marker_use_cases,
    sketch_regen_queue_use_cases,
    video_backend_catalog_use_cases,
    video_pool_use_cases,
)
from ai_anime.shared.project_media import make_project_asset_url_builder
from ai_anime.utils.media_io import decode_uploaded_rgb_image

router = APIRouter()

logger = logging.getLogger(__name__)

async def _resolve_generation_project(
    project: str, user: dict, required_role: str = "editor"
):
    return await resolve_project_scope(project, user, required_role=required_role)


def _render_plan_unavailable_response(use_cases: Any) -> JSONResponse | None:
    try:
        use_cases.ensure_available()
    except RenderPlanFeatureDisabled as exc:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "feature_disabled",
                "data": {"reason": str(exc)},
            },
        )
    return None


def _render_plan_rejection_response(
    exc: RenderPlanRejected,
) -> JSONResponse:
    return JSONResponse(
        status_code=409 if isinstance(exc, RenderPlanConflict) else 400,
        content=exc.as_dict(),
    )


async def _read_uploaded_rgb_image(file: UploadFile):
    content = await file.read()
    return decode_uploaded_rgb_image(content)


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
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
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
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
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
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
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
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
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
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
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
    """Return video backend options shared with the NiceGUI render workbench."""
    await _resolve_generation_project(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": [
            item.as_dict()
            for item in video_backend_catalog_use_cases().list_options()
        ],
    }


@router.get("/projects/{project}/render-settings")
async def get_render_settings(
    project: str,
    user: dict = Depends(get_api_user),
):
    """Return Render-stage image model and sizing settings for React."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": production_image_settings_use_cases().render_settings(
            resolved.username,
            resolved.project_name,
        ),
    }


@router.patch("/projects/{project}/render-settings")
async def update_render_settings(
    project: str,
    body: RenderSettingsUpdate,
    user: dict = Depends(get_api_user),
):
    """Persist Render-stage image model and sizing settings."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        data = production_image_settings_use_cases().update_render_settings(
            resolved.username,
            resolved.project_name,
            UpdateRenderImageSettingsCommand(
                render_image_selection=body.render_image_selection,
                sketch_aspect_padding=body.sketch_aspect_padding,
            ),
        )
    except ProductionImageSettingsRejected as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    return {"ok": True, "data": data}


@router.get("/projects/{project}/sketch-settings")
async def get_sketch_settings(
    project: str,
    user: dict = Depends(get_api_user),
):
    """Return Sketch-stage image model settings for React."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": production_image_settings_use_cases().sketch_settings(
            resolved.username,
            resolved.project_name,
        ),
    }


@router.patch("/projects/{project}/sketch-settings")
async def update_sketch_settings(
    project: str,
    body: SketchSettingsUpdate,
    user: dict = Depends(get_api_user),
):
    """Persist Sketch-stage image model settings."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        data = production_image_settings_use_cases().update_sketch_settings(
            resolved.username,
            resolved.project_name,
            UpdateSketchImageSettingsCommand(
                sketch_image_selection=body.sketch_image_selection,
            ),
        )
    except ProductionImageSettingsRejected as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    return {"ok": True, "data": data}


@router.get("/projects/{project}/episodes/{episode_num}/sketch-regen-queue")
async def get_sketch_regen_queue(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Return the persisted React sketch regeneration dispatch queue."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": sketch_regen_queue_use_cases().get(
            resolved.username,
            resolved.project_name,
            episode_num,
        ).as_dict(),
    }


@router.put("/projects/{project}/episodes/{episode_num}/sketch-regen-queue")
async def update_sketch_regen_queue(
    project: str,
    episode_num: int,
    body: SketchRegenQueueUpdate,
    user: dict = Depends(get_api_user),
):
    """Persist the React sketch regeneration dispatch queue per episode."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    result = sketch_regen_queue_use_cases().replace(
        resolved.username,
        resolved.project_name,
        ReplaceSketchRegenQueueCommand(
            episode_num=episode_num,
            items=[item.model_dump() for item in body.items],
        ),
    )
    return {
        "ok": True,
        "data": result.as_dict(),
    }


@router.get("/projects/{project}/episodes/{episode_num}/sketch-image-usage")
async def get_sketch_image_usage(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Return NiceGUI-style Sketch image request usage summary."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    summary = image_generation_usage_use_cases().sketch_usage(
        resolved.project_dir,
        episode_num,
    )
    return {"ok": True, "data": summary}


@router.get("/projects/{project}/episodes/{episode_num}/image-generation-guard")
async def get_image_generation_guard(
    project: str,
    episode_num: int,
    task_type: str = Query(...),
    scope: str = Query(...),
    subject: str = Query("当前生成任务"),
    user: dict = Depends(get_api_user),
):
    """Return per-scope image generation guard status used before dispatch."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    guard = image_generation_usage_use_cases().guard(
        ImageGenerationGuardQuery(
            project_dir=resolved.project_dir,
            episode_num=episode_num,
            task_type=task_type,
            scope=scope,
            subject=subject,
        )
    )
    return {"ok": True, "data": guard.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/image-generation-guard/verify-password"
)
async def verify_image_generation_guard_password(
    project: str,
    episode_num: int,
    body: OperatorPasswordVerifyRequest,
    user: dict = Depends(get_api_user),
):
    """Verify the same operator password NiceGUI requires after repeated image attempts."""
    verified = image_generation_usage_use_cases().verify_operator_password(
        body.password,
    )
    return {
        "ok": True,
        "data": {"verified": verified},
    }


@router.post("/projects/{project}/episodes/{episode_num}/videos/compose")
async def compose_video(
    project: str,
    episode_num: int,
    body: VideoComposeRequest,
    user: dict = Depends(get_api_user),
):
    """合成成片。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
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
    """读取 episode 成片状态，供 ai-anime-fe compose 页刷新 hydration。"""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    status_data = episode_video_use_cases().final_status(
        resolved.ctx,
        episode_num,
    )
    return {"ok": True, "data": status_data.as_dict()}


# ── TTS 语音 ──────────────────────────────────────────────────────────────────


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


# ── 草图 ──────────────────────────────────────────────────────────────────────


@router.post("/projects/{project}/episodes/{episode_num}/sketches/generate")
async def generate_sketches(
    project: str,
    episode_num: int,
    body: SketchGenerateRequest,
    user: dict = Depends(require_scope("tasks:submit")),
):
    """生成草图。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        scheduled = await sketch_generation_use_cases().generate(
            resolved.ctx,
            GenerateSketchesCommand(
                episode_num=episode_num,
                grid_index=body.grid_index,
                style=body.style,
                model=body.model,
                sketch_scene_grouping=body.sketch_scene_grouping,
                aspect_ratio=body.aspect_ratio,
                image_generation_selection=body.image_generation_selection,
            ),
        )
    except SketchGenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


# ── 语音生成 ──────────────────────────────────────────────────────────────────


@router.post("/projects/{project}/episodes/{episode_num}/audio/generate")
async def generate_audio(
    project: str,
    episode_num: int,
    body: TTSGenerateRequest = TTSGenerateRequest(),
    user: dict = Depends(get_api_user),
):
    """批量生成语音（IndexTTS2）。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        scheduled = await episode_audio_use_cases().generate(
            resolved.ctx,
            GenerateEpisodeAudioCommand(
                episode_num=episode_num,
                mode=body.mode,
                beat_numbers=body.beat_numbers,
            ),
        )
    except EpisodeAudioBeatsMissing as exc:
        return {"ok": False, "error": str(exc)}
    except AudioVoicePrerequisitesMissing as exc:
        return {"ok": False, "code": exc.code, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


# ── 视频优化 ──────────────────────────────────────────────────────────────────


@router.post("/projects/{project}/episodes/{episode_num}/optimize/video-global")
async def global_optimize_video(
    project: str,
    episode_num: int,
    body: GlobalOptimizeRequest = GlobalOptimizeRequest(),
    user: dict = Depends(get_api_user),
):
    """全局视频提示词优化（草图 → AI 自由决策每个 beat 的 i2v/k2v 模式）。

    language="en" (默认) 使用 SuperPower 模式（Gemini 英文提示词，含 camera/action/audio）。
    language="zh" 使用中文简短提示词。
    """
    resolved = await _resolve_generation_project(project, user, required_role="editor")
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


# ── 再生 ──────────────────────────────────────────────────────────────────────


@router.post("/projects/{project}/episodes/{episode_num}/grids/{grid_index}/regenerate")
async def regenerate_grid(
    project: str,
    episode_num: int,
    grid_index: int,
    body: GridRegenerateRequest,
    user: dict = Depends(get_api_user),
):
    """重新生成单个网格。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        scheduled = await grid_regeneration_use_cases().regenerate(
            resolved.ctx,
            RegenerateGridCommand(
                episode_num=episode_num,
                grid_index=grid_index,
                style=body.style,
                model=body.model,
                scene_grouping=body.scene_grouping,
                character_grouping=body.character_grouping,
                image_generation_selection=body.image_generation_selection,
                sketch_aspect_padding=body.sketch_aspect_padding,
            ),
        )
    except GridRegenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/render/plan")
async def render_plan(
    project: str,
    episode_num: int,
    body: RenderPlanRequest,
    user: dict = Depends(get_api_user),
):
    """Return the server-authoritative render plan for selected beats."""
    use_cases = render_plan_use_cases()
    unavailable = _render_plan_unavailable_response(use_cases)
    if unavailable is not None:
        return unavailable
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        planned = await use_cases.plan(
            resolved.ctx,
            BuildRenderPlanCommand(
                episode_num=episode_num,
                beat_numbers=tuple(body.beat_indices),
                strategy=body.strategy,
                aspect_mode=body.aspect_mode,
                force_one_by_one=body.force_one_by_one,
                image_generation_selection=body.image_generation_selection,
            ),
        )
    except RenderPlanRejected as exc:
        return _render_plan_rejection_response(exc)
    return {"ok": True, "data": planned.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/render/execute")
async def render_execute(
    project: str,
    episode_num: int,
    body: RenderPlanExecuteRequest,
    user: dict = Depends(get_api_user),
):
    """Validate and dispatch a render plan through the current selected-regen task path."""
    use_cases = render_plan_use_cases()
    unavailable = _render_plan_unavailable_response(use_cases)
    if unavailable is not None:
        return unavailable
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        executed = await use_cases.execute(
            resolved.ctx,
            ExecuteRenderPlanCommand(
                episode_num=episode_num,
                plan=tuple(
                    RenderPlanGrid(
                        mode_key=entry.mode_key,
                        rows=entry.rows,
                        cols=entry.cols,
                        beat_numbers=tuple(entry.beat_numbers),
                        location=entry.location,
                        padding_count=entry.padding_count,
                        reasons=tuple(entry.reasons),
                        warnings=tuple(entry.warnings),
                    )
                    for entry in body.plan
                ),
                plan_hash=body.plan_hash,
                input_fingerprint=body.input_fingerprint,
                strategy=body.strategy,
                aspect_mode=body.aspect_mode,
                beat_numbers=tuple(body.beat_indices),
                force_one_by_one=body.force_one_by_one,
                custom_plan=body.custom_plan,
                image_generation_selection=body.image_generation_selection,
                sketch_aspect_padding=body.sketch_aspect_padding,
            ),
        )
    except RenderPlanRejected as exc:
        return _render_plan_rejection_response(exc)
    return {"ok": True, "data": executed.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/beats/regenerate")
async def regenerate_beats(
    project: str,
    episode_num: int,
    body: BeatsRegenerateRequest,
    user: dict = Depends(get_api_user),
):
    """选中 Beats 再生画面。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        scheduled = await selected_regeneration_use_cases().regenerate(
            resolved.ctx,
            RegenerateSelectedBeatsCommand(
                kind=SelectedRegenerationKind.RENDER,
                episode_num=episode_num,
                beat_indices=tuple(body.beat_indices),
                style=body.style,
                model=body.model,
                mode_key=body.mode_key,
                image_generation_selection=body.image_generation_selection,
                sketch_aspect_padding=body.sketch_aspect_padding,
            ),
        )
    except SelectedRegenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/sketches/regenerate")
async def regenerate_sketches(
    project: str,
    episode_num: int,
    body: SketchRegenerateRequest,
    user: dict = Depends(get_api_user),
):
    """选中 Beats 再生草图。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        scheduled = await selected_regeneration_use_cases().regenerate(
            resolved.ctx,
            RegenerateSelectedBeatsCommand(
                kind=SelectedRegenerationKind.SKETCH,
                episode_num=episode_num,
                beat_indices=tuple(body.beat_indices),
                style=body.style,
                model=body.model,
                mode_key=body.mode_key,
                image_generation_selection=body.image_generation_selection,
            ),
        )
    except SelectedRegenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


async def _episode_beat_from_resolution(
    resolved,
    episode_num: int,
    beat_num: int,
):
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    try:
        beats = await store.get_beats_as_dicts(int(episode_num))
        target = next(
            (
                beat
                for beat in beats
                if int(beat.get("beat_number") or 0) == int(beat_num)
            ),
            None,
        )
        if target is None:
            raise HTTPException(status_code=404, detail=f"Beat {beat_num} not found")
        return store, target
    except Exception:
        close = getattr(store, "close", None)
        if close:
            await close()
        raise


@router.get(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/pano-background/manifest"
)
async def get_beat_pano_background_manifest(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Return the typed 360 viewer manifest for Beat selected-background capture."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    try:
        manifest = await beat_viewer_use_cases().pano_background_manifest(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
        )
    except BeatViewerBeatNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": manifest}


@router.get("/projects/{project}/director-stage/palette")
async def get_default_director_stage_palette(
    project: str,
    user: dict = Depends(get_api_user),
):
    """Return the shared director-stage palette used by local/freezone worlds."""
    await _resolve_generation_project(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": beat_viewer_use_cases().default_director_stage_palette(),
    }


@router.get(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/director-stage/manifest"
)
async def get_beat_director_stage_manifest(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Return the typed 3GS director-stage manifest for Beat-level capture."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    try:
        manifest = await beat_viewer_use_cases().director_stage_manifest(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
        )
    except BeatViewerBeatNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": manifest}


@router.get(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/director-stage/overlay"
)
async def get_beat_director_stage_overlay(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Load the current Beat 3GS overlay, or inherit the previous same-scene Beat."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    store, beat = await _episode_beat_from_resolution(resolved, episode_num, beat_num)
    try:
        scene_name = resolve_beat_scene_name(beat)
        if not scene_name:
            return {"ok": False, "error": "当前 Beat 没有关联场景"}
        return {
            "ok": True,
            "data": await beat_director_stage_use_cases().load_overlay(
                repository=store,
                project_dir=project_dir,
                episode_num=int(episode_num),
                beat_num=int(beat_num),
                scene_name=scene_name,
            ),
        }
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/director-stage/overlay"
)
async def save_beat_director_stage_overlay(
    project: str,
    episode_num: int,
    beat_num: int,
    body: dict[str, Any],
    user: dict = Depends(get_api_user),
):
    """Persist the current Beat 3GS overlay to director_blockings/epNNN/beat_MM.json."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    project_dir = resolved.project_dir
    store, beat = await _episode_beat_from_resolution(resolved, episode_num, beat_num)
    try:
        scene_name = resolve_beat_scene_name(beat)
        if not scene_name:
            return {"ok": False, "error": "当前 Beat 没有关联场景"}
        return {
            "ok": True,
            "data": await beat_director_stage_use_cases().save_overlay(
                repository=store,
                asset_writer=(
                    store
                    if callable(getattr(store, "update_beat_asset", None))
                    else None
                ),
                project_dir=project_dir,
                episode_num=int(episode_num),
                beat_num=int(beat_num),
                scene_name=scene_name,
                beat=beat,
                command=SaveBeatDirectorOverlayCommand(
                    frame_aspect=body.get("frame_aspect"),
                    source=body.get("source"),
                    frame_meta=body.get("frame_meta"),
                    snapshot=body.get("snapshot"),
                    camera=body.get("camera"),
                    actors=body.get("actors"),
                    props=body.get("props"),
                    stagings=body.get("stagings"),
                    command_log=body.get("command_log"),
                    deleted_keys=body.get("deleted_keys"),
                ),
            ),
        }
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/director-stage/control-frame"
)
async def export_beat_director_stage_control_frame(
    project: str,
    episode_num: int,
    beat_num: int,
    body: dict[str, Any],
    user: dict = Depends(get_api_user),
):
    """Persist Director Render control-frame PNG layers and frame_meta.json."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    project_dir = resolved.project_dir
    store, beat = await _episode_beat_from_resolution(resolved, episode_num, beat_num)
    try:
        scene_name = resolve_beat_scene_name(beat)
        if not scene_name:
            return {"ok": False, "error": "当前 Beat 没有关联场景"}
        try:
            payload = beat_director_stage_use_cases().export_control_frame(
                project_dir=project_dir,
                scene_name=scene_name,
                episode_num=int(episode_num),
                beat_num=int(beat_num),
                command=ExportBeatDirectorControlFrameCommand(
                    images=body.get("images"),
                    frame_meta=body.get("frame_meta"),
                    frame_aspect=body.get("frame_aspect"),
                    snapshot=body.get("snapshot"),
                    actors=body.get("actors"),
                    props=body.get("props"),
                    stagings=body.get("stagings"),
                ),
                asset_url=make_project_asset_url_builder(
                    resolved.ctx,
                    project_dir,
                    make_static_url_for_context,
                ),
            )
        except SceneViewerRejected as exc:
            return JSONResponse(
                status_code=400, content={"ok": False, "error": str(exc)}
            )
        return {"ok": True, "data": payload}
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


@router.get(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/background-anchors"
)
async def get_beat_background_anchors(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Return NiceGUI-compatible single-beat background anchor options."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    store, beat = await _episode_beat_from_resolution(resolved, episode_num, beat_num)
    try:
        return {
            "ok": True,
            "data": beat_background_anchor_use_cases().list_anchors(
                project_dir=project_dir,
                beat=beat,
                episode_num=episode_num,
                beat_num=beat_num,
                asset_url=make_project_asset_url_builder(
                    resolved.ctx,
                    project_dir,
                    make_static_url_for_context,
                ),
            ),
        }
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


@router.patch(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/background-anchor"
)
async def update_beat_background_anchor(
    project: str,
    episode_num: int,
    beat_num: int,
    body: BeatBackgroundAnchorUpdate,
    user: dict = Depends(get_api_user),
):
    """Persist the single-beat background anchor selection.

    Matches NiceGUI's render-input semantics: master/reverse/director env-only
    are snapshotted into the beat-owned selected_background.png before being
    used, while render_anchor_source_id preserves the UI-visible source.
    """
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    project_dir = resolved.project_dir
    store, beat = await _episode_beat_from_resolution(resolved, episode_num, beat_num)
    try:
        try:
            payload = await beat_background_anchor_use_cases().select_anchor(
                asset_writer=(
                    store
                    if callable(getattr(store, "update_beat_asset", None))
                    else None
                ),
                project_dir=project_dir,
                beat=beat,
                episode_num=int(episode_num),
                beat_num=int(beat_num),
                command=SelectBeatBackgroundCommand(anchor_id=body.anchor_id),
                asset_url=make_project_asset_url_builder(
                    resolved.ctx,
                    project_dir,
                    make_static_url_for_context,
                ),
            )
        except BackgroundAnchorRejected as exc:
            return {"ok": False, "error": str(exc)}

        return {"ok": True, "data": payload}
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/background-anchor/crop"
)
async def crop_beat_background_anchor(
    project: str,
    episode_num: int,
    beat_num: int,
    body: dict[str, Any],
    user: dict = Depends(get_api_user),
):
    """Crop a source background into the beat-owned render background slot."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    project_dir = resolved.project_dir
    store, beat = await _episode_beat_from_resolution(resolved, episode_num, beat_num)
    try:
        try:
            payload = await beat_background_anchor_use_cases().crop_anchor(
                asset_writer=(
                    store
                    if callable(getattr(store, "update_beat_asset", None))
                    else None
                ),
                project_dir=project_dir,
                beat=beat,
                episode_num=int(episode_num),
                beat_num=int(beat_num),
                command=CropBeatBackgroundCommand(
                    anchor_id=str(body.get("anchor_id") or ""),
                    x=body.get("x"),
                    y=body.get("y"),
                    width=body.get("width"),
                    height=body.get("height"),
                ),
                asset_url=make_project_asset_url_builder(
                    resolved.ctx,
                    project_dir,
                    make_static_url_for_context,
                ),
            )
        except BackgroundAnchorRejected as exc:
            return {"ok": False, "error": str(exc)}
        except (TypeError, ValueError):
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": "裁剪参数无效"},
            )
        except Exception as exc:
            return {"ok": False, "error": f"裁剪 Render 背景参考失败: {exc}"}

        return {"ok": True, "data": payload}
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/background-anchor/upload"
)
async def upload_beat_background_anchor(
    project: str,
    episode_num: int,
    beat_num: int,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """Upload an external render-background reference for a single Beat.

    This mirrors NiceGUI's Render 背景参考 upload path: the image is stored in
    the beat-owned selected_background.png slot and the beat scene_ref persists
    render_anchor_id=selected_background plus render_anchor_source_id for UI.
    It is a compatibility API for React; render generation still consumes the
    same core scene_ref contract.
    """
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    project_dir = resolved.project_dir
    store, beat = await _episode_beat_from_resolution(resolved, episode_num, beat_num)
    try:
        try:
            image = await _read_uploaded_rgb_image(file)
        except Exception as exc:
            return {"ok": False, "error": f"上传外部参考图失败: {exc}"}

        try:
            payload = await beat_background_anchor_use_cases().upload_anchor(
                asset_writer=(
                    store
                    if callable(getattr(store, "update_beat_asset", None))
                    else None
                ),
                project_dir=project_dir,
                beat=beat,
                episode_num=int(episode_num),
                beat_num=int(beat_num),
                command=UploadBeatBackgroundCommand(image=image),
                asset_url=make_project_asset_url_builder(
                    resolved.ctx,
                    project_dir,
                    make_static_url_for_context,
                ),
            )
        except BackgroundAnchorRejected as exc:
            return {"ok": False, "error": str(exc)}

        return {"ok": True, "data": payload}
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


@router.get(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/director-control-frame"
)
async def get_director_control_frame_status(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Return the NiceGUI director control frame status for one beat."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": beat_viewer_use_cases().director_control_frame_status(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
        ),
    }


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/director-control-to-sketch"
)
async def director_control_to_sketch(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Start the existing Direct Render combined.png -> canonical sketch task."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        scheduled = await director_control_sketch_use_cases().generate(
            resolved.ctx,
            GenerateDirectorControlSketchCommand(
                episode_num=episode_num,
                beat_num=beat_num,
            ),
        )
    except DirectorControlSketchUnavailable as exc:
        return {
            "ok": False,
            "error": str(exc),
            "data": exc.status.data,
        }
    return {"ok": True, **scheduled.as_dict()}


@router.get(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/sketch/pose-editor"
)
async def get_sketch_pose_editor(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Return NiceGUI-compatible pose editor payload for a canonical sketch."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    try:
        editor = await sketch_editing_use_cases().load_editor(
            resolved.ctx,
            SketchEditorQuery(
                episode_num=episode_num,
                beat_num=beat_num,
            ),
        )
    except (CurrentSketchMissing, SketchBeatMissing) as exc:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": str(exc)},
        )
    except SketchPoseCandidatesMissing:
        return {"ok": False, "error": "本集没有分配颜色的身份，请先重新配色"}
    return {"ok": True, "data": editor.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/sketch/pose-editor"
)
async def save_sketch_pose_editor(
    project: str,
    episode_num: int,
    beat_num: int,
    body: dict[str, Any],
    user: dict = Depends(get_api_user),
):
    """Persist pose editor strokes/skeletons back to the canonical sketch."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        edited = sketch_editing_use_cases().save_editor(
            resolved.ctx,
            SaveSketchEditorCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                editor_state=body,
            ),
        )
    except CurrentSketchMissing as exc:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": str(exc)},
        )
    except SketchEditorSaveRejected as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    return {"ok": True, "data": edited.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/sketch/crop")
async def crop_current_sketch(
    project: str,
    episode_num: int,
    beat_num: int,
    body: dict[str, Any],
    user: dict = Depends(get_api_user),
):
    """Crop and overwrite the canonical sketch, matching NiceGUI current-image crop."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        cropped = sketch_editing_use_cases().crop(
            resolved.ctx,
            CropCurrentSketchCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                x=body.get("x", 0),
                y=body.get("y", 0),
                width=body.get("width", 0),
                height=body.get("height", 0),
            ),
        )
    except CurrentSketchMissing as exc:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": str(exc)},
        )
    except SketchCropRejected as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )

    return {"ok": True, "data": cropped.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/sketches/generate-missing-manual"
)
async def generate_missing_manual_sketches(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Dispatch Sketch regeneration for missing manual-shot sketches."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        scheduled = await manual_sketch_regeneration_use_cases().generate(
            resolved.ctx,
            GenerateMissingManualSketchesCommand(episode_num=episode_num),
        )
    except ManualSketchRegenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return scheduled.as_dict()


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/video")
async def generate_single_video(
    project: str,
    episode_num: int,
    beat_num: int,
    body: SingleVideoRequest,
    user: dict = Depends(get_api_user),
):
    """单 Beat 视频再生。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
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


# ── 视频池查看 & 选择 ─────────────────────────────────────────────────────────


@router.get("/projects/{project}/episodes/{episode_num}/video-pool")
async def list_video_pool(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    pool = video_pool_use_cases().list_pool(resolved.ctx, episode_num)
    return {"ok": True, "data": pool.as_dict() if pool is not None else None}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/video-pool-select"
)
async def select_video_pool(
    project: str,
    episode_num: int,
    beat_num: int,
    body: VideoPoolSelectRequest,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        selected = video_pool_use_cases().select(
            resolved.ctx,
            episode_num,
            beat_num,
            body.pool_id,
        )
    except VideoPoolEntryUnavailable as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": selected.as_dict()}


# ── 图片池查看 & 选择 ─────────────────────────────────────────────────────────


@router.get("/projects/{project}/episodes/{episode_num}/grids")
async def list_grids(
    project: str, episode_num: int, user: dict = Depends(get_api_user)
):
    """查看网格预览和图片池。"""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    listing = await grid_pool_use_cases().list_pool(resolved.ctx, episode_num)
    return {
        "ok": True,
        "data": listing.as_dict() if listing is not None else None,
    }


@router.post("/projects/{project}/episodes/{episode_num}/grids/rebuild-pool")
async def rebuild_grids_pool_index(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Rebuild the episode image pool index using the same helper as NiceGUI."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    return {
        "ok": True,
        "data": grid_pool_use_cases().rebuild(
            resolved.ctx,
            episode_num,
        ).as_dict(),
    }


@router.get(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/sketch-candidates"
)
async def get_beat_sketch_candidates(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Return sketch pool candidates for a beat without treating them as the current sketch."""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    candidates = await grid_pool_use_cases().sketch_candidates(
        resolved.ctx,
        episode_num,
        beat_num,
    )
    return {"ok": True, "data": candidates.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/pool-select")
async def select_pool_image(
    project: str,
    episode_num: int,
    beat_num: int,
    body: PoolSelectRequest,
    user: dict = Depends(get_api_user),
):
    """选择 pool 图片，按类型设为 beat 首帧或草图。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        selected = await grid_pool_use_cases().select(
            resolved.ctx,
            SelectGridPoolImageCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                pool_id=body.pool_id,
                force=body.force,
            ),
        )
    except GridPoolImageStale as exc:
        return {"ok": False, "stale": True, "error": str(exc)}
    except GridPoolSelectionRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": selected.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/sketch/upload"
)
async def upload_beat_sketch(
    project: str,
    episode_num: int,
    beat_num: int,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """Upload a beat sketch, store the canonical sketch file, and add it to the pool."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    content = await file.read()
    try:
        uploaded = grid_pool_use_cases().upload(
            resolved.ctx,
            UploadBeatPoolImageCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                content=content,
                image_type="sketch",
            ),
        )
    except GridPoolUploadRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": uploaded.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/render/upload"
)
async def upload_beat_render(
    project: str,
    episode_num: int,
    beat_num: int,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """Upload a beat render first frame, promote it, and add it to the pool."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    content = await file.read()
    try:
        uploaded = grid_pool_use_cases().upload(
            resolved.ctx,
            UploadBeatPoolImageCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                content=content,
                image_type="render",
            ),
        )
    except GridPoolUploadRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": uploaded.as_dict()}


# ── 单 Beat 音频重生 ─────────────────────────────────────────────────────────


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/audio")
async def regenerate_beat_audio(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """重新生成单个 beat 的 IndexTTS2 语音。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        scheduled = await episode_audio_use_cases().regenerate_beat(
            resolved.ctx,
            episode_num,
            beat_num,
        )
    except EpisodeAudioBeatMissing as exc:
        return {"ok": False, "error": str(exc)}
    except AudioVoicePrerequisitesMissing as exc:
        return {"ok": False, "code": exc.code, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


# ── SRT 字幕导出 ─────────────────────────────────────────────────────────────


@router.get("/projects/{project}/episodes/{episode_num}/export/srt")
async def export_srt(
    project: str, episode_num: int, user: dict = Depends(get_api_user)
):
    """导出 SRT 字幕文件。"""
    from fastapi.responses import PlainTextResponse

    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    try:
        exported = await episode_export_use_cases().subtitle(
            resolved.ctx,
            episode_num,
        )
    except (EpisodeScriptBeatsMissing, EpisodeSubtitlesMissing) as exc:
        return {"ok": False, "error": str(exc)}

    return PlainTextResponse(
        content=exported.content,
        media_type=exported.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{exported.filename}"',
        },
    )


@router.get("/projects/{project}/episodes/{episode_num}/export/video")
async def export_final_video(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Download the composed final episode video."""
    from fastapi.responses import FileResponse

    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    try:
        exported = episode_export_use_cases().final_video(
            resolved.ctx,
            episode_num,
        )
    except FinalEpisodeVideoMissing as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(
        path=str(exported.path),
        filename=exported.filename,
        media_type=exported.media_type,
    )


# ── 网格上传 / Prompt 导出 / 切割 ─────────────────────────────────────────────


@router.post("/projects/{project}/episodes/{episode_num}/grids/{grid_index}/upload")
async def upload_grid(
    project: str,
    episode_num: int,
    grid_index: int,
    file: UploadFile = File(...),
    grid_type: str = Form("render"),
    mode_key: str = Form(""),
    beat_numbers: str = Form(""),
    user: dict = Depends(get_api_user),
):
    """上传单张网格整图并更新 pool index 中同 scope 的 grid_path。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    content = await file.read()
    try:
        uploaded = grid_pool_use_cases().upload_grid(
            resolved.ctx,
            UploadGridImageCommand(
                episode_num=episode_num,
                grid_index=grid_index,
                filename=file.filename,
                content=content,
                grid_type=grid_type,
                mode_key=mode_key,
                beat_numbers=beat_numbers,
            ),
        )
    except GridPoolUploadRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": uploaded.as_dict()}


@router.get("/projects/{project}/episodes/{episode_num}/grids/{grid_index}/prompt")
async def export_grid_prompt(
    project: str,
    episode_num: int,
    grid_index: int,
    grid_type: str = Query("render"),
    mode_key: str = Query(""),
    beat_numbers: str = Query(""),
    user: dict = Depends(get_api_user),
):
    """读取 pool index 中记录的单张网格 prompt 文本。"""
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    try:
        prompt = grid_pool_use_cases().prompt(
            resolved.ctx,
            GridPromptQuery(
                episode_num=episode_num,
                grid_index=grid_index,
                grid_type=grid_type,
                mode_key=mode_key,
                beat_numbers=beat_numbers,
            ),
        )
    except GridPoolPromptRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": prompt.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/grids/{grid_index}/sketch-preview"
)
async def sketch_grid_preview(
    project: str,
    episode_num: int,
    grid_index: int,
    body: GridSketchPreviewRequest,
    user: dict = Depends(get_api_user),
):
    """Return the same sketch-thumbnail preview NiceGUI shows for planned grids.

    This API exposes NiceGUI's `_get_sketch_thumbnail_url` behavior to React:
    it stitches existing beat sketches into a temporary preview image without
    changing the generation pipeline.
    """
    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    try:
        preview = grid_pool_use_cases().preview(
            resolved.ctx,
            GridSketchPreviewCommand(
                episode_num=episode_num,
                grid_index=grid_index,
                rows=body.rows,
                cols=body.cols,
                beat_numbers=tuple(body.beat_numbers),
            ),
        )
    except GridPoolPreviewRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": preview.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/grids/{grid_index}/cut")
async def cut_grid(
    project: str,
    episode_num: int,
    grid_index: int,
    body: GridCutRequest,
    user: dict = Depends(get_api_user),
):
    """将网格切割为单个 beat 图片入池。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        result = grid_pool_use_cases().cut(
            resolved.ctx,
            CutGridCommand(
                episode_num=episode_num,
                grid_index=grid_index,
                grid_type=body.grid_type,
                mode_key=body.mode_key,
                rows=body.rows,
                cols=body.cols,
                beat_start=body.beat_start,
                beat_end=body.beat_end,
                beat_numbers=(
                    tuple(body.beat_numbers)
                    if body.beat_numbers is not None
                    else None
                ),
            ),
        )
    except GridPoolCutRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": result.as_dict()}


# ── ZIP 导出 ─────────────────────────────────────────────────────────────────


@router.post("/projects/{project}/episodes/{episode_num}/export/zip")
async def export_zip(
    project: str, episode_num: int, user: dict = Depends(get_api_user)
):
    """打包指定集的所有资源为 ZIP 文件下载。"""
    from fastapi.responses import FileResponse

    resolved = await _resolve_generation_project(project, user, required_role="viewer")
    exported = await episode_export_use_cases().archive(
        resolved.ctx,
        episode_num,
    )
    return FileResponse(
        path=str(exported.path),
        filename=exported.filename,
        media_type=exported.media_type,
    )


# ---------------------------------------------------------------------------
# 草图配色 + AI 颜色检测
# ---------------------------------------------------------------------------


@router.post("/projects/{project}/episodes/{episode_num}/sketches/assign-colors")
async def assign_sketch_colors(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """为本集出场身份和全局道具分配共享颜色。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        result = await sketch_marker_use_cases().assign_colors(
            resolved.ctx,
            AssignProjectSketchColorsCommand(episode_num=episode_num),
        )
    except SketchEpisodeBeatsMissing as exc:
        return {"ok": False, "error": str(exc)}
    except SketchColorMarkersMissing:
        return {
            "ok": False,
            "error": "No identity or global prop markers found in beats",
        }

    return {"ok": True, "data": result.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/sketches/detect-identities")
async def detect_sketch_identities(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """AI 视觉识别草图中出现的身份/道具颜色标记。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    try:
        result = await sketch_marker_use_cases().detect(
            resolved.ctx,
            DetectProjectSketchMarkersCommand(episode_num=episode_num),
        )
    except SketchMarkerDetectionRejected as exc:
        return {"ok": False, "error": str(exc)}
    except SketchMarkerDetectionFailed as exc:
        return {"ok": False, "error": f"AI detection failed: {exc}"}

    return {"ok": True, "data": result.as_dict()}
