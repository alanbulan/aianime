"""FastAPI startup and shutdown lifecycle."""

from __future__ import annotations

import asyncio
import logging
import os
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
        from ai_anime.migrations.model_usage import migrate_legacy_gateway_secrets

        await asyncio.to_thread(migrate_legacy_gateway_secrets)
        container = application_container(application)
        await container.lifecycle.on_startup(register_as_worker=True)

        if os.environ.get("AI_ANIME_DESKTOP_MODE") == "1":
            from ai_anime.shared.infrastructure.project_stores import (
                prewarm_knowledge_graph_runtime,
            )

            # Cognee's import graph takes about 20 seconds on Windows. Warm it
            # in a worker so the API can answer /healthz and the desktop UI
            # remains responsive while the optional graph feature gets ready.
            application.state.knowledge_graph_runtime_warmup = asyncio.create_task(
                prewarm_knowledge_graph_runtime()
            )

        from ai_anime.shared.infrastructure.sqlite_pragmas import litestream_enabled

        if litestream_enabled():
            from ai_anime.modules.backup.public import migrate_state_tree
            from ai_anime.shared.runtime_paths import STATE_DIR

            try:
                await asyncio.to_thread(migrate_state_tree, Path(STATE_DIR))
            except Exception:
                logger.exception("WAL migration sweep failed (non-fatal)")
    except Exception:
        logger.exception("API startup failed while connecting to control-plane")
        raise


async def shutdown_application(application: FastAPI) -> None:
    warmup_task = getattr(
        application.state,
        "knowledge_graph_runtime_warmup",
        None,
    )
    if isinstance(warmup_task, asyncio.Task):
        if not warmup_task.done():
            warmup_task.cancel()
        await asyncio.gather(warmup_task, return_exceptions=True)
        application.state.knowledge_graph_runtime_warmup = None

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
