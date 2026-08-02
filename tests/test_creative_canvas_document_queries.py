from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.canvas import documents as document_routes
from ai_anime.modules.creative_canvas.infrastructure.canvas_store_contracts import (
    CanvasCorruptError,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_store_io import read_canvas
from ai_anime.modules.creative_canvas.infrastructure.canvas_lock import CanvasLockBusy
from ai_anime.modules.creative_canvas.application.canvas_documents import (
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
    CreativeCanvasDocumentQueries,
    GetCreativeCanvasDocumentQuery,
    InvalidCreativeCanvasDocumentQuery,
    ListCreativeCanvasDocumentHistoryQuery,
    ListCreativeCanvasDocumentsQuery,
    ListCreativeCanvasGenerationHistoryQuery,
    ListCreativeCanvasNodeGenerationHistoryQuery,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_documents import (
    LocalCreativeCanvasDocumentQueryGateway,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _project_context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj_canvas",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="owner",
        requester_user_id="viewer-1",
        requester_username="viewer",
        requester_principals=(("user", "viewer-1"),),
        effective_role="viewer",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def test_document_query_adapter_uses_state_dir_for_canvas_catalog(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    gateway = LocalCreativeCanvasDocumentQueryGateway()

    documents = gateway.list_documents(
        context=context,
        actor_id="viewer-1",
    )

    assert [item["id"] for item in documents] == ["default"]
    state_canvas = context.state_dir / "freezone" / "canvases" / "default.json"
    output_canvas = context.output_dir / "freezone" / "canvases" / "default.json"
    assert state_canvas.exists()
    assert not output_canvas.exists()
    payload = read_canvas(context.state_dir, "default")
    assert payload["project_id"] == "proj_canvas"
    assert payload["created_by"] == "viewer-1"


def test_document_query_adapter_reads_and_projects_generation_history(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    calls: list[tuple[str, dict]] = []

    def node_reader(**kwargs):
        calls.append(("node", kwargs))
        return [{"id": "node-record", "path": "local"}]

    def canvas_reader(**kwargs):
        calls.append(("canvas", kwargs))
        return [{"id": "canvas-record", "path": "local"}]

    def migrator(record, **kwargs):
        calls.append(("migrate", kwargs))
        return {**record, "migrated": True}

    def sanitizer(record, **kwargs):
        calls.append(("sanitize", kwargs))
        return {**record, "sanitized": True}

    gateway = LocalCreativeCanvasDocumentQueryGateway(
        node_generation_history_reader=node_reader,
        generation_history_reader=canvas_reader,
        static_url_migrator=migrator,
        local_path_sanitizer=sanitizer,
    )

    node_records = gateway.list_node_generation_history(
        context=context,
        project_dir=context.output_dir,
        canvas_id="canvas_a",
        node_id="node_a",
        limit=25,
    )
    canvas_records = gateway.list_generation_history(
        context=context,
        project_dir=context.output_dir,
        canvas_id="canvas_a",
        limit=50,
    )

    assert node_records == [
        {
            "id": "node-record",
            "path": "local",
            "migrated": True,
            "sanitized": True,
        }
    ]
    assert canvas_records[0]["id"] == "canvas-record"
    assert calls[0] == (
        "node",
        {
            "project_dir": context.output_dir,
            "canvas_id": "canvas_a",
            "node_id": "node_a",
            "limit": 25,
        },
    )
    assert calls[3] == (
        "canvas",
        {
            "project_dir": context.output_dir,
            "canvas_id": "canvas_a",
            "limit": 50,
        },
    )
    migrate_call = next(payload for name, payload in calls if name == "migrate")
    assert migrate_call == {
        "project_id": "proj_canvas",
        "owner_username": "owner",
        "project_name": "demo",
        "project_dir": context.output_dir,
    }


@pytest.mark.asyncio
async def test_document_query_adapter_returns_empty_shape_for_missing_document(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    gateway = LocalCreativeCanvasDocumentQueryGateway()

    document = await gateway.get_document(
        context=context,
        project_dir=context.output_dir,
        canvas_id="missing_canvas",
        actor_id="viewer-1",
    )

    assert document == {"nodes": [], "edges": [], "viewport": None}
    assert not (
        context.state_dir / "freezone" / "canvases" / "missing_canvas.json"
    ).exists()


def test_document_queries_translate_invalid_history_request(tmp_path: Path) -> None:
    context = _project_context(tmp_path)

    class Gateway:
        def list_node_generation_history(self, **_kwargs):
            raise ValueError("invalid canvas_id: '../bad'")

    queries = CreativeCanvasDocumentQueries(Gateway())

    with pytest.raises(
        InvalidCreativeCanvasDocumentQuery,
        match="invalid canvas_id",
    ):
        queries.list_node_generation_history(
            ListCreativeCanvasNodeGenerationHistoryQuery(
                context=context,
                project_dir=context.output_dir,
                canvas_id="../bad",
                node_id="node",
                limit=100,
            )
        )


@pytest.mark.asyncio
async def test_document_queries_translate_invalid_document_request(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)

    class Gateway:
        async def get_document(self, **_kwargs):
            raise ValueError("invalid canvas_id: '../bad'")

    queries = CreativeCanvasDocumentQueries(Gateway())

    with pytest.raises(
        InvalidCreativeCanvasDocumentQuery,
        match="invalid canvas_id",
    ):
        await queries.get_document(
            GetCreativeCanvasDocumentQuery(
                context=context,
                project_dir=context.output_dir,
                canvas_id="../bad",
                actor_id="viewer-1",
            )
        )


@pytest.mark.asyncio
async def test_document_query_adapter_translates_storage_errors(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)

    def busy(*_args, **_kwargs):
        raise CanvasLockBusy("default")

    busy_gateway = LocalCreativeCanvasDocumentQueryGateway(
        ensure_default_canvas=busy,
    )
    with pytest.raises(CreativeCanvasDocumentBusy) as busy_error:
        busy_gateway.list_documents(context=context, actor_id="viewer")
    assert busy_error.value.canvas_id == "default"
    with pytest.raises(CreativeCanvasDocumentBusy) as get_busy_error:
        await busy_gateway.get_document(
            context=context,
            project_dir=context.output_dir,
            canvas_id="default",
            actor_id="viewer",
        )
    assert get_busy_error.value.canvas_id == "default"

    def corrupt(*_args, **_kwargs):
        raise CanvasCorruptError("corrupt canvas json")

    corrupt_gateway = LocalCreativeCanvasDocumentQueryGateway(
        list_canvas_document_history=corrupt,
    )
    with pytest.raises(
        CreativeCanvasDocumentCorrupt,
        match="corrupt canvas json",
    ):
        corrupt_gateway.list_document_history(
            context=context,
            canvas_id="default",
        )

    corrupt_document_gateway = LocalCreativeCanvasDocumentQueryGateway(
        read_canvas=corrupt,
    )
    with pytest.raises(
        CreativeCanvasDocumentCorrupt,
        match="corrupt canvas json",
    ):
        await corrupt_document_gateway.get_document(
            context=context,
            project_dir=context.output_dir,
            canvas_id="corrupt",
            actor_id="viewer",
        )


@pytest.mark.asyncio
async def test_document_query_adapter_closes_store_and_keeps_stale_preset_on_refresh_error(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    canvas_path = context.state_dir / "freezone" / "canvases" / "beat_canvas.json"
    canvas_path.parent.mkdir(parents=True)
    canvas_path.write_text(
        '{"canvas_id":"beat_canvas","revision":7,"nodes":[{"id":"old"}],'
        '"edges":[],"metadata":{"preset":{"scope":"beat","episode":1,"beat":2}}}',
        encoding="utf-8",
    )
    closed = False

    class Store:
        async def close(self):
            nonlocal closed
            closed = True

    async def store_factory(_context):
        return Store()

    async def failing_context_builder(**_kwargs):
        raise RuntimeError("mainline unavailable")

    gateway = LocalCreativeCanvasDocumentQueryGateway(
        store_factory=store_factory,
        beat_preset_context_builder=failing_context_builder,
    )

    document = await gateway.get_document(
        context=context,
        project_dir=context.output_dir,
        canvas_id="beat_canvas",
        actor_id="viewer-1",
    )

    assert closed is True
    assert document["revision"] == 7
    assert document["nodes"] == [{"id": "old"}]


@pytest.mark.asyncio
async def test_document_query_routes_preserve_permissions_and_payloads(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)
    resolutions: list[tuple[str, str]] = []
    queries_seen: list[object] = []

    async def resolve_project_scope(
        project,
        user,
        *,
        required_role,
        operation,
    ):
        assert project == "proj_canvas"
        assert user == {"id": "viewer-1", "username": "viewer"}
        resolutions.append((required_role, operation))
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class Queries:
        async def get_document(self, query):
            queries_seen.append(query)
            return {"canvas_id": "default", "nodes": []}

        def list_documents(self, query):
            queries_seen.append(query)
            return [{"id": "default"}]

        def list_document_history(self, query):
            queries_seen.append(query)
            return [{"history_id": "rev1"}]

        def list_node_generation_history(self, query):
            queries_seen.append(query)
            return [{"id": "node-record"}]

        def list_generation_history(self, query):
            queries_seen.append(query)
            return [{"id": "canvas-record"}]

    monkeypatch.setattr(document_routes, "resolve_project_scope", resolve_project_scope)
    monkeypatch.setattr(
        document_routes,
        "creative_canvas_document_queries",
        lambda: Queries(),
    )
    user = {"id": "viewer-1", "username": "viewer"}

    documents = await document_routes.list_canvases("proj_canvas", user=user)
    document = await document_routes.get_canvas(
        "proj_canvas",
        "default",
        user=user,
    )
    history = await document_routes.list_canvas_history(
        "proj_canvas",
        "default",
        user=user,
    )
    node_history = await document_routes.get_node_generation_history(
        "proj_canvas",
        "default",
        "node-a",
        limit=25,
        user=user,
    )
    canvas_history = await document_routes.get_canvas_generation_history(
        "proj_canvas",
        "default",
        limit=50,
        user=user,
    )

    assert documents == {"ok": True, "data": [{"id": "default"}]}
    assert document == {
        "ok": True,
        "data": {"canvas_id": "default", "nodes": []},
    }
    assert history == {"ok": True, "data": [{"history_id": "rev1"}]}
    assert node_history["data"]["records"] == [{"id": "node-record"}]
    assert canvas_history["data"]["records"] == [{"id": "canvas-record"}]
    assert resolutions == [
        ("viewer", "access freezone project files"),
        ("viewer", "access freezone project files"),
        ("viewer", "access freezone project files"),
        ("viewer", "access freezone project files"),
        ("viewer", "access freezone project files"),
    ]
    assert queries_seen[0] == ListCreativeCanvasDocumentsQuery(
        context=context,
        actor_id="viewer-1",
    )
    assert queries_seen[1] == GetCreativeCanvasDocumentQuery(
        context=context,
        project_dir=context.output_dir,
        canvas_id="default",
        actor_id="viewer-1",
    )
    assert queries_seen[2] == ListCreativeCanvasDocumentHistoryQuery(
        context=context,
        canvas_id="default",
    )
    assert queries_seen[3].limit == 25
    assert queries_seen[4] == ListCreativeCanvasGenerationHistoryQuery(
        context=context,
        project_dir=context.output_dir,
        canvas_id="default",
        limit=50,
    )


@pytest.mark.asyncio
async def test_document_query_routes_map_validation_and_storage_errors(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)
    resolve_calls = 0

    async def resolve_project_scope(*_args, **_kwargs):
        nonlocal resolve_calls
        resolve_calls += 1
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class Queries:
        async def get_document(self, query):
            if query.canvas_id == "busy":
                raise CreativeCanvasDocumentBusy(query.canvas_id)
            raise CreativeCanvasDocumentCorrupt("corrupt canvas json")

        def list_documents(self, _query):
            raise CreativeCanvasDocumentBusy("default")

        def list_document_history(self, _query):
            raise CreativeCanvasDocumentCorrupt("corrupt canvas json")

        def list_node_generation_history(self, _query):
            raise InvalidCreativeCanvasDocumentQuery("invalid canvas_id")

    monkeypatch.setattr(document_routes, "resolve_project_scope", resolve_project_scope)
    monkeypatch.setattr(
        document_routes,
        "creative_canvas_document_queries",
        lambda: Queries(),
    )

    with pytest.raises(HTTPException) as invalid_id:
        await document_routes.get_canvas(
            "proj_canvas",
            "../bad",
            user={"username": "viewer"},
        )
    assert invalid_id.value.status_code == 400
    assert invalid_id.value.detail == "invalid canvas_id"
    assert resolve_calls == 0

    with pytest.raises(HTTPException) as busy_document:
        await document_routes.get_canvas(
            "proj_canvas",
            "busy",
            user={"username": "viewer"},
        )
    assert busy_document.value.status_code == 503
    assert busy_document.value.headers == {"Retry-After": "1"}
    assert busy_document.value.detail == {
        "code": "canvas_lock_busy",
        "canvas_id": "busy",
    }

    with pytest.raises(HTTPException) as corrupt_document:
        await document_routes.get_canvas(
            "proj_canvas",
            "corrupt",
            user={"username": "viewer"},
        )
    assert corrupt_document.value.status_code == 500
    assert corrupt_document.value.detail == "corrupt canvas json"

    with pytest.raises(HTTPException) as busy:
        await document_routes.list_canvases(
            "proj_canvas",
            user={"username": "viewer"},
        )
    assert busy.value.status_code == 503
    assert busy.value.headers == {"Retry-After": "1"}
    assert busy.value.detail == {"code": "canvas_lock_busy", "canvas_id": "default"}

    with pytest.raises(HTTPException) as corrupt:
        await document_routes.list_canvas_history(
            "proj_canvas",
            "default",
            user={"username": "viewer"},
        )
    assert corrupt.value.status_code == 500
    assert corrupt.value.detail == "corrupt canvas json"

    with pytest.raises(HTTPException) as invalid_query:
        await document_routes.get_node_generation_history(
            "proj_canvas",
            "default",
            "node",
            limit=100,
            user={"username": "viewer"},
        )
    assert invalid_query.value.status_code == 400
    assert invalid_query.value.detail == "invalid canvas_id"
