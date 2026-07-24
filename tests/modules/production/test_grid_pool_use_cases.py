from __future__ import annotations

import pytest

from ai_anime.modules.production.application.grid_pool import (
    BeatSketchCandidates,
    GridPoolImageView,
    GridPoolListing,
    GridPoolUseCases,
    RebuiltGridPool,
    SelectedGridPoolImage,
    SelectGridPoolImageCommand,
    UploadedBeatPoolImage,
    UploadBeatPoolImageCommand,
)


class _Gateway:
    def __init__(self, listing: GridPoolListing | None) -> None:
        self.listing = listing
        self.calls: list[tuple[object, ...]] = []

    async def list_pool(self, context, episode_num):
        self.calls.append(("list", context, episode_num))
        return self.listing

    def rebuild(self, context, episode_num):
        self.calls.append(("rebuild", context, episode_num))
        return RebuiltGridPool(episode=episode_num, image_count=3, mode_count=2)

    async def sketch_candidates(self, context, episode_num, beat_num):
        self.calls.append(("candidates", context, episode_num, beat_num))
        return BeatSketchCandidates(
            episode=episode_num,
            beat=beat_num,
            current_sketch_url="/static/current.png",
            candidates=(),
        )

    async def select(self, context, command):
        self.calls.append(("select", context, command))
        return SelectedGridPoolImage(
            beat_num=command.beat_num,
            pool_id=command.pool_id,
            image_type="render",
            frame_url="/static/frame.png",
        )

    def upload(self, context, command):
        self.calls.append(("upload", context, command))
        return UploadedBeatPoolImage(
            beat_num=command.beat_num,
            pool_id="uploaded-pool",
            sketch_url="/static/sketch.png",
        )


@pytest.mark.asyncio
async def test_grid_pool_use_cases_delegate_and_preserve_response_contract() -> None:
    context = object()
    listing = GridPoolListing(
        episode=2,
        modes={"2x2": {"total_grids": 1, "total_cells": 1}},
        images=(
            GridPoolImageView(
                id="beat_05_render",
                mode="2x2",
                grid_index=1,
                cell_index=1,
                grid_path="scene/render_grid.png",
                cell_path="render/beat_05.png",
                row=0,
                col=0,
                original_beat=5,
                generated_at=None,
                type="render",
                content_hash=None,
                beat_content_hash=None,
                cell_url="/static/cell.png",
                grid_url="/static/grid.png",
                stale=False,
            ),
        ),
        beat_assignments={"5": "beat_05_render"},
    )
    gateway = _Gateway(listing)
    use_cases = GridPoolUseCases(gateway)

    listed = await use_cases.list_pool(context, 2)
    rebuilt = use_cases.rebuild(context, 2)
    candidates = await use_cases.sketch_candidates(context, 2, 5)
    command = SelectGridPoolImageCommand(
        episode_num=2,
        beat_num=5,
        pool_id="pool-5",
        force=True,
    )
    selected = await use_cases.select(context, command)
    upload_command = UploadBeatPoolImageCommand(
        episode_num=2,
        beat_num=5,
        content=b"image",
        image_type="sketch",
    )
    uploaded = use_cases.upload(context, upload_command)

    assert listed is listing
    assert listed.as_dict()["images"][0]["generated_at"] is None
    assert rebuilt.as_dict() == {
        "episode": 2,
        "image_count": 3,
        "mode_count": 2,
    }
    assert candidates.as_dict() == {
        "episode": 2,
        "beat": 5,
        "current_sketch_url": "/static/current.png",
        "candidate_count": 0,
        "candidates": [],
    }
    assert selected.as_dict() == {
        "beat_num": 5,
        "pool_id": "pool-5",
        "image_type": "render",
        "frame_url": "/static/frame.png",
    }
    assert uploaded.as_dict() == {
        "beat_num": 5,
        "pool_id": "uploaded-pool",
        "sketch_url": "/static/sketch.png",
    }
    assert gateway.calls == [
        ("list", context, 2),
        ("rebuild", context, 2),
        ("candidates", context, 2, 5),
        ("select", context, command),
        ("upload", context, upload_command),
    ]


@pytest.mark.asyncio
async def test_grid_pool_use_cases_preserve_missing_pool() -> None:
    gateway = _Gateway(None)

    assert await GridPoolUseCases(gateway).list_pool(object(), 1) is None
