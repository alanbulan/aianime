"""Character catalog and image task scheduling use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.dto import (
    BuildCharactersTask,
    CharacterImageGenerationTask,
    ScheduledAssetTask,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterIdentityNotFound,
    CharacterNotFound,
    CharacterProjectContextRequired,
)
from ai_anime.modules.asset_world.application.ports import (
    CharacterTaskRepository,
    CharacterTaskScheduler,
)
from ai_anime.modules.asset_world.domain.character_assets import (
    find_character_identity,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class CharacterTaskUseCases:
    def __init__(self, scheduler: CharacterTaskScheduler) -> None:
        self._scheduler = scheduler

    async def schedule_build_characters(
        self,
        *,
        task_context: ProjectContext | None,
        output_dir: str | Path,
    ) -> ScheduledAssetTask:
        context = self._require_context(
            task_context,
            "角色补充需要 project context",
        )
        receipt = await self._scheduler.enqueue_build_characters(
            context,
            BuildCharactersTask(output_dir=output_dir),
        )
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type="build_characters",
            message="角色补充任务已进入队列",
        )

    async def schedule_character_portrait(
        self,
        *,
        task_context: ProjectContext | None,
        project_dir: str | Path,
        character_name: str,
        style: str,
        model: str,
    ) -> ScheduledAssetTask:
        context = self._require_context(
            task_context,
            "肖像生成需要 project context",
        )
        scope = f"character:{character_name}:portrait"
        return await self._schedule_image(
            context,
            CharacterImageGenerationTask(
                mode="portrait",
                task_type="character_portrait",
                character_name=character_name,
                style=style,
                model=model,
                scope=scope,
                output_dir=project_dir,
            ),
            message=f"肖像生成任务已进入队列: {character_name}",
        )

    async def schedule_identity_portrait(
        self,
        *,
        repository: CharacterTaskRepository,
        task_context: ProjectContext | None,
        project_dir: str | Path,
        character_name: str,
        identity_id: str,
        style: str,
        model: str,
    ) -> ScheduledAssetTask:
        identity = self._identity(repository, character_name, identity_id)
        context = self._require_context(
            task_context,
            "身份 Portrait 生成需要 project context",
        )
        scope = f"character:{character_name}:identity_portrait:{identity.identity_name}"
        return await self._schedule_image(
            context,
            CharacterImageGenerationTask(
                mode="identity_portrait",
                task_type="character_portrait",
                character_name=character_name,
                identity_id=identity_id,
                identity_name=identity.identity_name,
                style=style,
                model=model,
                scope=scope,
                output_dir=project_dir,
            ),
            message=(
                f"身份 Portrait 生成任务已进入队列: {identity.identity_name}"
            ),
        )

    async def schedule_identity_image(
        self,
        *,
        repository: CharacterTaskRepository,
        task_context: ProjectContext | None,
        project_dir: str | Path,
        character_name: str,
        identity_id: str,
        style: str,
        model: str,
    ) -> ScheduledAssetTask:
        identity = self._identity(repository, character_name, identity_id)
        context = self._require_context(
            task_context,
            "身份图生成需要 project context",
        )
        scope = f"character:{character_name}:identity:{identity.identity_name}"
        return await self._schedule_image(
            context,
            CharacterImageGenerationTask(
                mode="identity_image",
                task_type="identity_image",
                character_name=character_name,
                identity_id=identity_id,
                identity_name=identity.identity_name,
                style=style,
                model=model,
                scope=scope,
                output_dir=project_dir,
            ),
            message=f"身份图生成任务已进入队列: {identity.identity_name}",
        )

    async def _schedule_image(
        self,
        context: ProjectContext,
        task: CharacterImageGenerationTask,
        *,
        message: str,
    ) -> ScheduledAssetTask:
        receipt = await self._scheduler.enqueue_character_image(context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            scope=task.scope,
            message=message,
        )

    @staticmethod
    def _require_context(
        task_context: ProjectContext | None,
        message: str,
    ) -> ProjectContext:
        if task_context is None:
            raise CharacterProjectContextRequired(message)
        return task_context

    @staticmethod
    def _identity(
        repository: CharacterTaskRepository,
        character_name: str,
        identity_id: str,
    ) -> Any:
        character = repository.get_character(character_name)
        if character is None:
            raise CharacterNotFound(f"Character '{character_name}' not found")
        identity = find_character_identity(character, identity_id)
        if identity is None:
            raise CharacterIdentityNotFound(f"Identity '{identity_id}' not found")
        return identity
