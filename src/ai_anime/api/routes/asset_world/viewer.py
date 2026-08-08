"""Asset & World beat viewer endpoints."""

from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from fastapi.responses import JSONResponse

from ai_anime.api.routes.asset_world.viewer_schemas import BeatBackgroundAnchorUpdate
from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import resolve_project_scope
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
from ai_anime.shared.utils.media_io import decode_uploaded_rgb_image

router = APIRouter()

async def _read_uploaded_rgb_image(file: UploadFile):
    content = await file.read()
    return decode_uploaded_rgb_image(content)


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
    resolved = await resolve_project_scope(project, user, required_role="viewer")
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
    await resolve_project_scope(project, user, required_role="viewer")
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
    resolved = await resolve_project_scope(project, user, required_role="viewer")
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
    resolved = await resolve_project_scope(project, user, required_role="viewer")
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
    resolved = await resolve_project_scope(project, user, required_role="editor")
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
    resolved = await resolve_project_scope(project, user, required_role="editor")
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
    resolved = await resolve_project_scope(project, user, required_role="viewer")
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
    resolved = await resolve_project_scope(project, user, required_role="editor")
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
    resolved = await resolve_project_scope(project, user, required_role="editor")
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
    resolved = await resolve_project_scope(project, user, required_role="editor")
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
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": beat_viewer_use_cases().director_control_frame_status(
            resolved.ctx,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
        ),
    }
