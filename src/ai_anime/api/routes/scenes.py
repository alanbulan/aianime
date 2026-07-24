"""Scene asset workbench endpoints."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Query, UploadFile

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import (
    make_sqlite_store_for_context,
    make_static_url_for_context,
)
from ai_anime.api.schemas import (
    PanoViewerCorrection,
    SceneCreate,
    ScenePanoGenerateRequest,
    SceneReferenceGenerateRequest,
    SceneUpdate,
)
from ai_anime.modules.asset_world.public import (
    CreateSceneCommand,
    GenerateScenePanoCommand,
    SaveSceneDirectorWorldCommand,
    SaveSceneDirectorWorldSourceCommand,
    SceneCatalogRejected,
    UpdateSceneCommand,
    image_settings_use_cases,
    scene_catalog_use_cases,
    scene_media_use_cases,
    scene_task_use_cases,
    scene_viewer_use_cases,
)
from ai_anime.modules.project_workspace.public import ProjectContext, resolve_project_context
from ai_anime.shared.project_media import make_project_asset_url_builder
from ai_anime.sqlite_store import SQLiteStore

router = APIRouter()


async def _resolve_scene_project(
    project: str,
    user: dict,
    *,
    required_role: str = "editor",
) -> tuple[ProjectContext, str, str, Path, str, SQLiteStore]:
    ctx = await resolve_project_context(
        user=user,
        project_id=project,
        required_role=required_role,
    )
    store = await make_sqlite_store_for_context(ctx)
    return (
        ctx,
        ctx.owner_username,
        ctx.project_name,
        Path(ctx.output_dir),
        str(ctx.output_dir),
        store,
    )


@router.get("/projects/{project}/scenes")
async def list_scenes(
    project: str,
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="viewer")
    )
    data = await scene_catalog_use_cases().list_scenes(
        repository=store,
        project_dir=project_dir,
        asset_url=make_project_asset_url_builder(
            ctx, project_dir, make_static_url_for_context
        ),
    )
    return {
        "ok": True,
        "data": data,
    }


@router.get("/projects/{project}/scenes/plate-preview")
async def preview_scene_plate(
    project: str,
    scene_id: str = Query(default=""),
    variant_id: str = Query(default=""),
    time_of_day: str = Query(default=""),
    user: dict = Depends(get_api_user),
):
    _ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="viewer")
    )
    try:
        data = await scene_viewer_use_cases().preview_plate(
            repository=store,
            project_dir=project_dir,
            scene_id=scene_id,
            variant_id=variant_id,
            time_of_day=time_of_day,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.get("/projects/{project}/scenes/{name}/pano/manifest")
async def get_scene_pano_manifest(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="viewer")
    )
    try:
        data = await scene_viewer_use_cases().scene_pano_manifest(
            repository=store,
            project_id=ctx.project_id,
            project_dir=project_dir,
            scene_name=name,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.patch("/projects/{project}/scenes/{name}/pano/correction")
async def update_scene_pano_correction(
    project: str,
    name: str,
    correction: PanoViewerCorrection,
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="editor")
    )
    try:
        data = await scene_viewer_use_cases().update_pano_correction(
            repository=store,
            project_id=ctx.project_id,
            project_dir=project_dir,
            scene_name=name,
            correction=correction.model_dump(),
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.get("/projects/{project}/scenes/{name}/director-stage/manifest")
async def get_scene_director_stage_manifest(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="viewer")
    )
    try:
        data = await scene_viewer_use_cases().scene_director_stage_manifest(
            repository=store,
            project_id=ctx.project_id,
            project_dir=project_dir,
            scene_name=name,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/scenes/{name}/director-stage/world")
async def save_scene_director_world(
    project: str,
    name: str,
    body: dict[str, Any],
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="editor")
    )
    try:
        data = await scene_viewer_use_cases().save_director_world(
            repository=store,
            project_id=ctx.project_id,
            project_dir=project_dir,
            scene_name=name,
            command=SaveSceneDirectorWorldCommand(
                active_source_id=body.get("active_source_id"),
                snapshot=body.get("snapshot"),
                active_source=body.get("active_source"),
            ),
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/scenes/{name}/director-stage/world/source")
async def save_scene_director_world_source(
    project: str,
    name: str,
    body: dict[str, Any],
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="editor")
    )
    try:
        data = await scene_viewer_use_cases().save_director_world_source(
            repository=store,
            project_id=ctx.project_id,
            project_dir=project_dir,
            scene_name=name,
            command=SaveSceneDirectorWorldSourceCommand(
                source_id=body.get("source_id"),
                snapshot=body.get("snapshot"),
                source=body.get("source"),
            ),
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/scenes/{name}/director-stage/world/clear")
async def clear_scene_director_world(
    project: str,
    name: str,
    body: dict[str, Any] | None = None,
    user: dict = Depends(get_api_user),
):
    _ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="editor")
    )
    body = body or {}
    try:
        data = await scene_viewer_use_cases().clear_director_world(
            repository=store,
            project_dir=project_dir,
            scene_name=name,
            active_source_id=body.get("active_source_id"),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/scenes")
async def create_scene(
    project: str,
    body: SceneCreate,
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        data = await scene_catalog_use_cases().create_scene(
            repository=store,
            project_dir=project_dir,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
            command=CreateSceneCommand(**body.model_dump()),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.patch("/projects/{project}/scenes/{name}")
async def update_scene(
    project: str,
    name: str,
    body: SceneUpdate,
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        data = await scene_catalog_use_cases().update_scene(
            repository=store,
            project_dir=project_dir,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
            scene_name=name,
            command=UpdateSceneCommand(
                fields=body.model_dump(exclude_unset=True, exclude_none=True)
            ),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/scenes/{name}/delete")
async def delete_scene(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    _ctx, _username, _project_name, _project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        data = await scene_catalog_use_cases().delete_scene(
            repository=store,
            scene_name=name,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/scenes/build")
async def build_scenes(project: str, user: dict = Depends(get_api_user)):
    ctx, _username, _project_name, _project_dir, output_dir, _store = (
        await _resolve_scene_project(
            project,
            user,
            required_role="editor",
        )
    )
    try:
        scheduled = await scene_task_use_cases().schedule_build_scenes(
            task_context=ctx,
            output_dir=output_dir,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/scenes/{name}/master/upload")
async def upload_scene_master(
    project: str,
    name: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        scene = await scene_media_use_cases().upload_master(
            repository=store,
            project_dir=project_dir,
            scene_name=name,
            upload=file,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        "data": scene_catalog_use_cases().project_scene(
            scene,
            project_dir=project_dir,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        ),
    }


@router.post("/projects/{project}/scenes/{name}/master/delete")
async def delete_scene_master(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    _ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        data = await scene_media_use_cases().delete_master(
            repository=store,
            project_dir=project_dir,
            scene_name=name,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/scenes/{name}/master/generate-async")
async def generate_scene_master(
    project: str,
    name: str,
    body: SceneReferenceGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    return await _start_scene_reference_task(
        project=project,
        name=name,
        kind="master",
        model=body.model if body else None,
        user=user,
    )


@router.post("/projects/{project}/scenes/{name}/reverse/generate-async")
async def generate_scene_reverse_master(
    project: str,
    name: str,
    body: SceneReferenceGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    return await _start_scene_reference_task(
        project=project,
        name=name,
        kind="reverse_master",
        model=body.model if body else None,
        user=user,
    )


async def _start_scene_reference_task(
    *,
    project: str,
    name: str,
    kind: str,
    model: str | None = None,
    user: dict,
):
    (
        ctx,
        username,
        project_name,
        _project_dir,
        output_dir,
        store,
    ) = await _resolve_scene_project(project, user)

    try:
        scheduled = await scene_task_use_cases().schedule_reference(
            repository=store,
            task_context=ctx,
            output_dir=output_dir,
            scene_name=name,
            kind=kind,
            style=image_settings_use_cases().project_style(
                username,
                project_name,
            ),
            model=model,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/scenes/{name}/pano/upload")
async def upload_scene_pano(
    project: str,
    name: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        scene = await scene_media_use_cases().upload_pano(
            repository=store,
            project_dir=project_dir,
            scene_name=name,
            upload=file,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        "data": scene_catalog_use_cases().project_scene(
            scene,
            project_dir=project_dir,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        ),
    }


@router.post("/projects/{project}/scenes/{name}/pano/delete")
async def delete_scene_pano(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    _ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        data = await scene_media_use_cases().delete_pano(
            repository=store,
            project_dir=project_dir,
            scene_name=name,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/scenes/{name}/custom/upload")
async def upload_scene_custom_package(
    project: str,
    name: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        scene = await scene_media_use_cases().upload_custom_package(
            repository=store,
            project_dir=project_dir,
            scene_name=name,
            upload=file,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        "data": scene_catalog_use_cases().project_scene(
            scene,
            project_dir=project_dir,
            asset_url=make_project_asset_url_builder(
                ctx, project_dir, make_static_url_for_context
            ),
        ),
    }


@router.post("/projects/{project}/scenes/{name}/custom/delete")
async def delete_scene_custom_package(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    _ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        data = await scene_media_use_cases().delete_custom_package(
            repository=store,
            project_dir=project_dir,
            scene_name=name,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


async def _start_3gs_single_face_task(
    *,
    project: str,
    name: str,
    source_kind: str,
    user: dict,
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        scheduled = await scene_task_use_cases().schedule_single_face_3gs(
            repository=store,
            task_context=ctx,
            project_dir=project_dir,
            scene_name=name,
            source_kind=source_kind,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/scenes/{name}/3gs/master-ply/generate-async")
async def generate_scene_3gs_master_ply(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    return await _start_3gs_single_face_task(
        project=project,
        name=name,
        source_kind="master",
        user=user,
    )


@router.post("/projects/{project}/scenes/{name}/3gs/reverse-ply/generate-async")
async def generate_scene_3gs_reverse_ply(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    return await _start_3gs_single_face_task(
        project=project,
        name=name,
        source_kind="reverse",
        user=user,
    )


@router.post("/projects/{project}/scenes/{name}/3gs/pano-ply/generate-async")
async def generate_scene_3gs_pano_ply(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        scheduled = await scene_task_use_cases().schedule_pano_3gs(
            repository=store,
            task_context=ctx,
            project_dir=project_dir,
            scene_name=name,
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/scenes/{name}/pano/generate-async")
async def generate_scene_pano(
    project: str,
    name: str,
    body: ScenePanoGenerateRequest,
    user: dict = Depends(get_api_user),
):
    ctx, username, project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user)
    )
    try:
        scheduled = await scene_task_use_cases().schedule_pano_generation(
            repository=store,
            task_context=ctx,
            project_dir=project_dir,
            scene_name=name,
            command=GenerateScenePanoCommand(**body.model_dump()),
            project_style=(
                ""
                if body.style
                else image_settings_use_cases().project_style(
                    username,
                    project_name,
                )
            ),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}
