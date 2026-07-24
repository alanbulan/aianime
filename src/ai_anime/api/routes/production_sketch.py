"""Production sketch generation endpoints."""

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ai_anime.api.auth import get_api_user, require_scope
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import SketchGenerateRequest
from ai_anime.modules.production.public import (
    CropCurrentSketchCommand,
    CurrentSketchMissing,
    DirectorControlSketchUnavailable,
    GenerateDirectorControlSketchCommand,
    GenerateMissingManualSketchesCommand,
    GenerateSketchesCommand,
    ManualSketchRegenerationRejected,
    SaveSketchEditorCommand,
    SketchBeatMissing,
    SketchCropRejected,
    SketchEditorQuery,
    SketchEditorSaveRejected,
    SketchGenerationRejected,
    SketchPoseCandidatesMissing,
    director_control_sketch_use_cases,
    manual_sketch_regeneration_use_cases,
    sketch_editing_use_cases,
    sketch_generation_use_cases,
)

router = APIRouter()


@router.post("/projects/{project}/episodes/{episode_num}/sketches/generate")
async def generate_sketches(
    project: str,
    episode_num: int,
    body: SketchGenerateRequest,
    user: dict = Depends(require_scope("tasks:submit")),
):
    """Queue sketch grid generation for an episode."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
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


@router.post(
    "/projects/{project}/episodes/{episode_num}/sketches/generate-missing-manual"
)
async def generate_missing_manual_sketches(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Dispatch Sketch regeneration for missing manual-shot sketches."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await manual_sketch_regeneration_use_cases().generate(
            resolved.ctx,
            GenerateMissingManualSketchesCommand(episode_num=episode_num),
        )
    except ManualSketchRegenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return scheduled.as_dict()


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
    resolved = await resolve_project_scope(project, user, required_role="editor")
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
    resolved = await resolve_project_scope(project, user, required_role="viewer")
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
    resolved = await resolve_project_scope(project, user, required_role="editor")
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
    resolved = await resolve_project_scope(project, user, required_role="editor")
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


__all__ = ["router"]
