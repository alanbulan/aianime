"""Creative Canvas preset-factory application services."""

from __future__ import annotations

from collections.abc import Mapping
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


class InvalidCreativeCanvasPresetRequest(ValueError):
    pass


class CreativeCanvasPresetSourceNotFound(LookupError):
    pass


class CreativeCanvasPresetCanvasNotFound(LookupError):
    def __init__(self) -> None:
        super().__init__("canvas not found")


class CreativeCanvasPresetMismatch(ValueError):
    def __init__(self) -> None:
        super().__init__("canvas preset_key does not match requested preset")


@dataclass(frozen=True)
class CreateCreativeCanvasPresetCommand:
    context: ProjectContext
    project_id: str
    project_dir: Path
    request: Mapping[str, Any]
    canvas_id: str | None
    overwrite_existing: bool
    base_revision: int | None
    actor_id: str
    event_actor: CreativeCanvasEventActor


@dataclass(frozen=True)
class CreativeCanvasPresetPlan:
    request: Mapping[str, Any]
    preset_key: str
    canonical_canvas_id: str


@dataclass(frozen=True)
class CreativeCanvasPresetBuild:
    plan: CreativeCanvasPresetPlan
    payload: Mapping[str, Any]


@dataclass(frozen=True)
class CreativeCanvasPresetMutationResult:
    response: Mapping[str, Any]
    event_type: str
    event_payload: Mapping[str, Any]


class CreativeCanvasPresetBuilder(Protocol):
    def plan(self, request: Mapping[str, Any]) -> CreativeCanvasPresetPlan: ...

    async def build(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        plan: CreativeCanvasPresetPlan,
    ) -> CreativeCanvasPresetBuild: ...


class CreativeCanvasPresetGateway(Protocol):
    def find_reusable(
        self,
        *,
        context: ProjectContext,
        plan: CreativeCanvasPresetPlan,
    ) -> str | None: ...

    def validate_overwrite(
        self,
        *,
        context: ProjectContext,
        canvas_id: str,
        plan: CreativeCanvasPresetPlan,
    ) -> None: ...

    def save(
        self,
        command: CreateCreativeCanvasPresetCommand,
        *,
        preset: CreativeCanvasPresetBuild,
        canvas_id: str,
        overwrite_existing: bool,
    ) -> CreativeCanvasPresetMutationResult: ...


class CreativeCanvasPresetUseCases:
    def __init__(
        self,
        builder: CreativeCanvasPresetBuilder,
        gateway: CreativeCanvasPresetGateway,
        event_recorder: CreativeCanvasEventRecorder,
    ) -> None:
        self._builder = builder
        self._gateway = gateway
        self._event_recorder = event_recorder

    async def create(
        self,
        command: CreateCreativeCanvasPresetCommand,
    ) -> Mapping[str, Any]:
        plan = self._builder.plan(
            normalize_creative_canvas_preset_request(command.request)
        )
        overwrite_canvas_id = (
            str(command.canvas_id or "").strip()
            if command.overwrite_existing and str(command.canvas_id or "").strip()
            else ""
        )
        if not overwrite_canvas_id:
            reusable = self._gateway.find_reusable(
                context=command.context,
                plan=plan,
            )
            if reusable:
                return {
                    "canvas_id": reusable,
                    "reused": True,
                    "url": f"/?p={command.project_id}&canvas={reusable}",
                }
        else:
            self._gateway.validate_overwrite(
                context=command.context,
                canvas_id=overwrite_canvas_id,
                plan=plan,
            )

        preset = await self._builder.build(
            context=command.context,
            project_dir=command.project_dir,
            plan=plan,
        )
        canvas_id = overwrite_canvas_id or plan.canonical_canvas_id
        try:
            result = self._gateway.save(
                command,
                preset=preset,
                canvas_id=canvas_id,
                overwrite_existing=bool(overwrite_canvas_id),
            )
        except (
            CreativeCanvasDocumentBaseRevisionRequired,
            CreativeCanvasDocumentRevisionConflict,
        ) as exc:
            self._record(
                command=command,
                canvas_id=canvas_id,
                event_type="canvas.preset_refresh.conflict",
                payload={
                    "scope": plan.request["scope"],
                    "preset_key": plan.preset_key,
                    "base_revision": command.base_revision,
                    "error": str(exc),
                },
            )
            raise

        self._record(
            command=command,
            canvas_id=canvas_id,
            event_type=result.event_type,
            payload=result.event_payload,
        )
        return result.response

    def _record(
        self,
        *,
        command: CreateCreativeCanvasPresetCommand,
        canvas_id: str,
        event_type: str,
        payload: Mapping[str, Any],
    ) -> None:
        self._event_recorder.record(
            RecordCreativeCanvasEventCommand(
                project_dir=Path(command.context.state_dir),
                project_id=command.project_id,
                canvas_id=canvas_id,
                event_type=event_type,
                actor=command.event_actor,
                payload=payload,
            )
        )


def normalize_creative_canvas_preset_request(
    request: Mapping[str, Any],
) -> dict[str, Any]:
    scope = request.get("scope", "beat")
    if scope not in {"episode", "beat", "asset", "blank"}:
        raise InvalidCreativeCanvasPresetRequest(f"unsupported preset scope: {scope}")

    primary_slot = request.get("primary_slot", "render")
    if not isinstance(primary_slot, str):
        raise InvalidCreativeCanvasPresetRequest("invalid primary_slot")

    normalized: dict[str, Any] = {
        "scope": scope,
        "primary_slot": primary_slot,
    }
    for key in ("episode", "beat"):
        value = request.get(key)
        if value is None:
            continue
        if not isinstance(value, int) or isinstance(value, bool):
            raise InvalidCreativeCanvasPresetRequest(f"invalid {key}")
        normalized[key] = value
    for key in ("asset_kind", "character", "identity_id", "asset_id"):
        value = request.get(key)
        if value is None:
            continue
        if not isinstance(value, str):
            raise InvalidCreativeCanvasPresetRequest(f"invalid {key}")
        normalized[key] = value
    return normalized


__all__ = [
    "CreateCreativeCanvasPresetCommand",
    "CreativeCanvasPresetBuild",
    "CreativeCanvasPresetBuilder",
    "CreativeCanvasPresetCanvasNotFound",
    "CreativeCanvasPresetGateway",
    "CreativeCanvasPresetMismatch",
    "CreativeCanvasPresetMutationResult",
    "CreativeCanvasPresetPlan",
    "CreativeCanvasPresetSourceNotFound",
    "CreativeCanvasPresetUseCases",
    "InvalidCreativeCanvasPresetRequest",
    "normalize_creative_canvas_preset_request",
]
