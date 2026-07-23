"""FastAPI startup and shutdown lifecycle."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

logger = logging.getLogger("ai_anime.api.app")


async def startup_application() -> None:
    try:
        from ai_anime.ports.registry import ensure_bootstrap, get_port

        ensure_bootstrap()
        await get_port("lifecycle").on_startup(register_as_worker=True)

        from ai_anime.sqlite_pragmas import litestream_enabled

        if litestream_enabled():
            from ai_anime.backup.wal_migrator import migrate_state_tree
            from ai_anime.config import STATE_DIR

            try:
                await asyncio.to_thread(migrate_state_tree, Path(STATE_DIR))
            except Exception:
                logger.exception("WAL migration sweep failed (non-fatal)")
    except Exception:
        logger.exception("API startup failed while connecting to control-plane")
        raise


async def shutdown_application() -> None:
    from ai_anime.ports.registry import PortNotRegistered, get_port

    try:
        lifecycle = get_port("lifecycle")
    except PortNotRegistered:
        return
    await lifecycle.on_shutdown()


@asynccontextmanager
async def app_lifespan(application: FastAPI) -> AsyncIterator[None]:
    _ = application
    await startup_application()
    try:
        yield
    finally:
        await shutdown_application()
