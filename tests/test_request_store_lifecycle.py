"""Request-scoped SQLiteStore lifecycle tests."""

from __future__ import annotations

import asyncio

import pytest

from ai_anime.shared.infrastructure.project_stores import (
    begin_request_store_tracking,
    end_request_store_tracking,
    register_request_store,
)


class FakeStore:
    project_dir = "fake-project"

    def __init__(self) -> None:
        self.closed = False

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_request_tracking_returns_every_store_opened_by_request_task() -> None:
    first = FakeStore()
    second = FakeStore()

    tokens = begin_request_store_tracking()
    try:
        register_request_store(first)
        register_request_store(second)
        stores = end_request_store_tracking(tokens)
    finally:
        pass

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
        stores = end_request_store_tracking(tokens)
    finally:
        pass

    assert stores == []
    assert background_store.closed is False


@pytest.mark.asyncio
async def test_registration_outside_request_is_noop() -> None:
    store = FakeStore()
    register_request_store(store)
    assert store.closed is False
