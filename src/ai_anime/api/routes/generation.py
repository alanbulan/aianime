"""画面/网格/视频生成端点。"""

import json
import io
import logging
import os
import re
from pathlib import Path
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
    PlanEntryOut,
    OperatorPasswordVerifyRequest,
    RenderPlanExecuteRequest,
    RenderPlanExecuteResponse,
    RenderPlanRequest,
    RenderPlanResponse,
    RenderSettingsUpdate,
    SketchRegenQueueUpdate,
    SketchSettingsUpdate,
    BeatBackgroundAnchorUpdate,
    Seedance2AssetAudioTrimRequest,
    Seedance2AssetCropRequest,
    Seedance2AssetDeleteRequest,
)
from ai_anime.generators.nanobanana_grid import (
    build_regen_plan,
    compute_input_fingerprint,
    hash_plan,
)
from ai_anime.generators.render_identity_guard import render_ai_detection_error
from ai_anime.modules.narrative_planning.public import (
    choose_manual_sketch_mode_key,
    missing_manual_shot_segments,
    pick_beats_by_number,
    storyboard_beats_for_manual_sketches,
)
from ai_anime.modules.asset_world.public import (
    BackgroundAnchorRejected,
    CropBeatBackgroundCommand,
    ExportBeatDirectorControlFrameCommand,
    SaveBeatDirectorOverlayCommand,
    SceneCatalogRejected,
    SceneViewerRejected,
    SelectBeatBackgroundCommand,
    UploadBeatBackgroundCommand,
    beat_background_anchor_use_cases,
    beat_director_stage_use_cases,
    resolve_beat_scene_name,
    runtime_prop_menu_for_episode as _runtime_prop_menu_with_global_props,
    scene_viewer_use_cases,
)
from ai_anime.modules.production.public import (
    AudioVoicePrerequisitesMissing,
    ComposeEpisodeVideoCommand,
    CropSeedance2AssetCommand,
    CropSketchCommand,
    DetectSketchMarkersCommand,
    EpisodeBeatsMissing,
    EpisodeAudioBeatMissing,
    EpisodeAudioBeatsMissing,
    EpisodeScriptBeatsMissing,
    EpisodeSubtitlesMissing,
    FinalEpisodeVideoMissing,
    GenerateEpisodeAudioCommand,
    GenerateSketchesCommand,
    GenerateSingleVideoCommand,
    GlobalVideoOptimizationBeatsMissing,
    GlobalVideoOptimizationSketchesMissing,
    ImageGenerationGuardQuery,
    ProductionImageSettingsRejected,
    OptimizeEpisodeVideoCommand,
    ReplaceSketchRegenQueueCommand,
    RemoveSeedance2AssetCommand,
    SketchCropRejected,
    SketchColorMarkersMissing,
    SketchMarkerDetectionFailed,
    SketchMarkerDetectionRejected,
    SketchPoseCandidatesMissing,
    Seedance2PanelBeatMissing,
    Seedance2PanelOperationRejected,
    Seedance2PanelQuery,
    SketchGenerationRejected,
    SingleVideoRejected,
    TrimSeedance2AudioAssetCommand,
    UpdateRenderImageSettingsCommand,
    UpdateSketchImageSettingsCommand,
    UploadSeedance2AssetCommand,
    VideoPoolEntryUnavailable,
    global_video_optimization_use_cases,
    seedance2_panel_use_cases,
    sketch_generation_use_cases,
    single_video_use_cases,
    episode_audio_use_cases,
    episode_export_use_cases,
    episode_video_use_cases,
    production_generation_context_use_cases,
    production_image_settings_use_cases,
    image_generation_usage_use_cases,
    sketch_color_assignment_use_cases,
    sketch_image_use_cases,
    sketch_marker_detection_use_cases,
    sketch_pose_editor_use_cases,
    sketch_regen_queue_use_cases,
    video_backend_catalog_use_cases,
    video_pool_use_cases,
)
from ai_anime.render_plan.ref_image_hash import RefImageHasher
from ai_anime.project_config import load_project_config
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.ports import get_task_backend, get_usage_meter
from ai_anime.task_identity import project_task_state_key
from ai_anime.shared.project_media import make_project_asset_url_builder

router = APIRouter()

logger = logging.getLogger(__name__)

async def _resolve_generation_project(
    project: str, user: dict, required_role: str = "editor"
):
    return await resolve_project_scope(project, user, required_role=required_role)


def _requester_user_id_for_billing(resolved: Any, user: dict) -> str:
    ctx = getattr(resolved, "ctx", None)
    return str(
        getattr(ctx, "requester_user_id", "")
        or user.get("id")
        or user.get("user_id")
        or user.get("username")
        or ""
    )


def normalize_beat_indices(beat_indices: list[int]) -> list[int]:
    normalized: list[int] = []
    seen: set[int] = set()
    for beat_index in beat_indices:
        value = int(beat_index)
        if value in seen:
            continue
        normalized.append(value)
        seen.add(value)
    return normalized


def validate_beat_indices(all_beats: list[dict], beat_indices: list[int]) -> list[int]:
    valid_beat_numbers = {int(beat.get("beat_number", 0) or 0) for beat in all_beats}
    return [
        int(beat_index)
        for beat_index in beat_indices
        if int(beat_index) not in valid_beat_numbers
    ]


def _render_plan_feature_disabled() -> bool:
    return os.getenv("DISABLE_RENDER_PLAN_V2") in {"1", "true", "True", "yes"}


def _plan_entry_to_dict(entry: Any) -> dict:
    if isinstance(entry, dict):
        beat_numbers = entry.get("beat_numbers") or []
        reasons = entry.get("reasons") or []
        warnings = entry.get("warnings") or []
        return PlanEntryOut(
            mode_key=entry.get("mode_key", ""),
            rows=int(entry.get("rows", 0) or 0),
            cols=int(entry.get("cols", 0) or 0),
            beat_numbers=[int(beat) for beat in beat_numbers],
            location=str(entry.get("location") or ""),
            padding_count=int(entry.get("padding_count") or 0),
            reasons=[str(reason) for reason in reasons],
            warnings=[str(warning) for warning in warnings],
        ).model_dump()

    return PlanEntryOut(
        mode_key=entry.mode_key,
        rows=entry.rows,
        cols=entry.cols,
        beat_numbers=list(entry.beat_numbers),
        location=entry.location,
        padding_count=entry.padding_count,
        reasons=list(entry.reasons),
        warnings=list(entry.warnings),
    ).model_dump()


def _plan_to_dicts(plan) -> list[dict]:
    return [_plan_entry_to_dict(entry) for entry in plan]


def _parse_grid_beat_numbers(raw: str | None) -> list[int]:
    if not raw:
        return []
    text = raw.strip()
    if not text:
        return []
    if text.startswith("["):
        parsed = json.loads(text)
        values = parsed if isinstance(parsed, list) else []
    else:
        values = re.split(r"[,;\s]+", text)
    beat_numbers: list[int] = []
    seen: set[int] = set()
    for value in values:
        if value in ("", None):
            continue
        beat_num = int(value)
        if beat_num <= 0 or beat_num in seen:
            continue
        beat_numbers.append(beat_num)
        seen.add(beat_num)
    return beat_numbers


def _safe_grid_token(value: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.:-]+", "_", value.strip())
    return token.strip("._-") or "grid"


def _uploaded_grid_filename(
    grid_type: str, mode_key: str, beat_numbers: list[int], ext: str
) -> str:
    beats_slug = "-".join(str(beat) for beat in beat_numbers) or "manual"
    return (
        f"{_safe_grid_token(grid_type)}_{_safe_grid_token(mode_key)}_"
        f"{beats_slug}_grid_upload.{ext.lstrip('.')}"
    )


def _safe_grids_file(grids_dir: Path, relative_path: str) -> Path | None:
    if not relative_path:
        return None
    try:
        candidate = (grids_dir / relative_path).resolve()
        root = grids_dir.resolve()
    except Exception:
        return None
    if root == candidate or root not in candidate.parents:
        return None
    return candidate


