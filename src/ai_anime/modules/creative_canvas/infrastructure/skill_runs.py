"""Local runtime adapters for Creative Canvas skill runs."""

from __future__ import annotations

import inspect
import json
import logging
import re
import shutil
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter, ValidationError

from ai_anime.freezone import canvas_store
from ai_anime.freezone.paths import (
    CANVAS_ID_RE,
    freezone_root,
    output_path_for_job,
    resolve_static_url_to_path,
)
from ai_anime.freezone.slots import SlotTarget, slot_target_path
from ai_anime.models import beat_scene_id
from ai_anime.modules.creative_canvas.application.skill_catalog import (
    ResolvedSkillInput,
    SkillRunResponse,
)
from ai_anime.modules.creative_canvas.application.skill_run_contracts import (
    CreativeCanvasDirectorCommitResult,
    CreativeCanvasFrameReviewer,
    CreativeCanvasSkillBeatMissing,
    CreativeCanvasSkillRunRepository,
    CreativeCanvasSkillTaskReader,
    CreativeCanvasSkillTaskSnapshot,
    CreativeCanvasSkillWorkspace,
)
from ai_anime.modules.creative_canvas.domain.canvas_documents import (
    first_text_value,
    is_preset_managed_canvas_node,
)
from ai_anime.modules.creative_canvas.domain.mainline_generation import (
    beat_context_as_prompt_beat,
    standalone_character_map,
    standalone_prop_marker_colors,
    standalone_sketch_colors,
)
from ai_anime.modules.creative_canvas.domain.skill_runs import (
    creative_canvas_skill_idempotency_record_id,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure.project_stores import make_sqlite_store_for_context
from ai_anime.shared.project_media import make_static_url_for_context
from ai_anime.task_state import get_task_manager
from ai_anime.utils.background_anchor import copy_to_beat_selected_background
from ai_anime.utils.path_resolver import PathResolver


logger = logging.getLogger(__name__)

_SKILL_RUN_ID_RE = re.compile(r"^[a-zA-Z0-9_.:\-]{1,128}$")
_SLOT_TARGET_ADAPTER = TypeAdapter(SlotTarget)

StoreFactory = Callable[[ProjectContext], Awaitable[Any]]
TaskManagerFactory = Callable[[], Any]
FrameReviewerCallable = Callable[[str], str | Awaitable[str]]


async def _close_store(store: Any) -> None:
    close = getattr(store, "close", None)
    if close is None:
        return
    result = close()
    if inspect.isawaitable(result):
        await result


class LocalCreativeCanvasSkillRunRepository(CreativeCanvasSkillRunRepository):
    @staticmethod
    def _runs_dir(project_dir: Path) -> Path:
        return freezone_root(project_dir) / "_skill_runs"

    @classmethod
    def _run_path(cls, project_dir: Path, run_id: str) -> Path | None:
        if not _SKILL_RUN_ID_RE.match(run_id):
            return None
        return cls._runs_dir(project_dir) / f"{run_id}.json"

    @staticmethod
    def _idempotency_path(
        project_dir: Path,
        skill_id: str,
        idempotency_key: str,
    ) -> Path:
        record_id = creative_canvas_skill_idempotency_record_id(
            skill_id,
            idempotency_key,
        )
        return freezone_root(project_dir) / "_skill_run_idempotency" / f"{record_id}.json"

    def read_run(self, project_dir: Path, run_id: str) -> dict[str, Any] | None:
        path = self._run_path(project_dir, run_id)
        if path is None or not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None

    def write_run(
        self,
        project_dir: Path,
        run_id: str,
        metadata: Mapping[str, Any],
    ) -> None:
        path = self._run_path(project_dir, run_id)
        if path is None:
            raise ValueError("invalid skill run id")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(dict(metadata), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def read_idempotency(
        self,
        project_dir: Path,
        skill_id: str,
        idempotency_key: str,
    ) -> dict[str, Any] | None:
        path = self._idempotency_path(project_dir, skill_id, idempotency_key)
        if not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None

    def write_idempotency(
        self,
        project_dir: Path,
        skill_id: str,
        idempotency_key: str,
        request_hash: str,
        response: SkillRunResponse,
    ) -> None:
        path = self._idempotency_path(project_dir, skill_id, idempotency_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "skill_id": skill_id,
                    "idempotency_key": idempotency_key,
                    "request_hash": request_hash,
                    "response": response.model_dump(mode="json"),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )


class LocalCreativeCanvasSkillWorkspace(CreativeCanvasSkillWorkspace):
    def __init__(self, *, store_factory: StoreFactory | None = None) -> None:
        self._store_factory = store_factory or make_sqlite_store_for_context

    def is_preset_managed(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        canvas_id: str | None,
        skill_node_id: str | None,
    ) -> bool:
        canvas = (canvas_id or "").strip()
        node_id = (skill_node_id or "").strip()
        if not canvas or not node_id or not CANVAS_ID_RE.match(canvas):
            return False
        try:
            payload = canvas_store.read_canvas(Path(context.state_dir), canvas)
        except Exception:
            logger.exception("failed to inspect canvas node for skill auto-commit")
            return False
        if not isinstance(payload, dict):
            return False
        for node in payload.get("nodes") or []:
            if isinstance(node, dict) and str(node.get("id") or "") == node_id:
                return is_preset_managed_canvas_node(node)
        return False

    def resolve_media_path(self, project_dir: Path, image_url: str) -> Path:
        return resolve_static_url_to_path(image_url, project_dir)

    def media_url(
        self,
        context: ProjectContext,
        project_dir: Path,
        path: Path,
    ) -> str | None:
        candidate = path if path.is_absolute() else project_dir / str(path).lstrip("/")
        try:
            resolved = candidate.resolve()
            rel = resolved.relative_to(project_dir.resolve()).as_posix()
        except ValueError:
            return None
        if not resolved.exists() or not resolved.is_file():
            return None
        return make_static_url_for_context(context, rel, local_path=resolved)

    def build_standalone_sketch_prompt(
        self,
        *,
        input_item: ResolvedSkillInput,
        project_dir: Path,
        reference_path: str,
        reference_role: str,
        aspect_ratio: str,
        model: str,
    ) -> str:
        from ai_anime.generators.prompt_builder import (
            PromptMode,
            UnifiedPromptBuilder,
            create_prompt_context,
        )
        from ai_anime.utils.asset_resolver import ResolvedAssetRef

        beat_context = input_item.beat_context or {}
        beat_payload = dict(beat_context_as_prompt_beat(beat_context))
        is_director_combined = reference_role == "director_combined"
        scene_id = first_text_value(
            beat_context,
            ("scene_id", "sceneId", "scene_name", "sceneName", "title", "name"),
        )
        reference = ResolvedAssetRef(
            asset_type="scene",
            base_id=scene_id or "Canvas Beat Context",
            variant_id=reference_role,
            image_paths=[reference_path] if reference_path else [],
            text_description="" if is_director_combined else scene_id,
            source_level=(
                "director_image"
                if is_director_combined
                else "selected_background_image"
            ),
        )
        prompt_context = create_prompt_context(
            mode=PromptMode.SKETCH,
            beats=[beat_payload],
            rows=1,
            cols=1,
            character_map=standalone_character_map(beat_context),
            aspect_ratio=aspect_ratio,
            scene_refs={1: [reference]},
            sketch_colors=standalone_sketch_colors(beat_context),
            prop_marker_colors=standalone_prop_marker_colors(beat_context),
            project_dir=str(project_dir),
            image_provider="",
            image_model=model,
        )
        return UnifiedPromptBuilder(prompt_context).build()

    async def commit_selected_background(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        source_path: Path,
    ) -> Path:
        selected_path = copy_to_beat_selected_background(
            project_dir,
            episode,
            beat,
            source_path,
        )
        store = await self._store_factory(context)
        try:
            beats = await store.get_beats_as_dicts(episode)
            target = next(
                (item for item in beats if int(item.get("beat_number") or 0) == beat),
                None,
            )
            if not target:
                raise CreativeCanvasSkillBeatMissing(
                    f"beat not found: ep{episode} beat{beat}"
                )
            scene_ref = dict(target.get("scene_ref") or {})
            scene_id = beat_scene_id(target)
            if scene_id:
                scene_ref["scene_id"] = scene_id
            scene_ref["render_anchor_id"] = "selected_background"
            scene_ref["render_anchor_source_id"] = "skill_source_image"
            scene_ref.pop("render_anchor_path", None)
            await store.update_beat_asset(
                episode_number=episode,
                beat_number=beat,
                scene_ref=scene_ref,
            )
        finally:
            await _close_store(store)
        return selected_path

    @staticmethod
    def _project_path_from_rel(project_dir: Path, rel_path: str) -> Path | None:
        rel = str(rel_path or "").strip().lstrip("/")
        if not rel:
            return None
        candidate = (project_dir / rel).resolve()
        try:
            candidate.relative_to(project_dir.resolve())
        except ValueError:
            return None
        return candidate

    def _copy_director_bundle(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        bundle: Mapping[str, Any],
        fallback_combined_path: Path,
        target_dir: Path,
    ) -> dict[str, Any] | None:
        rel_paths = bundle.get("rel_paths")
        rel_paths = rel_paths if isinstance(rel_paths, dict) else {}
        source_paths = {
            "combined": self._project_path_from_rel(
                project_dir,
                str(rel_paths.get("combined") or ""),
            )
            or fallback_combined_path,
            "env_only": self._project_path_from_rel(
                project_dir,
                str(rel_paths.get("env_only") or ""),
            ),
            "frame_meta": self._project_path_from_rel(
                project_dir,
                str(rel_paths.get("frame_meta") or ""),
            ),
        }
        if not all(path and path.exists() and path.is_file() for path in source_paths.values()):
            return None

        target_dir.mkdir(parents=True, exist_ok=True)
        filenames = {
            "combined": "combined.png",
            "env_only": "env_only.png",
            "frame_meta": "frame_meta.json",
        }
        paths: dict[str, str] = {}
        next_rel_paths: dict[str, str] = {}
        urls: dict[str, str] = {}
        for kind, filename in filenames.items():
            source_path = source_paths[kind]
            if source_path is None:
                return None
            target_path = target_dir / filename
            if source_path.resolve() != target_path.resolve():
                shutil.copyfile(source_path, target_path)
            rel = target_path.relative_to(project_dir).as_posix()
            paths[kind] = target_path.as_posix()
            next_rel_paths[kind] = rel
            urls[kind] = make_static_url_for_context(
                context,
                rel,
                local_path=target_path,
            )

        frame_meta_value = bundle.get("frame_meta")
        if not isinstance(frame_meta_value, dict):
            try:
                frame_meta_value = json.loads(
                    (target_dir / "frame_meta.json").read_text(encoding="utf-8")
                )
            except (OSError, json.JSONDecodeError):
                frame_meta_value = None

        next_bundle: dict[str, Any] = {
            "schema_version": "director_control_bundle_v1",
            "dir": str(target_dir),
            "paths": paths,
            "rel_paths": next_rel_paths,
            "urls": urls,
        }
        if isinstance(bundle.get("source"), dict):
            next_bundle["source"] = bundle["source"]
        if isinstance(frame_meta_value, dict):
            next_bundle["frame_meta"] = frame_meta_value
        return next_bundle

    def commit_director_combined(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        source_path: Path,
        control_bundle: Mapping[str, Any],
    ) -> CreativeCanvasDirectorCommitResult:
        target_path = PathResolver(str(project_dir), episode).director_render(beat)
        bundle = (
            self._copy_director_bundle(
                context=context,
                project_dir=project_dir,
                bundle=control_bundle,
                fallback_combined_path=source_path,
                target_dir=target_path.parent,
            )
            if control_bundle
            else None
        )
        if not bundle:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            if source_path.resolve() != target_path.resolve():
                shutil.copyfile(source_path, target_path)
        return CreativeCanvasDirectorCommitResult(
            path=target_path,
            control_bundle=bundle,
        )

    def task_result_url(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        task_result: Mapping[str, Any] | None,
    ) -> str | None:
        if not isinstance(task_result, Mapping):
            return None
        for key in ("output_path", "pano_path"):
            raw_path = str(task_result.get(key) or "").strip()
            if raw_path and (
                image_url := self.media_url(context, project_dir, Path(raw_path))
            ):
                return image_url
        return None

    def slot_target_url(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        output_metadata: Mapping[str, Any],
    ) -> str | None:
        if (
            output_metadata.get("pushable") is not True
            or output_metadata.get("auto_commit") is not True
        ):
            return None
        target = output_metadata.get("slot_target")
        try:
            parsed = _SLOT_TARGET_ADAPTER.validate_python(target)
        except ValidationError:
            return None
        return self.media_url(
            context,
            project_dir,
            slot_target_path(project_dir, parsed),
        )

    def job_output_path(
        self,
        project_dir: Path,
        task_type: str,
        job_id: str,
    ) -> Path | None:
        output = output_path_for_job(project_dir, task_type, job_id)
        if output.exists():
            return output
        for suffix in (".webp", ".mp4", ".mov", ".webm"):
            candidate = output.with_suffix(suffix)
            if candidate.exists():
                return candidate
        return None


class TaskManagerCreativeCanvasSkillTaskReader(CreativeCanvasSkillTaskReader):
    def __init__(
        self,
        *,
        task_manager_factory: TaskManagerFactory = get_task_manager,
    ) -> None:
        self._task_manager_factory = task_manager_factory

    def read(
        self,
        *,
        context: ProjectContext,
        task_type: str,
        episode: int,
        beat_num: int | None,
        scope: str,
    ) -> CreativeCanvasSkillTaskSnapshot | None:
        task = self._task_manager_factory().get_task_for_project(
            context,
            task_type,
            episode,
            beat_num=beat_num,
            scope=scope,
        )
        if task is None:
            return None
        result = getattr(task, "result", None)
        return CreativeCanvasSkillTaskSnapshot(
            status=getattr(task, "status", None),
            error=getattr(task, "error", None),
            result=result if isinstance(result, Mapping) else None,
        )


class OptionalCreativeCanvasFrameReviewer(CreativeCanvasFrameReviewer):
    def __init__(self, reviewer: FrameReviewerCallable | None = None) -> None:
        self._reviewer = reviewer

    async def review(self, prompt: str) -> str | None:
        if self._reviewer is None:
            return None
        result = self._reviewer(prompt)
        if inspect.isawaitable(result):
            result = await result
        return result if isinstance(result, str) else None


__all__ = [
    "LocalCreativeCanvasSkillRunRepository",
    "LocalCreativeCanvasSkillWorkspace",
    "OptionalCreativeCanvasFrameReviewer",
    "TaskManagerCreativeCanvasSkillTaskReader",
]
