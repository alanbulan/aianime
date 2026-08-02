"""Creative Canvas skill-run application service."""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from ai_anime.modules.creative_canvas.application.canvas_commits import (
    CopyCreativeCanvasSlotCommand,
    CreativeCanvasSlotCommitUseCases,
)
from ai_anime.modules.creative_canvas.application.canvas_events import (
    CreativeCanvasEventRecorder,
    RecordCreativeCanvasEventCommand,
)
from ai_anime.modules.creative_canvas.application.image_generation import (
    CreativeCanvasImageGenerationReferenceMissing,
    CreativeCanvasImageGenerationUseCases,
    InvalidCreativeCanvasImageGenerationRequest,
    StartCreativeCanvasImageGenerationCommand,
)
from ai_anime.modules.creative_canvas.application.mainline_generation import (
    MAINLINE_SCENE_360_IMAGE_SIZE,
    CreativeCanvasMainlineBeatMissing,
    CreativeCanvasMainlineGenerationUseCases,
    CreativeCanvasMainlineMediaMissing,
    InvalidCreativeCanvasMainlineGeneration,
    StartCreativeCanvasBackgroundSketchCommand,
    StartCreativeCanvasDirectorSketchCommand,
    StartCreativeCanvasFrameFromContextCommand,
    StartCreativeCanvasScene360Command,
)
from ai_anime.modules.creative_canvas.application.skill_catalog import (
    CreativeCanvasSkillCatalogQueries,
    ResolvedSkillInput,
    SkillDefinition,
    SkillErrorEnvelope,
    SkillRunOutput,
    SkillRunRequest,
    SkillRunResponse,
    SkillRunResult,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
)
from ai_anime.modules.creative_canvas.application.skill_run_contracts import (
    CreativeCanvasFrameReviewer,
    CreativeCanvasSkillBeatMissing,
    CreativeCanvasSkillRunRepository,
    CreativeCanvasSkillTaskReader,
    CreativeCanvasSkillWorkspace,
    GetCreativeCanvasSkillRunResultQuery,
    RunCreativeCanvasSkillCommand,
    reject_creative_canvas_skill_run as _reject,
)
from ai_anime.modules.creative_canvas.application.skill_run_inputs import (
    _canvas_references_from_inputs,
    _dict_extra,
    _episode_and_beat_from_input,
    _filter_canvas_references_by_beat_context,
    _input_extra,
    _required_image_url,
    _required_input,
    _single_input,
    _slot_target_for_input,
    creative_canvas_skill_output_metadata,
    group_and_validate_creative_canvas_skill_inputs,
)
from ai_anime.modules.creative_canvas.domain.mainline_generation import (
    beat_context_as_prompt_beat,
    build_scene_360_prompt,
    is_standalone_beat_context,
    normalize_mainline_aspect_ratio,
    normalize_mainline_frame_quality,
)
from ai_anime.modules.creative_canvas.domain.skill_runs import (
    creative_canvas_skill_background_reference_mode,
    creative_canvas_skill_request_hash,
    creative_canvas_skill_status_from_task_status,
    deterministic_creative_canvas_frame_review,
)


logger = logging.getLogger(__name__)