def _find_pool_grid_entry(
    pool: Any,
    *,
    grid_type: str,
    mode_key: str | None,
    beat_numbers: list[int],
    grid_index: int,
) -> Any | None:
    if pool is None:
        return None
    if mode_key and beat_numbers:
        entry = pool.find_grid(grid_type, mode_key, beat_numbers)
        if entry is not None:
            return entry

    image_grid_paths = {
        img.grid_path
        for img in getattr(pool, "images", [])
        if img.type == grid_type
        and img.grid_index == grid_index
        and (not beat_numbers or img.original_beat in beat_numbers)
        and img.grid_path
    }
    for entry in getattr(pool, "grids", []):
        if entry.type != grid_type:
            continue
        if mode_key and entry.mode_key != mode_key:
            continue
        if beat_numbers and set(entry.beat_nums) != set(beat_numbers):
            continue
        if not image_grid_paths or entry.grid_path in image_grid_paths:
            return entry
    return None


def _custom_render_plan_error(plan: list[Any], beat_indices: list[int]) -> str | None:
    flat: list[int] = []
    seen: set[int] = set()
    for entry in plan:
        beat_numbers = [int(beat) for beat in getattr(entry, "beat_numbers", [])]
        if not beat_numbers:
            return "empty_grid"
        if int(getattr(entry, "rows", 0)) * int(getattr(entry, "cols", 0)) < len(
            beat_numbers
        ):
            return "grid_capacity"
        for beat in beat_numbers:
            if beat in seen:
                return "duplicate_beat"
            seen.add(beat)
            flat.append(beat)
    if set(flat) != set(beat_indices) or len(flat) != len(beat_indices):
        return "beat_mismatch"
    return None


async def _read_uploaded_rgb_image(file: UploadFile):
    content = await file.read()
    if not content:
        raise ValueError("empty file")
    try:
        from PIL import Image

        return Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as exc:
        raise ValueError(f"invalid image file: {exc}") from exc


def _register_uploaded_pool_image(
    *,
    project_dir: Path,
    episode_num: int,
    beat_num: int,
    image,
    image_type: str,
) -> str:
    from datetime import datetime
    from ai_anime.generators.pool_indexer import (
        add_cell_with_dedup,
        build_pool_index,
        load_pool_index,
        save_pool_index,
    )

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    pool = load_pool_index(grids_dir) or build_pool_index(grids_dir, episode_num)
    upload_dir = grids_dir / image_type
    upload_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    cell_path = upload_dir / f"beat_{beat_num:02d}_t{timestamp}.png"
    image.save(cell_path, format="PNG")

    pool_image = add_cell_with_dedup(
        pool,
        cell_path,
        grids_dir,
        beat_num,
        timestamp,
        img_type=image_type,
        mode="upload",
        grid_index=0,
        cell_index=0,
        grid_path="",
        row=0,
        col=0,
    )
    if pool_image is None:
        pool_id = f"beat_{beat_num:02d}_t{timestamp}_{image_type}"
        assignment_path = None
    else:
        pool_id = pool_image.id
        assignment_path = pool_image.cell_path
    if image_type != "sketch" and assignment_path:
        pool.beat_assignments[str(beat_num)] = assignment_path
    save_pool_index(pool, grids_dir)
    return pool_id


def _prop_marker_colors_from_menu(prop_menu: list[dict] | None) -> dict[str, str]:
    colors: dict[str, str] = {}
    for item in prop_menu or []:
        if not isinstance(item, dict):
            continue
        prop_id = str(item.get("prop_id") or "").strip()
        marker_color = str(item.get("marker_color") or "").strip()
        if prop_id and marker_color:
            colors[prop_id] = marker_color
    return colors


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
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    output_dir = resolved.output_dir

    proj_config = load_project_config(username, project_name)
    style = body.style or proj_config.get("visual_style", "chinese_period_drama")
    render_image_selection = production_image_settings_use_cases().resolve_render_selection(
        proj_config,
        body.image_generation_selection,
    )

    store = (
        await make_sqlite_store_for_context(ctx)
        if ctx
        else await make_sqlite_store(username, project_name)
    )
    beats = await store.get_beats_as_dicts(episode_num)

    if not beats:
        return {"ok": False, "error": f"No beats found for episode {episode_num}"}

    # 验证 grid_index 范围
    character_map = await production_generation_context_use_cases(
        store,
        username,
    ).build_character_map(
        beats=beats,
        project=project_name,
        episode_num=episode_num,
        use_detected_identities=True,
    )

    if body.character_grouping:
        from ai_anime.generators.nanobanana_grid import character_grid_split

        char_plan = character_grid_split(beats, character_map)
        max_grids = len(char_plan)
        if grid_index < 0 or grid_index >= max_grids:
            grid_labels = " + ".join(
                f"{e['rows']}x{e['cols']}(comp={e.get('composite_count', '?')})"
                for e in char_plan
            )
            return {
                "ok": False,
                "error": (
                    f"grid_index={grid_index} 超出范围。"
                    f"角色分组方案: {grid_labels}，"
                    f"有效 grid_index: 0~{max_grids - 1}"
                ),
            }
        selected_beat_numbers = [
            int(beat) for beat in char_plan[grid_index].get("beat_numbers", [])
        ]
    elif body.scene_grouping:
        from ai_anime.generators.nanobanana_grid import scene_grid_split

        loc_plan = scene_grid_split(beats, character_map=character_map)
        max_grids = len(loc_plan)
        if grid_index < 0 or grid_index >= max_grids:
            grid_labels = " + ".join(
                f"{e['rows']}x{e['cols']}({e['scene_id']})" for e in loc_plan
            )
            return {
                "ok": False,
                "error": (
                    f"grid_index={grid_index} 超出范围。"
                    f"场景分组方案: {grid_labels}，"
                    f"有效 grid_index: 0~{max_grids - 1}"
                ),
            }
        selected_beat_numbers = [
            int(beat) for beat in loc_plan[grid_index].get("beat_numbers", [])
        ]
    else:
        from ai_anime.generators.nanobanana_grid import (
            perfect_grid_split,
            REGEN_MODE_CONFIGS as _RMC,
        )

        grid_plan = perfect_grid_split(len(beats))
        if grid_index < 0 or grid_index >= len(grid_plan):
            grid_labels = " + ".join(
                f"{_RMC[mk]['rows']}x{_RMC[mk]['cols']}" for mk in grid_plan
            )
            return {
                "ok": False,
                "error": (
                    f"grid_index={grid_index} 超出范围。"
                    f"共 {len(beats)} 个 beats，分割方案: {grid_labels}，"
                    f"有效 grid_index: 0~{len(grid_plan) - 1}"
                ),
            }
        start_offset = sum(_RMC[mk]["capacity"] for mk in grid_plan[:grid_index])
        capacity = _RMC[grid_plan[grid_index]]["capacity"]
        selected_beat_numbers = [
            int(beat.get("beat_number", index + 1))
            for index, beat in enumerate(
                beats[start_offset : start_offset + capacity], start_offset
            )
        ]

    selected_beats = pick_beats_by_number(beats, selected_beat_numbers)
    detection_error = render_ai_detection_error(selected_beats)
    if detection_error:
        return {"ok": False, "error": detection_error}

    config = {
        "beats": beats,
        "character_map": character_map,
        "style": style,
        "model": body.model,
        "image_generation_selection": render_image_selection,
        "render_mode": "Render",
        "scene_grouping": body.scene_grouping,
        "character_grouping": body.character_grouping,
        "sketch_aspect_padding": production_image_settings_use_cases().resolve_sketch_aspect_padding(
            proj_config,
            body.sketch_aspect_padding,
        ),
    }

    scope = f"grid_{grid_index}"
    if ctx is not None:
        queued = await get_task_backend().enqueue_project_task(
            ctx,
            task_type="grid_regenerate",
            queue_kind="default",
            episode=episode_num,
            scope=scope,
            payload={
                "episode": episode_num,
                "grid_index": grid_index,
                "output_dir": output_dir,
                "config": config,
            },
        )
        return {
            "ok": True,
            "task_type": "grid_regenerate",
            "scope": scope,
            "task_id": queued.task_state.task_id,
            "task_key": project_task_state_key(
                "grid_regenerate", ctx.project_id, episode_num, scope=scope
            ),
            "backend": queued.backend,
            "queue": queued.queue,
            "message": f"第 {episode_num} 集网格 {grid_index} 重新生成已进入队列",
        }

    return {"ok": False, "error": "网格重新生成需要 project context"}


