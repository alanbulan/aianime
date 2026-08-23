"""Scene generation task scheduling use cases."""

from __future__ import annotations

from pathlib import Path

from ai_anime.modules.asset_world.application.dto import (
    BuildScenesTask,
    GenerateScenePanoCommand,
    SceneReferenceGenerationTask,
    SceneStageGenerationTask,
    ScheduledAssetTask,
)
from ai_anime.modules.asset_world.application.errors import (
    SceneGenerationRejected,
    SceneProjectContextRequired,
)
from ai_anime.modules.asset_world.application.ports import (
    SceneTaskAssets,
    SceneTaskRepository,
    SceneTaskScheduler,
)
from ai_anime.modules.asset_world.domain.scene_generation import (
    resolve_scene_pano_source,
    scene_360_description,
)
from ai_anime.modules.asset_world.application.scene_lookup import require_scene
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.story_intake.public import require_imported_story
from ai_anime.modules.task_execution.public import task_config_scope
from ai_anime.modules.model_usage.domain.model_route import resolve_model_route


class SceneTaskUseCases:
    def __init__(
        self,
        scheduler: SceneTaskScheduler,
        assets: SceneTaskAssets,
    ) -> None:
        self._scheduler = scheduler
        self._assets = assets

    async def schedule_build_scenes(
        self,
        *,
        task_context: ProjectContext | None,
        output_dir: str | Path,
    ) -> ScheduledAssetTask:
        context = self._require_context(
            task_context,
            "场景补充需要 project context",
        )
        require_imported_story(output_dir)
        task = BuildScenesTask(output_dir=output_dir)
        receipt = await self._scheduler.enqueue_build_scenes(context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            message="场景补充任务已进入队列",
        )

    async def schedule_reference(
        self,
        *,
        repository: SceneTaskRepository,
        task_context: ProjectContext | None,
        output_dir: str | Path,
        scene_name: str,
        kind: str,
        style: str,
        model: str | None,
    ) -> ScheduledAssetTask:
        scene = await require_scene(repository, scene_name)
        model_route = resolve_model_route(model)
        if not model_route.model:
            raise SceneGenerationRejected("请先选择场景图片模型")
        context = self._require_context(
            task_context,
            "场景参考图生成需要 project context",
        )
        scope = task_config_scope(
            "scene_ref",
            {"scene": scene.name, "kind": kind},
        )
        task = SceneReferenceGenerationTask(
            scene_name=scene.name,
            kind=kind,
            style=style,
            model=model_route.model,
            model_selector=model_route.selector,
            output_dir=output_dir,
            scope=scope,
        )
        receipt = await self._scheduler.enqueue_scene_reference(context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            scope=scope,
            message=f"场景「{scene.name}」{kind} 生成任务已进入队列",
        )

    async def schedule_single_face_3gs(
        self,
        *,
        repository: SceneTaskRepository,
        task_context: ProjectContext | None,
        project_dir: Path,
        scene_name: str,
        source_kind: str,
    ) -> ScheduledAssetTask:
        scene = await require_scene(repository, scene_name)
        self._require_stage_capability("single_face_sharp")
        source = str(source_kind or "master").strip().lower()
        if source == "reverse":
            if not self._assets.has_reverse_master(project_dir, scene.name):
                raise SceneGenerationRejected(
                    "缺少 reverse_master.png，请先生成 reverse master"
                )
        elif not self._assets.has_master(project_dir, scene.name):
            raise SceneGenerationRejected("缺少 master.png，请先上传或生成场景源图")

        return await self._schedule_stage(
            task_context=task_context,
            project_dir=project_dir,
            scene_name=scene.name,
            step="single_face_sharp",
            params={
                "source_kind": source,
                "face_name": "front",
                "depth_meters": 8.0,
                "device": "auto",
                "face_size": 768,
                "internal_size": 1536,
                "max_gaussians_per_face": 1_000_000,
                "timeout_seconds": 1800,
            },
            source=source,
            message=f"场景「{scene.name}」{source} → SOG 任务已启动",
        )

    async def schedule_pano_3gs(
        self,
        *,
        repository: SceneTaskRepository,
        task_context: ProjectContext | None,
        project_dir: Path,
        scene_name: str,
    ) -> ScheduledAssetTask:
        scene = await require_scene(repository, scene_name)
        self._require_stage_capability("pano_sharp")
        if not self._assets.has_pano(project_dir, scene.name):
            raise SceneGenerationRejected(
                "缺少 pano_360.png，请先上传或生成 360 全景"
            )

        return await self._schedule_stage(
            task_context=task_context,
            project_dir=project_dir,
            scene_name=scene.name,
            step="pano_sharp",
            params={
                "geometry_mode": "pano-depth",
                "depth_source": "da2",
                "depth_device": "auto",
                "device": "auto",
                "pano_depth_width": 2048,
                "pano_depth_point_scale": 0.72,
                "pano_depth_min_scale": 0.0008,
                "pano_depth_max_scale": 0.045,
                "pano_depth_opacity": 0.96,
                "pano_depth_radius_scale": 1.0,
                "face_size": 768,
                "internal_size": 1536,
                "max_gaussians_per_face": 1_000_000,
                "timeout_seconds": 1800,
            },
            source="pano",
            message=f"场景「{scene.name}」360 → SOG 任务已启动",
        )

    async def schedule_pano_generation(
        self,
        *,
        repository: SceneTaskRepository,
        task_context: ProjectContext | None,
        project_dir: Path,
        scene_name: str,
        command: GenerateScenePanoCommand,
        project_style: str,
    ) -> ScheduledAssetTask:
        scene = await require_scene(repository, scene_name)
        model_route = resolve_model_route(command.model)
        if not model_route.model:
            raise SceneGenerationRejected("请先选择场景图片模型")
        source = resolve_scene_pano_source(
            command.source,
            has_master=self._assets.has_master(project_dir, scene.name),
        )
        params: dict[str, object] = {
            "description": scene_360_description(scene),
            "style": command.style or project_style,
            "timeout_seconds": command.timeout_seconds,
        }
        for key, value in {
            "model": model_route.model,
            "model_selector": model_route.selector,
            "image_size": command.image_size,
            "quality": command.quality,
        }.items():
            if value:
                params[key] = value

        return await self._schedule_stage(
            task_context=task_context,
            project_dir=project_dir,
            scene_name=scene.name,
            step=f"pano_from_{source}",
            params=params,
            source=source,
            message=f"场景「{scene.name}」360 全景生成任务已启动",
        )

    async def _schedule_stage(
        self,
        *,
        task_context: ProjectContext | None,
        project_dir: Path,
        scene_name: str,
        step: str,
        params: dict[str, object],
        source: str,
        message: str,
    ) -> ScheduledAssetTask:
        context = self._require_context(
            task_context,
            "片场资产生成需要 project context",
        )
        scope = task_config_scope(
            "stage_asset",
            {"scene": scene_name, "step": step},
        )
        task = SceneStageGenerationTask(
            scene_name=scene_name,
            step=step,
            params=params,
            project_dir=project_dir,
            scope=scope,
        )
        receipt = await self._scheduler.enqueue_scene_stage(context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            scope=scope,
            source=source,
            message=message,
        )

    def _require_stage_capability(self, step: str) -> None:
        available, message = self._assets.stage_generation_capability(step)
        if not available:
            raise SceneGenerationRejected(message)

    @staticmethod
    def _require_context(
        task_context: ProjectContext | None,
        message: str,
    ) -> ProjectContext:
        if task_context is None:
            raise SceneProjectContextRequired(message)
        return task_context
