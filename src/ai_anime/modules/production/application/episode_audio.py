"""Episode IndexTTS2 audio scheduling use cases."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionEpisodeAudioBilling,
    ProductionEpisodeAudioPlanner,
    ProductionEpisodeAudioScheduler,
    ProductionEpisodeBeatSource,
)
from ai_anime.modules.project_workspace.public import ProjectContext

INDEXTTS2_AUDIO_TASK_TYPE = "audio_generation_indextts2"


@dataclass(frozen=True)
class GenerateEpisodeAudioCommand:
    episode_num: int
    mode: str | None = None
    beat_numbers: list[int] | None = None


@dataclass(frozen=True)
class EpisodeAudioGenerationPlan:
    beat_numbers: tuple[int, ...] = ()
    errors: tuple[str, ...] = ()
    billable_chars: int = 0
    pricing_model: str = ""

    @property
    def quantity(self) -> int:
        return len(self.beat_numbers)


@dataclass(frozen=True)
class EpisodeAudioBillingQuote:
    beat_numbers: tuple[int, ...]
    quantity: int
    unit_cost: int
    cost: int
    display: str
    prereq_errors: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "beat_numbers": list(self.beat_numbers),
            "quantity": self.quantity,
            "unit_cost": self.unit_cost,
            "cost": self.cost,
            "display": self.display,
            "prereq_errors": list(self.prereq_errors),
        }


@dataclass(frozen=True)
class EpisodeAudioTask:
    episode_num: int
    mode: str
    beat_numbers: list[int] | None
    output_dir: str | Path
    state_dir: str | Path
    billing: dict[str, Any] = field(default_factory=dict)

    def backend_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "episode": self.episode_num,
            "mode": self.mode,
            "beat_numbers": self.beat_numbers,
            "output_dir": str(self.output_dir),
            "state_dir": str(self.state_dir),
        }
        if self.billing:
            payload["billing"] = dict(self.billing)
        return payload


@dataclass(frozen=True)
class EpisodeAudioTaskReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledEpisodeAudio:
    task_id: str
    task_key: str
    backend: str
    queue: str | None
    message: str
    beat_numbers: tuple[int, ...] = ()

    @classmethod
    def from_receipt(
        cls,
        receipt: EpisodeAudioTaskReceipt,
        *,
        message: str,
        beat_numbers: tuple[int, ...],
    ) -> ScheduledEpisodeAudio:
        return cls(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
            message=message,
            beat_numbers=beat_numbers,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": INDEXTTS2_AUDIO_TASK_TYPE,
            "task_id": self.task_id,
            "task_key": self.task_key,
            "backend": self.backend,
            "queue": self.queue,
            "message": self.message,
        }


class EpisodeAudioBeatsMissing(ValueError):
    def __init__(self, episode_num: int) -> None:
        super().__init__(f"No beats found for episode {episode_num}")


class EpisodeAudioBeatMissing(ValueError):
    def __init__(self, beat_num: int) -> None:
        super().__init__(f"Beat {beat_num} not found")


class AudioVoicePrerequisitesMissing(ValueError):
    code = "voice_prereq_required"
    action_required = True

    def __init__(self, errors: list[str]) -> None:
        self.errors = tuple(errors)
        super().__init__("；".join(errors))


class EpisodeAudioGenerationNotRequired(ValueError):
    code = "audio_generation_not_required"

    def __init__(self, message: str = "没有需要生成的音频") -> None:
        super().__init__(message)


class EpisodeAudioUseCases:
    def __init__(
        self,
        beat_source: ProductionEpisodeBeatSource,
        planner: ProductionEpisodeAudioPlanner,
        billing: ProductionEpisodeAudioBilling,
        scheduler: ProductionEpisodeAudioScheduler,
    ) -> None:
        self._beat_source = beat_source
        self._planner = planner
        self._billing = billing
        self._scheduler = scheduler

    async def plan(
        self,
        context: ProjectContext,
        command: GenerateEpisodeAudioCommand,
    ) -> EpisodeAudioGenerationPlan:
        return await self._planner.plan(
            context,
            command.episode_num,
            command.beat_numbers,
            command.mode or "sync_changed",
        )

    async def billing_quote(
        self,
        context: ProjectContext,
        command: GenerateEpisodeAudioCommand,
    ) -> EpisodeAudioBillingQuote:
        return await self._billing.quote(await self.plan(context, command))

    async def generate(
        self,
        context: ProjectContext,
        command: GenerateEpisodeAudioCommand,
    ) -> ScheduledEpisodeAudio:
        beats = await self._beat_source.for_episode(context, command.episode_num)
        if not beats:
            raise EpisodeAudioBeatsMissing(command.episode_num)

        mode = command.mode or "sync_changed"
        plan = await self.plan(context, command)
        self._require_generation_plan(plan)
        return await self._schedule(
            context,
            episode_num=command.episode_num,
            mode=mode,
            plan=plan,
            message=f"第 {command.episode_num} 集语音批量生成已进入队列",
        )

    async def regenerate_beat(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> ScheduledEpisodeAudio:
        beats = await self._beat_source.for_episode(context, episode_num)
        beat = next(
            (item for item in beats if item.get("beat_number") == beat_num),
            None,
        )
        if not beat and not (1 <= beat_num <= len(beats)):
            raise EpisodeAudioBeatMissing(beat_num)

        plan = await self.plan(
            context,
            GenerateEpisodeAudioCommand(
                episode_num=episode_num,
                mode="redo_selected",
                beat_numbers=[beat_num],
            ),
        )
        self._require_generation_plan(
            plan,
            empty_message="当前 Beat 没有需要生成的音频",
        )
        return await self._schedule(
            context,
            episode_num=episode_num,
            mode="redo_selected",
            plan=plan,
            message=f"第 {episode_num} 集 Beat {beat_num} 语音生成已进入队列",
        )

    @staticmethod
    def _require_generation_plan(
        plan: EpisodeAudioGenerationPlan,
        *,
        empty_message: str = "没有需要生成的音频",
    ) -> None:
        if plan.errors:
            raise AudioVoicePrerequisitesMissing(list(plan.errors))
        if not plan.beat_numbers:
            raise EpisodeAudioGenerationNotRequired(empty_message)

    async def _schedule(
        self,
        context: ProjectContext,
        *,
        episode_num: int,
        mode: str,
        plan: EpisodeAudioGenerationPlan,
        message: str,
    ) -> ScheduledEpisodeAudio:
        receipt = await self._scheduler.enqueue(
            context,
            EpisodeAudioTask(
                episode_num=episode_num,
                mode=mode,
                beat_numbers=list(plan.beat_numbers),
                output_dir=context.output_dir,
                state_dir=context.state_dir,
                billing=self._billing.task_payload(plan),
            ),
        )
        return ScheduledEpisodeAudio.from_receipt(
            receipt,
            message=message,
            beat_numbers=plan.beat_numbers,
        )
