from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.canvas_image_schemas import FreezoneMarkDetectRequest
from ai_anime.api.routes.canvas import image as mark_detection_routes
from ai_anime.modules.creative_canvas.application.mark_detection import (
    CreativeCanvasMarkDetectionFailed,
    CreativeCanvasMarkDetectionUseCases,
    DetectedCreativeCanvasMark,
    DetectCreativeCanvasMarkCommand,
    InvalidCreativeCanvasMarkRequest,
)
from ai_anime.modules.creative_canvas.domain.mark_detection import (
    CreativeCanvasMarkSelection,
    CreativeCanvasMarkSelectionRequired,
)
from ai_anime.modules.creative_canvas.infrastructure import (
    mark_detection as mark_detection_adapters,
)
from ai_anime.modules.creative_canvas.infrastructure.media_sources import (
    ProjectCreativeCanvasMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.infrastructure.mark_detection import (
    FreezoneVisionMarkDetector,
)


@pytest.mark.parametrize(
    "selection",
    [
        CreativeCanvasMarkSelection(point_x=0.25, point_y=0.75),
        CreativeCanvasMarkSelection(
            box_x=0.1,
            box_y=0.2,
            box_width=0.3,
            box_height=0.4,
        ),
    ],
)
def test_mark_selection_accepts_complete_point_or_box(
    selection: CreativeCanvasMarkSelection,
) -> None:
    selection.require_target()


def test_mark_selection_rejects_incomplete_target() -> None:
    selection = CreativeCanvasMarkSelection(point_x=0.25, box_width=0.4)

    with pytest.raises(
        CreativeCanvasMarkSelectionRequired,
        match="point or box selection is required",
    ):
        selection.require_target()


@pytest.mark.asyncio
async def test_mark_detection_use_case_delegates_and_maps_result(
    tmp_path: Path,
) -> None:
    image_path = tmp_path / "source.png"
    selection = CreativeCanvasMarkSelection(point_x=0.25, point_y=0.75)

    class FakeSources:
        def resolve(self, project_dir: Path, source_url: str) -> Path:
            assert project_dir == tmp_path
            assert source_url == "/static/alice/demo/source.png"
            return image_path

    class FakeDetector:
        async def detect(
            self,
            received_path: Path,
            received_selection: CreativeCanvasMarkSelection,
        ) -> DetectedCreativeCanvasMark:
            assert received_path == image_path
            assert received_selection is selection
            return DetectedCreativeCanvasMark(
                label="旧伞",
                note="框选区域中的物体",
                provider="newapi",
                model="vision-model",
            )

    result = await CreativeCanvasMarkDetectionUseCases(
        FakeSources(),
        FakeDetector(),
    ).detect(
        DetectCreativeCanvasMarkCommand(
            project_dir=tmp_path,
            source_url="/static/alice/demo/source.png",
            selection=selection,
        )
    )

    assert result.source_url == "/static/alice/demo/source.png"
    assert result.selection is selection
    assert result.label == "旧伞"
    assert result.note == "框选区域中的物体"
    assert result.provider == "newapi"
    assert result.model == "vision-model"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("source_url", "selection", "message"),
    [
        (
            "",
            CreativeCanvasMarkSelection(point_x=0.2, point_y=0.3),
            "source_url is required",
        ),
        (
            "source.png",
            CreativeCanvasMarkSelection(point_x=0.2),
            "point or box selection is required",
        ),
    ],
)
async def test_mark_detection_use_case_rejects_invalid_request(
    tmp_path: Path,
    source_url: str,
    selection: CreativeCanvasMarkSelection,
    message: str,
) -> None:
    class UnusedSources:
        def resolve(self, _project_dir: Path, _source_url: str) -> Path:
            raise AssertionError("source resolver must not be called")

    class UnusedDetector:
        async def detect(self, *_args) -> DetectedCreativeCanvasMark:
            raise AssertionError("detector must not be called")

    use_cases = CreativeCanvasMarkDetectionUseCases(
        UnusedSources(),
        UnusedDetector(),
    )

    with pytest.raises(InvalidCreativeCanvasMarkRequest, match=message):
        await use_cases.detect(
            DetectCreativeCanvasMarkCommand(
                project_dir=tmp_path,
                source_url=source_url,
                selection=selection,
            )
        )


