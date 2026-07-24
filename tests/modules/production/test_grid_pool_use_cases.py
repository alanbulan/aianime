from __future__ import annotations

import pytest

from ai_anime.modules.production.application.grid_pool import (
    GridPoolImageView,
    GridPoolListing,
    GridPoolUseCases,
    RebuiltGridPool,
)


class _Gateway:
    def __init__(self, listing: GridPoolListing | None) -> None:
        self.listing = listing
        self.calls: list[tuple[str, object, int]] = []

    async def list_pool(self, context, episode_num):
        self.calls.append(("list", context, episode_num))
        return self.listing

    def rebuild(self, context, episode_num):
        self.calls.append(("rebuild", context, episode_num))
        return RebuiltGridPool(episode=episode_num, image_count=3, mode_count=2)


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

    assert listed is listing
    assert listed.as_dict()["images"][0]["generated_at"] is None
    assert rebuilt.as_dict() == {
        "episode": 2,
        "image_count": 3,
        "mode_count": 2,
    }
    assert gateway.calls == [
        ("list", context, 2),
        ("rebuild", context, 2),
    ]


@pytest.mark.asyncio
async def test_grid_pool_use_cases_preserve_missing_pool() -> None:
    gateway = _Gateway(None)

    assert await GridPoolUseCases(gateway).list_pool(object(), 1) is None
