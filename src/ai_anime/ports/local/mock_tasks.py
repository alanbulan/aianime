"""Task backend that drives the desktop mock cloud adapter."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from ai_anime.ports.cloud import CloudAdapter, CloudTaskCancelled, CloudTaskRequest
from ai_anime.ports.tasks import QueuedTask, display_metadata_for_task
from ai_anime.project_context import require_project_home_node
from ai_anime.task_backend.limits import project_lane_effective_active_limit
from ai_anime.task_backend.queues import normalize_queue_kind
from ai_anime.task_state import ACTIVE_PROJECT_TASK_STATUSES, get_task_manager

from .mock_cloud import cloud_task_kind

logger = logging.getLogger(__name__)


class MockCloudTaskBackend:
    def __init__(self, adapter: CloudAdapter) -> None:
        self._adapter = adapter
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._cancelled: set[str] = set()

    async def enqueue_project_task(
        self,
        ctx,
        *,
        task_type: str,
        queue_kind: str = "default",
        episode: int = 0,
        beat_num: int | None = None,
        scope: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> QueuedTask:
        require_project_home_node(ctx, operation="enqueue mock cloud task")
        manager = get_task_manager()
        task_payload = payload or {}
        lane_name = normalize_queue_kind(queue_kind)
        kind = cloud_task_kind(task_type)
        metadata = {
            "backend": "mock-cloud",
            "cloud_adapter": self._adapter.name,
            "cloud_kind": kind,
            "queue_kind": lane_name,
            "project_id": ctx.project_id,
            **display_metadata_for_task(task_type, task_payload),
        }
        state, reserved = manager.reserve_task_for_project(
            ctx,
            task_type,
            episode,
            beat_num=beat_num,
            scope=scope,
            metadata=metadata,
            queue_kind=lane_name,
            project_lane_limit=project_lane_effective_active_limit(
                lane_name,
                eligible_user_count=1,
            ),
        )
        if not reserved and state.status in ACTIVE_PROJECT_TASK_STATUSES:
            return QueuedTask(task_state=state, backend="mock-cloud")

        manager.update_progress_for_project(
            ctx,
            task_type,
            episode,
            beat_num=beat_num,
            scope=scope,
            progress=0.0,
            current_task="Mock task queued",
            metadata=metadata,
            status="queued",
            expected_task_id=state.task_id,
        )
        request = CloudTaskRequest(
            task_id=state.task_id,
            task_type=task_type,
            kind=kind,
            project_id=ctx.project_id,
            episode=episode,
            beat_num=beat_num,
            scope=scope,
            payload=task_payload,
            output_dir=ctx.output_dir,
        )
        task = asyncio.create_task(
            self._run_task(
                ctx,
                request=request,
                metadata=metadata,
            )
        )
        self._tasks[state.task_id] = task
        task.add_done_callback(lambda _done, task_id=state.task_id: self._forget(task_id))
        return QueuedTask(task_state=state, backend="mock-cloud")

    async def _run_task(
        self,
        ctx,
        *,
        request: CloudTaskRequest,
        metadata: dict[str, Any],
    ) -> None:
        manager = get_task_manager()

        async def report_progress(progress: float, message: str) -> None:
            manager.update_progress_for_project(
                ctx,
                request.task_type,
                request.episode,
                beat_num=request.beat_num,
                scope=request.scope,
                progress=progress,
                current_task=message,
                metadata=metadata,
                status="running",
                expected_task_id=request.task_id,
            )

        try:
            result = await self._adapter.run_task(
                request,
                report_progress=report_progress,
                is_cancelled=lambda: request.task_id in self._cancelled,
            )
            if request.task_id in self._cancelled:
                raise CloudTaskCancelled("mock cloud task cancelled")
            manager.complete_task_for_project(
                ctx,
                request.task_type,
                request.episode,
                beat_num=request.beat_num,
                scope=request.scope,
                result=result.as_task_result(),
                current_task="Mock task completed",
                metadata=metadata,
                expected_task_id=request.task_id,
            )
        except (CloudTaskCancelled, asyncio.CancelledError):
            current = manager.get_task_for_project(
                ctx,
                request.task_type,
                request.episode,
                beat_num=request.beat_num,
                scope=request.scope,
            )
            if current and current.status not in {"completed", "failed", "cancelled"}:
                manager.update_progress_for_project(
                    ctx,
                    request.task_type,
                    request.episode,
                    beat_num=request.beat_num,
                    scope=request.scope,
                    progress=current.progress,
                    current_task="Mock task cancelled",
                    status="cancelled",
                    expected_task_id=request.task_id,
                )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Mock cloud task failed")
            manager.fail_task_for_project(
                ctx,
                request.task_type,
                request.episode,
                beat_num=request.beat_num,
                scope=request.scope,
                error=str(exc),
                current_task="Mock task failed",
                metadata=metadata,
                expected_task_id=request.task_id,
            )

    def _forget(self, task_id: str) -> None:
        self._tasks.pop(task_id, None)
        self._cancelled.discard(task_id)

    async def cancel_project_task(self, ctx, task_state) -> bool:
        self._cancelled.add(task_state.task_id)
        get_task_manager().update_progress_for_project(
            ctx,
            task_state.task_type,
            task_state.episode,
            beat_num=task_state.beat_num,
            scope=task_state.scope,
            progress=task_state.progress,
            current_task="Mock task cancelled",
            status="cancelled",
            expected_task_id=task_state.task_id,
        )
        task = self._tasks.get(task_state.task_id)
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        return True
