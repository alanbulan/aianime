"""Creative Canvas canonical-slot commit use cases."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.creative_canvas.application.canvas_events import (
    CreativeCanvasEventRecorder,
    RecordCreativeCanvasEventCommand,
)
from ai_anime.modules.creative_canvas.domain import CreativeCanvasEventActor
from ai_anime.modules.creative_canvas.domain.canvas_commits import (
    is_global_creative_canvas_slot,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class InvalidCreativeCanvasSlotCommit(ValueError):
    pass


class CreativeCanvasSlotSourceNotFound(LookupError):
    pass


class CreativeCanvasSlotBeatNotFound(LookupError):
    pass


@dataclass(frozen=True)
class CopyCreativeCanvasSlotCommand:
    context: ProjectContext
    project_dir: Path
    source_url: str
    target: Mapping[str, Any]


@dataclass(frozen=True)
class GetCreativeCanvasSlotImpactQuery:
    context: ProjectContext
    target: Mapping[str, Any]


@dataclass(frozen=True)
class CommitCreativeCanvasSlotCommand:
    context: ProjectContext
    project_id: str
    project_dir: Path
    source_url: str
    target: Mapping[str, Any]
    mark_stale: bool
    event_actor: CreativeCanvasEventActor


@dataclass(frozen=True)
class CreativeCanvasSlotCopyResult:
    target_path: Path
    target_url: str
    backup_path: Path | None
    image_adaptation: Mapping[str, Any]


class CreativeCanvasSlotCommitGateway(Protocol):
    def copy(
        self, command: CopyCreativeCanvasSlotCommand
    ) -> CreativeCanvasSlotCopyResult: ...

    async def impact(
        self,
        *,
        context: ProjectContext,
        target: Mapping[str, Any],
    ) -> Sequence[Mapping[str, Any]]: ...

    def record_stale_marks(
        self,
        *,
        project_dir: Path,
        target: Mapping[str, Any],
        impacted: Sequence[Mapping[str, Any]],
        source_url: str,
    ) -> int: ...

    async def sync_selected_background(
        self,
        *,
        context: ProjectContext,
        target: Mapping[str, Any],
    ) -> None: ...

    async def sync_identity_metadata(
        self,
        *,
        context: ProjectContext,
        target: Mapping[str, Any],
        target_path: Path,
    ) -> None: ...


class CreativeCanvasSlotCommitUseCases:
    def __init__(
        self,
        gateway: CreativeCanvasSlotCommitGateway,
        event_recorder: CreativeCanvasEventRecorder,
    ) -> None:
        self._gateway = gateway
        self._event_recorder = event_recorder

    def copy(
        self,
        command: CopyCreativeCanvasSlotCommand,
    ) -> CreativeCanvasSlotCopyResult:
        target = normalize_creative_canvas_slot_target(command.target)
        return self._gateway.copy(
            CopyCreativeCanvasSlotCommand(
                context=command.context,
                project_dir=command.project_dir,
                source_url=command.source_url,
                target=target,
            )
        )

    async def impact(
        self,
        query: GetCreativeCanvasSlotImpactQuery,
    ) -> Mapping[str, Any]:
        target = normalize_creative_canvas_slot_target(query.target)
        impacted = (
            list(await self._gateway.impact(context=query.context, target=target))
            if is_global_creative_canvas_slot(target)
            else []
        )
        return {
            "target": target,
            "affected_beats": impacted,
            "affected_count": len(impacted),
        }

    async def commit(
        self,
        command: CommitCreativeCanvasSlotCommand,
    ) -> Mapping[str, Any]:
        target = normalize_creative_canvas_slot_target(command.target)
        copied = self.copy(
            CopyCreativeCanvasSlotCommand(
                context=command.context,
                project_dir=command.project_dir,
                source_url=command.source_url,
                target=target,
            )
        )

        kind = target["kind"]
        if kind == "selected_background":
            await self._gateway.sync_selected_background(
                context=command.context,
                target=target,
            )

        impacted: list[Mapping[str, Any]] = []
        stale_marked = 0
        if command.mark_stale and is_global_creative_canvas_slot(target):
            impacted = list(
                await self._gateway.impact(
                    context=command.context,
                    target=target,
                )
            )
            stale_marked = self._gateway.record_stale_marks(
                project_dir=command.project_dir,
                target=target,
                impacted=impacted,
                source_url=command.source_url,
            )

        if kind in {"identity", "identity_costume", "identity_portrait"}:
            await self._gateway.sync_identity_metadata(
                context=command.context,
                target=target,
                target_path=copied.target_path,
            )

        self._event_recorder.record(
            RecordCreativeCanvasEventCommand(
                project_dir=Path(command.context.state_dir),
                project_id=command.project_id,
                canvas_id=None,
                event_type="canvas.push_committed",
                actor=command.event_actor,
                payload={
                    "source_url": command.source_url,
                    "target": target,
                    "target_path": str(copied.target_path),
                    "target_url": copied.target_url,
                    "backup": (str(copied.backup_path) if copied.backup_path else None),
                    "stale_marked": stale_marked,
                    "affected_count": len(impacted),
                },
            )
        )
        return {
            "target_path": str(copied.target_path),
            "target_url": copied.target_url,
            "backup": str(copied.backup_path) if copied.backup_path else None,
            "image_adaptation": dict(copied.image_adaptation),
            "stale_marked": stale_marked,
            "affected_count": len(impacted),
        }


def normalize_creative_canvas_slot_target(
    target: Mapping[str, Any],
) -> dict[str, Any]:
    if not isinstance(target, Mapping):
        raise InvalidCreativeCanvasSlotCommit("invalid slot target")
    kind = target.get("kind")
    if not isinstance(kind, str) or not kind.strip():
        raise InvalidCreativeCanvasSlotCommit("invalid slot target kind")
    normalized = dict(target)
    normalized["kind"] = kind.strip()
    return normalized


__all__ = [
    "CommitCreativeCanvasSlotCommand",
    "CopyCreativeCanvasSlotCommand",
    "CreativeCanvasSlotBeatNotFound",
    "CreativeCanvasSlotCommitGateway",
    "CreativeCanvasSlotCommitUseCases",
    "CreativeCanvasSlotCopyResult",
    "CreativeCanvasSlotSourceNotFound",
    "GetCreativeCanvasSlotImpactQuery",
    "InvalidCreativeCanvasSlotCommit",
    "normalize_creative_canvas_slot_target",
]
