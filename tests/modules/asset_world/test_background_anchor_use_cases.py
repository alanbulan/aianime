from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from ai_anime.modules.asset_world.application.background_anchor import (
    BeatBackgroundAnchorUseCases,
)
from ai_anime.modules.asset_world.application.dto import (
    CropBeatBackgroundCommand,
    SelectBeatBackgroundCommand,
    UploadBeatBackgroundCommand,
)
from ai_anime.modules.asset_world.infrastructure.background_anchor import (
    LocalBeatBackgroundAnchorFiles,
)
from ai_anime.shared.utils.background_anchor import (
    ANCHOR_DIRECTOR_ENV_ONLY,
    ANCHOR_MASTER,
    ANCHOR_REVERSE,
    ANCHOR_SELECTED_BACKGROUND,
)


def _selected_background_path(project_dir: Path) -> Path:
    return (
        project_dir
        / "director_control_frames"
        / "ep001"
        / "beat_04"
        / "selected_background.png"
    )


def _asset_url(project_dir: Path):
    def build(path: Path) -> str:
        return f"/media/{path.relative_to(project_dir).as_posix()}"

    return build


class _Writer:
    def __init__(self, selected_path: Path) -> None:
        self.selected_path = selected_path
        self.updates: list[dict[str, Any]] = []

    async def update_beat_asset(self, **updates: Any) -> None:
        assert self.selected_path.exists()
        self.updates.append(updates)


@pytest.mark.asyncio
async def test_select_anchor_snapshots_master_before_persisting_source(
    tmp_path: Path,
) -> None:
    beat = {
        "beat_number": 4,
        "scene_ref": {"scene_id": "地下室", "render_anchor_id": "master"},
    }
    master = tmp_path / "assets" / "scenes" / "地下室" / "master.png"
    master.parent.mkdir(parents=True)
    master.write_bytes(b"fake master")
    selected = _selected_background_path(tmp_path)
    writer = _Writer(selected)

    payload = await BeatBackgroundAnchorUseCases(
        LocalBeatBackgroundAnchorFiles()
    ).select_anchor(
        asset_writer=writer,
        project_dir=tmp_path,
        beat=beat,
        episode_num=1,
        beat_num=4,
        command=SelectBeatBackgroundCommand(anchor_id=ANCHOR_MASTER),
        asset_url=_asset_url(tmp_path),
    )

    assert selected.read_bytes() == b"fake master"
    assert beat["scene_ref"]["render_anchor_id"] == ANCHOR_SELECTED_BACKGROUND
    assert beat["scene_ref"]["render_anchor_source_id"] == ANCHOR_MASTER
    assert writer.updates == [
        {
            "episode_number": 1,
            "beat_number": 4,
            "scene_ref": beat["scene_ref"],
        }
    ]
    assert payload["render_anchor_id"] == ANCHOR_SELECTED_BACKGROUND
    assert payload["current_source"] == ANCHOR_MASTER
    assert payload["display_reference"]["rel_path"] == (
        "assets/scenes/地下室/master.png"
    )
    assert payload["render_input"]["rel_path"] == (
        "director_control_frames/ep001/beat_04/selected_background.png"
    )


@pytest.mark.asyncio
async def test_director_environment_capture_becomes_available_for_snapshot_use(
    tmp_path: Path,
) -> None:
    beat = {
        "beat_number": 4,
        "scene_ref": {"scene_id": "地下室", "render_anchor_id": "master"},
    }
    env_only = (
        tmp_path
        / "director_control_frames"
        / "ep001"
        / "beat_04"
        / "env_only.png"
    )
    env_only.parent.mkdir(parents=True)
    env_only.write_bytes(b"director environment")
    selected = _selected_background_path(tmp_path)
    writer = _Writer(selected)
    use_cases = BeatBackgroundAnchorUseCases(LocalBeatBackgroundAnchorFiles())

    listed = use_cases.list_anchors(
        project_dir=tmp_path,
        beat=beat,
        episode_num=1,
        beat_num=4,
        asset_url=_asset_url(tmp_path),
    )
    director_anchor = next(
        item
        for item in listed["anchors"]
        if item["id"] == ANCHOR_DIRECTOR_ENV_ONLY
    )
    assert director_anchor["exists"] is True

    payload = await use_cases.select_anchor(
        asset_writer=writer,
        project_dir=tmp_path,
        beat=beat,
        episode_num=1,
        beat_num=4,
        command=SelectBeatBackgroundCommand(
            anchor_id=ANCHOR_DIRECTOR_ENV_ONLY,
        ),
        asset_url=_asset_url(tmp_path),
    )

    assert selected.read_bytes() == b"director environment"
    assert payload["current_source"] == ANCHOR_DIRECTOR_ENV_ONLY
    assert beat["scene_ref"]["render_anchor_source_id"] == ANCHOR_DIRECTOR_ENV_ONLY


