"""Commands, ports, and failures for Creative Canvas skill runs."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Never, Protocol

from ai_anime.modules.creative_canvas.application.skill_catalog import (
    ResolvedSkillInput,
    SkillErrorEnvelope,
    SkillRunRequest,
    SkillRunResponse,
)
from ai_anime.modules.creative_canvas.domain import CreativeCanvasEventActor
from ai_anime.modules.project_workspace.public import ProjectContext


CreativeCanvasSkillRunErrorKind = Literal[
    "bad_request",
    "not_found",
    "conflict",
    "validation",
    "runtime",
    "unsupported",
]


class CreativeCanvasSkillRunRejected(Exception):
    def __init__(
        self,
        *,
        kind: CreativeCanvasSkillRunErrorKind,
        code: str,
        category: str,
        message: str,
        retryable: bool = False,
        user_action_hint: str | None = None,
        enveloped: bool = True,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.error = SkillErrorEnvelope(
            code=code,
            category=category,
            message=message,
            retryable=retryable,
            user_action_hint=user_action_hint,
        )
        self.enveloped = enveloped

    @property
    def detail(self) -> str | dict[str, Any]:
        if not self.enveloped:
            return self.error.message
        return self.error.model_dump(mode="json")


class CreativeCanvasSkillBeatMissing(LookupError):
    pass


@dataclass(frozen=True)
class RunCreativeCanvasSkillCommand:
    context: ProjectContext
    project_id: str
    project_dir: Path
    skill_id: str
    request: SkillRunRequest
    actor: CreativeCanvasEventActor


@dataclass(frozen=True)
class GetCreativeCanvasSkillRunResultQuery:
    context: ProjectContext
    project_id: str
    project_dir: Path
    run_id: str
    actor: CreativeCanvasEventActor


@dataclass(frozen=True)
class CreativeCanvasDirectorCommitResult:
    path: Path
    control_bundle: Mapping[str, Any] | None = None


@dataclass(frozen=True)
class CreativeCanvasSkillTaskSnapshot:
    status: str | None
    error: str | None = None
    result: Mapping[str, Any] | None = None


class CreativeCanvasSkillRunRepository(Protocol):
    def read_run(self, project_dir: Path, run_id: str) -> dict[str, Any] | None: ...

    def write_run(
        self,
        project_dir: Path,
        run_id: str,
        metadata: Mapping[str, Any],
    ) -> None: ...

    def read_idempotency(
        self,
        project_dir: Path,
        skill_id: str,
        idempotency_key: str,
    ) -> dict[str, Any] | None: ...

    def write_idempotency(
        self,
        project_dir: Path,
        skill_id: str,
        idempotency_key: str,
        request_hash: str,
        response: SkillRunResponse,
    ) -> None: ...


class CreativeCanvasSkillWorkspace(Protocol):
    def is_preset_managed(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        canvas_id: str | None,
        skill_node_id: str | None,
    ) -> bool: ...

    def resolve_media_path(self, project_dir: Path, image_url: str) -> Path: ...

    def media_url(
        self,
        context: ProjectContext,
        project_dir: Path,
        path: Path,
    ) -> str | None: ...

    def build_standalone_sketch_prompt(
        self,
        *,
        input_item: ResolvedSkillInput,
        project_dir: Path,
        reference_path: str,
        reference_role: str,
        aspect_ratio: str,
        model: str,
    ) -> str: ...

    async def commit_selected_background(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        source_path: Path,
    ) -> Path: ...

    def commit_director_combined(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        source_path: Path,
        control_bundle: Mapping[str, Any],
    ) -> CreativeCanvasDirectorCommitResult: ...

    def task_result_url(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        task_result: Mapping[str, Any] | None,
    ) -> str | None: ...

    def slot_target_url(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        output_metadata: Mapping[str, Any],
    ) -> str | None: ...

    def job_output_path(
        self,
        project_dir: Path,
        task_type: str,
        job_id: str,
    ) -> Path | None: ...


class CreativeCanvasSkillTaskReader(Protocol):
    def read(
        self,
        *,
        context: ProjectContext,
        task_type: str,
        episode: int,
        beat_num: int | None,
        scope: str,
    ) -> CreativeCanvasSkillTaskSnapshot | None: ...


class CreativeCanvasFrameReviewer(Protocol):
    async def review(self, prompt: str) -> str | None: ...


def reject_creative_canvas_skill_run(
    kind: CreativeCanvasSkillRunErrorKind,
    *,
    code: str,
    category: str,
    message: str,
    retryable: bool = False,
    user_action_hint: str | None = None,
    enveloped: bool = True,
) -> Never:
    raise CreativeCanvasSkillRunRejected(
        kind=kind,
        code=code,
        category=category,
        message=message,
        retryable=retryable,
        user_action_hint=user_action_hint,
        enveloped=enveloped,
    )


__all__ = [
    "CreativeCanvasDirectorCommitResult",
    "CreativeCanvasFrameReviewer",
    "CreativeCanvasSkillBeatMissing",
    "CreativeCanvasSkillRunRejected",
    "CreativeCanvasSkillRunRepository",
    "CreativeCanvasSkillTaskReader",
    "CreativeCanvasSkillTaskSnapshot",
    "CreativeCanvasSkillWorkspace",
    "GetCreativeCanvasSkillRunResultQuery",
    "RunCreativeCanvasSkillCommand",
    "reject_creative_canvas_skill_run",
]
