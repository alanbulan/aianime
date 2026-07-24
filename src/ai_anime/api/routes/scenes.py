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
from ai_anime.api.viewer_manifests import (
    build_director_stage_manifest,
    build_pano_viewer_manifest,
)
from ai_anime.director_world import stage_manifest
from ai_anime.models import (
    NovelScene,
    resolve_scene_plate_from_records,
)
from ai_anime.modules.asset_world.public import (
    CreateSceneCommand,
    GenerateScenePanoCommand,
    SceneCatalogRejected,
    UpdateSceneCommand,
    scene_catalog_use_cases,
    scene_media_use_cases,
    scene_task_use_cases,
)
from ai_anime.project_config import load_project_config_file
from ai_anime.modules.project_workspace.public import ProjectContext, resolve_project_context
from ai_anime.sqlite_store import SQLiteStore
from ai_anime.utils.path_resolver import (
    compute_scene_master_path,
)

router = APIRouter()


def _project_style(username: str, project: str) -> str:
    config = load_project_config_file(username, project)
    return str(config.get("visual_style") or config.get("project_style") or "")


def _asset_url(ctx: ProjectContext, project_dir: Path, abs_path: str | Path) -> str:
    path = Path(abs_path)
    if not path.exists():
        return ""
    try:
        rel_path = path.relative_to(project_dir).as_posix()
    except ValueError:
        return ""
    return make_static_url_for_context(ctx, rel_path, local_path=path)


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


async def _require_scene(store: SQLiteStore, name: str) -> NovelScene | None:
    return await store.get_scene(name)


def _scene_plate_preview_payload(
    *,
    scene_id: str,
    variant_id: str,
    time_of_day: str,
    resolved_scene_name: str,
    time_baked: bool,
    planned_scene_name: str = "",
) -> dict[str, Any]:
    has_time = bool(str(time_of_day or "").strip())
    if not has_time:
        render_status = "no_time"
        render_relight = False
        render_label = f"Render：将使用 {resolved_scene_name}，锁图光"
        seedance_label = f"Seedance2：将喂入 {resolved_scene_name}，提示词时间：无"
    elif planned_scene_name and planned_scene_name != resolved_scene_name:
        render_status = "planned_missing"
        render_relight = True
        render_label = (
            f"Render：已规划 {planned_scene_name} 但暂无图，将使用 "
            f"{resolved_scene_name}，relight 到 {time_of_day}"
        )
        seedance_label = (
            f"Seedance2：将喂入 {resolved_scene_name}，提示词时间：{time_of_day}"
        )
    elif time_baked:
        render_status = "time_baked"
        render_relight = False
        render_label = f"Render：将使用 {resolved_scene_name}，锁图光"
        seedance_label = (
            f"Seedance2：将喂入 {resolved_scene_name}，提示词时间：{time_of_day}"
        )
    else:
        render_status = "relight"
        render_relight = True
        render_label = f"Render：将使用 {resolved_scene_name}，relight 到 {time_of_day}"
        seedance_label = (
            f"Seedance2：将喂入 {resolved_scene_name}，提示词时间：{time_of_day}"
        )

    return {
        "scene_id": scene_id,
        "variant_id": variant_id,
        "time_of_day": time_of_day,
        "resolved_scene_name": resolved_scene_name,
        "planned_scene_name": planned_scene_name,
        "time_baked": time_baked,
        "render": {
            "resolved_scene_name": resolved_scene_name,
            "planned_scene_name": planned_scene_name,
            "relight": render_relight,
            "status": render_status,
            "label": render_label,
        },
        "seedance2": {
            "resolved_scene_name": resolved_scene_name,
            "prompt_time_of_day": time_of_day,
            "label": seedance_label,
        },
    }


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
        asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
    scene_id = scene_id if isinstance(scene_id, str) else ""
    variant_id = variant_id if isinstance(variant_id, str) else ""
    time_of_day = time_of_day if isinstance(time_of_day, str) else ""
    _ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="viewer")
    )
    scene_records = await store.list_scenes()
    resolved_scene_name, time_baked = resolve_scene_plate_from_records(
        scene_id,
        variant_id,
        time_of_day,
        scene_records,
    )
    planned_scene_name = ""
    if time_baked:
        resolved_master_path = compute_scene_master_path(
            project_dir, resolved_scene_name
        )
        if not resolved_master_path:
            planned_scene_name = resolved_scene_name
            resolved_scene_name, _unused_time_baked = resolve_scene_plate_from_records(
                scene_id,
                variant_id,
                "",
                scene_records,
            )
            time_baked = False
    return {
        "ok": True,
        "data": _scene_plate_preview_payload(
            scene_id=scene_id,
            variant_id=variant_id,
            time_of_day=time_of_day,
            resolved_scene_name=resolved_scene_name,
            time_baked=time_baked,
            planned_scene_name=planned_scene_name,
        ),
    }


