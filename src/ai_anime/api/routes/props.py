"""Prop asset workbench endpoints."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import (
    make_sqlite_store,
    make_sqlite_store_for_context,
    make_static_url_for_context,
    resolve_project_scope,
)
from ai_anime.api.schemas import PropCreate, PropReferenceGenerateRequest, PropUpdate
from ai_anime.modules.asset_world.public import (
    CreatePropCommand,
    PropCatalogRejected,
    UpdatePropCommand,
    prop_catalog_use_cases,
)
from ai_anime.project_config import load_project_config_file
from ai_anime.ports import get_task_backend
from ai_anime.task_scopes import prop_reference_asset_scope
from ai_anime.task_identity import project_task_state_key

router = APIRouter()


def _project_style(username: str, project: str) -> str:
    config = load_project_config_file(username, project)
    return str(config.get("visual_style") or config.get("project_style") or "")


def _asset_url(ctx, project_dir: Path, abs_path: str | Path) -> str:
    path = Path(abs_path)
    if not path.exists():
        return ""
    try:
        rel_path = path.relative_to(project_dir).as_posix()
    except ValueError:
        return ""
    return make_static_url_for_context(ctx, rel_path, local_path=path)


@router.get("/projects/{project}/props")
async def list_props(
    project: str,
    scope: Annotated[str, Query(pattern="^(global|local|all)$")] = "global",
    user: dict = Depends(get_api_user),
):
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    project_dir = resolved.project_dir
    data = await prop_catalog_use_cases().list_props(
        repository=store,
        project_dir=project_dir,
        asset_url=lambda path: _asset_url(resolved.ctx, project_dir, path),
        scope=scope,
    )
    return {
        "ok": True,
        "data": data,
    }


@router.post("/projects/{project}/props")
async def create_prop(
    project: str,
    body: PropCreate,
    user: dict = Depends(get_api_user),
):
    resolved = await resolve_project_scope(project, user, required_role="editor")
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    project_dir = resolved.project_dir
    try:
        data = await prop_catalog_use_cases().create_prop(
            repository=store,
            project_dir=project_dir,
            asset_url=lambda path: _asset_url(resolved.ctx, project_dir, path),
            command=CreatePropCommand(**body.model_dump()),
        )
    except PropCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.patch("/projects/{project}/props/{name}")
async def update_prop(
    project: str,
    name: str,
    body: PropUpdate,
    user: dict = Depends(get_api_user),
):
    resolved = await resolve_project_scope(project, user, required_role="editor")
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    project_dir = resolved.project_dir
    try:
        data = await prop_catalog_use_cases().update_prop(
            repository=store,
            project_dir=project_dir,
            asset_url=lambda path: _asset_url(resolved.ctx, project_dir, path),
            prop_name=name,
            command=UpdatePropCommand(
                fields=body.model_dump(exclude_unset=True, exclude_none=True)
            ),
        )
    except PropCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/props/{name}/delete")
async def delete_prop(
    project: str,
    name: str,
    user: dict = Depends(get_api_user),
):
    resolved = await resolve_project_scope(project, user, required_role="editor")
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    try:
        data = await prop_catalog_use_cases().delete_prop(
            repository=store,
            prop_name=name,
        )
    except PropCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.post("/projects/{project}/props/{name}/reference/generate-async")
async def generate_prop_reference(
    project: str,
    name: str,
    body: PropReferenceGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    resolved = await resolve_project_scope(project, user, required_role="editor")
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    output_dir = resolved.output_dir
    store = (
        await make_sqlite_store_for_context(ctx)
        if ctx
        else await make_sqlite_store(username, project_name)
    )
    style = (body.style if body else "") or _project_style(username, project_name)
    model = str(body.model if body else "").strip()
    prop = await store.get_prop(name)
    if prop is None:
        return {"ok": False, "error": f"Prop '{name}' not found"}
    if not (prop.visual_prompt or prop.description or prop.name):
        return {"ok": False, "error": f"Prop '{prop.name}' has no visual prompt"}

    scope = prop_reference_asset_scope(prop.name)
    if ctx is not None:
        queued = await get_task_backend().enqueue_project_task(
            ctx,
            task_type="prop_reference_asset",
            queue_kind="default",
            episode=0,
            scope=scope,
            payload={
                "prop_name": prop.name,
                "style": style,
                "model": model,
                "output_dir": output_dir,
            },
        )
        return {
            "ok": True,
            "task_type": "prop_reference_asset",
            "scope": scope,
            "task_id": queued.task_state.task_id,
            "task_key": project_task_state_key(
                "prop_reference_asset", ctx.project_id, 0, scope=scope
            ),
            "backend": queued.backend,
            "queue": queued.queue,
            "message": f"道具「{prop.name}」参考图生成任务已进入队列",
        }

    return {"ok": False, "error": "道具参考图生成需要 project context"}


@router.post("/projects/{project}/props/reference/batch-generate")
async def batch_generate_prop_references(
    project: str,
    body: PropReferenceGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    resolved = await resolve_project_scope(project, user, required_role="editor")
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    output_dir = resolved.output_dir
    style = (body.style if body else "") or _project_style(username, project_name)
    model = str(body.model if body else "").strip()

    if ctx is not None:
        queued = await get_task_backend().enqueue_project_task(
            ctx,
            task_type="batch_prop_ref",
            queue_kind="default",
            episode=0,
            payload={"style": style, "model": model, "output_dir": output_dir},
        )
        return {
            "ok": True,
            "task_type": "batch_prop_ref",
            "task_id": queued.task_state.task_id,
            "task_key": project_task_state_key("batch_prop_ref", ctx.project_id, 0),
            "backend": queued.backend,
            "queue": queued.queue,
            "message": "批量道具参考图生成任务已进入队列",
        }

    return {"ok": False, "error": "批量道具参考图生成需要 project context"}
