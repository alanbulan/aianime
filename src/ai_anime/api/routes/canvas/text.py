"""Creative Canvas text endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.canvas_job_schemas import FreezoneJobAcceptedResponse
from ai_anime.api.canvas_text_schemas import (
    FreezoneStoryScriptGenerateRequest,
    FreezoneTextTranslateRequest,
)
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTextProcessingSourceMissing,
    InvalidCreativeCanvasTextProcessingRequest,
    StartCreativeCanvasStoryScriptCommand,
    StartCreativeCanvasTextTranslationCommand,
    creative_canvas_text_processing_use_cases,
)
from ai_anime.modules.task_execution.public import (
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
)

logger = logging.getLogger("ai_anime.api.freezone")
router = APIRouter()


@router.post(
    "/projects/{project}/freezone/text/translate",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-text"],
)
async def freezone_text_translate(
    project: str,
    body: FreezoneTextTranslateRequest,
    user: dict = Depends(get_api_user),
):
    """文本工具：中英文互译，供各类节点编写提示词时直接调用。"""
    resolved = await _resolve_editor_project(project, user)
    try:
        result = await creative_canvas_text_processing_use_cases().start_translation(
            StartCreativeCanvasTextTranslationCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                text=body.text,
                model=body.model,
                node_type=body.node_type,
                canvas_id=body.canvas_id or None,
                node_id=body.node_id or None,
            )
        )
    except InvalidCreativeCanvasTextProcessingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
        raise
    except RuntimeError as exc:
        logger.warning(
            "failed to start text translate task: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            503,
            f"failed to start text translate task: {exc}",
        ) from exc
    return _text_processing_response(result)


@router.post(
    "/projects/{project}/freezone/text/story-script",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-text"],
)
async def freezone_story_script_generate(
    project: str,
    body: FreezoneStoryScriptGenerateRequest,
    user: dict = Depends(get_api_user),
):
    """文本工具：根据上传剧本内容生成结构化故事脚本表。"""
    resolved = await _resolve_editor_project(project, user)
    try:
        result = await creative_canvas_text_processing_use_cases().start_story_script(
            StartCreativeCanvasStoryScriptCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                source_text=body.source_text,
                source_url=body.source_url,
                prompt=body.prompt,
                model=body.model,
                canvas_id=body.canvas_id or None,
                node_id=body.node_id or None,
            )
        )
    except InvalidCreativeCanvasTextProcessingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasTextProcessingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
        raise
    except RuntimeError as exc:
        logger.warning(
            "failed to start story script task: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            503,
            f"failed to start story script task: {exc}",
        ) from exc
    return _text_processing_response(result)


def _text_processing_response(result: CreativeCanvasTaskReceipt) -> dict:
    data = {
        "task_type": result.task_type,
        "job_id": result.job_id,
        "task_key": result.task_key,
        "task_episode": result.task_episode,
        "task_scope": result.task_scope,
        "backend": result.backend,
        "queue": result.queue,
    }
    if result.task_id:
        data["task_id"] = result.task_id
    return {"ok": True, "data": data}


async def _resolve_editor_project(project: str, user: dict):
    return await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )


__all__ = ["router"]