@pytest.mark.asyncio
async def test_mark_detection_use_case_maps_source_and_detector_failures(
    tmp_path: Path,
) -> None:
    selection = CreativeCanvasMarkSelection(point_x=0.2, point_y=0.3)

    class InvalidSources:
        def resolve(self, _project_dir: Path, _source_url: str) -> Path:
            raise ValueError("resolved path escapes project directory")

    class FailingDetector:
        async def detect(
            self,
            _image_path: Path,
            _selection: CreativeCanvasMarkSelection,
        ) -> DetectedCreativeCanvasMark:
            raise RuntimeError("vision unavailable")

    command = DetectCreativeCanvasMarkCommand(
        project_dir=tmp_path,
        source_url="source.png",
        selection=selection,
    )
    with pytest.raises(
        InvalidCreativeCanvasMarkRequest,
        match="resolved path escapes project directory",
    ):
        await CreativeCanvasMarkDetectionUseCases(
            InvalidSources(),
            FailingDetector(),
        ).detect(command)

    class ValidSources:
        def resolve(self, _project_dir: Path, _source_url: str) -> Path:
            return tmp_path / "source.png"

    with pytest.raises(
        CreativeCanvasMarkDetectionFailed,
        match="mark detect failed: vision unavailable",
    ):
        await CreativeCanvasMarkDetectionUseCases(
            ValidSources(),
            FailingDetector(),
        ).detect(command)


def test_project_image_source_resolver_preserves_static_url_mapping(
    tmp_path: Path,
) -> None:
    result = ProjectCreativeCanvasMediaSourceResolver().resolve(
        tmp_path,
        "/static/alice/demo/freezone/_uploads/source.png?v=1",
    )

    assert result == (tmp_path / "freezone" / "_uploads" / "source.png").resolve()


@pytest.mark.asyncio
async def test_freezone_vision_detector_delegates_to_existing_implementation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    image_path = tmp_path / "source.png"
    selection = CreativeCanvasMarkSelection(
        box_x=0.1,
        box_y=0.2,
        box_width=0.3,
        box_height=0.4,
    )

    async def fake_detect_freezone_mark(**kwargs):
        assert kwargs == {
            "image_path": image_path,
            "point_x": None,
            "point_y": None,
            "box_x": 0.1,
            "box_y": 0.2,
            "box_width": 0.3,
            "box_height": 0.4,
        }
        return {
            "label": "旧伞",
            "note": "框选区域中的物体",
            "provider": "newapi",
            "model": "vision-model",
        }

    monkeypatch.setattr(
        mark_detection_adapters,
        "detect_freezone_mark",
        fake_detect_freezone_mark,
    )

    result = await FreezoneVisionMarkDetector().detect(image_path, selection)

    assert result == DetectedCreativeCanvasMark(
        label="旧伞",
        note="框选区域中的物体",
        provider="newapi",
        model="vision-model",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "status_code"),
    [
        (InvalidCreativeCanvasMarkRequest("invalid source"), 400),
        (CreativeCanvasMarkDetectionFailed("mark detect failed: unavailable"), 500),
    ],
)
async def test_mark_detection_route_preserves_error_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure: Exception,
    status_code: int,
) -> None:
    async def fake_resolve_project_scope(
        project: str,
        user: dict,
        *,
        required_role: str,
        operation: str,
    ):
        assert project == "project-1"
        assert user == {"username": "alice"}
        assert required_role == "editor"
        assert operation == "access freezone project files"
        return SimpleNamespace(project_dir=tmp_path)

    class FailingUseCases:
        async def detect(self, command):
            assert command.project_dir == tmp_path
            assert command.source_url == "source.png"
            assert command.selection.has_point is True
            raise failure

    monkeypatch.setattr(
        mark_detection_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        mark_detection_routes,
        "creative_canvas_mark_detection_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        await mark_detection_routes.freezone_mark_detect(
            project="project-1",
            body=FreezoneMarkDetectRequest(
                source_url="source.png",
                point_x=0.2,
                point_y=0.3,
            ),
            user={"username": "alice"},
        )

    assert exc.value.status_code == status_code
    assert exc.value.detail == str(failure)