@router.post("/projects/{project}/episodes/{episode_num}/render/plan")
async def render_plan(
    project: str,
    episode_num: int,
    body: RenderPlanRequest,
    user: dict = Depends(get_api_user),
):
    """Return the server-authoritative render plan for selected beats."""
    if _render_plan_feature_disabled():
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "feature_disabled",
                "data": {"reason": "DISABLE_RENDER_PLAN_V2 is set"},
            },
        )

    resolved = await _resolve_generation_project(project, user, required_role="editor")
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    output_dir = resolved.output_dir
    store = (
        await make_sqlite_store_for_context(ctx)
        if ctx
        else await make_sqlite_store(username, project_name)
    )
    all_beats = await store.get_beats_as_dicts(episode_num)
    if not all_beats:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "no_beats",
                "data": {"episode": episode_num},
            },
        )

    beat_indices = normalize_beat_indices(body.beat_indices)
    invalid = validate_beat_indices(all_beats, beat_indices)
    if invalid:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "invalid_beats",
                "data": {"invalid": invalid},
            },
        )
    selected_beats = pick_beats_by_number(all_beats, beat_indices)

    detection_error = render_ai_detection_error(selected_beats)
    if detection_error:
        return JSONResponse(
            status_code=400, content={"ok": False, "error": detection_error}
        )

    character_map = await production_generation_context_use_cases(
        store,
        username,
    ).build_character_map(
        beats=selected_beats,
        project=project_name,
        episode_num=episode_num,
        use_detected_identities=True,
    )
    sketch_colors = store.get_sketch_colors(episode_num) or {}
    project_config = load_project_config(username, project_name)
    render_image_selection = production_image_settings_use_cases().resolve_render_selection(
        project_config,
        body.image_generation_selection,
    )
    plan = build_regen_plan(
        selected_beats=selected_beats,
        strategy=body.strategy,
        aspect_mode=body.aspect_mode,
        character_map=character_map,
        force_one_by_one=body.force_one_by_one,
        image_generation_selection=render_image_selection,
    )

    hasher = RefImageHasher(Path(output_dir) / ".render_plan_cache")
    try:
        fingerprint = compute_input_fingerprint(
            beats=selected_beats,
            character_map=character_map,
            sketch_colors=sketch_colors,
            strategy=body.strategy,
            aspect_mode=body.aspect_mode,
            force_one_by_one=body.force_one_by_one,
            ref_image_hasher=hasher.hash,
        )
    except FileNotFoundError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "invalid_beats",
                "data": {"reason": f"missing ref image: {exc}"},
            },
        )

    return {
        "ok": True,
        "data": RenderPlanResponse(
            plan=[PlanEntryOut(**entry) for entry in _plan_to_dicts(plan)],
            plan_hash=hash_plan(plan),
            input_fingerprint=fingerprint,
            strategy=body.strategy,
            total_beats=len(selected_beats),
            total_grids=len(plan),
        ).model_dump(),
    }


@router.post("/projects/{project}/episodes/{episode_num}/render/execute")
async def render_execute(
    project: str,
    episode_num: int,
    body: RenderPlanExecuteRequest,
    user: dict = Depends(get_api_user),
):
    """Validate and dispatch a render plan through the current selected-regen task path."""
    if _render_plan_feature_disabled():
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "feature_disabled",
                "data": {"reason": "DISABLE_RENDER_PLAN_V2 is set"},
            },
        )

    resolved = await _resolve_generation_project(project, user, required_role="editor")
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    output_dir = resolved.output_dir
    store = (
        await make_sqlite_store_for_context(ctx)
        if ctx
        else await make_sqlite_store(username, project_name)
    )
    all_beats = await store.get_beats_as_dicts(episode_num)
    if not all_beats:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "no_beats",
                "data": {"episode": episode_num},
            },
        )

    beat_indices = normalize_beat_indices(body.beat_indices)
    invalid = validate_beat_indices(all_beats, beat_indices)
    if invalid:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "invalid_beats",
                "data": {"invalid": invalid},
            },
        )
    selected_beats = pick_beats_by_number(all_beats, beat_indices)

    detection_error = render_ai_detection_error(selected_beats)
    if detection_error:
        return JSONResponse(
            status_code=400, content={"ok": False, "error": detection_error}
        )

    character_map = await production_generation_context_use_cases(
        store,
        username,
    ).build_character_map(
        beats=selected_beats,
        project=project_name,
        episode_num=episode_num,
        use_detected_identities=True,
    )
    sketch_colors = store.get_sketch_colors(episode_num) or {}
    project_config = load_project_config(username, project_name)
    render_image_selection = production_image_settings_use_cases().resolve_render_selection(
        project_config,
        body.image_generation_selection,
    )
    hasher = RefImageHasher(Path(output_dir) / ".render_plan_cache")
    try:
        new_fingerprint = compute_input_fingerprint(
            beats=selected_beats,
            character_map=character_map,
            sketch_colors=sketch_colors,
            strategy=body.strategy,
            aspect_mode=body.aspect_mode,
            force_one_by_one=body.force_one_by_one,
            ref_image_hasher=hasher.hash,
        )
    except FileNotFoundError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "invalid_beats",
                "data": {"reason": f"missing ref image: {exc}"},
            },
        )

    if new_fingerprint != body.input_fingerprint:
        new_plan = build_regen_plan(
            selected_beats=selected_beats,
            strategy=body.strategy,
            aspect_mode=body.aspect_mode,
            character_map=character_map,
            force_one_by_one=body.force_one_by_one,
            image_generation_selection=render_image_selection,
        )
        return JSONResponse(
            status_code=409,
            content={
                "ok": False,
                "error": "input_stale",
                "data": {
                    "new_plan": _plan_to_dicts(new_plan),
                    "new_plan_hash": hash_plan(new_plan),
                    "new_input_fingerprint": new_fingerprint,
                },
            },
        )

    if body.custom_plan:
        custom_error = _custom_render_plan_error(body.plan, beat_indices)
        if custom_error:
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": "invalid_custom_plan",
                    "data": {"reason": custom_error},
                },
            )
        execution_plan = body.plan
        execution_hash = hash_plan(execution_plan)
        dispatch_strategy = "custom"
    else:
        recomputed = build_regen_plan(
            selected_beats=selected_beats,
            strategy=body.strategy,
            aspect_mode=body.aspect_mode,
            character_map=character_map,
            force_one_by_one=body.force_one_by_one,
            image_generation_selection=render_image_selection,
        )
        recomputed_hash = hash_plan(recomputed)
        if recomputed_hash != body.plan_hash:
            return JSONResponse(
                status_code=409,
                content={
                    "ok": False,
                    "error": "plan_stale",
                    "data": {
                        "new_plan": _plan_to_dicts(recomputed),
                        "new_plan_hash": recomputed_hash,
                        "new_input_fingerprint": new_fingerprint,
                    },
                },
            )
        execution_plan = recomputed
        execution_hash = recomputed_hash
        dispatch_strategy = body.strategy

    from ai_anime.task_identity import selection_scope

    style = project_config.get("visual_style") or "chinese_period_drama"
    episode_obj = production_generation_context_use_cases(
        store,
        username,
    ).episode_or_none(episode_num)
    prop_menu = await _runtime_prop_menu_with_global_props(
        store, episode_obj, all_beats
    )
    base_config = {
        "beats": all_beats,
        "character_map": character_map,
        "style": style,
        "model": "nanobanana",
        "image_generation_selection": render_image_selection,
        "sketch_colors": sketch_colors,
        "prop_menu": prop_menu,
        "sketch_aspect_padding": production_image_settings_use_cases().resolve_sketch_aspect_padding(
            project_config,
            body.sketch_aspect_padding,
        ),
    }
    scope = f"{dispatch_strategy}__{execution_hash}"
    dispatched_task_ids: list[str] = []

    if ctx is not None:
        for entry in execution_plan:
            entry_beats = [int(beat) for beat in entry.beat_numbers]
            entry_scope = selection_scope(entry.mode_key, entry_beats)
            queued = await get_task_backend().enqueue_project_task(
                ctx,
                task_type="selected_regen",
                queue_kind="default",
                episode=episode_num,
                scope=entry_scope,
                payload={
                    "episode": episode_num,
                    "mode_key": entry.mode_key,
                    "output_dir": output_dir,
                    "config": {
                        **base_config,
                        "mode_key": entry.mode_key,
                        "selected_beat_numbers": entry_beats,
                    },
                },
            )
            dispatched_task_ids.append(queued.task_state.task_id)
    else:
        return {
            "ok": False,
            "error": "渲染计划执行需要 project context",
            "data": RenderPlanExecuteResponse(
                task_type="render_plan",
                message="渲染计划未启动",
                scope=scope,
                resolved_grids=[
                    PlanEntryOut(**entry) for entry in _plan_to_dicts(execution_plan)
                ],
            ).model_dump(),
        }

    return {
        "ok": True,
        "data": RenderPlanExecuteResponse(
            task_type="render_plan",
            message=f"渲染已启动 ({len(execution_plan)} 个网格)",
            scope=scope,
            resolved_grids=[
                PlanEntryOut(**entry) for entry in _plan_to_dicts(execution_plan)
            ],
        ).model_dump()
        | ({"task_ids": dispatched_task_ids} if dispatched_task_ids else {}),
    }


