from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.creative_canvas import text as text_routes
from ai_anime.api.routes.creative_canvas.text_schemas import (
    FreezoneStoryScriptGenerateRequest,
    FreezoneTextTranslateRequest,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.application.text_processing import (
    CREATIVE_CANVAS_STORY_SCRIPT_TASK_TYPE,
    CREATIVE_CANVAS_TEXT_TRANSLATION_TASK_TYPE,
    CreativeCanvasTextProcessingSourceMissing,
    CreativeCanvasTextProcessingUseCases,
    InvalidCreativeCanvasTextProcessingRequest,
    StartCreativeCanvasStoryScriptCommand,
    StartCreativeCanvasTextTranslationCommand,
)
from ai_anime.modules.creative_canvas.infrastructure.text_sources import (
    LocalCreativeCanvasTextSourceReader,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import ProjectTaskLimitExceeded


def _project_context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-1",
        owner_username="alice",
        requester_user_id="user-1",
        requester_username="alice",
        requester_principals=(("user", "user-1"),),
        effective_role="owner",
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


class _UnusedSources:
    def resolve(self, *_args) -> Path:
        raise AssertionError("source resolver must not be called")

    def exists(self, *_args) -> bool:
        raise AssertionError("source resolver must not be called")


class _UnusedReader:
    def read(self, *_args) -> str:
        raise AssertionError("text reader must not be called")


@pytest.mark.asyncio
async def test_text_processing_enqueues_exact_payloads_and_prefers_source_text(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    scheduler = _CapturingScheduler(context)
    use_cases = CreativeCanvasTextProcessingUseCases(
        _UnusedSources(),
        _UnusedReader(),
        _FixedJobIds("translate-1", "story-1"),
        scheduler,
    )

    translation = await use_cases.start_translation(
        StartCreativeCanvasTextTranslationCommand(
            context=context,
            project_dir=context.output_dir,
            text="  雨夜街头  ",
            model="cloud-text-standard",
            model_selector=None,
            node_type="image",
            canvas_id="canvas-1",
            node_id="node-1",
        )
    )
    story = await use_cases.start_story_script(
        StartCreativeCanvasStoryScriptCommand(
            context=context,
            project_dir=context.output_dir,
            source_text="  沈昭昭在深夜办公室醒来。  ",
            source_url="must-not-be-read.txt",
            prompt="节奏要快",
            model="newapi_gemini_flash",
            model_selector=None,
            video_url=None,
            duration_sec=None,
            character_refs=(),
            max_frames=20,
            scene_threshold=0.3,
            canvas_id="canvas-2",
            node_id="node-2",
        )
    )

    assert translation == _receipt(
        CREATIVE_CANVAS_TEXT_TRANSLATION_TASK_TYPE, "translate-1"
    )
    assert story == _receipt(CREATIVE_CANVAS_STORY_SCRIPT_TASK_TYPE, "story-1")
    assert scheduler.tasks == [
        CreativeCanvasTaskSubmission(
            task_type=CREATIVE_CANVAS_TEXT_TRANSLATION_TASK_TYPE,
            queue_kind="default",
            job_id="translate-1",
            project_dir=context.output_dir,
            payload={
                "text": "  雨夜街头  ",
                "model": "cloud-text-standard",
                "model_id": "",
                "node_type": "image",
                "canvas_id": "canvas-1",
                "node_id": "node-1",
            },
        ),
        CreativeCanvasTaskSubmission(
            task_type=CREATIVE_CANVAS_STORY_SCRIPT_TASK_TYPE,
            queue_kind="default",
            job_id="story-1",
            project_dir=context.output_dir,
            payload={
                "source_text": "沈昭昭在深夜办公室醒来。",
                "prompt": "节奏要快",
                "model": "newapi_gemini_flash",
                "model_id": "",
                "video_path": "",
                "duration_sec": None,
                "max_frames": 20,
                "scene_threshold": 0.3,
                "character_refs": [],
                "character_image_paths": [],
                "canvas_id": "canvas-2",
                "node_id": "node-2",
            },
        ),
    ]


@pytest.mark.asyncio
async def test_story_script_reads_gb18030_source_file(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    source_path = tmp_path / "script.txt"
    source_path.write_bytes("  雨巷里，林昭撑伞。  ".encode("gb18030"))
    scheduler = _CapturingScheduler(context)

    class Sources:
        def resolve(self, project_dir: Path, source_url: str) -> Path:
            assert project_dir == context.output_dir
            assert source_url == "script.txt"
            return source_path

        def exists(self, path: Path) -> bool:
            return path.exists()

    await CreativeCanvasTextProcessingUseCases(
        Sources(),
        LocalCreativeCanvasTextSourceReader(),
        _FixedJobIds("story-1"),
        scheduler,
    ).start_story_script(
        StartCreativeCanvasStoryScriptCommand(
            context=context,
            project_dir=context.output_dir,
            source_text="",
            source_url="script.txt",
            prompt="",
            model="model-1",
            model_selector=None,
            video_url=None,
            duration_sec=None,
            character_refs=(),
            max_frames=20,
            scene_threshold=0.3,
        )
    )

    assert scheduler.tasks[0].payload["source_text"] == "雨巷里，林昭撑伞。"


@pytest.mark.asyncio
async def test_text_processing_rejects_blank_inputs(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    unused = _UnusedReader()
    use_cases = CreativeCanvasTextProcessingUseCases(
        _UnusedSources(),
        unused,
        unused,
        unused,
    )

    with pytest.raises(
        InvalidCreativeCanvasTextProcessingRequest,
        match="text is required",
    ):
        await use_cases.start_translation(
            StartCreativeCanvasTextTranslationCommand(
                context=context,
                project_dir=context.output_dir,
                text=" \t ",
                model="model-1",
                model_selector=None,
                node_type="generic",
            )
        )
    with pytest.raises(
        InvalidCreativeCanvasTextProcessingRequest,
        match="source_text, source_url, video_url or character_refs is required",
    ):
        await use_cases.start_story_script(
            StartCreativeCanvasStoryScriptCommand(
                context=context,
                project_dir=context.output_dir,
                source_text=" ",
                source_url=None,
                prompt="",
                model="model-1",
                model_selector=None,
                video_url=None,
                duration_sec=None,
                character_refs=(),
                max_frames=20,
                scene_threshold=0.3,
            )
        )

    with pytest.raises(
        InvalidCreativeCanvasTextProcessingRequest,
        match="model is required",
    ):
        await use_cases.start_translation(
            StartCreativeCanvasTextTranslationCommand(
                context=context,
                project_dir=context.output_dir,
                text="hello",
                model=" \t ",
                model_selector=None,
                node_type="generic",
            )
        )
    with pytest.raises(
        InvalidCreativeCanvasTextProcessingRequest,
        match="model is required",
    ):
        await use_cases.start_story_script(
            StartCreativeCanvasStoryScriptCommand(
                context=context,
                project_dir=context.output_dir,
                source_text="story",
                source_url=None,
                prompt="",
                model=" \t ",
                model_selector=None,
                video_url=None,
                duration_sec=None,
                character_refs=(),
                max_frames=20,
                scene_threshold=0.3,
            )
        )


@pytest.mark.asyncio
async def test_story_script_maps_invalid_missing_and_unsupported_sources(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    missing = tmp_path / "missing.txt"

    class InvalidSources:
        def resolve(self, *_args) -> Path:
            raise ValueError("resolved path escapes project directory")

        def exists(self, *_args) -> bool:
            raise AssertionError("exists must not be called")

    class MissingSources:
        def resolve(self, *_args) -> Path:
            return missing

        def exists(self, *_args) -> bool:
            return False

    class ExistingSources(MissingSources):
        def exists(self, *_args) -> bool:
            return True

    class InvalidEncodingReader:
        def read(self, *_args) -> str:
            raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid")

    command = StartCreativeCanvasStoryScriptCommand(
        context=context,
        project_dir=context.output_dir,
        source_text="",
        source_url="script.txt",
        prompt="",
        model="model-1",
        model_selector=None,
        video_url=None,
        duration_sec=None,
        character_refs=(),
        max_frames=20,
        scene_threshold=0.3,
    )
    unused = _UnusedReader()
    with pytest.raises(
        InvalidCreativeCanvasTextProcessingRequest,
        match="resolved path escapes project directory",
    ):
        await CreativeCanvasTextProcessingUseCases(
            InvalidSources(), unused, unused, unused
        ).start_story_script(command)
    with pytest.raises(
        CreativeCanvasTextProcessingSourceMissing,
        match="source not found",
    ) as exc:
        await CreativeCanvasTextProcessingUseCases(
            MissingSources(), unused, unused, unused
        ).start_story_script(command)
    assert exc.value.source_path == missing
    with pytest.raises(
        InvalidCreativeCanvasTextProcessingRequest,
        match="unsupported text encoding: missing.txt",
    ):
        await CreativeCanvasTextProcessingUseCases(
            ExistingSources(), InvalidEncodingReader(), unused, unused
        ).start_story_script(command)


async def _fake_resolve_project_scope(
    project: str,
    user: dict,
    *,
    required_role: str,
    operation: str,
    context: ProjectContext,
):
    assert project == "project-1"
    assert user == {"username": "alice"}
    assert required_role == "editor"
    assert operation == "access freezone project files"
    return SimpleNamespace(ctx=context, project_dir=context.output_dir)


@pytest.mark.asyncio
async def test_text_routes_preserve_success_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)
    commands: list[object] = []

    async def resolve(*args, **kwargs):
        return await _fake_resolve_project_scope(*args, **kwargs, context=context)

    class UseCases:
        async def start_translation(self, command):
            commands.append(command)
            return _receipt(CREATIVE_CANVAS_TEXT_TRANSLATION_TASK_TYPE, "translate-1")

        async def start_story_script(self, command):
            commands.append(command)
            return _receipt(CREATIVE_CANVAS_STORY_SCRIPT_TASK_TYPE, "story-1")

    monkeypatch.setattr(text_routes, "resolve_project_scope", resolve)
    monkeypatch.setattr(
        text_routes,
        "creative_canvas_text_processing_use_cases",
        lambda: UseCases(),
    )

    translation = await text_routes.freezone_text_translate(
        project="project-1",
        body=FreezoneTextTranslateRequest(
            text="电影感特写，雨夜街头",
            model="cloud-text-standard",
            node_type="image",
        ),
        user={"username": "alice"},
    )
    story = await text_routes.freezone_story_script_generate(
        project="project-1",
        body=FreezoneStoryScriptGenerateRequest(
            source_text="沈昭昭在深夜办公室醒来。",
            model="cloud-text-standard",
        ),
        user={"username": "alice"},
    )

    assert translation["data"] == {
        "task_type": CREATIVE_CANVAS_TEXT_TRANSLATION_TASK_TYPE,
        "job_id": "translate-1",
        "task_key": "task:freezone_text_translate:translate-1",
        "task_episode": 0,
        "task_scope": "translate-1",
        "backend": "celery",
        "queue": "default",
        "task_id": "task-1",
    }
    assert story["data"]["task_type"] == CREATIVE_CANVAS_STORY_SCRIPT_TASK_TYPE
    assert commands[0].text == "电影感特写，雨夜街头"
    assert commands[0].model == "cloud-text-standard"
    assert commands[1].source_text == "沈昭昭在深夜办公室醒来。"
    assert commands[1].prompt == "根据我上传的剧本生成一个完整的故事脚本"
    assert commands[1].model == "cloud-text-standard"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("handler", "failure", "status_code", "detail"),
    [
        (
            "translation",
            InvalidCreativeCanvasTextProcessingRequest("text is required"),
            400,
            "text is required",
        ),
        (
            "translation",
            RuntimeError("broker unavailable"),
            503,
            "failed to start text translate task: broker unavailable",
        ),
        (
            "story",
            InvalidCreativeCanvasTextProcessingRequest("invalid source"),
            400,
            "invalid source",
        ),
        (
            "story",
            CreativeCanvasTextProcessingSourceMissing(Path("missing.txt")),
            404,
            "source not found: missing.txt",
        ),
        ("story", ValueError("invalid model"), 400, "invalid model"),
        (
            "story",
            RuntimeError("broker unavailable"),
            503,
            "failed to start story script task: broker unavailable",
        ),
    ],
)
async def test_text_routes_preserve_error_contract(
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
        async def start_translation(self, _command):
            raise failure

        async def start_story_script(self, _command):
            raise failure

    monkeypatch.setattr(text_routes, "resolve_project_scope", resolve)
    monkeypatch.setattr(
        text_routes,
        "creative_canvas_text_processing_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        if handler == "translation":
            await text_routes.freezone_text_translate(
                project="project-1",
                body=FreezoneTextTranslateRequest(
                    text="hello",
                    model="cloud-text-standard",
                ),
                user={"username": "alice"},
            )
        else:
            await text_routes.freezone_story_script_generate(
                project="project-1",
                body=FreezoneStoryScriptGenerateRequest(
                    source_text="story",
                    model="cloud-text-standard",
                ),
                user={"username": "alice"},
            )

    assert exc.value.status_code == status_code
    assert exc.value.detail == detail


@pytest.mark.asyncio
@pytest.mark.parametrize("handler", ["translation", "story"])
async def test_text_routes_preserve_project_task_limits(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    handler: str,
) -> None:
    context = _project_context(tmp_path)
    failure = ProjectTaskLimitExceeded("project-1", "default", 1, 1)

    async def resolve(*args, **kwargs):
        return await _fake_resolve_project_scope(*args, **kwargs, context=context)

    class FailingUseCases:
        async def start_translation(self, _command):
            raise failure

        async def start_story_script(self, _command):
            raise failure

    monkeypatch.setattr(text_routes, "resolve_project_scope", resolve)
    monkeypatch.setattr(
        text_routes,
        "creative_canvas_text_processing_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(ProjectTaskLimitExceeded) as exc:
        if handler == "translation":
            await text_routes.freezone_text_translate(
                project="project-1",
                body=FreezoneTextTranslateRequest(
                    text="hello",
                    model="cloud-text-standard",
                ),
                user={"username": "alice"},
            )
        else:
            await text_routes.freezone_story_script_generate(
                project="project-1",
                body=FreezoneStoryScriptGenerateRequest(
                    source_text="story",
                    model="cloud-text-standard",
                ),
                user={"username": "alice"},
            )
    assert exc.value is failure
