from __future__ import annotations

from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_ingest_log_messages_do_not_reset_progress(monkeypatch):
    from ai_anime.modules.task_execution.infrastructure.runners import ingest
    from ai_anime.shared.infrastructure import project_stores

    updates: list[dict] = []

    class FakeManager:
        def update_progress_for_project(self, *_args, **kwargs):
            updates.append(kwargs)

    class FakeStore:
        async def ingest_novel_fast(self, _path, **kwargs):
            kwargs["on_progress"](0.3, "构建知识图谱...")
            kwargs["on_log"]("云端模型调用中...")
            kwargs["on_progress"](0.7, "创建向量索引...")
            kwargs["on_log"]("向量索引写入中...")
            return {"status": "graph_ready"}

        async def close(self):
            return None

    async def fake_make_store(*_args, **_kwargs):
        return FakeStore()

    monkeypatch.setattr(ingest, "get_task_manager", lambda: FakeManager())
    monkeypatch.setattr(project_stores, "make_cognee_store_for_context", fake_make_store)

    envelope = {
        "payload": {
            "novel_path": "novel.txt",
            "models": {"text": "text-model", "embedding": "embedding-model"},
            "config": {},
            "billing": {},
        }
    }

    result = await ingest._run_ingest_fast(envelope, SimpleNamespace())

    assert result["status"] == "graph_ready"
    assert [item["progress"] for item in updates] == [0.3, 0.3, 0.7, 0.7]