@router.post("/projects/{project}/episodes/{episode_num}/beats/regenerate")
async def regenerate_beats(
    project: str,
    episode_num: int,
    body: BeatsRegenerateRequest,
    user: dict = Depends(get_api_user),
):
    """选中 Beats 再生画面。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    output_dir = resolved.output_dir
    proj_config = load_project_config(username, project_name)
    style = body.style or proj_config.get("visual_style", "chinese_period_drama")
    render_image_selection = production_image_settings_use_cases().resolve_render_selection(
        proj_config,
        body.image_generation_selection,
    )

    store = (
        await make_sqlite_store_for_context(ctx)
        if ctx
        else await make_sqlite_store(username, project_name)
    )
    beats = await store.get_beats_as_dicts(episode_num)

    if not beats:
        return {"ok": False, "error": f"No beats found for episode {episode_num}"}

    # 验证 beat_indices
    if not body.beat_indices:
        return {"ok": False, "error": "beat_indices 不能为空"}
    total_beats = len(beats)
    invalid = [i for i in body.beat_indices if i < 1 or i > total_beats]
    if invalid:
        return {
            "ok": False,
            "error": f"beat_indices {invalid} 超出范围（共 {total_beats} 个 beats，有效: 1~{total_beats}）",
        }

    selected_beats = pick_beats_by_number(beats, body.beat_indices)
    detection_error = render_ai_detection_error(selected_beats)
    if detection_error:
        return {"ok": False, "error": detection_error}

    character_map = await production_generation_context_use_cases(
        store,
        username,
    ).build_character_map(
        beats=selected_beats,
        project=project_name,
        episode_num=episode_num,
        use_detected_identities=True,
    )

    mode_key = body.mode_key
    episode_obj = production_generation_context_use_cases(
        store,
        username,
    ).episode_or_none(episode_num)
    prop_menu = await _runtime_prop_menu_with_global_props(store, episode_obj, beats)
    config = {
        "beats": beats,
        "character_map": character_map,
        "style": style,
        "model": body.model,
        "image_generation_selection": render_image_selection,
        "selected_beat_numbers": body.beat_indices,
        "sketch_colors": store.get_sketch_colors(episode_num) or {},
        "prop_menu": prop_menu,
        "sketch_aspect_padding": production_image_settings_use_cases().resolve_sketch_aspect_padding(
            proj_config,
            body.sketch_aspect_padding,
        ),
    }

    from ai_anime.task_identity import selection_scope

    scope = selection_scope(mode_key, body.beat_indices)

    if ctx is not None:
        queued = await get_task_backend().enqueue_project_task(
            ctx,
            task_type="selected_regen",
            queue_kind="default",
            episode=episode_num,
            scope=scope,
            payload={
                "episode": episode_num,
                "mode_key": mode_key,
                "output_dir": output_dir,
                "config": {**config, "mode_key": mode_key},
            },
        )
        return {
            "ok": True,
            "task_type": "selected_regen",
            "scope": scope,
            "task_id": queued.task_state.task_id,
            "task_key": project_task_state_key(
                "selected_regen", ctx.project_id, episode_num, scope=scope
            ),
            "backend": queued.backend,
            "queue": queued.queue,
            "message": f"第 {episode_num} 集选中 Beats 画面再生已进入队列",
        }

    return {"ok": False, "error": "选中 Beats 画面再生需要 project context"}


@router.post("/projects/{project}/episodes/{episode_num}/sketches/regenerate")
async def regenerate_sketches(
    project: str,
    episode_num: int,
    body: SketchRegenerateRequest,
    user: dict = Depends(get_api_user),
):
    """选中 Beats 再生草图。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    output_dir = resolved.output_dir
    proj_config = load_project_config(username, project_name)
    style = body.style or proj_config.get("visual_style", "chinese_period_drama")

    store = (
        await make_sqlite_store_for_context(ctx)
        if ctx
        else await make_sqlite_store(username, project_name)
    )
    beats = await store.get_beats_as_dicts(episode_num)

    if not beats:
        return {"ok": False, "error": f"No beats found for episode {episode_num}"}

    # 验证 beat_indices
    if not body.beat_indices:
        return {"ok": False, "error": "beat_indices 不能为空"}
    total_beats = len(beats)
    invalid = [i for i in body.beat_indices if i < 1 or i > total_beats]
    if invalid:
        return {
            "ok": False,
            "error": f"beat_indices {invalid} 超出范围（共 {total_beats} 个 beats，有效: 1~{total_beats}）",
        }

    character_map = await production_generation_context_use_cases(
        store,
        username,
    ).build_character_map(
        beats=beats,
        project=project_name,
        episode_num=episode_num,
        use_detected_identities=False,
    )

    mode_key = body.mode_key
    episode_obj = production_generation_context_use_cases(
        store,
        username,
    ).episode_or_none(episode_num)
    prop_menu = await _runtime_prop_menu_with_global_props(store, episode_obj, beats)
    sketch_image_selection = production_image_settings_use_cases().resolve_sketch_selection(
        proj_config,
        body.image_generation_selection,
    )
    config = {
        "beats": beats,
        "character_map": character_map,
        "style": style,
        "model": body.model,
        "image_generation_selection": sketch_image_selection,
        "selected_beat_numbers": body.beat_indices,
        "sketch_colors": store.get_sketch_colors(episode_num) or {},
        "prop_menu": prop_menu,
    }

    from ai_anime.task_identity import selection_scope

    scope = selection_scope(mode_key, body.beat_indices)

    if ctx is not None:
        queued = await get_task_backend().enqueue_project_task(
            ctx,
            task_type="sketch_regen",
            queue_kind="default",
            episode=episode_num,
            scope=scope,
            payload={
                "episode": episode_num,
                "mode_key": mode_key,
                "output_dir": output_dir,
                "config": {**config, "mode_key": mode_key},
            },
        )
        return {
            "ok": True,
            "task_type": "sketch_regen",
            "scope": scope,
            "task_id": queued.task_state.task_id,
            "task_key": project_task_state_key(
                "sketch_regen", ctx.project_id, episode_num, scope=scope
            ),
            "backend": queued.backend,
            "queue": queued.queue,
            "message": f"第 {episode_num} 集选中 Beats 草图再生已进入队列",
        }

    return {"ok": False, "error": "选中 Beats 草图再生需要 project context"}


def _canonical_sketch_path(project_dir: Path, episode_num: int, beat_num: int) -> Path:
    return (
        project_dir / "sketches" / f"ep{episode_num:03d}" / f"beat_{beat_num:02d}.png"
    )


