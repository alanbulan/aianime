"""Episode IndexTTS2 audio scheduling use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionAudioVoicePrerequisiteChecker,
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
class EpisodeAudioTask:
    episode_num: int
    mode: str
    beat_numbers: list[int] | None
    output_dir: str | Path
    state_dir: str | Path

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode_num,
            "mode": self.mode,
            "beat_numbers": self.beat_numbers,
            "output_dir": str(self.output_dir),
            "state_dir": str(self.state_dir),
        }


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

    @classmethod
    def from_receipt(
        cls,
        receipt: EpisodeAudioTaskReceipt,
        *,
        message: str,
    ) -> ScheduledEpisodeAudio:
        return cls(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
            message=message,
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

    def __init__(self, errors: list[str]) -> None:
        self.errors = tuple(errors)
        preview = "；".join(errors[:5])
        suffix = " ..." if len(errors) > 5 else ""
        super().__init__(f"{preview}{suffix}")


class EpisodeAudioUseCases:
    def __init__(
        self,
        beat_source: ProductionEpisodeBeatSource,
        voice_prerequisites: ProductionAudioVoicePrerequisiteChecker,
        scheduler: ProductionEpisodeAudioScheduler,
    ) -> None:
        self._beat_source = beat_source
        self._voice_prerequisites = voice_prerequisites
        self._scheduler = scheduler

    async def generate(
        self,
        context: ProjectContext,
        command: GenerateEpisodeAudioCommand,
    ) -> ScheduledEpisodeAudio:
        beats = await self._beat_source.for_episode(context, command.episode_num)
        if not beats:
            raise EpisodeAudioBeatsMissing(command.episode_num)

        mode = command.mode or "sync_changed"
        await self._require_voice_prerequisites(
            context,
            episode_num=command.episode_num,
            beat_numbers=command.beat_numbers,
            mode=mode,
        )
        return await self._schedule(
            context,
            episode_num=command.episode_num,
            mode=mode,
            beat_numbers=command.beat_numbers,
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

        await self._require_voice_prerequisites(
            context,
            episode_num=episode_num,
            beat_numbers=[beat_num],
            mode="redo_selected",
        )
        return await self._schedule(
            context,
            episode_num=episode_num,
            mode="redo_selected",
            beat_numbers=[beat_num],
            message=f"第 {episode_num} 集 Beat {beat_num} 语音生成已进入队列",
        )

    async def _require_voice_prerequisites(
        self,
        context: ProjectContext,
        *,
        episode_num: int,
        beat_numbers: list[int] | None,
        mode: str,
    ) -> None:
        errors = await self._voice_prerequisites.check(
            context,
            episode_num,
            beat_numbers,
            mode,
        )
        if errors:
            raise AudioVoicePrerequisitesMissing(errors)

    async def _schedule(
        self,
        context: ProjectContext,
        *,
        episode_num: int,
        mode: str,
        beat_numbers: list[int] | None,
        message: str,
    ) -> ScheduledEpisodeAudio:
        receipt = await self._scheduler.enqueue(
            context,
            EpisodeAudioTask(
                episode_num=episode_num,
                mode=mode,
                beat_numbers=beat_numbers,
                output_dir=context.output_dir,
                state_dir=context.state_dir,
            ),
        )
        return ScheduledEpisodeAudio.from_receipt(receipt, message=message)