@router.get("/projects/{project}/scenes/{name}/pano/manifest")
async def get_scene_pano_manifest(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="viewer")
    )
    scene = await _require_scene(store, name)
    if scene is None:
        return {"ok": False, "error": f"Scene '{name}' not found"}
    manifest = build_pano_viewer_manifest(
        ctx=ctx,
        project_dir=project_dir,
        scene_name=scene.name,
        mode="scene",
    )
    if manifest is None:
        return {"ok": False, "error": "当前场景没有 360 全景资产"}
    return {"ok": True, "data": manifest.model_dump(exclude_none=True)}


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
    scene = await _require_scene(store, name)
    if scene is None:
        return {"ok": False, "error": f"Scene '{name}' not found"}
    stage_manifest.set_pano_correction(
        project_dir,
        scene.name,
        correction.model_dump(),
    )
    manifest = build_pano_viewer_manifest(
        ctx=ctx,
        project_dir=project_dir,
        scene_name=scene.name,
        mode="scene",
    )
    if manifest is None:
        return {"ok": False, "error": "当前场景没有 360 全景资产"}
    return {"ok": True, "data": manifest.model_dump(exclude_none=True)}


@router.get("/projects/{project}/scenes/{name}/director-stage/manifest")
async def get_scene_director_stage_manifest(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    ctx, _username, _project_name, project_dir, _output_dir, store = (
        await _resolve_scene_project(project, user, required_role="viewer")
    )
    scene = await _require_scene(store, name)
    if scene is None:
        return {"ok": False, "error": f"Scene '{name}' not found"}
    manifest = build_director_stage_manifest(
        ctx=ctx,
        project_dir=project_dir,
        scene_name=scene.name,
        mode="scene",
    )
    if manifest is None:
        return {"ok": False, "error": "当前场景没有 3GS 资产"}
    return {"ok": True, "data": manifest.model_dump(exclude_none=True)}


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
    scene = await _require_scene(store, name)
    if scene is None:
        return {"ok": False, "error": f"Scene '{name}' not found"}
    snapshot = body.get("snapshot")
    if not isinstance(snapshot, dict):
        return {"ok": False, "error": "snapshot is required"}
    source_id = str(body.get("active_source_id") or "").strip()
    try:
        active_source = body.get("active_source")
        saved = stage_manifest.save_scene_director_world(
            project_dir,
            scene.name,
            active_source_id=source_id,
            snapshot=snapshot,
            active_source=active_source if isinstance(active_source, dict) else None,
        )
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    manifest = build_director_stage_manifest(
        ctx=ctx,
        project_dir=project_dir,
        scene_name=scene.name,
        mode="scene",
    )
    return {
        "ok": True,
        "data": {
            **saved,
            "manifest": (
                manifest.model_dump(exclude_none=True) if manifest is not None else None
            ),
        },
    }


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
    scene = await _require_scene(store, name)
    if scene is None:
        return {"ok": False, "error": f"Scene '{name}' not found"}
    snapshot = body.get("snapshot")
    if not isinstance(snapshot, dict):
        return {"ok": False, "error": "snapshot is required"}
    source_id = str(body.get("source_id") or "").strip()
    try:
        source = body.get("source")
        saved = stage_manifest.save_scene_director_world_source(
            project_dir,
            scene.name,
            source_id=source_id,
            snapshot=snapshot,
            source=source if isinstance(source, dict) else None,
        )
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    manifest = build_director_stage_manifest(
        ctx=ctx,
        project_dir=project_dir,
        scene_name=scene.name,
        mode="scene",
    )
    return {
        "ok": True,
        "data": {
            **saved,
            "manifest": (
                manifest.model_dump(exclude_none=True) if manifest is not None else None
            ),
        },
    }


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
    scene = await _require_scene(store, name)
    if scene is None:
        return {"ok": False, "error": f"Scene '{name}' not found"}
    body = body or {}
    saved = stage_manifest.clear_scene_director_world(
        project_dir,
        scene.name,
        active_source_id=str(body.get("active_source_id") or "").strip() or None,
    )
    return {"ok": True, "data": saved}


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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
            style=_project_style(username, project_name),
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
            asset_url=lambda path: _asset_url(ctx, project_dir, path),
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
                "" if body.style else _project_style(username, project_name)
            ),
        )
    except SceneCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}
