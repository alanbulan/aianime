"""Close request-scoped SQLiteStore handles after each HTTP request.

Legacy project routes open stores via ``make_sqlite_store_for_context`` and
historically never closed them, leaking aiosqlite connections on the long-lived
desktop process. Instead of touching every handler, stores created by the
request task are registered (see ``shared/infrastructure/project_stores.py``)
and closed once the response completes.

The registry is keyed by task id, so background tasks spawned during a request
(inline task runners) are not closed out from under them; those runners manage
their own store lifecycle. ``SQLiteStore.close()`` is idempotent, so handlers
that already close manually stay correct.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request

from ai_anime.shared.infrastructure.project_stores import (
    begin_request_store_tracking,
    end_request_store_tracking,
)

if TYPE_CHECKING:
    from ai_anime.sqlite_store import SQLiteStore

logger = logging.getLogger("ai_anime.api.middleware.request_store_close")


def install_request_store_close_middleware(application: FastAPI) -> None:
    @application.middleware("http")
    async def _close_request_stores(request: Request, call_next):
        tokens = begin_request_store_tracking()
        try:
            return await call_next(request)
        finally:
            stores: list[SQLiteStore] = end_request_store_tracking(tokens)
            for store in stores:
                try:
                    await store.close()
                except Exception:
                    logger.exception(
                        "failed to close request-scoped SQLiteStore project_dir=%s",
                        getattr(store, "project_dir", "?"),
                    )
