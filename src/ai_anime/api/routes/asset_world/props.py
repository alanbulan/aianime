"""Prop asset workbench endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import (
    make_sqlite_store,
    make_sqlite_store_for_context,
    make_static_url_for_context,
    resolve_project_scope,
)
from ai_anime.api.routes.asset_world.props_schemas import (
    PropCreate,
    PropReferenceGenerateRequest,
    PropUpdate,
)
from ai_anime.modules.asset_world.public import (
    CreatePropCommand,
    PropCatalogRejected,
    UpdatePropCommand,
    image_settings_use_cases,
    prop_catalog_use_cases,
    prop_task_use_cases,
)
from ai_anime.shared.project_media import make_project_asset_url_builder

router = APIRouter()


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
        asset_url=make_project_asset_url_builder(
            resolved.ctx, project_dir, make_static_url_for_context
        ),
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
            asset_url=make_project_asset_url_builder(
                resolved.ctx, project_dir, make_static_url_for_context
            ),
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
            asset_url=make_project_asset_url_builder(
                resolved.ctx, project_dir, make_static_url_for_context
            ),
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
    style = (body.style if body else "") or image_settings_use_cases().project_style(
        username,
        project_name,
    )
    model = str((body.model if body else None) or "").strip()
    try:
        scheduled = await prop_task_use_cases().schedule_reference(
            repository=store,
            task_context=ctx,
            output_dir=output_dir,
            prop_name=name,
            style=style,
            model=model,
        )
    except PropCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


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
    style = (body.style if body else "") or image_settings_use_cases().project_style(
        username,
        project_name,
    )
    model = str((body.model if body else None) or "").strip()

    try:
        scheduled = await prop_task_use_cases().schedule_batch_references(
            task_context=ctx,
            output_dir=output_dir,
            style=style,
            model=model,
        )
    except PropCatalogRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}
