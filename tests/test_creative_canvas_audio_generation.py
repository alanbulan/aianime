from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.canvas import audio as audio_routes
from ai_anime.api.schemas import FreezoneAudioMusicRequest, FreezoneAudioSpeechRequest
from ai_anime.modules.creative_canvas.application.audio_generation import (
    CREATIVE_CANVAS_MUSIC_GENERATION_TASK_TYPE,
    CREATIVE_CANVAS_SPEECH_GENERATION_TASK_TYPE,
    CreativeCanvasAudioGenerationUseCases,
    InvalidCreativeCanvasAudioGenerationRequest,
    StartCreativeCanvasMusicGenerationCommand,
    StartCreativeCanvasSpeechGenerationCommand,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_backend.limits import ProjectTaskLimitExceeded


def _project_context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="owner",
        requester_user_id="viewer-1",
        requester_username="viewer",
        requester_principals=(("user", "viewer-1"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def _receipt(task_type: str, job_id: str) -> CreativeCanvasTaskReceipt:
    return CreativeCanvasTaskReceipt(
        task_type=task_type,
        job_id=job_id,
        task_key=f"task:{task_type}:{job_id}",
        task_episode=0,
        task_scope=job_id,
        backend="celery",
        queue="default",
        task_id="task-1",
    )


class _FixedJobIds:
    def __init__(self, *job_ids: str) -> None:
        self._job_ids = iter(job_ids)

    def new_id(self) -> str:
        return next(self._job_ids)


class _CapturingScheduler:
    def __init__(self, context: ProjectContext) -> None:
        self._context = context
        self.tasks: list[CreativeCanvasTaskSubmission] = []

    async def enqueue(
        self,
        context: ProjectContext,
        task: CreativeCanvasTaskSubmission,
    ) -> CreativeCanvasTaskReceipt:
        assert context is self._context
        self.tasks.append(task)
        return _receipt(task.task_type, task.job_id)


@pytest.mark.asyncio
async def test_audio_generation_enqueues_exact_payloads(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    scheduler = _CapturingScheduler(context)
    use_cases = CreativeCanvasAudioGenerationUseCases(
        _FixedJobIds("speech-1", "music-1"),
        scheduler,
    )
    voice_ref = {
        "scope": "user_custom",
        "character_name": "",
        "identity_id": "",
        "slot": "",
        "voice_id": "fv-viewer",
    }

    speech = await use_cases.start_speech_generation(
        StartCreativeCanvasSpeechGenerationCommand(
            context=context,
            project_dir=context.output_dir,
            text="  雨声压低了脚步。  ",
            emotion_prompt="紧张、压低声音",
            voice_ref=voice_ref,
            target_episode=2,
            target_beat=3,
        )
    )
    music = await use_cases.start_music_generation(
        StartCreativeCanvasMusicGenerationCommand(
            context=context,
            project_dir=context.output_dir,
            input_text="  cinematic rain-soaked suspense music  ",
            model="LingShan-MU-11",
            response_format="mp3",
            music_length_ms=45_000,
            force_instrumental=True,
            respect_sections_durations=False,
            output_format="mp3_44100_128",
        )
    )

    assert speech == _receipt(CREATIVE_CANVAS_SPEECH_GENERATION_TASK_TYPE, "speech-1")
    assert music == _receipt(CREATIVE_CANVAS_MUSIC_GENERATION_TASK_TYPE, "music-1")
    assert scheduler.tasks == [
        CreativeCanvasTaskSubmission(
            task_type=CREATIVE_CANVAS_SPEECH_GENERATION_TASK_TYPE,
            queue_kind="default",
            job_id="speech-1",
            project_dir=context.output_dir,
            payload={
                "text": "  雨声压低了脚步。  ",
                "emotion_prompt": "紧张、压低声音",
                "voice_ref": voice_ref,
                "account_voice_username": "viewer",
                "target_episode": 2,
                "target_beat": 3,
            },
        ),
        CreativeCanvasTaskSubmission(
            task_type=CREATIVE_CANVAS_MUSIC_GENERATION_TASK_TYPE,
            queue_kind="default",
            job_id="music-1",
            project_dir=context.output_dir,
            payload={
                "input": "cinematic rain-soaked suspense music",
                "model": "LingShan-MU-11",
                "response_format": "mp3",
                "music_length_ms": 45_000,
                "force_instrumental": True,
                "respect_sections_durations": False,
                "output_format": "mp3_44100_128",
            },
        ),
    ]


@pytest.mark.asyncio
async def test_audio_generation_preserves_input_validation(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    use_cases = CreativeCanvasAudioGenerationUseCases(
        _FixedJobIds(), _CapturingScheduler(context)
    )

    with pytest.raises(
        InvalidCreativeCanvasAudioGenerationRequest,
        match="text is required",
    ):
        await use_cases.start_speech_generation(
            StartCreativeCanvasSpeechGenerationCommand(
                context=context,
                project_dir=context.output_dir,
                text=" \t ",
                emotion_prompt="",
                voice_ref=None,
            )
        )
    with pytest.raises(
        InvalidCreativeCanvasAudioGenerationRequest,
        match="text must be <= 10000 characters",
    ):
        await use_cases.start_speech_generation(
            StartCreativeCanvasSpeechGenerationCommand(
                context=context,
                project_dir=context.output_dir,
                text="x" * 10_001,
                emotion_prompt="",
                voice_ref=None,
            )
        )
    with pytest.raises(
        InvalidCreativeCanvasAudioGenerationRequest,
        match="input is required",
    ):
        await use_cases.start_music_generation(
            StartCreativeCanvasMusicGenerationCommand(
                context=context,
                project_dir=context.output_dir,
                input_text=" \n ",
                model="model",
                response_format="mp3",
                music_length_ms=30_000,
                force_instrumental=True,
                respect_sections_durations=True,
                output_format="mp3_44100_128",
            )
        )
    with pytest.raises(
        InvalidCreativeCanvasAudioGenerationRequest,
        match="input must be <= 4100 characters",
    ):
        await use_cases.start_music_generation(
            StartCreativeCanvasMusicGenerationCommand(
                context=context,
                project_dir=context.output_dir,
                input_text=" " + "x" * 4101 + " ",
                model="model",
                response_format="mp3",
                music_length_ms=30_000,
                force_instrumental=True,
                respect_sections_durations=True,
                output_format="mp3_44100_128",
            )
        )


async def _fake_resolve_project_scope(
    project: str,
    user: dict,
    *,
    required_role: str,
    operation: str,
    context: ProjectContext,
):
    assert project == "project-1"
    assert user == {"username": "viewer"}
    assert required_role == "editor"
    assert operation == "access freezone project files"
    return SimpleNamespace(ctx=context, project_dir=context.output_dir)


@pytest.mark.asyncio
async def test_audio_routes_preserve_success_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)
    commands: list[object] = []

    async def resolve(*args, **kwargs):
        return await _fake_resolve_project_scope(*args, **kwargs, context=context)

    class UseCases:
        async def start_speech_generation(self, command):
            commands.append(command)
            return _receipt(CREATIVE_CANVAS_SPEECH_GENERATION_TASK_TYPE, "speech-1")

        async def start_music_generation(self, command):
            commands.append(command)
            return _receipt(CREATIVE_CANVAS_MUSIC_GENERATION_TASK_TYPE, "music-1")

    monkeypatch.setattr(audio_routes, "resolve_project_scope", resolve)
    monkeypatch.setattr(
        audio_routes,
        "creative_canvas_audio_generation_use_cases",
        lambda: UseCases(),
    )

    speech = await audio_routes.freezone_audio_speech(
        project="project-1",
        body=FreezoneAudioSpeechRequest(
            text="雨声压低了脚步。",
            emotion_prompt="紧张",
            voice_ref={"scope": "user_custom", "voice_id": "fv-viewer"},
            target_episode=1,
            target_beat=2,
        ),
        user={"username": "viewer"},
    )
    music = await audio_routes.freezone_audio_eleven_music(
        project="project-1",
        body=FreezoneAudioMusicRequest(input="cinematic suspense"),
        user={"username": "viewer"},
    )

    assert speech["data"] == {
        "task_type": CREATIVE_CANVAS_SPEECH_GENERATION_TASK_TYPE,
        "job_id": "speech-1",
        "task_key": "task:freezone_audio_speech:speech-1",
        "task_episode": 0,
        "task_scope": "speech-1",
        "backend": "celery",
        "queue": "default",
        "task_id": "task-1",
    }
    assert music["data"]["task_type"] == CREATIVE_CANVAS_MUSIC_GENERATION_TASK_TYPE
    assert commands[0].voice_ref == {
        "scope": "user_custom",
        "character_name": "",
        "identity_id": "",
        "slot": "",
        "voice_id": "fv-viewer",
    }
    assert commands[0].target_episode == 1
    assert commands[0].target_beat == 2
    assert commands[1].input_text == "cinematic suspense"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("handler", "failure", "status_code", "detail"),
    [
        (
            "speech",
            InvalidCreativeCanvasAudioGenerationRequest("text is required"),
            400,
            "text is required",
        ),
        (
            "speech",
            RuntimeError("broker unavailable"),
            503,
            "failed to start freezone audio speech task: broker unavailable",
        ),
        (
            "music",
            InvalidCreativeCanvasAudioGenerationRequest("input is required"),
            400,
            "input is required",
        ),
        (
            "music",
            RuntimeError("broker unavailable"),
            503,
            "failed to start freezone audio music task: broker unavailable",
        ),
    ],
)
async def test_audio_routes_preserve_error_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    handler: str,
    failure: Exception,
    status_code: int,
    detail: str,
) -> None:
    context = _project_context(tmp_path)

    async def resolve(*args, **kwargs):
        return await _fake_resolve_project_scope(*args, **kwargs, context=context)

    class FailingUseCases:
        async def start_speech_generation(self, _command):
            raise failure

        async def start_music_generation(self, _command):
            raise failure

    monkeypatch.setattr(audio_routes, "resolve_project_scope", resolve)
    monkeypatch.setattr(
        audio_routes,
        "creative_canvas_audio_generation_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        if handler == "speech":
            await audio_routes.freezone_audio_speech(
                project="project-1",
                body=FreezoneAudioSpeechRequest(text="line"),
                user={"username": "viewer"},
            )
        else:
            await audio_routes.freezone_audio_eleven_music(
                project="project-1",
                body=FreezoneAudioMusicRequest(input="music"),
                user={"username": "viewer"},
            )

    assert exc.value.status_code == status_code
    assert exc.value.detail == detail


@pytest.mark.asyncio
@pytest.mark.parametrize("handler", ["speech", "music"])
async def test_audio_routes_preserve_project_task_limits(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    handler: str,
) -> None:
    context = _project_context(tmp_path)
    failure = ProjectTaskLimitExceeded("project-1", "default", 1, 1)

    async def resolve(*args, **kwargs):
        return await _fake_resolve_project_scope(*args, **kwargs, context=context)

    class FailingUseCases:
        async def start_speech_generation(self, _command):
            raise failure

        async def start_music_generation(self, _command):
            raise failure

    monkeypatch.setattr(audio_routes, "resolve_project_scope", resolve)
    monkeypatch.setattr(
        audio_routes,
        "creative_canvas_audio_generation_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(ProjectTaskLimitExceeded) as exc:
        if handler == "speech":
            await audio_routes.freezone_audio_speech(
                project="project-1",
                body=FreezoneAudioSpeechRequest(text="line"),
                user={"username": "viewer"},
            )
        else:
            await audio_routes.freezone_audio_eleven_music(
                project="project-1",
                body=FreezoneAudioMusicRequest(input="music"),
                user={"username": "viewer"},
            )
    assert exc.value is failure
