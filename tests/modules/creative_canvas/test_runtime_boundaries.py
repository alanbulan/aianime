from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.creative_canvas.application.generation_history import (
    CreativeCanvasGenerationHistoryUseCases,
    RecordCreativeCanvasGenerationCommand,
)
from ai_anime.modules.creative_canvas.application.job_execution import (
    CreativeCanvasJobExecutionUseCases,
    GenerateCreativeCanvasImageJobCommand,
)
from ai_anime.modules.creative_canvas.application.reverse_prompt import (
    CreativeCanvasReversePromptExecutionUseCases,
)
from ai_anime.modules.creative_canvas.application.vision_analysis import (
    AnalyzeCreativeCanvasVisionCommand,
    CreativeCanvasVisionAnalysisUseCases,
    CreativeCanvasVisionInput,
)
from ai_anime.modules.creative_canvas.infrastructure.job_workspace import (
    LocalCreativeCanvasJobWorkspace,
)


def test_generation_history_use_case_delegates_the_command(tmp_path: Path) -> None:
    captured: list[RecordCreativeCanvasGenerationCommand] = []

    class Writer:
        def append(self, command: RecordCreativeCanvasGenerationCommand):
            captured.append(command)
            return {"id": "history-1"}

    command = RecordCreativeCanvasGenerationCommand(
        project_dir=tmp_path,
        canvas_id="default",
        node_id="node-1",
        task_type="freezone_gen",
        job_id="job-1",
        task_key="task-1",
        status="completed",
        media_type="image",
    )

    assert CreativeCanvasGenerationHistoryUseCases(Writer()).record(command) == {
        "id": "history-1"
    }
    assert captured == [command]


def test_local_job_workspace_owns_the_output_layout(tmp_path: Path) -> None:
    workspace = LocalCreativeCanvasJobWorkspace()
    workspace.initialize(tmp_path)

    assert workspace.output_directory(tmp_path, "freezone_gen") == (
        tmp_path / "freezone" / "_outputs" / "freezone_gen"
    )
    assert (tmp_path / "freezone" / "_uploads").is_dir()
    assert workspace.output_directory(tmp_path, "freezone_gen").is_dir()
    assert workspace.image_output_path(tmp_path, "freezone_gen", "job-1") == (
        tmp_path / "freezone" / "_outputs" / "freezone_gen" / "job-1.png"
    )


@pytest.mark.asyncio
async def test_job_execution_initializes_workspace_before_delegating(
    tmp_path: Path,
) -> None:
    events: list[object] = []

    class Workspace:
        def initialize(self, project_dir: Path) -> None:
            events.append(("initialize", project_dir))

    class Images:
        async def generate(self, command):
            events.append(("generate", command))
            return tmp_path / "result.png"

    command = GenerateCreativeCanvasImageJobCommand(
        project_dir=tmp_path,
        job_id="job-1",
        prompt="prompt",
    )
    use_cases = CreativeCanvasJobExecutionUseCases(
        Workspace(),
        Images(),
        object(),
        object(),
        object(),
        object(),
        object(),
    )

    assert await use_cases.generate_image(command) == tmp_path / "result.png"
    assert events == [("initialize", tmp_path), ("generate", command)]


@pytest.mark.asyncio
async def test_vision_analysis_use_case_delegates_the_command() -> None:
    captured: list[AnalyzeCreativeCanvasVisionCommand] = []

    class Analyzer:
        async def analyze(self, command: AnalyzeCreativeCanvasVisionCommand):
            captured.append(command)
            return "model-1", "result"

    command = AnalyzeCreativeCanvasVisionCommand(
        prompt="analyze",
        images=(CreativeCanvasVisionInput(data=b"image"),),
    )

    assert await CreativeCanvasVisionAnalysisUseCases(Analyzer()).analyze(command) == (
        "model-1",
        "result",
    )
    assert captured == [command]


@pytest.mark.asyncio
async def test_reverse_prompt_execution_delegates_to_generator(tmp_path: Path) -> None:
    image_path = tmp_path / "source.png"
    captured: list[Path] = []

    class Generator:
        async def generate(self, path: Path) -> str:
            captured.append(path)
            return "reverse prompt"

    use_cases = CreativeCanvasReversePromptExecutionUseCases(Generator())

    assert await use_cases.generate(image_path) == "reverse prompt"
    assert captured == [image_path]
