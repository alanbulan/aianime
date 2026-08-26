from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import pytest

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.story_intake.application.dto import (
    IngestionTask,
    ScheduledIngestion,
    StartIngestionCommand,
    StoredStoryDocument,
    UploadStoryDocumentCommand,
)
from ai_anime.modules.story_intake.application.errors import StoryDocumentTooLarge
from ai_anime.modules.story_intake.application.use_cases import (
    GetChapterPreview,
    GetKnowledgeGraph,
    StartIngestion,
    UploadStoryDocument,
)
from ai_anime.modules.story_intake.domain import (
    MAX_STORY_IMPORT_BYTES,
    SpineTemplateChangeRequiresRebuild,
)


class FakeStoryDocuments:
    def __init__(self, project_dir: Path) -> None:
        self.document = StoredStoryDocument(
            filename="novel.txt",
            path=project_dir / "uploads" / "novel.txt",
            size=12,
        )
        self.story_text = "第一章 雨巷\n林昭撑伞。"
        self.preview = {
            "total_chars": len(self.story_text),
            "billable_chars": 12,
            "count": 1,
            "chapters": [{"number": 1, "title": "第一章 雨巷"}],
        }
        self.format_check = {"level": "ok", "issues": []}
        self.upload_stream = None

    def store_upload(self, project_dir, filename, stream):
        self.upload_stream = stream
        return self.document

    def get_existing(self, project_dir, filename):
        return self.document

    def load_text(self, document):
        return self.story_text

    def count_billable_chars(self, text):
        return 12

    def build_chapter_preview(self, text):
        return dict(self.preview)

    def build_format_check(self, text, *, chapters):
        return dict(self.format_check)


class FakeProjectSettings:
    def __init__(self, spine_template: str = "drama") -> None:
        self.calls: list[dict[str, str]] = []
        self.spine_template = spine_template

    def get_spine_template(self, username, project_name):
        return self.spine_template

    def set_ingestion_configuration(
        self,
        username,
        project_name,
        *,
        spine_template,
        visual_style,
        narration_style,
        ethnicity,
    ):
        self.calls.append(
            {
                "username": username,
                "project_name": project_name,
                "spine_template": spine_template,
                "visual_style": visual_style,
                "narration_style": narration_style,
                "ethnicity": ethnicity,
            }
        )


class FakeTaskScheduler:
    def __init__(self) -> None:
        self.calls: list[tuple[object, Any]] = []

    async def enqueue_ingestion(self, task_context, task):
        self.calls.append((task_context, task))
        return ScheduledIngestion(
            task_id="task-1",
            task_key="ingest_fast:project-1:0",
            backend="inline",
            queue="inline",
        )


def _scope(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-1",
        owner_username="alice",
        requester_user_id="user-1",
        requester_username="alice",
        requester_principals=(("user", "user-1"),),
        effective_role="owner",
        home_node_id="local",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def test_upload_story_document_combines_preview_and_format_check(tmp_path):
    documents = FakeStoryDocuments(tmp_path)
    use_case = UploadStoryDocument(documents, GetChapterPreview(documents))
    stream = io.BytesIO(b"story")

    result = use_case.execute(
        _scope(tmp_path),
        UploadStoryDocumentCommand(filename="novel.txt", stream=stream),
    )

    assert documents.upload_stream is stream
    assert result["filename"] == "novel.txt"
    assert result["text_preview"] == documents.story_text
    assert result["text_preview_truncated"] is False
    assert result["chapters"] == documents.preview["chapters"]
    assert result["format_check"] == documents.format_check


@pytest.mark.asyncio
async def test_start_ingestion_owns_the_stable_task_payload(tmp_path):
    documents = FakeStoryDocuments(tmp_path)
    settings = FakeProjectSettings()
    scheduler = FakeTaskScheduler()
    context = _scope(tmp_path)
    use_case = StartIngestion(documents, settings, scheduler)

    result = await use_case.execute(
        context,
        StartIngestionCommand(
            filename="novel.txt",
            rebuild=True,
            spine_template="narrated",
            visual_style="anime",
            narration_style="third_person",
            ethnicity="Japanese",
        ),
    )

    assert settings.calls == [
        {
            "username": "alice",
            "project_name": "demo",
            "spine_template": "narrated",
            "visual_style": "anime",
            "narration_style": "third_person",
            "ethnicity": "Japanese",
        }
    ]
    assert len(scheduler.calls) == 1
    task_context, task = scheduler.calls[0]
    assert task_context is context
    assert task.backend_payload() == {
        "novel_path": str(tmp_path / "uploads" / "novel.txt"),
        "config": {"rebuild": True, "spine_template": "narrated"},
        "billing": {"billable_chars": 12, "billing_quantity": 12},
    }
    assert IngestionTask.from_backend_payload(task.backend_payload()) == task
    assert result == {
        "task_type": "ingest_fast",
        "task_id": "task-1",
        "task_key": "ingest_fast:project-1:0",
        "backend": "inline",
        "queue": "inline",
        "message": "导入任务已进入队列: novel.txt",
    }


@pytest.mark.asyncio
async def test_start_ingestion_allows_unchanged_spine_template_without_rebuild(
    tmp_path,
):
    documents = FakeStoryDocuments(tmp_path)
    settings = FakeProjectSettings(spine_template="drama")
    scheduler = FakeTaskScheduler()

    await StartIngestion(documents, settings, scheduler).execute(
        _scope(tmp_path),
        StartIngestionCommand(
            filename="novel.txt",
            rebuild=False,
            spine_template="drama",
        ),
    )

    assert scheduler.calls[0][1].config == {
        "rebuild": False,
        "spine_template": "drama",
    }


@pytest.mark.asyncio
async def test_start_ingestion_rejects_changed_spine_template_without_rebuild(
    tmp_path,
):
    documents = FakeStoryDocuments(tmp_path)
    settings = FakeProjectSettings(spine_template="drama")
    scheduler = FakeTaskScheduler()

    with pytest.raises(
        SpineTemplateChangeRequiresRebuild,
        match="必须使用重新导入",
    ):
        await StartIngestion(documents, settings, scheduler).execute(
            _scope(tmp_path),
            StartIngestionCommand(
                filename="novel.txt",
                rebuild=False,
                spine_template="narrated",
            ),
        )

    assert settings.calls == []
    assert scheduler.calls == []


@pytest.mark.asyncio
async def test_start_ingestion_rejects_legacy_document_over_import_limit(tmp_path):
    documents = FakeStoryDocuments(tmp_path)
    documents.document = StoredStoryDocument(
        filename="novel.txt",
        path=tmp_path / "uploads" / "novel.txt",
        size=MAX_STORY_IMPORT_BYTES + 1,
    )
    settings = FakeProjectSettings()
    scheduler = FakeTaskScheduler()

    with pytest.raises(StoryDocumentTooLarge) as captured:
        await StartIngestion(documents, settings, scheduler).execute(
            _scope(tmp_path),
            StartIngestionCommand(
                filename="novel.txt",
            ),
        )

    assert captured.value.max_bytes == MAX_STORY_IMPORT_BYTES
    assert settings.calls == []
    assert scheduler.calls == []

@pytest.mark.asyncio
async def test_get_knowledge_graph_delegates_to_port():
    class FakeKnowledgeGraph:
        async def get_snapshot(self):
            return {"nodes": [{"id": "hero"}], "edges": []}

    result = await GetKnowledgeGraph(FakeKnowledgeGraph()).execute()

    assert result == {"nodes": [{"id": "hero"}], "edges": []}