@pytest.mark.parametrize("legacy_source", [None, "legacy_unknown"])
def test_list_anchors_infers_legacy_selected_source_by_file_content(
    tmp_path: Path,
    legacy_source: str | None,
) -> None:
    beat = {
        "beat_number": 4,
        "scene_ref": {
            "scene_id": "地下室",
            "render_anchor_id": ANCHOR_SELECTED_BACKGROUND,
            "render_anchor_source_id": legacy_source,
        },
    }
    scene_dir = tmp_path / "assets" / "scenes" / "地下室"
    scene_dir.mkdir(parents=True)
    (scene_dir / "master.png").write_bytes(b"different master")
    reverse = scene_dir / "reverse_master.png"
    reverse.write_bytes(b"same frozen reverse")
    selected = _selected_background_path(tmp_path)
    selected.parent.mkdir(parents=True)
    selected.write_bytes(b"same frozen reverse")

    payload = BeatBackgroundAnchorUseCases(
        LocalBeatBackgroundAnchorFiles()
    ).list_anchors(
        project_dir=tmp_path,
        beat=beat,
        episode_num=1,
        beat_num=4,
        asset_url=_asset_url(tmp_path),
    )

    assert payload["render_anchor_id"] == ANCHOR_SELECTED_BACKGROUND
    assert payload["current_source"] == ANCHOR_REVERSE
    assert payload["display_reference"]["id"] == ANCHOR_REVERSE
    assert payload["render_input"]["id"] == ANCHOR_SELECTED_BACKGROUND
    reverse_anchor = [
        item for item in payload["anchors"] if item["id"] == ANCHOR_REVERSE
    ][0]
    assert reverse_anchor["anchor_id"] == ANCHOR_REVERSE
    assert reverse_anchor["current"] is True


@pytest.mark.asyncio
async def test_crop_anchor_writes_selected_and_records_source(tmp_path: Path) -> None:
    beat = {
        "beat_number": 4,
        "scene_ref": {"scene_id": "地下室", "render_anchor_id": "master"},
    }
    master = tmp_path / "assets" / "scenes" / "地下室" / "master.png"
    master.parent.mkdir(parents=True)
    Image.new("RGB", (8, 8), color=(255, 0, 0)).save(master)
    selected = _selected_background_path(tmp_path)

    payload = await BeatBackgroundAnchorUseCases(
        LocalBeatBackgroundAnchorFiles()
    ).crop_anchor(
        asset_writer=_Writer(selected),
        project_dir=tmp_path,
        beat=beat,
        episode_num=1,
        beat_num=4,
        command=CropBeatBackgroundCommand(
            anchor_id=ANCHOR_MASTER,
            x=1,
            y=1,
            width=4,
            height=4,
        ),
        asset_url=_asset_url(tmp_path),
    )

    assert selected.exists()
    with Image.open(selected) as image:
        assert image.size == (4, 4)
    assert beat["scene_ref"]["render_anchor_id"] == ANCHOR_SELECTED_BACKGROUND
    assert beat["scene_ref"]["render_anchor_source_id"] == ANCHOR_MASTER
    assert payload["current_source"] == ANCHOR_MASTER


@pytest.mark.asyncio
async def test_upload_anchor_writes_selected_as_external(tmp_path: Path) -> None:
    beat = {
        "beat_number": 4,
        "scene_ref": {"scene_id": "地下室", "render_anchor_id": "master"},
    }
    content = BytesIO()
    Image.new("RGB", (4, 4), color=(0, 255, 0)).save(content, format="PNG")
    content.seek(0)
    image = Image.open(content)
    selected = _selected_background_path(tmp_path)

    payload = await BeatBackgroundAnchorUseCases(
        LocalBeatBackgroundAnchorFiles()
    ).upload_anchor(
        asset_writer=_Writer(selected),
        project_dir=tmp_path,
        beat=beat,
        episode_num=1,
        beat_num=4,
        command=UploadBeatBackgroundCommand(image=image),
        asset_url=_asset_url(tmp_path),
    )

    assert selected.exists()
    assert beat["scene_ref"]["render_anchor_id"] == ANCHOR_SELECTED_BACKGROUND
    assert (
        beat["scene_ref"]["render_anchor_source_id"]
        == ANCHOR_SELECTED_BACKGROUND
    )
    assert payload["current_source"] == ANCHOR_SELECTED_BACKGROUND
