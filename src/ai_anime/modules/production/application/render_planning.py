"""Server-authoritative Render planning and execution use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionRenderPlanAvailability,
    ProductionRenderPlanEngine,
    ProductionRenderPlanningPreparer,
    ProductionRenderPlanScheduler,
)
from ai_anime.modules.production.domain.render_planning import (
    RenderPlanGrid,
    custom_render_plan_error,
    normalize_render_beat_numbers,
)
from ai_anime.modules.project_workspace.public import ProjectContext

RENDER_PLAN_RESPONSE_TASK_TYPE = "render_plan"


@dataclass(frozen=True)
class BuildRenderPlanCommand:
    episode_num: int
    beat_numbers: tuple[int, ...]
    strategy: str
    aspect_mode: str
    force_one_by_one: bool = False
    image_generation_selection: str | None = None


@dataclass(frozen=True)
class ExecuteRenderPlanCommand:
    episode_num: int
    plan: tuple[RenderPlanGrid, ...]
    plan_hash: str
    input_fingerprint: str
    strategy: str
    aspect_mode: str
    beat_numbers: tuple[int, ...]
    force_one_by_one: bool = False
    custom_plan: bool = False
    image_generation_selection: str | None = None
    sketch_aspect_padding: bool | None = None


@dataclass(frozen=True)
class RenderPlanningMaterials:
    all_beats: list[dict[str, Any]]
    selected_beats: list[dict[str, Any]]
    character_map: dict[str, Any]
    sketch_colors: dict[str, Any]
    style: str
    image_generation_selection: str


@dataclass(frozen=True)
class RenderExecutionMaterials:
    prop_menu: list[dict[str, Any]]
    sketch_aspect_padding: bool


@dataclass(frozen=True)
class RenderPlanGridTask:
    episode_num: int
    grid: RenderPlanGrid
    output_dir: str | Path
    base_config: dict[str, Any]

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode_num,
            "mode_key": self.grid.mode_key,
            "output_dir": str(self.output_dir),
            "config": {
                **self.base_config,
                "mode_key": self.grid.mode_key,
                "selected_beat_numbers": list(self.grid.beat_numbers),
            },
        }


@dataclass(frozen=True)
class RenderPlanGridTaskReceipt:
    task_id: str


@dataclass(frozen=True)
class PlannedRenderEpisode:
    plan: tuple[RenderPlanGrid, ...]
    plan_hash: str
    input_fingerprint: str
    strategy: str
    total_beats: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "plan": [entry.as_dict() for entry in self.plan],
            "plan_hash": self.plan_hash,
            "input_fingerprint": self.input_fingerprint,
            "strategy": self.strategy,
            "total_beats": self.total_beats,
            "total_grids": len(self.plan),
        }


@dataclass(frozen=True)
class ExecutedRenderPlan:
    plan: tuple[RenderPlanGrid, ...]
    scope: str
    task_ids: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "task_type": RENDER_PLAN_RESPONSE_TASK_TYPE,
            "message": f"渲染已启动 ({len(self.plan)} 个网格)",
            "scope": self.scope,
            "resolved_grids": [entry.as_dict() for entry in self.plan],
        }
        if self.task_ids:
            data["task_ids"] = list(self.task_ids)
        return data


class RenderPlanFeatureDisabled(Exception):
    def __init__(self) -> None:
        super().__init__("DISABLE_RENDER_PLAN_V2 is set")


class RenderPlanRejected(Exception):
    def __init__(
        self,
        error: str,
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(error)
        self.error = error
        self.data = data

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"ok": False, "error": self.error}
        if self.data is not None:
            payload["data"] = self.data
        return payload


class RenderPlanConflict(RenderPlanRejected):
    pass


class RenderPlanUseCases:
    def __init__(
        self,
        availability: ProductionRenderPlanAvailability,
        preparer: ProductionRenderPlanningPreparer,
        engine: ProductionRenderPlanEngine,
        scheduler: ProductionRenderPlanScheduler,
    ) -> None:
        self._availability = availability
        self._preparer = preparer
        self._engine = engine
        self._scheduler = scheduler

    def ensure_available(self) -> None:
        if not self._availability.is_enabled():
            raise RenderPlanFeatureDisabled

    async def plan(
        self,
        context: ProjectContext,
        command: BuildRenderPlanCommand,
    ) -> PlannedRenderEpisode:
        beat_numbers = normalize_render_beat_numbers(command.beat_numbers)
        materials = await self._preparer.prepare(
            context,
            episode_num=command.episode_num,
            beat_numbers=beat_numbers,
            image_generation_selection=command.image_generation_selection,
        )
        plan = self._engine.build(
            materials,
            strategy=command.strategy,
            aspect_mode=command.aspect_mode,
            force_one_by_one=command.force_one_by_one,
        )
        fingerprint = self._fingerprint(
            context,
            materials,
            strategy=command.strategy,
            aspect_mode=command.aspect_mode,
            force_one_by_one=command.force_one_by_one,
        )
        return PlannedRenderEpisode(
            plan=plan,
            plan_hash=self._engine.hash(plan),
            input_fingerprint=fingerprint,
            strategy=command.strategy,
            total_beats=len(materials.selected_beats),
        )

    async def execute(
        self,
        context: ProjectContext,
        command: ExecuteRenderPlanCommand,
    ) -> ExecutedRenderPlan:
        beat_numbers = normalize_render_beat_numbers(command.beat_numbers)
        materials = await self._preparer.prepare(
            context,
            episode_num=command.episode_num,
            beat_numbers=beat_numbers,
            image_generation_selection=command.image_generation_selection,
        )
        fingerprint = self._fingerprint(
            context,
            materials,
            strategy=command.strategy,
            aspect_mode=command.aspect_mode,
            force_one_by_one=command.force_one_by_one,
        )
        if fingerprint != command.input_fingerprint:
            new_plan = self._engine.build(
                materials,
                strategy=command.strategy,
                aspect_mode=command.aspect_mode,
                force_one_by_one=command.force_one_by_one,
            )
            raise RenderPlanConflict(
                "input_stale",
                {
                    "new_plan": [entry.as_dict() for entry in new_plan],
                    "new_plan_hash": self._engine.hash(new_plan),
                    "new_input_fingerprint": fingerprint,
                },
            )

        if command.custom_plan:
            custom_error = custom_render_plan_error(command.plan, beat_numbers)
            if custom_error:
                raise RenderPlanRejected(
                    "invalid_custom_plan",
                    {"reason": custom_error},
                )
            execution_plan = command.plan
            execution_hash = self._engine.hash(execution_plan)
            dispatch_strategy = "custom"
        else:
            execution_plan = self._engine.build(
                materials,
                strategy=command.strategy,
                aspect_mode=command.aspect_mode,
                force_one_by_one=command.force_one_by_one,
            )
            execution_hash = self._engine.hash(execution_plan)
            if execution_hash != command.plan_hash:
                raise RenderPlanConflict(
                    "plan_stale",
                    {
                        "new_plan": [entry.as_dict() for entry in execution_plan],
                        "new_plan_hash": execution_hash,
                        "new_input_fingerprint": fingerprint,
                    },
                )
            dispatch_strategy = command.strategy

        execution_materials = await self._preparer.prepare_execution(
            context,
            episode_num=command.episode_num,
            all_beats=materials.all_beats,
            sketch_aspect_padding=command.sketch_aspect_padding,
        )
        base_config = {
            "beats": materials.all_beats,
            "character_map": materials.character_map,
            "style": materials.style,
            "model": materials.image_generation_selection,
            "sketch_colors": materials.sketch_colors,
            "prop_menu": execution_materials.prop_menu,
            "sketch_aspect_padding": (
                execution_materials.sketch_aspect_padding
            ),
        }
        receipts: list[RenderPlanGridTaskReceipt] = []
        for grid in execution_plan:
            receipts.append(
                await self._scheduler.enqueue(
                    context,
                    RenderPlanGridTask(
                        episode_num=command.episode_num,
                        grid=grid,
                        output_dir=context.output_dir,
                        base_config=base_config,
                    ),
                )
            )
        return ExecutedRenderPlan(
            plan=execution_plan,
            scope=f"{dispatch_strategy}__{execution_hash}",
            task_ids=tuple(receipt.task_id for receipt in receipts),
        )

    def _fingerprint(
        self,
        context: ProjectContext,
        materials: RenderPlanningMaterials,
        *,
        strategy: str,
        aspect_mode: str,
        force_one_by_one: bool,
    ) -> str:
        try:
            return self._engine.fingerprint(
                context,
                materials,
                strategy=strategy,
                aspect_mode=aspect_mode,
                force_one_by_one=force_one_by_one,
            )
        except FileNotFoundError as exc:
            raise RenderPlanRejected(
                "invalid_beats",
                {"reason": f"missing ref image: {exc}"},
            ) from exc
