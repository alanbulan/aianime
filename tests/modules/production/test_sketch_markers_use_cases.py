from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.application.sketch_color import (
    SketchColorAssignmentResult,
)
from ai_anime.modules.production.application.sketch_marker_detection import (
    SketchMarkerDetectionResult,
)
from ai_anime.modules.production.application.sketch_markers import (
    AssignProjectSketchColorsCommand,
    DetectProjectSketchMarkersCommand,
    SketchEpisodeBeatsMissing,
    SketchMarkerUseCases,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class _Store:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats

    async def get_beats_as_dicts(self, episode_num: int) -> list[dict]:
        assert episode_num == 2
        return self.beats


class _Session:
    def __init__(self, store: _Store, exits: list[type[BaseException] | None]) -> None:
        self.store = store
        self.exits = exits

    async def __aenter__(self) -> _Store:
        return self.store

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        self.exits.append(exc_type)


class _Workspace:
    def __init__(self, store: _Store) -> None:
        self.store = store
        self.contexts: list[ProjectContext] = []
        self.exits: list[type[BaseException] | None] = []

    def session(self, context: ProjectContext) -> _Session:
        self.contexts.append(context)
        return _Session(self.store, self.exits)


class _ColorAssignment:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def assign(self, **kwargs) -> SketchColorAssignmentResult:
        self.calls.append(kwargs)
        return SketchColorAssignmentResult(
            identity_colors={"Hero_Main": "#ff0000 RED"},
            prop_colors={},
        )


class _MarkerDetection:
    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []

    async def detect(self, store, command) -> SketchMarkerDetectionResult:
        self.calls.append((store, command))
        return SketchMarkerDetectionResult(
            identity_detections={1: ["Hero_Main"]},
            prop_detections={1: ["__NO_PROP__"]},
            total_beats=1,
            total_identities=1,
            total_props=0,
        )


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="alice",
        requester_user_id="user-1",
        requester_username="alice",
        requester_principals=(("user", "user-1"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_project_sketch_markers_project_context_and_close_sessions(
    tmp_path: Path,
) -> None:
    context = _context(tmp_path)
    store = _Store([{"beat_number": 1}])
    workspace = _Workspace(store)
    colors = _ColorAssignment()
    detection = _MarkerDetection()
    use_cases = SketchMarkerUseCases(workspace, colors, detection)

    assigned = await use_cases.assign_colors(
        context,
        AssignProjectSketchColorsCommand(episode_num=2),
    )
    detected = await use_cases.detect(
        context,
        DetectProjectSketchMarkersCommand(episode_num=2),
    )

    assert assigned.as_dict() == {
        "colors": {"Hero_Main": "#ff0000 RED"},
        "count": 1,
        "prop_colors": {},
        "prop_count": 0,
    }
    assert detected.identity_detections == {1: ["Hero_Main"]}
    assert colors.calls == [
        {
            "store": store,
            "episode_num": 2,
            "beats": [{"beat_number": 1}],
        }
    ]
    detection_store, detection_command = detection.calls[0]
    assert detection_store is store
    assert detection_command.episode_num == 2
    assert detection_command.project_dir == context.output_dir
    assert detection_command.requester_user_id == "user-1"
    assert detection_command.project_id == "project-1"
    assert workspace.contexts == [context, context]
    assert workspace.exits == [None, None]


@pytest.mark.asyncio
async def test_project_sketch_color_assignment_closes_session_when_beats_missing(
    tmp_path: Path,
) -> None:
    workspace = _Workspace(_Store([]))
    use_cases = SketchMarkerUseCases(
        workspace,
        _ColorAssignment(),
        _MarkerDetection(),
    )

    with pytest.raises(SketchEpisodeBeatsMissing, match="No beats found for episode 2"):
        await use_cases.assign_colors(
            _context(tmp_path),
            AssignProjectSketchColorsCommand(episode_num=2),
        )

    assert workspace.exits == [SketchEpisodeBeatsMissing]
