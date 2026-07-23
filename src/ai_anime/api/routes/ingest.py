"""Story Intake HTTP adapter."""

import logging

from fastapi import APIRouter, Depends, File, UploadFile

from ai_anime.api.auth import get_api_user, require_scope
from ai_anime.api.deps import get_cognee_store, resolve_project_scope
from ai_anime.api.story_intake_mapper import story_intake_error_payload
from ai_anime.api.story_intake_schemas import IngestStart
from ai_anime.modules.story_intake.bootstrap import (
    build_get_knowledge_graph,
    build_story_intake_application,
)
from ai_anime.modules.story_intake.public import (
    ProjectScope,
    SpineTemplateChangeRequiresRebuild,
    StartIngestionCommand,
    StoryIntakeError,
    UploadStoryDocumentCommand,
)
from ai_anime.ports import get_task_backend
from ai_anime.project_config import (
    default_aspect_ratio_for_spine_template,
    load_project_config,
    save_project_config,
)

logger = logging.getLogger("ai_anime.api.ingest")
router = APIRouter()


def _application():
    return build_story_intake_application(
        task_backend_provider=get_task_backend,
        load_project_config=load_project_config,
        save_project_config=save_project_config,
        default_aspect_ratio=default_aspect_ratio_for_spine_template,
    )


def _project_scope(resolved) -> ProjectScope:
    return ProjectScope(
        username=resolved.username,
        project_name=resolved.project_name,
        project_dir=resolved.project_dir,
        task_context=resolved.ctx,
    )


@router.get("/projects/{project}/ingest/graph")
async def get_ingest_knowledge_graph(
    project: str,
    store=Depends(get_cognee_store),
):
    snapshot = await build_get_knowledge_graph(store).execute()
    return {"ok": True, "data": snapshot}


@router.post("/projects/{project}/ingest/upload")
async def upload_novel(
    project: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    logger.info("[%s] upload_novel: %s", project, file.filename)
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        data = _application().upload_story_document.execute(
            _project_scope(resolved),
            UploadStoryDocumentCommand(filename=file.filename, stream=file.file),
        )
    except StoryIntakeError as exc:
        return story_intake_error_payload(exc)
    return {"ok": True, "data": data}


@router.post("/projects/{project}/ingest/start")
async def start_ingest(
    project: str,
    body: IngestStart,
    user: dict = Depends(require_scope("tasks:submit")),
):
    logger.info(
        "[%s] start_ingest: %s (rebuild=%s)", project, body.filename, body.rebuild
    )
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        data = await _application().start_ingestion.execute(
            _project_scope(resolved),
            StartIngestionCommand(
                filename=body.filename,
                rebuild=body.rebuild,
                spine_template=body.spine_template,
            ),
        )
    except (StoryIntakeError, SpineTemplateChangeRequiresRebuild) as exc:
        return story_intake_error_payload(exc)
    return {"ok": True, **data}
