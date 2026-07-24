"""画面/网格/视频生成端点。"""

import logging
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from fastapi.responses import JSONResponse

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import (
    BeatBackgroundAnchorUpdate,
    Seedance2AssetAudioTrimRequest,
    Seedance2AssetCropRequest,
    Seedance2AssetDeleteRequest,
)
from ai_anime.modules.asset_world.public import (
    BackgroundAnchorRejected,
    BeatViewerBeatNotFound,
    BeatViewerQuery,
    BeatViewerSceneMissing,
    CropBeatBackgroundCommand,
    ExportBeatDirectorControlFrameCommand,
    SaveBeatDirectorOverlayCommand,
    SceneCatalogRejected,
    SceneViewerRejected,
    SelectBeatBackgroundCommand,
    UploadBeatBackgroundCommand,
    beat_viewer_use_cases,
)
from ai_anime.modules.production.public import (
    AssignProjectSketchColorsCommand,
    CropSeedance2AssetCommand,
    CropCurrentSketchCommand,
    CurrentSketchMissing,
    DetectProjectSketchMarkersCommand,
    DirectorControlSketchUnavailable,
    GenerateMissingManualSketchesCommand,
    GenerateDirectorControlSketchCommand,
    ManualSketchRegenerationRejected,
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
    TrimSeedance2AudioAssetCommand,
    UploadSeedance2AssetCommand,
    director_control_sketch_use_cases,
    manual_sketch_regeneration_use_cases,
    seedance2_panel_use_cases,
    sketch_editing_use_cases,
    sketch_marker_use_cases,
)
from ai_anime.utils.media_io import decode_uploaded_rgb_image

router = APIRouter()

logger = logging.getLogger(__name__)

async def _resolve_generation_project(
    project: str, user: dict, required_role: str = "editor"
):
    return await resolve_project_scope(project, user, required_role=required_role)


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
    try:
        data = await beat_viewer_use_cases().load_director_stage_overlay(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
        )
    except BeatViewerBeatNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


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
    try:
        data = await beat_viewer_use_cases().save_director_stage_overlay(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
            SaveBeatDirectorOverlayCommand(
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
        )
    except BeatViewerBeatNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


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
    try:
        payload = await beat_viewer_use_cases().export_director_stage_control_frame(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
            ExportBeatDirectorControlFrameCommand(
                images=body.get("images"),
                frame_meta=body.get("frame_meta"),
                frame_aspect=body.get("frame_aspect"),
                snapshot=body.get("snapshot"),
                actors=body.get("actors"),
                props=body.get("props"),
                stagings=body.get("stagings"),
            )
        )
    except BeatViewerBeatNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except BeatViewerSceneMissing as exc:
        return {"ok": False, "error": str(exc)}
    except SceneViewerRejected as exc:
        return JSONResponse(
            status_code=400, content={"ok": False, "error": str(exc)}
        )
    return {"ok": True, "data": payload}


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
    try:
        payload = await beat_viewer_use_cases().background_anchors(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
        )
    except BeatViewerBeatNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "data": payload}


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
    try:
        payload = await beat_viewer_use_cases().select_background_anchor(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
            SelectBeatBackgroundCommand(anchor_id=body.anchor_id),
        )
    except BeatViewerBeatNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except BackgroundAnchorRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": payload}


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
    try:
        payload = await beat_viewer_use_cases().crop_background_anchor(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
            CropBeatBackgroundCommand(
                anchor_id=str(body.get("anchor_id") or ""),
                x=body.get("x"),
                y=body.get("y"),
                width=body.get("width"),
                height=body.get("height"),
            ),
        )
    except BeatViewerBeatNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
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
    try:
        image = await _read_uploaded_rgb_image(file)
    except Exception as exc:
        return {"ok": False, "error": f"上传外部参考图失败: {exc}"}

    try:
        payload = await beat_viewer_use_cases().upload_background_anchor(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
            UploadBeatBackgroundCommand(image=image),
        )
    except BeatViewerBeatNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except BackgroundAnchorRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": payload}


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
