"""Request-scoped SQLiteStore lifecycle tests."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

from ai_anime import sqlite_store
from ai_anime.api.middleware import install_http_middleware
from ai_anime.shared.infrastructure import project_stores
from ai_anime.shared.infrastructure.project_stores import (
    begin_request_store_tracking,
    end_request_store_tracking,
    register_request_store,
)


class FakeStore:
    project_dir = "fake-project"

    def __init__(self) -> None:
        self.closed = False
        self.close_count = 0

    async def close(self) -> None:
        self.closed = True
        self.close_count += 1


def make_test_application() -> FastAPI:
    application = FastAPI()
    install_http_middleware(
        application,
        desktop_mode=False,
        desktop_token="",
    )
    return application


@pytest.mark.asyncio
async def test_request_tracking_returns_every_store_opened_by_request_task() -> None:
    first = FakeStore()
    second = FakeStore()

    tokens = begin_request_store_tracking()
    try:
        register_request_store(first)
        register_request_store(second)
    finally:
        stores = end_request_store_tracking(tokens)

    assert stores == [first, second]
    assert first.closed is False


@pytest.mark.asyncio
async def test_background_task_stores_are_not_registered() -> None:
    """Inline task runners inherit the request context; their stores must not
    be closed by the request middleware."""

    background_store = FakeStore()

    async def background_worker() -> None:
        register_request_store(background_store)

    tokens = begin_request_store_tracking()
    try:
        task = asyncio.create_task(background_worker())
        await task
    finally:
        stores = end_request_store_tracking(tokens)

    assert stores == []
    assert background_store.closed is False


@pytest.mark.asyncio
async def test_registration_outside_request_is_noop() -> None:
    store = FakeStore()
    register_request_store(store)
    assert store.closed is False


def test_http_middleware_closes_store_opened_by_route() -> None:
    store = FakeStore()
    application = make_test_application()

    @application.get("/")
    async def route():
        register_request_store(store)
        return {"ok": True}

    with TestClient(application) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert store.closed is True
    assert store.close_count == 1


def test_http_middleware_closes_store_after_stream_finishes() -> None:
    store = FakeStore()
    closed_while_streaming: list[bool] = []
    application = make_test_application()

    @application.get("/stream")
    async def route():
        register_request_store(store)

        async def content():
            closed_while_streaming.append(store.closed)
            yield b"chunk"

        return StreamingResponse(content(), media_type="text/plain")

    with TestClient(application) as client:
        response = client.get("/stream")

    assert response.status_code == 200
    assert response.content == b"chunk"
    assert closed_while_streaming == [False]
    assert store.closed is True
    assert store.close_count == 1


def test_http_middleware_closes_store_when_route_raises() -> None:
    store = FakeStore()
    application = make_test_application()

    @application.get("/error")
    async def route():
        register_request_store(store)
        raise RuntimeError("request failed")

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get("/error")

    assert response.status_code == 500
    assert store.closed is True
    assert store.close_count == 1


@pytest.mark.asyncio
async def test_sqlite_factory_closes_store_when_loading_fails(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    class FailingStore(FakeStore):
        async def initialize(self) -> None:
            pass

        async def load_graph_state(self) -> None:
            raise RuntimeError("load failed")

    class FakeProjectPaths:
        output_dir = tmp_path / "output"
        state_dir = tmp_path / "state"

        def __init__(self, _username: str, _project: str) -> None:
            pass

    store = FailingStore()
    monkeypatch.setattr(project_stores, "ProjectPaths", FakeProjectPaths)
    monkeypatch.setattr(sqlite_store, "SQLiteStore", lambda *_args, **_kwargs: store)

    with pytest.raises(RuntimeError, match="load failed"):
        await project_stores.make_sqlite_store("user", "project")

    assert store.closed is True
    assert store.close_count == 1
