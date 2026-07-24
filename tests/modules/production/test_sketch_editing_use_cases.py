from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.application.sketch_editing import (
    CanonicalSketch,
    CropCurrentSketchCommand,
    CurrentSketchMissing,
    SaveSketchEditorCommand,
    SketchBeatContext,
    SketchBeatMissing,
    SketchEditingUseCases,
    SketchEditorQuery,
    SketchEditorSaveRejected,
)


class _Workspace:
    def __init__(
        self,
        target: CanonicalSketch | None,
        beat_context=None,
        targets: list[CanonicalSketch | None] | None = None,
    ) -> None:
        self.target = target
        self.source = beat_context
        self.targets = iter(targets) if targets is not None else None
        self.calls: list[tuple[object, ...]] = []

    def canonical_sketch(self, context, episode_num, beat_num):
        self.calls.append(("target", context, episode_num, beat_num))
        if self.targets is not None:
            return next(self.targets)
        return self.target

    async def beat_context(self, context, episode_num, beat_num):
        self.calls.append(("beat", context, episode_num, beat_num))
        return self.source


class _PoseEditor:
    def __init__(self) -> None:
        self.calls: list[tuple[object, ...]] = []
        self.save_error: Exception | None = None

    def load_editor(self, *, sketch_path, beat, sketch_colors):
        self.calls.append(("load", sketch_path, beat, sketch_colors))
        return {"width": 64, "height": 96}

    def save_editor(self, *, sketch_path, editor_state):
        self.calls.append(("save", sketch_path, editor_state))
        if self.save_error is not None:
            raise self.save_error


class _SketchImage:
    def __init__(self) -> None:
        self.calls: list[tuple[object, ...]] = []

    def crop(self, *, sketch_path, command):
        self.calls.append((sketch_path, command))
        return {"width": 20, "height": 30}


@pytest.mark.asyncio
async def test_sketch_editing_use_cases_project_contract() -> None:
    context = object()
    target = CanonicalSketch(Path("sketch.png"), "/static/sketch.png")
    source = SketchBeatContext(
        beat={"beat_number": 5, "detected_identities": ["hero"]},
        sketch_colors={"hero": "#00ffff"},
    )
    saved_target = CanonicalSketch(Path("sketch.png"), "/static/sketch.png?v=2")
    cropped_target = CanonicalSketch(Path("sketch.png"), "/static/sketch.png?v=3")
    workspace = _Workspace(
        target,
        source,
        targets=[target, target, saved_target, saved_target, cropped_target],
    )
    pose_editor = _PoseEditor()
    sketch_image = _SketchImage()
    use_cases = SketchEditingUseCases(workspace, pose_editor, sketch_image)

    loaded = await use_cases.load_editor(context, SketchEditorQuery(2, 5))
    saved = use_cases.save_editor(
        context,
        SaveSketchEditorCommand(2, 5, {"strokes": []}),
    )
    cropped = use_cases.crop(
        context,
        CropCurrentSketchCommand(2, 5, 1, 2, 20, 30),
    )

    assert loaded.as_dict() == {
        "beat_num": 5,
        "sketch_url": "/static/sketch.png",
        "width": 64,
        "height": 96,
    }
    assert saved.as_dict() == {
        "beat_num": 5,
        "sketch_url": "/static/sketch.png?v=2",
    }
    assert cropped.as_dict() == {
        "beat_num": 5,
        "sketch_url": "/static/sketch.png?v=3",
        "width": 20,
        "height": 30,
    }
    assert workspace.calls == [
        ("target", context, 2, 5),
        ("beat", context, 2, 5),
        ("target", context, 2, 5),
        ("target", context, 2, 5),
        ("target", context, 2, 5),
        ("target", context, 2, 5),
    ]
    assert pose_editor.calls == [
        (
            "load",
            Path("sketch.png"),
            {"beat_number": 5, "detected_identities": ["hero"]},
            {"hero": "#00ffff"},
        ),
        ("save", Path("sketch.png"), {"strokes": []}),
    ]
    assert sketch_image.calls[0][0] == Path("sketch.png")


@pytest.mark.asyncio
async def test_sketch_editing_use_cases_preserve_missing_and_save_errors() -> None:
    context = object()
    pose_editor = _PoseEditor()
    sketch_image = _SketchImage()
    missing = SketchEditingUseCases(_Workspace(None), pose_editor, sketch_image)

    with pytest.raises(CurrentSketchMissing, match="Beat 5 缺少当前草图"):
        await missing.load_editor(context, SketchEditorQuery(2, 5))

    target = CanonicalSketch(Path("sketch.png"), "/static/sketch.png")
    missing_beat = SketchEditingUseCases(
        _Workspace(target, None),
        pose_editor,
        sketch_image,
    )
    with pytest.raises(SketchBeatMissing, match="Beat 5 不存在"):
        await missing_beat.load_editor(context, SketchEditorQuery(2, 5))

    pose_editor.save_error = ValueError("invalid stroke")
    with pytest.raises(SketchEditorSaveRejected, match="保存草图编辑失败"):
        missing_beat.save_editor(
            context,
            SaveSketchEditorCommand(2, 5, {"strokes": []}),
        )
