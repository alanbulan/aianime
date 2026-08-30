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
CREATIVE_CANVAS_VOICE_DESIGN_TASK_TYPE = "freezone_voice_design"
CREATIVE_CANVAS_VOICE_PRESET_TASK_TYPE = "freezone_voice_preset"


def _voice_binding_scope(binding: dict[str, str] | None) -> str | None:
    kind = str((binding or {}).get("kind") or "").strip()
    if kind == "project_narrator":
        return "project_narrator"
    if kind in {"character_slot", "identity"}:
        return "character_voice"
    return None


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
    mode: str = "VOICE_CLONE"
    voice: str = ""
    model_selector: str | None = None
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


@dataclass(frozen=True)
class StartCreativeCanvasVoiceDesignCommand:
    context: ProjectContext
    project_dir: Path
    name: str
    model_selector: str
    voice_prompt: str
    preview_text: str
    preferred_name: str
    language: str
    sample_rate: int
    response_format: str
    binding: dict[str, str] | None = None


@dataclass(frozen=True)
class StartCreativeCanvasPresetVoiceCommand:
    context: ProjectContext
    project_dir: Path
    name: str
    model_selector: str
    voice: str
    text: str
    binding: dict[str, str] | None = None


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
        mode = str(command.mode or "VOICE_CLONE").strip().upper()
        voice = str(command.voice or "").strip()
        if mode not in {"SPEECH", "VOICE_CLONE"}:
            raise InvalidCreativeCanvasAudioGenerationRequest(
                "mode must be SPEECH or VOICE_CLONE"
            )
        model_selector = str(command.model_selector or "").strip()
        if mode == "SPEECH" and not voice and not model_selector.startswith("byok:"):
            raise InvalidCreativeCanvasAudioGenerationRequest(
                "voice is required when mode is SPEECH"
            )
        if mode == "SPEECH" and command.voice_ref is not None:
            raise InvalidCreativeCanvasAudioGenerationRequest(
                "voice_ref is not allowed when mode is SPEECH"
            )
        if mode == "VOICE_CLONE" and voice:
            raise InvalidCreativeCanvasAudioGenerationRequest(
                "voice is not allowed when mode is VOICE_CLONE"
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
                    "mode": mode,
                    "voice": voice,
                    "model_selector": model_selector,
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

    async def start_voice_design(
        self,
        command: StartCreativeCanvasVoiceDesignCommand,
    ) -> CreativeCanvasTaskReceipt:
        if not command.model_selector.strip():
            raise InvalidCreativeCanvasAudioGenerationRequest(
                "model_selector is required"
            )
        if not command.voice_prompt.strip() or not command.preview_text.strip():
            raise InvalidCreativeCanvasAudioGenerationRequest(
                "voice_prompt and preview_text are required"
            )
        job_id = self._job_ids.new_id()
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_VOICE_DESIGN_TASK_TYPE,
                queue_kind="default",
                job_id=job_id,
                project_dir=command.project_dir,
                scope=_voice_binding_scope(command.binding),
                payload={
                    "name": command.name,
                    "model_selector": command.model_selector,
                    "voice_prompt": command.voice_prompt,
                    "preview_text": command.preview_text,
                    "preferred_name": command.preferred_name,
                    "language": command.language,
                    "sample_rate": command.sample_rate,
                    "response_format": command.response_format,
                    "binding": command.binding,
                    "display_name": (
                        "设计并绑定项目解说声线"
                        if _voice_binding_scope(command.binding) == "project_narrator"
                        else "设计并绑定角色声线"
                    ),
                },
            ),
        )

    async def start_preset_voice(
        self,
        command: StartCreativeCanvasPresetVoiceCommand,
    ) -> CreativeCanvasTaskReceipt:
        if not command.model_selector.strip() or not command.text.strip():
            raise InvalidCreativeCanvasAudioGenerationRequest(
                "model_selector and text are required"
            )
        job_id = self._job_ids.new_id()
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_VOICE_PRESET_TASK_TYPE,
                queue_kind="default",
                job_id=job_id,
                project_dir=command.project_dir,
                scope=_voice_binding_scope(command.binding),
                payload={
                    "name": command.name,
                    "model_selector": command.model_selector,
                    "voice": command.voice,
                    "text": command.text,
                    "binding": command.binding,
                    "display_name": (
                        "生成并绑定项目解说预设声线"
                        if _voice_binding_scope(command.binding) == "project_narrator"
                        else "生成并绑定预设声线"
                    ),
                },
            ),
        )
