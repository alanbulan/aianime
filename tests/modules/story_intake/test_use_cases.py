from __future__ import annotations

import io
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from ai_anime.modules.story_intake.application.dto import (
    ProjectScope,
    ScheduledIngestion,
    StartIngestionCommand,
    StoredStoryDocument,
    UploadStoryDocumentCommand,
)
from ai_anime.modules.story_intake.application.errors import ProjectContextRequired
from ai_anime.modules.story_intake.application.use_cases import (
    GetChapterPreview,
    GetKnowledgeGraph,
    StartIngestion,
    UploadStoryDocument,
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
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str]] = []

    def set_spine_template(self, username, project_name, spine_template):
        self.calls.append((username, project_name, spine_template))


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


def _scope(tmp_path: Path, *, task_context: object | None = None) -> ProjectScope:
    return ProjectScope(
        username="alice",
        project_name="demo",
        project_dir=tmp_path,
        task_context=task_context,
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
    assert result["chapters"] == documents.preview["chapters"]
    assert result["format_check"] == documents.format_check


@pytest.mark.asyncio
async def test_start_ingestion_owns_the_stable_task_payload(tmp_path):
    documents = FakeStoryDocuments(tmp_path)
    settings = FakeProjectSettings()
    scheduler = FakeTaskScheduler()
    context = SimpleNamespace(project_id="project-1")
    use_case = StartIngestion(documents, settings, scheduler)

    result = await use_case.execute(
        _scope(tmp_path, task_context=context),
        StartIngestionCommand(
            filename="novel.txt",
            rebuild=True,
            spine_template="narrated",
        ),
    )

    assert settings.calls == [("alice", "demo", "narrated")]
    assert len(scheduler.calls) == 1
    task_context, task = scheduler.calls[0]
    assert task_context is context
    assert task.backend_payload() == {
        "novel_path": str(tmp_path / "uploads" / "novel.txt"),
        "config": {"rebuild": True, "spine_template": "narrated"},
        "billing": {"billable_chars": 12, "billing_quantity": 12},
    }
    assert result == {
        "task_type": "ingest_fast",
        "task_id": "task-1",
        "task_key": "ingest_fast:project-1:0",
        "backend": "inline",
        "queue": "inline",
        "message": "导入任务已进入队列: novel.txt",
    }


@pytest.mark.asyncio
async def test_start_ingestion_keeps_config_update_before_legacy_context_failure(
    tmp_path,
):
    documents = FakeStoryDocuments(tmp_path)
    settings = FakeProjectSettings()
    scheduler = FakeTaskScheduler()
    use_case = StartIngestion(documents, settings, scheduler)

    with pytest.raises(ProjectContextRequired):
        await use_case.execute(
            _scope(tmp_path),
            StartIngestionCommand(
                filename="novel.txt",
                rebuild=True,
                spine_template="narrated",
            ),
        )

    assert settings.calls == [("alice", "demo", "narrated")]
    assert scheduler.calls == []


@pytest.mark.asyncio
async def test_get_knowledge_graph_delegates_to_port():
    class FakeKnowledgeGraph:
        async def get_snapshot(self):
            return {"nodes": [{"id": "hero"}], "edges": []}

    result = await GetKnowledgeGraph(FakeKnowledgeGraph()).execute()

    assert result == {"nodes": [{"id": "hero"}], "edges": []}
