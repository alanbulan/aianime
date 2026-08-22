"""Creative Canvas audio-generation application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskScheduler,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.project_workspace.public import ProjectContext

CREATIVE_CANVAS_SPEECH_GENERATION_TASK_TYPE = "freezone_audio_speech"
CREATIVE_CANVAS_MUSIC_GENERATION_TASK_TYPE = "freezone_audio_eleven_music"


class InvalidCreativeCanvasAudioGenerationRequest(ValueError):
    pass


@dataclass(frozen=True)
class CreativeCanvasGeneratedAudio:
    audio_path: Path
    duration_ms: int
    mime_type: str
    model: str
    voice_source: str
    voice_sha256: str


@dataclass(frozen=True)
class StartCreativeCanvasSpeechGenerationCommand:
    context: ProjectContext
    project_dir: Path
    text: str
    emotion_prompt: str
    voice_ref: dict[str, object] | None
    target_episode: int | None = None
    target_beat: int | None = None


@dataclass(frozen=True)
class StartCreativeCanvasMusicGenerationCommand:
    context: ProjectContext
    project_dir: Path
    input_text: str
    response_format: str
    music_length_ms: int
    force_instrumental: bool
    respect_sections_durations: bool
    output_format: str


class CreativeCanvasAudioGenerationUseCases:
    def __init__(
        self,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def start_speech_generation(
        self,
        command: StartCreativeCanvasSpeechGenerationCommand,
    ) -> CreativeCanvasTaskReceipt:
        if not command.text.strip():
            raise InvalidCreativeCanvasAudioGenerationRequest("text is required")
        if len(command.text) > 10_000:
            raise InvalidCreativeCanvasAudioGenerationRequest(
                "text must be <= 10000 characters"
            )

        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_SPEECH_GENERATION_TASK_TYPE,
                queue_kind="default",
                job_id=self._job_ids.new_id(),
                project_dir=command.project_dir,
                payload={
                    "text": command.text,
                    "emotion_prompt": command.emotion_prompt,
                    "voice_ref": command.voice_ref,
                    "account_voice_username": (
                        command.context.requester_username
                        or command.context.owner_username
                    ),
                    "target_episode": command.target_episode,
                    "target_beat": command.target_beat,
                },
            ),
        )

    async def start_music_generation(
        self,
        command: StartCreativeCanvasMusicGenerationCommand,
    ) -> CreativeCanvasTaskReceipt:
        prompt = command.input_text.strip()
        if not prompt:
            raise InvalidCreativeCanvasAudioGenerationRequest("input is required")
        if len(prompt) > 4100:
            raise InvalidCreativeCanvasAudioGenerationRequest(
                "input must be <= 4100 characters"
            )

        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_MUSIC_GENERATION_TASK_TYPE,
                queue_kind="default",
                job_id=self._job_ids.new_id(),
                project_dir=command.project_dir,
                payload={
                    "input": prompt,
                    "response_format": command.response_format,
                    "music_length_ms": command.music_length_ms,
                    "force_instrumental": command.force_instrumental,
                    "respect_sections_durations": command.respect_sections_durations,
                    "output_format": command.output_format,
                },
            ),
        )