def _canonical_sketch_url(
    ctx: ProjectContext,
    project_dir: Path,
    episode_num: int,
    beat_num: int,
) -> str:
    rel = f"sketches/ep{episode_num:03d}/beat_{beat_num:02d}.png"
    return make_static_url_for_context(
        ctx,
        rel,
        local_path=project_dir / rel,
    )


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
    project_dir = resolved.project_dir
    store, beat = await _episode_beat_from_resolution(resolved, episode_num, beat_num)
    try:
        scene_name = resolve_beat_scene_name(beat)
        if not scene_name:
            return {"ok": False, "error": "当前 Beat 没有关联场景"}
        manifest = scene_viewer_use_cases().beat_pano_manifest(
            project_id=resolved.ctx.project_id,
            project_dir=project_dir,
            scene_name=scene_name,
            asset_url=make_project_asset_url_builder(
                resolved.ctx,
                project_dir,
                make_static_url_for_context,
            ),
            episode_num=int(episode_num),
            beat_num=int(beat_num),
            beat=beat,
        )
        return {"ok": True, "data": manifest}
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


@router.get("/projects/{project}/director-stage/palette")
async def get_default_director_stage_palette(
    project: str,
    user: dict = Depends(get_api_user),
):
    """Return the shared director-stage palette used by local/freezone worlds."""
    await _resolve_generation_project(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": scene_viewer_use_cases().default_director_stage_palette(),
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
    project_dir = resolved.project_dir
    store, beat = await _episode_beat_from_resolution(resolved, episode_num, beat_num)
    try:
        scene_name = resolve_beat_scene_name(beat)
        if not scene_name:
            return {"ok": False, "error": "当前 Beat 没有关联场景"}
        beats = await store.get_beats_as_dicts(int(episode_num))
        sketch_colors = {}
        get_sketch_colors = getattr(store, "get_sketch_colors", None)
        if get_sketch_colors is not None:
            sketch_colors = dict(get_sketch_colors(int(episode_num)) or {})
        episode_obj = production_generation_context_use_cases(
            store,
            resolved.username,
        ).episode_or_none(int(episode_num))
        prop_menu = await _runtime_prop_menu_with_global_props(
            store, episode_obj, list(beats)
        )
        manifest = scene_viewer_use_cases().beat_director_stage_manifest(
            project_id=resolved.ctx.project_id,
            project_dir=project_dir,
            scene_name=scene_name,
            asset_url=make_project_asset_url_builder(
                resolved.ctx,
                project_dir,
                make_static_url_for_context,
            ),
            episode_num=int(episode_num),
            beat_num=int(beat_num),
            beat=beat,
            sketch_colors=sketch_colors,
            prop_marker_colors=_prop_marker_colors_from_menu(prop_menu),
        )
        return {"ok": True, "data": manifest}
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


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
    project_dir = resolved.project_dir
    return {
        "ok": True,
        "data": beat_director_stage_use_cases().control_frame_status(
            project_dir=project_dir,
            episode_num=episode_num,
            beat_num=beat_num,
            asset_url=make_project_asset_url_builder(
                resolved.ctx,
                project_dir,
                make_static_url_for_context,
            ),
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
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    project_dir = resolved.project_dir
    state_dir = resolved.state_dir
    payload = beat_director_stage_use_cases().control_frame_status(
        project_dir=project_dir,
        episode_num=episode_num,
        beat_num=beat_num,
        asset_url=make_project_asset_url_builder(
            resolved.ctx,
            project_dir,
            make_static_url_for_context,
        ),
    )
    if not payload["ready"]:
        return {
            "ok": False,
            "error": f"Beat {int(beat_num)} 缺少 Direct Render combined.png，请先从 3GS / Freezone 导出",
            "data": payload,
        }

    if ctx is not None:
        queued = await get_task_backend().enqueue_project_task(
            ctx,
            task_type="sketch_generation",
            queue_kind="default",
            episode=int(episode_num),
            beat_num=int(beat_num),
            scope=payload["scope"],
            payload={
                "task_kind": "director_control_to_sketch",
                "episode": int(episode_num),
                "beat_num": int(beat_num),
                "output_dir": str(project_dir),
                "state_dir": state_dir,
            },
        )
        return {
            "ok": True,
            "task_type": "sketch_generation",
            "scope": payload["scope"],
            "task_id": queued.task_state.task_id,
            "task_key": project_task_state_key(
                "sketch_generation",
                ctx.project_id,
                int(episode_num),
                beat_num=int(beat_num),
                scope=payload["scope"],
            ),
            "backend": queued.backend,
            "queue": queued.queue,
            "message": f"Beat {int(beat_num)} Direct Render 转草图任务已进入队列",
            "data": payload,
        }

    try:
        start_fn = globals().get("start_control_frame_to_sketch_task")
        if start_fn is None:
            return {
                "ok": False,
                "error": "Direct Render 转草图需要 project context",
                "data": payload,
            }

        start_fn(
            username=username,
            project=project_name,
            episode=int(episode_num),
            beat_num=int(beat_num),
            output_dir=str(project_dir),
            state_dir=state_dir,
            scope=payload["scope"],
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc), "data": payload}

    return {
        "ok": True,
        "task_type": "sketch_generation",
        "scope": payload["scope"],
        "message": f"Beat {int(beat_num)} Direct Render 转草图任务已启动",
        "data": payload,
    }


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
    username = resolved.username
    project_name = resolved.project_name
    project_dir = resolved.project_dir
    sketch_path = _canonical_sketch_path(project_dir, episode_num, beat_num)
    if not sketch_path.exists():
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": f"Beat {beat_num} 缺少当前草图"},
        )

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(username, project_name)
    )
    beats = await store.get_beats_as_dicts(episode_num)
    beat = next(
        (b for b in beats if int(b.get("beat_number", 0) or 0) == beat_num), None
    )
    if beat is None:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": f"Beat {beat_num} 不存在"},
        )

    sketch_colors = store.get_sketch_colors(episode_num) or {}
    try:
        editor = sketch_pose_editor_use_cases().load_editor(
            sketch_path=sketch_path,
            beat=beat,
            sketch_colors=sketch_colors,
        )
    except SketchPoseCandidatesMissing:
        return {"ok": False, "error": "本集没有分配颜色的身份，请先重新配色"}

    return {
        "ok": True,
        "data": {
            "beat_num": beat_num,
            "sketch_url": _canonical_sketch_url(
                resolved.ctx, project_dir, episode_num, beat_num
            ),
            **editor,
        },
    }


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
    project_dir = resolved.project_dir
    sketch_path = _canonical_sketch_path(project_dir, episode_num, beat_num)
    if not sketch_path.exists():
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": f"Beat {beat_num} 缺少当前草图"},
        )

    try:
        sketch_pose_editor_use_cases().save_editor(
            sketch_path=sketch_path,
            editor_state=body,
        )
    except Exception as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": f"保存草图编辑失败: {exc}"},
        )

    return {
        "ok": True,
        "data": {
            "beat_num": beat_num,
            "sketch_url": _canonical_sketch_url(
                resolved.ctx, project_dir, episode_num, beat_num
            ),
        },
    }


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
    project_dir = resolved.project_dir
    sketch_path = _canonical_sketch_path(project_dir, episode_num, beat_num)
    if not sketch_path.exists():
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": f"Beat {beat_num} 缺少当前草图"},
        )

    try:
        cropped = sketch_image_use_cases().crop(
            sketch_path=sketch_path,
            command=CropSketchCommand(
                x=body.get("x", 0),
                y=body.get("y", 0),
                width=body.get("width", 0),
                height=body.get("height", 0),
            ),
        )
    except SketchCropRejected as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )

    return {
        "ok": True,
        "data": {
            "beat_num": beat_num,
            "sketch_url": _canonical_sketch_url(
                resolved.ctx, project_dir, episode_num, beat_num
            ),
            **cropped,
        },
    }