class CreativeCanvasSkillRunUseCases:
    def __init__(
        self,
        catalog: CreativeCanvasSkillCatalogQueries,
        repository: CreativeCanvasSkillRunRepository,
        workspace: CreativeCanvasSkillWorkspace,
        tasks: CreativeCanvasSkillTaskReader,
        reviewer: CreativeCanvasFrameReviewer,
        job_ids: CreativeCanvasJobIds,
        mainline_generation: CreativeCanvasMainlineGenerationUseCases,
        image_generation: CreativeCanvasImageGenerationUseCases,
        slot_commits: CreativeCanvasSlotCommitUseCases,
        events: CreativeCanvasEventRecorder,
    ) -> None:
        self._catalog = catalog
        self._repository = repository
        self._workspace = workspace
        self._tasks = tasks
        self._reviewer = reviewer
        self._job_ids = job_ids
        self._mainline_generation = mainline_generation
        self._image_generation = image_generation
        self._slot_commits = slot_commits
        self._events = events

    def _record_event(
        self,
        command: RunCreativeCanvasSkillCommand | GetCreativeCanvasSkillRunResultQuery,
        event_type: str,
        payload: Mapping[str, Any],
        *,
        canvas_id: str | None,
    ) -> None:
        self._events.record(
            RecordCreativeCanvasEventCommand(
                project_dir=command.project_dir,
                project_id=command.project_id,
                canvas_id=canvas_id,
                event_type=event_type,
                actor=command.actor,
                payload=payload,
            )
        )

    def _idempotent_response(
        self,
        command: RunCreativeCanvasSkillCommand,
    ) -> tuple[str | None, SkillRunResponse | None]:
        body = command.request
        idempotency_key = (body.idempotency_key or "").strip()
        if not idempotency_key:
            return None, None
        request_hash = creative_canvas_skill_request_hash(
            body.model_dump(mode="json", exclude={"idempotency_key"})
        )
        record = self._repository.read_idempotency(
            command.project_dir,
            command.skill_id,
            idempotency_key,
        )
        if record is None:
            return request_hash, None
        if record.get("request_hash") != request_hash:
            _reject(
                "conflict",
                code="skill_run_idempotency_conflict",
                category="conflict",
                message="idempotency key reused with different skill run request",
                user_action_hint=(
                    "Retry with a new idempotency key for a changed request."
                ),
            )
        response = record.get("response")
        if not isinstance(response, dict):
            _reject(
                "runtime",
                code="skill_run_idempotency_record_invalid",
                category="runtime",
                message="invalid skill run idempotency record",
                retryable=True,
                user_action_hint=(
                    "Retry the skill run or contact support if this repeats."
                ),
            )
        return request_hash, SkillRunResponse(**response)

    def _persist_idempotency_response(
        self,
        command: RunCreativeCanvasSkillCommand,
        request_hash: str | None,
        response: SkillRunResponse,
    ) -> None:
        idempotency_key = (command.request.idempotency_key or "").strip()
        if not idempotency_key or not request_hash:
            return
        self._repository.write_idempotency(
            command.project_dir,
            command.skill_id,
            idempotency_key,
            request_hash,
            response,
        )

    @staticmethod
    async def _start_mainline_task(
        task: Any,
    ) -> CreativeCanvasTaskReceipt:
        try:
            return await task
        except InvalidCreativeCanvasMainlineGeneration as exc:
            _reject(
                "bad_request",
                code="skill_generation_invalid",
                category="validation",
                message=str(exc),
                enveloped=False,
            )
        except (CreativeCanvasMainlineBeatMissing, CreativeCanvasMainlineMediaMissing) as exc:
            _reject(
                "not_found",
                code="skill_generation_source_missing",
                category="not_found",
                message=str(exc),
                enveloped=False,
            )

    @staticmethod
    def _scene_id_from_input(scene_master: ResolvedSkillInput | None) -> str:
        target = _slot_target_for_input(scene_master)
        scene_id = target.get("scene_id") if isinstance(target, dict) else None
        if scene_id:
            return str(scene_id)
        _reject(
            "validation",
            code="skill_scene_master_missing_scene_id",
            category="validation",
            message="scene_master input must include slot_target.scene_id",
            user_action_hint=(
                "Connect a scene master node that belongs to a mainline scene."
            ),
        )

    @staticmethod
    def _scene_prompt(scene_input: ResolvedSkillInput | None) -> str:
        if scene_input is None:
            return ""
        return str(scene_input.text or _input_extra(scene_input, "content") or "").strip()

    def _source_path(
        self,
        command: RunCreativeCanvasSkillCommand,
        source_url: str,
    ) -> Path:
        try:
            source_path = self._workspace.resolve_media_path(
                command.project_dir,
                source_url,
            )
        except ValueError as exc:
            _reject(
                "validation",
                code="skill_input_media_url_unsupported",
                category="validation",
                message=str(exc),
                user_action_hint="Use media stored in the current project.",
            )
        if not source_path.exists() or not source_path.is_file():
            _reject(
                "not_found",
                code="skill_input_media_missing",
                category="not_found",
                message="source image file not found",
                user_action_hint="Refresh the canvas or choose an existing image.",
            )
        return source_path

    async def _run_set_selected_background(
        self,
        command: RunCreativeCanvasSkillCommand,
        skill: SkillDefinition,
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
        *,
        idempotency_request_hash: str | None,
        auto_commit: bool,
    ) -> SkillRunResponse:
        body = command.request
        beat_input = _single_input(grouped, "beat_context")
        source = _single_input(grouped, "source_image")
        standalone_context = is_standalone_beat_context(
            beat_input.beat_context if beat_input else None
        )
        if standalone_context:
            auto_commit = False
            episode = beat = None
        else:
            episode, beat = _episode_and_beat_from_input(beat_input)
        source_url = (source.image_url if source else "") or ""
        if not source_url:
            _reject(
                "validation",
                code="skill_input_missing_field",
                category="validation",
                message="source_image must include image_url",
                user_action_hint="Connect an image source before running the skill.",
            )
        source_path = self._source_path(command, source_url)

        committed = False
        if auto_commit:
            try:
                output_path = await self._workspace.commit_selected_background(
                    context=command.context,
                    project_dir=command.project_dir,
                    episode=int(episode or 0),
                    beat=int(beat or 0),
                    source_path=source_path,
                )
            except CreativeCanvasSkillBeatMissing as exc:
                _reject(
                    "not_found",
                    code="skill_beat_not_found",
                    category="not_found",
                    message=str(exc),
                    user_action_hint="Reconnect a valid Beat Context node.",
                )
            committed = True
        else:
            output_path = source_path
        image_url = self._workspace.media_url(
            command.context,
            command.project_dir,
            output_path,
        )
        if not image_url:
            _reject(
                "runtime",
                code="skill_output_url_unavailable",
                category="runtime",
                message="skill output could not be mapped to project media",
                retryable=True,
            )

        output = creative_canvas_skill_output_metadata(
            skill,
            grouped,
            auto_commit=auto_commit,
        )
        output["image_url"] = image_url
        if not auto_commit:
            output["pushable"] = True
        if committed:
            output.update(
                pushable=False,
                committed=True,
                committed_slot_url=image_url,
            )
        run_id = f"freezone.set_selected_background:{self._job_ids.new_id()}"
        self._repository.write_run(
            command.project_dir,
            run_id,
            {
                "run_id": run_id,
                "skill_id": skill.id,
                "status": "completed",
                "outputs": [output],
                "canvas_id": body.canvas_id,
                "skill_node_id": body.skill_node_id,
            },
        )
        response = SkillRunResponse(run_id=run_id, status="completed")
        self._record_event(
            command,
            "skill.run_completed",
            {
                "skill_id": skill.id,
                "skill_node_id": body.skill_node_id,
                "run_id": run_id,
                "status": response.status,
                "output_count": 1,
            },
            canvas_id=body.canvas_id,
        )
        self._persist_idempotency_response(
            command,
            idempotency_request_hash,
            response,
        )
        return response

    async def _run_set_director_combined(
        self,
        command: RunCreativeCanvasSkillCommand,
        skill: SkillDefinition,
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
        *,
        idempotency_request_hash: str | None,
        auto_commit: bool,
    ) -> SkillRunResponse:
        body = command.request
        beat_input = _single_input(grouped, "beat_context")
        source = _single_input(grouped, "source_image")
        standalone_context = is_standalone_beat_context(
            beat_input.beat_context if beat_input else None
        )
        if standalone_context:
            auto_commit = False
            episode = beat = None
        else:
            episode, beat = _episode_and_beat_from_input(beat_input)
        source_url = (source.image_url if source else "") or ""
        if not source_url:
            _reject(
                "validation",
                code="skill_input_missing_field",
                category="validation",
                message="source_image must include image_url",
                user_action_hint=(
                    "Connect an image source before running the skill, or use 3GS capture."
                ),
            )
        source_path = self._source_path(command, source_url)
        source_bundle = _dict_extra(source, "director_control_bundle") if source else {}

        committed = False
        director_bundle: Mapping[str, Any] | None = None
        if auto_commit:
            committed_result = self._workspace.commit_director_combined(
                context=command.context,
                project_dir=command.project_dir,
                episode=int(episode or 0),
                beat=int(beat or 0),
                source_path=source_path,
                control_bundle=source_bundle,
            )
            output_path = committed_result.path
            director_bundle = committed_result.control_bundle
            committed = True
        else:
            output_path = source_path
            director_bundle = source_bundle or None
        image_url = self._workspace.media_url(
            command.context,
            command.project_dir,
            output_path,
        )
        if not image_url:
            _reject(
                "runtime",
                code="skill_output_url_unavailable",
                category="runtime",
                message="skill output could not be mapped to project media",
                retryable=True,
            )

        output = creative_canvas_skill_output_metadata(
            skill,
            grouped,
            auto_commit=auto_commit,
        )
        output["image_url"] = image_url
        output["label"] = skill.outputs[0].label
        if director_bundle:
            output["director_control_bundle"] = dict(director_bundle)
        if not standalone_context:
            output["mainline_context"] = [
                {
                    "kind": "director_combined",
                    "episode": int(episode or 0),
                    "beat": int(beat or 0),
                    "role": "director_combined",
                    "sourceUrl": image_url,
                }
            ]
        if committed:
            output.update(
                pushable=False,
                committed=True,
                committed_slot_url=image_url,
            )
        run_id = f"freezone.set_director_combined:{self._job_ids.new_id()}"
        self._repository.write_run(
            command.project_dir,
            run_id,
            {
                "run_id": run_id,
                "skill_id": skill.id,
                "status": "completed",
                "outputs": [output],
                "canvas_id": body.canvas_id,
                "skill_node_id": body.skill_node_id,
            },
        )
        response = SkillRunResponse(run_id=run_id, status="completed")
        self._record_event(
            command,
            "skill.run_completed",
            {
                "skill_id": skill.id,
                "skill_node_id": body.skill_node_id,
                "run_id": run_id,
                "status": response.status,
                "output_count": 1,
            },
            canvas_id=body.canvas_id,
        )
        self._persist_idempotency_response(
            command,
            idempotency_request_hash,
            response,
        )
        return response

    @staticmethod
    def _auto_commit_target(output: Mapping[str, Any]) -> dict[str, Any] | None:
        if output.get("pushable") is not True or output.get("auto_commit") is not True:
            return None
        target = output.get("slot_target")
        if not isinstance(target, dict) or not target.get("kind"):
            return None
        return dict(target)

    async def _finalize_outputs(
        self,
        query: GetCreativeCanvasSkillRunResultQuery,
        metadata: dict[str, Any],
        outputs: Sequence[Mapping[str, Any]],
    ) -> list[dict[str, Any]]:
        finalized: list[dict[str, Any]] = []
        changed = False
        for output in outputs:
            item = dict(output)
            target = self._auto_commit_target(item)
            image_url = str(item.get("image_url") or "").strip()
            if target is not None and image_url:
                try:
                    copied = self._slot_commits.copy(
                        CopyCreativeCanvasSlotCommand(
                            context=query.context,
                            project_dir=query.project_dir,
                            source_url=image_url,
                            target=target,
                        )
                    )
                    target_url = copied.target_url
                    item.update(
                        image_url=target_url,
                        pushable=False,
                        committed=True,
                        committed_slot_url=target_url,
                        target_path=copied.target_path.as_posix(),
                        backup=(
                            str(copied.backup_path) if copied.backup_path else None
                        ),
                        image_adaptation=dict(copied.image_adaptation),
                    )
                    changed = True
                    self._record_event(
                        query,
                        "skill.output_committed",
                        {
                            "skill_id": metadata.get("skill_id"),
                            "skill_node_id": metadata.get("skill_node_id"),
                            "run_id": metadata.get("run_id"),
                            "role": item.get("role"),
                            "target": target,
                            "target_url": target_url,
                        },
                        canvas_id=str(metadata.get("canvas_id") or "") or None,
                    )
                except Exception as exc:
                    logger.exception("skill output auto-commit failed")
                    _reject(
                        "runtime",
                        code="skill_output_auto_commit_failed",
                        category="runtime",
                        message=f"skill output auto-commit failed: {exc}",
                        retryable=True,
                        user_action_hint=(
                            "Retry the skill run. If this repeats, inspect the "
                            "canonical slot target."
                        ),
                    )
            finalized.append(item)

        if outputs and (changed or metadata.get("status") != "completed"):
            metadata["status"] = "completed"
            metadata["outputs"] = finalized
            self._repository.write_run(query.project_dir, query.run_id, metadata)
            self._record_event(
                query,
                "skill.run_completed",
                {
                    "skill_id": metadata.get("skill_id"),
                    "skill_node_id": metadata.get("skill_node_id"),
                    "run_id": metadata.get("run_id"),
                    "status": "completed",
                    "output_count": len(finalized),
                },
                canvas_id=str(metadata.get("canvas_id") or "") or None,
            )
        return finalized

    @staticmethod
    def _frame_review_context(
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
    ) -> tuple[int | None, int | None, ResolvedSkillInput | None]:
        beat_input = _single_input(grouped, "beat_context")
        if is_standalone_beat_context(beat_input.beat_context if beat_input else None):
            episode = beat = None
        else:
            episode, beat = _episode_and_beat_from_input(beat_input)
        return episode, beat, beat_input

    def _build_frame_review_prompt(
        self,
        body: SkillRunRequest,
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
    ) -> str:
        episode, beat, beat_input = self._frame_review_context(grouped)
        beat_context = (beat_input.beat_context if beat_input else None) or {}
        frame = _single_input(grouped, "frame")
        frame_details = {
            "node_id": frame.node_id if frame else "",
            "node_type": frame.node_type if frame else "",
            "image_url": frame.image_url if frame else "",
            "slot_target": frame.slot_target if frame else None,
            "candidate_origin": frame.candidate_origin if frame else None,
        }
        return "\n".join(
            [
                "Review this generated frame against the beat context.",
                "Return a concise production note covering composition, continuity, "
                "identity consistency, and mismatches.",
                f"Episode: {json.dumps(episode)}",
                f"Beat: {json.dumps(beat)}",
                f"Skill node: {body.skill_node_id}",
                f"Canvas: {body.canvas_id}",
                (
                    "Beat context: "
                    f"{json.dumps(beat_context, ensure_ascii=False, sort_keys=True)}"
                ),
                f"Frame: {json.dumps(frame_details, ensure_ascii=False, sort_keys=True)}",
            ]
        )

    async def _review_frame_text(
        self,
        body: SkillRunRequest,
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
    ) -> str:
        episode, beat, _beat_input = self._frame_review_context(grouped)
        frame = _single_input(grouped, "frame")
        fallback = deterministic_creative_canvas_frame_review(
            episode=episode,
            beat=beat,
            frame_label=frame.node_id if frame else "frame",
        )
        try:
            review = await self._reviewer.review(
                self._build_frame_review_prompt(body, grouped)
            )
        except Exception:
            logger.exception(
                "agent.review_frame reviewer failed; using deterministic fallback"
            )
            return fallback
        return review.strip() if isinstance(review, str) and review.strip() else fallback

    async def _run_review_frame(
        self,
        command: RunCreativeCanvasSkillCommand,
        skill: SkillDefinition,
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
        idempotency_request_hash: str | None,
    ) -> SkillRunResponse:
        body = command.request
        run_id = f"agent.review_frame:{self._job_ids.new_id()}"
        output = creative_canvas_skill_output_metadata(skill, grouped)
        output["text"] = await self._review_frame_text(body, grouped)
        self._repository.write_run(
            command.project_dir,
            run_id,
            {
                "run_id": run_id,
                "skill_id": command.skill_id,
                "status": "completed",
                "outputs": [output],
                "canvas_id": body.canvas_id,
                "skill_node_id": body.skill_node_id,
            },
        )
        response = SkillRunResponse(run_id=run_id, status="completed")
        self._record_event(
            command,
            "skill.run_completed",
            {
                "skill_id": command.skill_id,
                "skill_node_id": body.skill_node_id,
                "run_id": run_id,
                "status": response.status,
                "output_count": 1,
            },
            canvas_id=body.canvas_id,
        )
        self._persist_idempotency_response(
            command,
            idempotency_request_hash,
            response,
        )
        return response

    async def _start_sketch(
        self,
        command: RunCreativeCanvasSkillCommand,
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
    ) -> CreativeCanvasTaskReceipt:
        body = command.request
        parameters = dict(body.parameters if isinstance(body.parameters, dict) else {})
        try:
            aspect_ratio = normalize_mainline_aspect_ratio(parameters.get("aspect_ratio"))
        except ValueError as exc:
            _reject(
                "validation",
                code="skill_parameter_aspect_ratio_invalid",
                category="validation",
                message=str(exc),
                user_action_hint="Choose 2:3 or 16:9 before running the skill.",
            )
        model = self._required_image_model(parameters)
        beat_input = _required_input(grouped, "beat_context")
        if is_standalone_beat_context(beat_input.beat_context):
            if command.skill_id == "freezone.sketch_from_director_combined":
                reference_role = "director_combined"
                source_label = "导演合成图"
            else:
                reference_role = "background"
                source_label = "背景"
            reference_input = _required_input(grouped, reference_role)
            reference_url = _required_image_url(reference_input, reference_role)
            try:
                reference_path = self._workspace.resolve_media_path(
                    command.project_dir,
                    reference_url,
                ).as_posix()
            except ValueError as exc:
                _reject(
                    "bad_request",
                    code="skill_input_media_url_unsupported",
                    category="validation",
                    message=str(exc),
                    enveloped=False,
                )
            try:
                return await self._image_generation.start(
                    StartCreativeCanvasImageGenerationCommand(
                        context=command.context,
                        project_dir=command.project_dir,
                        prompt=self._workspace.build_standalone_sketch_prompt(
                            input_item=beat_input,
                            project_dir=command.project_dir,
                            reference_path=reference_path,
                            reference_role=reference_role,
                            aspect_ratio=aspect_ratio,
                            model=model,
                        ),
                        aspect_ratio=aspect_ratio,
                        image_size=str(parameters.get("image_size") or "2K"),
                        reference_urls=(reference_url,),
                        model=model,
                        quality=str(parameters.get("quality") or "medium"),
                        canvas_id=body.canvas_id,
                        node_id=body.skill_node_id,
                        task_display={
                            "task_label": "生成草图",
                            "display_name": "生成草图",
                            "source_label": source_label,
                            "target_label": "草图候选",
                            "skill_id": command.skill_id,
                        },
                    )
                )
            except InvalidCreativeCanvasImageGenerationRequest as exc:
                _reject(
                    "bad_request",
                    code="skill_generation_invalid",
                    category="validation",
                    message=str(exc),
                    enveloped=False,
                )
            except CreativeCanvasImageGenerationReferenceMissing as exc:
                _reject(
                    "not_found",
                    code="skill_generation_source_missing",
                    category="not_found",
                    message=str(exc),
                    enveloped=False,
                )

        episode, beat = _episode_and_beat_from_input(beat_input)
        if command.skill_id == "freezone.sketch_from_director_combined":
            director_combined = _required_input(grouped, "director_combined")
            return await self._start_mainline_task(
                self._mainline_generation.start_director_sketch(
                    StartCreativeCanvasDirectorSketchCommand(
                        context=command.context,
                        project_dir=command.project_dir,
                        episode=episode,
                        beat=beat,
                        director_combined_url=_required_image_url(
                            director_combined,
                            "director_combined",
                        ),
                        aspect_ratio=aspect_ratio,
                        model=model,
                        canvas_id=body.canvas_id,
                        node_id=body.skill_node_id,
                        task_display={
                            "task_family": "mainline_skill",
                            "task_label": "导演合成图转草图",
                            "display_name": f"导演合成图转草图 · EP{episode} / Beat {beat}",
                            "source_label": "导演合成图",
                            "target_label": "当前草图候选",
                            "skill_id": command.skill_id,
                        },
                    )
                )
            )
        background = _required_input(grouped, "background")
        return await self._start_mainline_task(
            self._mainline_generation.start_background_sketch(
                StartCreativeCanvasBackgroundSketchCommand(
                    context=command.context,
                    project_dir=command.project_dir,
                    episode=episode,
                    beat=beat,
                    beat_payload=beat_context_as_prompt_beat(beat_input.beat_context),
                    background_url=_required_image_url(background, "background"),
                    aspect_ratio=aspect_ratio,
                    model=model,
                    canvas_id=body.canvas_id,
                    node_id=body.skill_node_id,
                    task_display={
                        "task_family": "mainline_skill",
                        "task_label": "生成草图",
                        "display_name": f"生成草图 · EP{episode} / Beat {beat}",
                        "source_label": "背景",
                        "target_label": "当前草图",
                        "skill_id": command.skill_id,
                    },
                )
            )
        )

    async def _start_frame(
        self,
        command: RunCreativeCanvasSkillCommand,
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
    ) -> CreativeCanvasTaskReceipt:
        body = command.request
        parameters = dict(body.parameters if isinstance(body.parameters, dict) else {})
        try:
            quality = normalize_mainline_frame_quality(parameters.get("quality"))
        except ValueError as exc:
            _reject(
                "validation",
                code="skill_parameter_quality_invalid",
                category="validation",
                message=str(exc),
                user_action_hint="Choose low, medium, or high before running the skill.",
            )
        background_reference_mode = creative_canvas_skill_background_reference_mode(
            parameters
        )
        beat_input = _required_input(grouped, "beat_context")
        sketch = _required_input(grouped, "sketch")
        background = _single_input(grouped, "background")
        identity_references = _filter_canvas_references_by_beat_context(
            _canvas_references_from_inputs(grouped, "identity"),
            beat_input,
            "identity",
        )
        prop_references = _filter_canvas_references_by_beat_context(
            _canvas_references_from_inputs(grouped, "prop"),
            beat_input,
            "prop",
        )
        standalone_context = is_standalone_beat_context(beat_input.beat_context)
        if standalone_context:
            episode = 0
            beat: int | None = None
            display_name = "渲染分镜"
            target_label = "分镜候选"
        else:
            episode, beat = _episode_and_beat_from_input(beat_input)
            display_name = f"渲染分镜 · EP{episode} / Beat {beat}"
            target_label = "当前分镜"
        return await self._start_mainline_task(
            self._mainline_generation.start_frame_from_context(
                StartCreativeCanvasFrameFromContextCommand(
                    context=command.context,
                    project_dir=command.project_dir,
                    episode=episode,
                    beat=beat,
                    beat_payload=beat_context_as_prompt_beat(beat_input.beat_context),
                    standalone_beat_context=(
                        beat_input.beat_context or {} if standalone_context else None
                    ),
                    sketch_url=_required_image_url(sketch, "sketch"),
                    reference_urls=(
                        (_required_image_url(background, "background"),)
                        if background
                        else ()
                    ),
                    identity_references=tuple(identity_references),
                    prop_references=tuple(prop_references),
                    quality=quality,
                    model=self._required_image_model(parameters),
                    background_reference_mode=background_reference_mode,
                    canvas_id=body.canvas_id,
                    node_id=body.skill_node_id,
                    task_display={
                        "task_family": "mainline_skill",
                        "task_label": "渲染分镜",
                        "display_name": display_name,
                        "source_label": "草图 + 背景 + 身份/道具",
                        "target_label": target_label,
                        "skill_id": command.skill_id,
                    },
                )
            )
        )

    async def _start_scene_360(
        self,
        command: RunCreativeCanvasSkillCommand,
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
        *,
        auto_commit: bool,
    ) -> CreativeCanvasTaskReceipt:
        body = command.request
        parameters = dict(body.parameters if isinstance(body.parameters, dict) else {})
        scene_prompt = self._scene_prompt(_single_input(grouped, "scene"))
        scene_master = _required_input(grouped, "scene_master")
        scene_reverse = _single_input(grouped, "scene_reverse_master")
        scene_id = self._scene_id_from_input(scene_master)
        description = build_scene_360_prompt(scene_id)
        if scene_prompt:
            description = f"{description}\n\n场景提示词：{scene_prompt}"
        return await self._start_mainline_task(
            self._mainline_generation.start_scene_360(
                StartCreativeCanvasScene360Command(
                    context=command.context,
                    project_dir=command.project_dir,
                    scene_id=scene_id,
                    description=description,
                    master_url=_required_image_url(scene_master, "scene_master"),
                    reverse_url=(
                        _required_image_url(scene_reverse, "scene_reverse_master")
                        if scene_reverse
                        else None
                    ),
                    model=self._required_image_model(parameters),
                    image_size=MAINLINE_SCENE_360_IMAGE_SIZE,
                    quality=None,
                    canvas_id=body.canvas_id,
                    node_id=body.skill_node_id,
                    auto_commit=auto_commit,
                    task_display={"skill_id": command.skill_id},
                )
            )
        )

    @staticmethod
    def _required_image_model(parameters: Mapping[str, Any]) -> str:
        model = str(parameters.get("model") or "").strip()
        if not model:
            _reject(
                "validation",
                code="skill_parameter_model_required",
                category="validation",
                message="model is required",
                user_action_hint="Choose an image model before running the skill.",
            )
        return model

    def _queue_response(
        self,
        command: RunCreativeCanvasSkillCommand,
        skill: SkillDefinition,
        grouped: Mapping[str, Sequence[ResolvedSkillInput]],
        receipt: CreativeCanvasTaskReceipt,
        *,
        auto_commit: bool,
        idempotency_request_hash: str | None,
    ) -> SkillRunResponse:
        body = command.request
        data = receipt.to_dict()
        task_type = str(data.get("task_type") or "")
        job_id = str(data.get("job_id") or "")
        if not task_type or not job_id:
            _reject(
                "runtime",
                code="skill_run_metadata_incomplete",
                category="runtime",
                message="skill run missing task_type/job_id",
                retryable=True,
                user_action_hint=(
                    "Retry the skill run. If this repeats, inspect the skill dispatcher."
                ),
            )
        run_id = f"{task_type}:{job_id}"
        self._repository.write_run(
            command.project_dir,
            run_id,
            {
                "run_id": run_id,
                "skill_id": command.skill_id,
                "status": "queued",
                "task_type": task_type,
                "job_id": job_id,
                "task_key": data.get("task_key"),
                "task_episode": data.get("task_episode", 0),
                "task_beat_num": data.get("task_beat_num"),
                "task_scope": data.get("task_scope") or job_id,
                "canvas_id": body.canvas_id,
                "skill_node_id": body.skill_node_id,
                "output": creative_canvas_skill_output_metadata(
                    skill,
                    grouped,
                    auto_commit=auto_commit,
                ),
            },
        )
        response = SkillRunResponse(
            run_id=run_id,
            status="queued",
            task_key=data.get("task_key"),
            task_type=task_type,
            job_id=job_id,
        )
        self._record_event(
            command,
            "skill.run_requested",
            {
                "skill_id": command.skill_id,
                "skill_node_id": body.skill_node_id,
                "run_id": run_id,
                "status": response.status,
                "task_type": task_type,
                "job_id": job_id,
            },
            canvas_id=body.canvas_id,
        )
        self._persist_idempotency_response(
            command,
            idempotency_request_hash,
            response,
        )
        return response

    async def run(
        self,
        command: RunCreativeCanvasSkillCommand,
    ) -> SkillRunResponse:
        skill = self._catalog.find_skill(command.skill_id)
        if skill is None:
            _reject(
                "not_found",
                code="skill_not_found",
                category="not_found",
                message="skill not found",
                user_action_hint="Refresh the skill registry and try again.",
            )
        idempotency_request_hash, idempotent_response = self._idempotent_response(
            command
        )
        if idempotent_response is not None:
            return idempotent_response
        grouped = group_and_validate_creative_canvas_skill_inputs(
            skill,
            command.request.resolved_inputs,
            project_id=command.project_id,
            context=command.context,
        )
        auto_commit = self._workspace.is_preset_managed(
            context=command.context,
            project_dir=command.project_dir,
            canvas_id=command.request.canvas_id,
            skill_node_id=command.request.skill_node_id,
        )
        first_beat_input = _single_input(grouped, "beat_context")
        if is_standalone_beat_context(
            first_beat_input.beat_context if first_beat_input else None
        ):
            auto_commit = False

        if command.skill_id in {
            "freezone.sketch_from_context",
            "freezone.sketch_from_director_combined",
        }:
            receipt = await self._start_sketch(command, grouped)
        elif command.skill_id == "freezone.frame_from_context":
            receipt = await self._start_frame(command, grouped)
        elif command.skill_id == "freezone.scene_360":
            receipt = await self._start_scene_360(
                command,
                grouped,
                auto_commit=auto_commit,
            )
        elif command.skill_id == "freezone.set_selected_background":
            return await self._run_set_selected_background(
                command,
                skill,
                grouped,
                idempotency_request_hash=idempotency_request_hash,
                auto_commit=auto_commit,
            )
        elif command.skill_id == "freezone.set_director_combined":
            return await self._run_set_director_combined(
                command,
                skill,
                grouped,
                idempotency_request_hash=idempotency_request_hash,
                auto_commit=auto_commit,
            )
        elif command.skill_id == "agent.review_frame":
            return await self._run_review_frame(
                command,
                skill,
                grouped,
                idempotency_request_hash,
            )
        else:
            _reject(
                "unsupported",
                code="skill_provider_not_runnable",
                category="unsupported",
                message="skill provider is not runnable",
                user_action_hint=(
                    "Use a runnable skill provider or wait for its runtime integration."
                ),
            )
        return self._queue_response(
            command,
            skill,
            grouped,
            receipt,
            auto_commit=auto_commit,
            idempotency_request_hash=idempotency_request_hash,
        )

    def _normalized_task_outputs(
        self,
        query: GetCreativeCanvasSkillRunResultQuery,
        task_result: Mapping[str, Any] | None,
        output_metadata: Mapping[str, Any],
    ) -> list[SkillRunOutput]:
        if not isinstance(task_result, Mapping):
            return []
        raw_outputs = task_result.get("outputs")
        if not isinstance(raw_outputs, list):
            return []
        outputs: list[SkillRunOutput] = []
        for raw_output in raw_outputs:
            if not isinstance(raw_output, dict):
                continue
            item = {**output_metadata, **raw_output}
            output_path = str(item.get("output_path") or "").strip()
            if output_path and not item.get("image_url"):
                image_url = self._workspace.media_url(
                    query.context,
                    query.project_dir,
                    Path(output_path),
                )
                if image_url:
                    item["image_url"] = image_url
            outputs.append(SkillRunOutput(**item))
        return outputs

    async def result(
        self,
        query: GetCreativeCanvasSkillRunResultQuery,
    ) -> SkillRunResult:
        metadata = self._repository.read_run(query.project_dir, query.run_id)
        if metadata is None:
            _reject(
                "not_found",
                code="skill_run_not_found",
                category="not_found",
                message="skill run not found",
                user_action_hint="Refresh the skill run list and try again.",
                enveloped=False,
            )
        if isinstance(metadata.get("outputs"), list):
            return SkillRunResult(
                run_id=query.run_id,
                status=(
                    "done"
                    if metadata.get("status") == "completed"
                    else str(metadata.get("status"))
                ),
                outputs=[SkillRunOutput(**item) for item in metadata["outputs"]],
                task_key=metadata.get("task_key"),
                task_type=metadata.get("task_type"),
                job_id=metadata.get("job_id"),
            )

        task_type = str(metadata.get("task_type") or "")
        job_id = str(metadata.get("job_id") or "")
        if not task_type or not job_id:
            _reject(
                "runtime",
                code="skill_run_metadata_incomplete",
                category="runtime",
                message="skill run metadata missing task_type/job_id",
                retryable=True,
                user_action_hint=(
                    "Retry the skill run. If this repeats, inspect stored run metadata."
                ),
            )
        try:
            task_episode = int(metadata.get("task_episode") or 0)
        except (TypeError, ValueError):
            task_episode = 0
        task_scope = str(metadata.get("task_scope") or job_id)
        try:
            task_beat_num = (
                int(metadata["task_beat_num"])
                if metadata.get("task_beat_num") is not None
                else None
            )
        except (TypeError, ValueError):
            task_beat_num = None
        task = self._tasks.read(
            context=query.context,
            task_type=task_type,
            episode=task_episode,
            beat_num=task_beat_num,
            scope=task_scope,
        )
        task_status = task.status if task else None
        if task is not None and task_status == "failed":
            return SkillRunResult(
                run_id=query.run_id,
                status="failed",
                outputs=[],
                task_key=metadata.get("task_key"),
                task_type=task_type,
                job_id=job_id,
                error=SkillErrorEnvelope(
                    code="skill_run_failed",
                    category="runtime",
                    message=task.error or "job failed",
                    retryable=False,
                    user_action_hint="Review the failed job logs before retrying.",
                ),
            )
        if task_status != "completed":
            return SkillRunResult(
                run_id=query.run_id,
                status=creative_canvas_skill_status_from_task_status(task_status),
                outputs=[],
                task_key=metadata.get("task_key"),
                task_type=task_type,
                job_id=job_id,
            )

        task_result = task.result if task else None
        output_metadata = dict(metadata.get("output") or {})
        nested_outputs = self._normalized_task_outputs(
            query,
            task_result,
            output_metadata,
        )
        if nested_outputs:
            finalized_outputs = await self._finalize_outputs(
                query,
                metadata,
                [item.model_dump(mode="json") for item in nested_outputs],
            )
            return SkillRunResult(
                run_id=query.run_id,
                status="done",
                outputs=[SkillRunOutput(**item) for item in finalized_outputs],
                task_key=metadata.get("task_key"),
                task_type=task_type,
                job_id=job_id,
            )

        image_url = None
        if isinstance(task_result, Mapping):
            for key in ("image_url", "output_url", "url"):
                value = task_result.get(key)
                if isinstance(value, str) and value:
                    image_url = value
                    break
        if not image_url:
            image_url = self._workspace.task_result_url(
                context=query.context,
                project_dir=query.project_dir,
                task_result=task_result,
            )
        if not image_url and task_status == "completed":
            image_url = self._workspace.slot_target_url(
                context=query.context,
                project_dir=query.project_dir,
                output_metadata=output_metadata,
            )
        output_path = self._workspace.job_output_path(
            query.project_dir,
            task_type,
            job_id,
        )
        if not image_url and output_path is not None:
            image_url = self._workspace.media_url(
                query.context,
                query.project_dir,
                output_path,
            )
        if image_url:
            finalized_outputs = await self._finalize_outputs(
                query,
                metadata,
                [{**output_metadata, "image_url": image_url}],
            )
            return SkillRunResult(
                run_id=query.run_id,
                status="done",
                outputs=[SkillRunOutput(**item) for item in finalized_outputs],
                task_key=metadata.get("task_key"),
                task_type=task_type,
                job_id=job_id,
            )
        return SkillRunResult(
            run_id=query.run_id,
            status=creative_canvas_skill_status_from_task_status(task_status),
            outputs=[],
            task_key=metadata.get("task_key"),
            task_type=task_type,
            job_id=job_id,
        )


__all__ = [
    "CreativeCanvasSkillRunUseCases",
]
