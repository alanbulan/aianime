"""Creative Canvas projected-subgraph application services."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.creative_canvas.application.canvas_events import (
    CreativeCanvasEventRecorder,
    RecordCreativeCanvasEventCommand,
)
from ai_anime.modules.creative_canvas.application.canvas_writes import (
    CreativeCanvasDocumentBaseRevisionRequired,
    CreativeCanvasDocumentRevisionConflict,
)
from ai_anime.modules.creative_canvas.domain import CreativeCanvasEventActor
from ai_anime.modules.project_workspace.public import ProjectContext


class InvalidCreativeCanvasProjectionRequest(ValueError):
    pass


class CreativeCanvasProjectionSourceNotFound(LookupError):
    pass


class CreativeCanvasProjectionCanvasNotFound(LookupError):
    def __init__(self) -> None:
        super().__init__("canvas not found")


@dataclass(frozen=True)
class BuildCreativeCanvasProjectionQuery:
    context: ProjectContext
    project_dir: Path
    request: Mapping[str, Any]


@dataclass(frozen=True)
class ProjectCreativeCanvasProjectionCommand:
    context: ProjectContext
    project_id: str
    project_dir: Path
    canvas_id: str
    request: Mapping[str, Any]
    base_revision: int
    force_refresh: bool
    actor_id: str
    event_actor: CreativeCanvasEventActor


@dataclass(frozen=True)
class RemoveCreativeCanvasProjectionCommand:
    context: ProjectContext
    project_id: str
    canvas_id: str
    projection_key: str
    base_revision: int
    actor_id: str
    event_actor: CreativeCanvasEventActor


@dataclass(frozen=True)
class GetCreativeCanvasProjectionStatusQuery:
    context: ProjectContext
    project_dir: Path
    canvas_id: str
    projection_keys: Sequence[str] | None


@dataclass(frozen=True)
class CreativeCanvasProjectionBuild:
    payload: Mapping[str, Any]
    request: Mapping[str, Any]
    preset_key: str
    facts_signature: str


@dataclass(frozen=True)
class CreativeCanvasProjectionMutationResult:
    response: Mapping[str, Any]
    event_type: str
    event_payload: Mapping[str, Any]


class CreativeCanvasProjectionGateway(Protocol):
    async def build_projection(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        request: Mapping[str, Any],
    ) -> CreativeCanvasProjectionBuild: ...

    def project(
        self,
        command: ProjectCreativeCanvasProjectionCommand,
        projection: CreativeCanvasProjectionBuild,
    ) -> CreativeCanvasProjectionMutationResult: ...

    def remove(
        self,
        command: RemoveCreativeCanvasProjectionCommand,
    ) -> CreativeCanvasProjectionMutationResult: ...

    def read_document(
        self,
        *,
        context: ProjectContext,
        canvas_id: str,
    ) -> Mapping[str, Any] | None: ...


class CreativeCanvasProjectionUseCases:
    def __init__(
        self,
        gateway: CreativeCanvasProjectionGateway,
        event_recorder: CreativeCanvasEventRecorder,
    ) -> None:
        self._gateway = gateway
        self._event_recorder = event_recorder

    async def build(
        self,
        query: BuildCreativeCanvasProjectionQuery,
    ) -> Mapping[str, Any]:
        projection = await self._gateway.build_projection(
            context=query.context,
            project_dir=query.project_dir,
            request=_normalize_projection_request(query.request),
        )
        payload = projection.payload
        metadata = payload.get("metadata")
        return {
            "projection_key": projection.request["projection_key"],
            "facts_signature": projection.facts_signature,
            "nodes": payload.get("nodes") or [],
            "edges": payload.get("edges") or [],
            "metadata": metadata if isinstance(metadata, dict) else None,
        }

    async def project(
        self,
        command: ProjectCreativeCanvasProjectionCommand,
    ) -> Mapping[str, Any]:
        projection = await self._gateway.build_projection(
            context=command.context,
            project_dir=command.project_dir,
            request=_normalize_projection_request(command.request),
        )
        try:
            result = self._gateway.project(command, projection)
        except (
            CreativeCanvasDocumentBaseRevisionRequired,
            CreativeCanvasDocumentRevisionConflict,
        ) as exc:
            self._record(
                context=command.context,
                project_id=command.project_id,
                canvas_id=command.canvas_id,
                event_type="canvas.projection_refresh.conflict",
                actor=command.event_actor,
                payload={
                    "scope": projection.request["scope"],
                    "preset_key": projection.preset_key,
                    "projection_key": projection.request["projection_key"],
                    "base_revision": command.base_revision,
                    "error": str(exc),
                },
            )
            raise
        self._record_result(command, result)
        return result.response

    def remove(
        self,
        command: RemoveCreativeCanvasProjectionCommand,
    ) -> Mapping[str, Any]:
        try:
            result = self._gateway.remove(command)
        except (
            CreativeCanvasDocumentBaseRevisionRequired,
            CreativeCanvasDocumentRevisionConflict,
        ) as exc:
            self._record(
                context=command.context,
                project_id=command.project_id,
                canvas_id=command.canvas_id,
                event_type="canvas.projection_remove.conflict",
                actor=command.event_actor,
                payload={
                    "projection_key": command.projection_key,
                    "base_revision": command.base_revision,
                    "error": str(exc),
                },
            )
            raise
        self._record_result(command, result)
        return result.response

    async def status(
        self,
        query: GetCreativeCanvasProjectionStatusQuery,
    ) -> Mapping[str, Any]:
        existing = self._gateway.read_document(
            context=query.context,
            canvas_id=query.canvas_id,
        )
        if not isinstance(existing, Mapping):
            raise CreativeCanvasProjectionCanvasNotFound()

        metadata = existing.get("metadata")
        projections = (
            metadata.get("projections") if isinstance(metadata, dict) else None
        )
        if not isinstance(projections, dict):
            return {
                "canvas_id": query.canvas_id,
                "revision": existing.get("revision"),
                "projections": [],
            }

        requested_keys = set(query.projection_keys or [])
        keys = [
            key
            for key in sorted(projections)
            if isinstance(key, str) and (not requested_keys or key in requested_keys)
        ]
        statuses: list[dict[str, Any]] = []
        for projection_key in keys:
            projection = projections.get(projection_key)
            if not isinstance(projection, dict):
                continue
            request = projection.get("request")
            if not isinstance(request, dict):
                continue
            try:
                normalized_request = _normalize_projection_request(
                    {**request, "projection_key": projection_key}
                )
                current = await self._gateway.build_projection(
                    context=query.context,
                    project_dir=query.project_dir,
                    request=normalized_request,
                )
            except Exception as exc:  # noqa: BLE001 - report each stale-check error
                statuses.append(
                    {
                        "projection_key": projection_key,
                        "stale": False,
                        "error": str(exc),
                    }
                )
                continue

            stored_signature = projection.get("facts_signature")
            stored_signature = (
                stored_signature if isinstance(stored_signature, str) else ""
            )
            statuses.append(
                {
                    "projection_key": projection_key,
                    "scope": normalized_request["scope"],
                    "episode": normalized_request.get("episode"),
                    "beat": normalized_request.get("beat"),
                    "asset_kind": normalized_request.get("asset_kind"),
                    "asset_id": normalized_request.get("asset_id"),
                    "stored_facts_signature": stored_signature,
                    "current_facts_signature": current.facts_signature,
                    "stale": stored_signature != current.facts_signature,
                }
            )

        return {
            "canvas_id": query.canvas_id,
            "revision": existing.get("revision"),
            "projections": statuses,
        }

    def _record_result(
        self,
        command: (
            ProjectCreativeCanvasProjectionCommand
            | RemoveCreativeCanvasProjectionCommand
        ),
        result: CreativeCanvasProjectionMutationResult,
    ) -> None:
        self._record(
            context=command.context,
            project_id=command.project_id,
            canvas_id=command.canvas_id,
            event_type=result.event_type,
            actor=command.event_actor,
            payload=result.event_payload,
        )

    def _record(
        self,
        *,
        context: ProjectContext,
        project_id: str,
        canvas_id: str,
        event_type: str,
        actor: CreativeCanvasEventActor,
        payload: Mapping[str, Any],
    ) -> None:
        self._event_recorder.record(
            RecordCreativeCanvasEventCommand(
                project_dir=Path(context.state_dir),
                project_id=project_id,
                canvas_id=canvas_id,
                event_type=event_type,
                actor=actor,
                payload=payload,
            )
        )


def _normalize_projection_request(
    request: Mapping[str, Any],
) -> dict[str, Any]:
    scope = request.get("scope", "beat")
    if scope not in {"episode", "beat", "asset", "blank"}:
        raise InvalidCreativeCanvasProjectionRequest(
            f"unsupported preset scope: {scope}"
        )

    projection_key = request.get("projection_key")
    if not isinstance(projection_key, str) or not 1 <= len(projection_key) <= 160:
        raise InvalidCreativeCanvasProjectionRequest("invalid projection_key")

    primary_slot = request.get("primary_slot", "render")
    if not isinstance(primary_slot, str):
        raise InvalidCreativeCanvasProjectionRequest("invalid primary_slot")

    normalized: dict[str, Any] = {
        "scope": scope,
        "primary_slot": primary_slot,
        "projection_key": projection_key,
    }
    for key in ("episode", "beat"):
        value = request.get(key)
        if value is None:
            continue
        if not isinstance(value, int) or isinstance(value, bool):
            raise InvalidCreativeCanvasProjectionRequest(f"invalid {key}")
        normalized[key] = value
    for key in ("asset_kind", "character", "identity_id", "asset_id"):
        value = request.get(key)
        if value is None:
            continue
        if not isinstance(value, str):
            raise InvalidCreativeCanvasProjectionRequest(f"invalid {key}")
        normalized[key] = value
    return normalized


__all__ = [
    "BuildCreativeCanvasProjectionQuery",
    "CreativeCanvasProjectionBuild",
    "CreativeCanvasProjectionCanvasNotFound",
    "CreativeCanvasProjectionGateway",
    "CreativeCanvasProjectionMutationResult",
    "CreativeCanvasProjectionSourceNotFound",
    "CreativeCanvasProjectionUseCases",
    "GetCreativeCanvasProjectionStatusQuery",
    "InvalidCreativeCanvasProjectionRequest",
    "ProjectCreativeCanvasProjectionCommand",
    "RemoveCreativeCanvasProjectionCommand",
]