@router.post(
    "/projects/{project}/episodes/{episode_num}/sketches/generate-missing-manual"
)
async def generate_missing_manual_sketches(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Dispatch sketch regen only for manually inserted beats missing sketches.

    This scans `is_manual_shot=True` beats whose canonical sketch file does not
    exist, groups adjacent missing manual beats by scene, and dispatches one
    `sketch_regen` task per group. Normal beats are never regenerated here.
    """
    from ai_anime.task_identity import selection_scope

    resolved = await _resolve_generation_project(project, user, required_role="editor")
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    project_dir = resolved.project_dir
    output_dir = resolved.output_dir
    sketches_dir = project_dir / "sketches" / f"ep{episode_num:03d}"

    store = (
        await make_sqlite_store_for_context(ctx)
        if ctx
        else await make_sqlite_store(username, project_name)
    )
    beats = await store.get_beats_as_dicts(episode_num)
    if not beats:
        return {"ok": False, "error": f"第 {episode_num} 集没有 beats"}

    storyboard_beats = storyboard_beats_for_manual_sketches(beats)
    segments = missing_manual_shot_segments(storyboard_beats, sketches_dir)
    if not segments:
        return {
            "ok": True,
            "data": {"dispatched": 0, "scopes": [], "segments": []},
            "message": "没有缺草图的手工分镜",
        }

    proj_config = load_project_config(username, project_name)
    style = proj_config.get("visual_style", "chinese_period_drama")
    sketch_image_selection = (
        production_image_settings_use_cases().resolve_sketch_selection(
            proj_config
        )
    )
    character_map = await production_generation_context_use_cases(
        store,
        username,
    ).build_character_map(
        beats=beats,
        project=project_name,
        episode_num=episode_num,
        use_detected_identities=False,
    )
    sketch_colors = store.get_sketch_colors(episode_num) or {}

    dispatched_scopes: list[str] = []
    dispatched_segments: list[list[int]] = []
    for beat_numbers in segments:
        beat_indices = [int(n) for n in beat_numbers]
        mode_key = choose_manual_sketch_mode_key(len(beat_indices))
        config = {
            "beats": beats,
            "character_map": character_map,
            "style": style,
            "model": None,
            "image_generation_selection": sketch_image_selection,
            "selected_beat_numbers": beat_indices,
            "composite_key": f"{mode_key}:sketch",
            "sketch_colors": sketch_colors,
        }
        scope = selection_scope(mode_key, beat_indices)
        if ctx is not None:
            await get_task_backend().enqueue_project_task(
                ctx,
                task_type="sketch_regen",
                queue_kind="default",
                episode=episode_num,
                scope=scope,
                payload={
                    "episode": episode_num,
                    "mode_key": mode_key,
                    "output_dir": output_dir,
                    "config": {**config, "mode_key": mode_key},
                },
            )
            dispatched_scopes.append(scope)
            dispatched_segments.append(beat_indices)
            continue

        return {
            "ok": False,
            "error": f"分段 {beat_indices} 派发失败: 需要 project context",
            "data": {
                "dispatched": len(dispatched_scopes),
                "scopes": dispatched_scopes,
                "segments": dispatched_segments,
            },
        }

    return {
        "ok": True,
        "task_type": "sketch_regen",
        "data": {
            "dispatched": len(dispatched_segments),
            "scopes": dispatched_scopes,
            "segments": dispatched_segments,
        },
        "message": f"已启动 {len(dispatched_segments)} 组新增分镜草图生成",
    }


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
    username = resolved.username
    project_name = resolved.project_name
    project_dir = resolved.project_dir

    from ai_anime.generators.pool_indexer import (
        compute_beat_content_hash,
        is_pool_image_stale,
        load_pool_index,
    )

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    pool = load_pool_index(grids_dir)
    if not pool:
        return {"ok": True, "data": None}

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(username, project_name)
    )
    script_data = await store.get_script_as_dict(episode_num) or {}
    sketch_colors = script_data.get("sketch_colors", {}) or {}
    script_mt = None
    beat_hashes: dict[int, str] = {}
    for beat in script_data.get("beats", []):
        beat_num = beat.get("beat_number")
        if beat_num is not None:
            beat_hashes[beat_num] = compute_beat_content_hash(
                beat, sketch_colors=sketch_colors
            )

    images = []
    for img in pool.images:
        entry = img.model_dump()
        # datetime → ISO string
        if entry.get("generated_at"):
            entry["generated_at"] = entry["generated_at"].isoformat()
        # cell URL
        if img.cell_path:
            cell_path = grids_dir / img.cell_path
            entry["cell_url"] = make_static_url_for_context(
                resolved.ctx,
                f"grids/ep{episode_num:03d}/{img.cell_path}",
                local_path=cell_path,
            )
        else:
            entry["cell_url"] = ""
        # grid URL
        if img.grid_path:
            grid_path = grids_dir / img.grid_path
            entry["grid_url"] = make_static_url_for_context(
                resolved.ctx,
                f"grids/ep{episode_num:03d}/{img.grid_path}",
                local_path=grid_path,
            )
        else:
            entry["grid_url"] = ""
        entry["stale"] = is_pool_image_stale(img, beat_hashes, script_mt)
        images.append(entry)

    return {
        "ok": True,
        "data": {
            "episode": pool.episode,
            "modes": pool.modes,
            "images": images,
            "beat_assignments": pool.beat_assignments,
        },
    }


@router.post("/projects/{project}/episodes/{episode_num}/grids/rebuild-pool")
async def rebuild_grids_pool_index(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Rebuild the episode image pool index using the same helper as NiceGUI."""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    project_dir = resolved.project_dir

    from ai_anime.generators.pool_indexer import rebuild_pool_index

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    grids_dir.mkdir(parents=True, exist_ok=True)
    pool = rebuild_pool_index(
        episode_grids_dir=grids_dir,
        episode=episode_num,
        split_cells=True,
    )
    return {
        "ok": True,
        "data": {
            "episode": pool.episode,
            "image_count": len(pool.images),
            "mode_count": len(pool.modes),
        },
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
    username = resolved.username
    project_name = resolved.project_name
    project_dir = resolved.project_dir

    from ai_anime.generators.pool_indexer import (
        compute_beat_content_hash,
        is_pool_image_stale,
        load_pool_index,
    )

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    current_path = (
        project_dir / "sketches" / f"ep{episode_num:03d}" / f"beat_{beat_num:02d}.png"
    )
    current_sketch_url = ""
    if current_path.exists():
        current_sketch_url = make_static_url_for_context(
            resolved.ctx,
            f"sketches/ep{episode_num:03d}/beat_{beat_num:02d}.png",
            local_path=current_path,
        )

    pool = load_pool_index(grids_dir)
    if not pool:
        return {
            "ok": True,
            "data": {
                "episode": episode_num,
                "beat": beat_num,
                "current_sketch_url": current_sketch_url,
                "candidate_count": 0,
                "candidates": [],
            },
        }

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(username, project_name)
    )
    script_data = await store.get_script_as_dict(episode_num) or {}
    sketch_colors = script_data.get("sketch_colors", {}) or {}
    beat_hashes: dict[int, str] = {}
    for beat in script_data.get("beats", []) or []:
        raw_beat_num = beat.get("beat_number")
        try:
            parsed_beat_num = int(raw_beat_num)
        except (TypeError, ValueError):
            continue
        beat_hashes[parsed_beat_num] = compute_beat_content_hash(
            beat,
            sketch_colors=sketch_colors,
        )

    candidates = []
    for img in pool.images:
        if img.type != "sketch" or int(img.original_beat or 0) != int(beat_num):
            continue
        if not img.cell_path:
            continue
        cell_path = grids_dir / img.cell_path
        if not cell_path.exists():
            continue
        generated_at = img.generated_at.isoformat() if img.generated_at else ""
        candidates.append(
            {
                "id": img.id,
                "type": "sketch",
                "mode": img.mode,
                "cell_path": img.cell_path,
                "url": make_static_url_for_context(
                    resolved.ctx,
                    f"grids/ep{episode_num:03d}/{img.cell_path}",
                    local_path=cell_path,
                ),
                "grid_path": img.grid_path,
                "grid_index": img.grid_index,
                "cell_index": img.cell_index,
                "row": img.row,
                "col": img.col,
                "original_beat": img.original_beat,
                "generated_at": generated_at,
                "stale": is_pool_image_stale(img, beat_hashes, None),
            }
        )
    candidates.sort(
        key=lambda item: (
            str(item.get("generated_at") or ""),
            str(item.get("id") or ""),
        ),
        reverse=True,
    )

    return {
        "ok": True,
        "data": {
            "episode": episode_num,
            "beat": beat_num,
            "current_sketch_url": current_sketch_url,
            "candidate_count": len(candidates),
            "candidates": candidates,
        },
    }


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/pool-select")
async def select_pool_image(
    project: str,
    episode_num: int,
    beat_num: int,
    body: PoolSelectRequest,
    user: dict = Depends(get_api_user),
):
    """选择 pool 图片，按类型设为 beat 首帧或草图。"""
    import shutil

    resolved = await _resolve_generation_project(project, user, required_role="editor")
    username = resolved.username
    project_name = resolved.project_name
    project_dir = resolved.project_dir

    from ai_anime.generators.pool_indexer import (
        compute_beat_content_hash,
        is_pool_image_stale,
        load_pool_index,
        save_pool_index,
    )

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    pool = load_pool_index(grids_dir)
    if not pool:
        return {"ok": False, "error": "No pool index found. Generate grids first."}

    pool_img = pool.get_image(body.pool_id)
    if not pool_img:
        return {
            "ok": False,
            "error": f"Pool ID '{body.pool_id}' not found in pool index",
        }

    if pool_img and pool_img.type == "sketch":
        store = (
            await make_sqlite_store_for_context(resolved.ctx)
            if resolved.ctx
            else await make_sqlite_store(username, project_name)
        )
        script_data = await store.get_script_as_dict(episode_num) or {}
        sketch_colors = script_data.get("sketch_colors", {}) or {}
        beats = script_data.get("beats", [])
        script_mt = None
        beat_hashes: dict[int, str] = {}
        beat_index = pool_img.original_beat - 1
        if 0 <= beat_index < len(beats):
            beat_hashes[pool_img.original_beat] = compute_beat_content_hash(
                beats[beat_index], sketch_colors=sketch_colors
            )
        if is_pool_image_stale(pool_img, beat_hashes, script_mt) and not body.force:
            return {
                "ok": False,
                "stale": True,
                "error": "该草图已过期，请先重新生成。如确认仍要使用，请传 force=true。",
            }

    cell_path = pool_img.cell_path
    if not cell_path:
        return {
            "ok": False,
            "error": f"Pool ID '{body.pool_id}' not found in pool index",
        }

    # 完整路径
    cell_full = grids_dir / cell_path
    if not cell_full.exists():
        return {"ok": False, "error": f"Cell image not found at {cell_path}"}

    image_type = pool_img.type or "render"
    data = {
        "beat_num": beat_num,
        "pool_id": body.pool_id,
        "image_type": image_type,
    }

    if image_type == "sketch":
        sketches_dir = project_dir / "sketches" / f"ep{episode_num:03d}"
        sketches_dir.mkdir(parents=True, exist_ok=True)
        dest = sketches_dir / f"beat_{beat_num:02d}.png"
        shutil.copy2(str(cell_full), str(dest))
        rel = f"sketches/ep{episode_num:03d}/beat_{beat_num:02d}.png"
        data["sketch_url"] = make_static_url_for_context(
            resolved.ctx,
            rel,
            local_path=dest,
        )
    else:
        frames_dir = project_dir / "frames" / f"ep{episode_num:03d}"
        frames_dir.mkdir(parents=True, exist_ok=True)
        dest = frames_dir / f"beat_{beat_num:02d}.png"
        shutil.copy2(str(cell_full), str(dest))
        pool.beat_assignments[str(beat_num)] = cell_path
        rel = f"frames/ep{episode_num:03d}/beat_{beat_num:02d}.png"
        data["frame_url"] = make_static_url_for_context(
            resolved.ctx,
            rel,
            local_path=dest,
        )

    save_pool_index(pool, grids_dir)

    return {
        "ok": True,
        "data": data,
    }


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
    project_dir = resolved.project_dir
    try:
        image = await _read_uploaded_rgb_image(file)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    sketches_dir = project_dir / "sketches" / f"ep{episode_num:03d}"
    sketches_dir.mkdir(parents=True, exist_ok=True)
    sketch_path = sketches_dir / f"beat_{beat_num:02d}.png"
    image.save(sketch_path, format="PNG")

    pool_id = _register_uploaded_pool_image(
        project_dir=project_dir,
        episode_num=episode_num,
        beat_num=beat_num,
        image=image,
        image_type="sketch",
    )
    rel = f"sketches/ep{episode_num:03d}/beat_{beat_num:02d}.png"
    sketch_url = make_static_url_for_context(
        resolved.ctx,
        rel,
        local_path=sketch_path,
    )
    return {
        "ok": True,
        "data": {
            "beat_num": beat_num,
            "pool_id": pool_id,
            "sketch_url": sketch_url,
        },
    }


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
    project_dir = resolved.project_dir
    try:
        image = await _read_uploaded_rgb_image(file)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    frames_dir = project_dir / "frames" / f"ep{episode_num:03d}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    frame_path = frames_dir / f"beat_{beat_num:02d}.png"
    image.save(frame_path, format="PNG")

    pool_id = _register_uploaded_pool_image(
        project_dir=project_dir,
        episode_num=episode_num,
        beat_num=beat_num,
        image=image,
        image_type="render",
    )
    rel = f"frames/ep{episode_num:03d}/beat_{beat_num:02d}.png"
    frame_url = make_static_url_for_context(
        resolved.ctx,
        rel,
        local_path=frame_path,
    )
    return {
        "ok": True,
        "data": {
            "beat_num": beat_num,
            "pool_id": pool_id,
            "frame_url": frame_url,
        },
    }


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
    project_dir = resolved.project_dir

    grid_type = grid_type.strip() or "render"
    if grid_type not in {"render", "sketch"}:
        return {"ok": False, "error": "grid_type must be render or sketch"}
    try:
        parsed_beats = _parse_grid_beat_numbers(beat_numbers)
    except Exception as exc:
        return {"ok": False, "error": f"invalid beat_numbers: {exc}"}
    mode_key = mode_key.strip() or "upload"

    content = await file.read()
    if not content:
        return {"ok": False, "error": "uploaded file is empty"}

    suffix = Path(file.filename or "").suffix.lower().lstrip(".")
    if suffix not in {"png", "jpg", "jpeg", "webp"}:
        suffix = "png"
    if suffix == "jpeg":
        suffix = "jpg"

    from datetime import datetime
    from ai_anime.generators.pool_indexer import (
        build_pool_index,
        load_pool_index,
        register_grid_entry,
        save_pool_index,
    )

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    upload_dir = grids_dir / "custom"
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = _uploaded_grid_filename(grid_type, mode_key, parsed_beats, suffix)
    grid_path = upload_dir / filename
    grid_path.write_bytes(content)
    grid_rel = grid_path.relative_to(grids_dir).as_posix()

    pool = load_pool_index(grids_dir) or build_pool_index(grids_dir, episode_num)
    entry = pool.find_grid(grid_type, mode_key, parsed_beats) if parsed_beats else None
    if entry is None:
        entry = register_grid_entry(
            pool=pool,
            grid_type=grid_type,
            mode_key=mode_key,
            beat_nums=parsed_beats,
            preset="custom",
            grid_path=grid_rel,
            prompt_path="",
        )
    else:
        entry.grid_path = grid_rel
        entry.preset = "custom"
        entry.generated_at = datetime.now()

    for image in pool.images:
        if image.type != grid_type or image.grid_index != grid_index:
            continue
        if parsed_beats and image.original_beat not in parsed_beats:
            continue
        image.grid_path = grid_rel
        image.mode = mode_key

    save_pool_index(pool, grids_dir)

    return {
        "ok": True,
        "data": {
            "grid_index": grid_index,
            "grid_type": grid_type,
            "mode_key": mode_key,
            "beat_numbers": parsed_beats,
            "grid_path": grid_rel,
            "grid_url": make_static_url_for_context(
                resolved.ctx,
                f"grids/ep{episode_num:03d}/{grid_rel}",
                local_path=grid_path,
            ),
        },
    }


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
    project_dir = resolved.project_dir
    grid_type = grid_type.strip() or "render"
    if grid_type not in {"render", "sketch"}:
        return {"ok": False, "error": "grid_type must be render or sketch"}
    try:
        parsed_beats = _parse_grid_beat_numbers(beat_numbers)
    except Exception as exc:
        return {"ok": False, "error": f"invalid beat_numbers: {exc}"}
    mode_key = mode_key.strip()

    from ai_anime.generators.pool_indexer import load_pool_index

    grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    pool = load_pool_index(grids_dir)
    if not pool:
        return {"ok": False, "error": "No pool index found. Generate grids first."}

    entry = _find_pool_grid_entry(
        pool,
        grid_type=grid_type,
        mode_key=mode_key or None,
        beat_numbers=parsed_beats,
        grid_index=grid_index,
    )
    if entry is None:
        return {"ok": False, "error": "Grid prompt metadata not found"}

    prompt_candidates: list[str] = []
    if entry.prompt_path:
        prompt_candidates.append(entry.prompt_path)
    if parsed_beats and entry.mode_key:
        beats_slug = "-".join(str(beat) for beat in parsed_beats)
        prompt_candidates.append(
            f"{entry.preset}/{grid_type}_{entry.mode_key}_{beats_slug}_prompt.txt"
        )

    for relative in prompt_candidates:
        prompt_path = _safe_grids_file(grids_dir, relative)
        if prompt_path and prompt_path.exists():
            return {
                "ok": True,
                "data": {
                    "grid_index": grid_index,
                    "grid_type": grid_type,
                    "mode_key": entry.mode_key,
                    "beat_numbers": list(entry.beat_nums),
                    "prompt": prompt_path.read_text(encoding="utf-8"),
                    "prompt_path": prompt_path.relative_to(grids_dir).as_posix(),
                },
            }

    return {"ok": False, "error": "Prompt file not found for this grid"}


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
    output_dir = Path(resolved.output_dir)
    ep_grids_dir = output_dir / "grids" / f"ep{episode_num:03d}"

    from ai_anime.generators.nanobanana_grid import crop_sketch_panels
    from ai_anime.generators.pool_indexer import (
        build_beat_sketch_paths,
        load_pool_index,
    )

    beat_numbers = [int(beat) for beat in body.beat_numbers if int(beat) > 0]
    if not beat_numbers:
        return {"ok": False, "error": "beat_numbers is required"}

    paths = build_beat_sketch_paths(ep_grids_dir, beat_numbers)
    pool = load_pool_index(ep_grids_dir)
    if pool:
        latest_pool_paths: dict[int, tuple[float, str]] = {}
        for img in pool.images:
            if img.type != "sketch" or not img.cell_path:
                continue
            beat_num = int(img.original_beat)
            if beat_num not in beat_numbers:
                continue
            cell_path = ep_grids_dir / img.cell_path
            if not cell_path.exists():
                continue
            generated_at = img.generated_at.timestamp() if img.generated_at else 0.0
            current = latest_pool_paths.get(beat_num)
            if current is None or generated_at > current[0]:
                latest_pool_paths[beat_num] = (generated_at, str(cell_path))
        paths = {
            **{beat: path for beat, (_generated_at, path) in latest_pool_paths.items()},
            **paths,
        }
    if not paths:
        return {"ok": False, "error": "No sketch images found for requested beats"}

    beats_slug = "_".join(str(beat) for beat in beat_numbers[:8])
    out_file = (
        ep_grids_dir
        / f"sketch_thumb_grid{grid_index}_{beats_slug}_{body.rows}x{body.cols}.jpg"
    )
    sketch_out = Path(
        crop_sketch_panels(
            str(ep_grids_dir),
            beat_numbers,
            body.rows,
            body.cols,
            str(out_file),
            beat_sketch_paths=paths,
        )
    )
    try:
        rel = sketch_out.relative_to(ep_grids_dir)
    except ValueError:
        return {
            "ok": False,
            "error": "Sketch preview path escaped episode grids directory",
        }

    return {
        "ok": True,
        "data": {
            "grid_index": grid_index,
            "rows": body.rows,
            "cols": body.cols,
            "beat_numbers": beat_numbers,
            "preview_path": str(rel),
            "preview_url": make_static_url_for_context(
                resolved.ctx,
                f"grids/ep{episode_num:03d}/{rel}",
                local_path=sketch_out,
            ),
        },
    }


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
    project_dir = resolved.project_dir

    from datetime import datetime
    from ai_anime.generators.pool_indexer import save_grid_and_split

    episode_grids_dir = project_dir / "grids" / f"ep{episode_num:03d}"
    if not episode_grids_dir.exists():
        return {"ok": False, "error": f"No grids directory for episode {episode_num}"}

    beat_nums = (
        [int(beat) for beat in body.beat_numbers]
        if body.beat_numbers
        else list(range(body.beat_start, body.beat_end + 1))
    )
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    mode_key = body.mode_key or f"{body.rows}x{body.cols}"

    grid_image_path = None
    from ai_anime.generators.pool_indexer import load_pool_index

    pool = load_pool_index(episode_grids_dir)
    entry = _find_pool_grid_entry(
        pool,
        grid_type=body.grid_type,
        mode_key=body.mode_key,
        beat_numbers=beat_nums,
        grid_index=grid_index,
    )
    if entry is not None:
        entry_path = _safe_grids_file(episode_grids_dir, entry.grid_path)
        if entry_path and entry_path.exists():
            grid_image_path = str(entry_path)

    if grid_image_path is None:
        # 兼容旧版根目录 grid_XX.png / jpg 文件。
        grid_files = sorted(episode_grids_dir.glob("*.png")) + sorted(
            episode_grids_dir.glob("*.jpg")
        )
        if grid_index < 0 or grid_index >= len(grid_files):
            return {
                "ok": False,
                "error": f"Grid index {grid_index} out of range (total: {len(grid_files)})",
            }
        grid_image_path = str(grid_files[grid_index])

    if body.grid_type == "render":
        promote_dir = project_dir / "frames" / f"ep{episode_num:03d}"
    else:
        promote_dir = project_dir / "sketches"
    promote_dir.mkdir(parents=True, exist_ok=True)

    result = save_grid_and_split(
        grid_image_path=grid_image_path,
        episode_grids_dir=str(episode_grids_dir),
        grid_type=body.grid_type,
        mode_key=mode_key,
        beat_nums=beat_nums,
        preset="custom",
        rows=body.rows,
        cols=body.cols,
        ts=ts,
        promote_dir=promote_dir,
        force_promote=body.grid_type == "render",
    )

    return {
        "ok": True,
        "data": {
            "grid_index": grid_index,
            "added": result.get("added", 0),
            "skipped": result.get("skipped", 0),
        },
    }


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
    username = resolved.username
    project_name = resolved.project_name

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(username, project_name)
    )

    beats = await store.get_beats_as_dicts(episode_num)
    if not beats:
        return {"ok": False, "error": f"No beats found for episode {episode_num}"}

    try:
        result = await sketch_color_assignment_use_cases(store).assign(
            episode_num=episode_num,
            beats=beats,
            output_dir=resolved.output_dir,
        )
    except SketchColorMarkersMissing:
        return {
            "ok": False,
            "error": "No identity or global prop markers found in beats",
        }

    return {
        "ok": True,
        "data": {
            "colors": result.identity_colors,
            "count": len(result.identity_colors),
            "prop_colors": result.prop_colors,
            "prop_count": len(result.prop_colors),
        },
    }


@router.post("/projects/{project}/episodes/{episode_num}/sketches/detect-identities")
async def detect_sketch_identities(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """AI 视觉识别草图中出现的身份/道具颜色标记。"""
    resolved = await _resolve_generation_project(project, user, required_role="editor")
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    ctx = getattr(resolved, "ctx", None)
    try:
        result = await sketch_marker_detection_use_cases(
            store,
            get_usage_meter(),
        ).detect(
            DetectSketchMarkersCommand(
                episode_num=episode_num,
                project_dir=resolved.project_dir,
                requester_user_id=_requester_user_id_for_billing(resolved, user),
                project_id=str(getattr(ctx, "project_id", "") or ""),
            )
        )
    except SketchMarkerDetectionRejected as exc:
        return {"ok": False, "error": str(exc)}
    except SketchMarkerDetectionFailed as exc:
        return {"ok": False, "error": f"AI detection failed: {exc}"}

    return {"ok": True, "data": result.as_dict()}
