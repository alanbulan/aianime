"""Creative Canvas preset-factory endpoint."""

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.canvas_errors import raise_canvas_document_http_error
from ai_anime.api.canvas_presets_schemas import PresetCanvasRequest
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreateCreativeCanvasPresetCommand,
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
    CreativeCanvasDocumentWriteError,
    CreativeCanvasPresetCanvasNotFound,
    CreativeCanvasPresetMismatch,
    CreativeCanvasPresetSourceNotFound,
    InvalidCreativeCanvasPresetRequest,
    canvas_actor_id,
    canvas_event_actor,
    creative_canvas_preset_use_cases,
)


router = APIRouter()


@router.post(
    "/projects/{project}/freezone/canvases:from-preset",
    tags=["freezone-canvas"],
)
async def create_canvas_from_preset(
    project: str,
    body: PresetCanvasRequest,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_editor_project(project, user)
    try:
        data = await creative_canvas_preset_use_cases().create(
            CreateCreativeCanvasPresetCommand(
                context=resolved.ctx,
                project_id=project,
                project_dir=resolved.project_dir,
                request=body.model_dump(
                    exclude={"canvas_id", "overwrite_existing", "base_revision"},
                    exclude_none=True,
                ),
                canvas_id=body.canvas_id,
                overwrite_existing=body.overwrite_existing,
                base_revision=body.base_revision,
                actor_id=canvas_actor_id(user),
                event_actor=canvas_event_actor(user),
            )
        )
    except InvalidCreativeCanvasPresetRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasPresetSourceNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except CreativeCanvasPresetCanvasNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except CreativeCanvasPresetMismatch as exc:
        raise HTTPException(400, str(exc)) from exc
    except (
        CreativeCanvasDocumentWriteError,
        CreativeCanvasDocumentCorrupt,
        CreativeCanvasDocumentBusy,
    ) as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": data}


async def _resolve_editor_project(project: str, user: dict):
    return await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )


__all__ = ["router"]
