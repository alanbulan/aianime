"""FastAPI startup and shutdown lifecycle."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import cast

from fastapi import FastAPI

from ai_anime.modules.bootstrap.public import (
    ApplicationContainer,
    build_application_container,
)

logger = logging.getLogger("ai_anime.api.app")


def application_container(application: FastAPI) -> ApplicationContainer:
    existing = getattr(application.state, "container", None)
    if existing is not None:
        return cast(ApplicationContainer, existing)

    container = build_application_container()
    application.state.container = container
    return container


async def startup_application(application: FastAPI) -> None:
    try:
        container = application_container(application)
        await container.lifecycle.on_startup(register_as_worker=True)

        from ai_anime.sqlite_pragmas import litestream_enabled

        if litestream_enabled():
            from ai_anime.modules.backup.public import migrate_state_tree
            from ai_anime.config import STATE_DIR

            try:
                await asyncio.to_thread(migrate_state_tree, Path(STATE_DIR))
            except Exception:
                logger.exception("WAL migration sweep failed (non-fatal)")
    except Exception:
        logger.exception("API startup failed while connecting to control-plane")
        raise


async def shutdown_application(application: FastAPI) -> None:
    container = getattr(application.state, "container", None)
    if container is None:
        return
    await cast(ApplicationContainer, container).lifecycle.on_shutdown()


@asynccontextmanager
async def app_lifespan(application: FastAPI) -> AsyncIterator[None]:
    await startup_application(application)
    try:
        yield
    finally:
        await shutdown_application(application)
