from __future__ import annotations

import pytest

from ai_anime.modules.production.application.grid_pool import (
    BeatSketchCandidates,
    BuildGridSketchPreviewCommand,
    CutGridCommand,
    CutGridResult,
    GridPoolPromptRejected,
    GridPoolPreviewRejected,
    GridPoolUploadRejected,
    GridPoolImageView,
    GridPoolListing,
    GridPoolUseCases,
    GridPrompt,
    GridPromptQuery,
    GridSketchPreview,
    GridSketchPreviewCommand,
    LocateGridPromptQuery,
    PersistGridCutCommand,
    PersistGridImageCommand,
    RebuiltGridPool,
    SelectedGridPoolImage,
    SelectGridPoolImageCommand,
    UploadedBeatPoolImage,
    UploadedGridImage,
    UploadBeatPoolImageCommand,
    UploadGridImageCommand,
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

    def upload_grid(self, context, command):
        self.calls.append(("upload_grid", context, command))
        return UploadedGridImage(
            grid_index=command.grid_index,
            grid_type=command.grid_type,
            mode_key=command.mode_key,
            beat_numbers=command.beat_numbers,
            grid_path="custom/uploaded-grid.jpg",
            grid_url="/static/uploaded-grid.jpg",
        )

    def prompt(self, context, query):
        self.calls.append(("prompt", context, query))
        return GridPrompt(
            grid_index=query.grid_index,
            grid_type=query.grid_type,
            mode_key=query.mode_key or "2x2",
            beat_numbers=query.beat_numbers,
            prompt="stored prompt",
            prompt_path="custom/prompt.txt",
        )

    def cut(self, context, command):
        self.calls.append(("cut", context, command))
        return CutGridResult(grid_index=command.grid_index, added=2, skipped=1)

    def preview(self, context, command):
        self.calls.append(("preview", context, command))
        return GridSketchPreview(
            grid_index=command.grid_index,
            rows=command.rows,
            cols=command.cols,
            beat_numbers=command.beat_numbers,
            preview_path="sketch-preview.jpg",
            preview_url="/static/sketch-preview.jpg",
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
    grid_upload_command = UploadGridImageCommand(
        episode_num=2,
        grid_index=3,
        filename="GRID.JPEG",
        content=b"grid",
        grid_type=" render ",
        mode_key=" 2x2 ",
        beat_numbers="[5, 5, -1, 6]",
    )
    uploaded_grid = use_cases.upload_grid(context, grid_upload_command)
    prompt_query = GridPromptQuery(
        episode_num=2,
        grid_index=3,
        grid_type=" render ",
        mode_key=" 2x2 ",
        beat_numbers="5,5,-1,6",
    )
    prompt = use_cases.prompt(context, prompt_query)
    cut_command = CutGridCommand(
        episode_num=2,
        grid_index=3,
        grid_type="render",
        mode_key=None,
        rows=1,
        cols=2,
        beat_start=5,
        beat_end=6,
    )
    cut = use_cases.cut(context, cut_command)
    preview_command = GridSketchPreviewCommand(
        episode_num=2,
        grid_index=3,
        rows=1,
        cols=2,
        beat_numbers=(-1, 5, 6),
    )
    preview = use_cases.preview(context, preview_command)

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
    assert uploaded_grid.as_dict() == {
        "grid_index": 3,
        "grid_type": "render",
        "mode_key": "2x2",
        "beat_numbers": [5, 6],
        "grid_path": "custom/uploaded-grid.jpg",
        "grid_url": "/static/uploaded-grid.jpg",
    }
    assert prompt.as_dict() == {
        "grid_index": 3,
        "grid_type": "render",
        "mode_key": "2x2",
        "beat_numbers": [5, 6],
        "prompt": "stored prompt",
        "prompt_path": "custom/prompt.txt",
    }
    assert cut.as_dict() == {"grid_index": 3, "added": 2, "skipped": 1}
    assert preview.as_dict() == {
        "grid_index": 3,
        "rows": 1,
        "cols": 2,
        "beat_numbers": [5, 6],
        "preview_path": "sketch-preview.jpg",
        "preview_url": "/static/sketch-preview.jpg",
    }
    assert gateway.calls == [
        ("list", context, 2),
        ("rebuild", context, 2),
        ("candidates", context, 2, 5),
        ("select", context, command),
        ("upload", context, upload_command),
        (
            "upload_grid",
            context,
            PersistGridImageCommand(
                episode_num=2,
                grid_index=3,
                content=b"grid",
                grid_type="render",
                mode_key="2x2",
                beat_numbers=(5, 6),
                extension="jpg",
            ),
        ),
        (
            "prompt",
            context,
            LocateGridPromptQuery(
                episode_num=2,
                grid_index=3,
                grid_type="render",
                mode_key="2x2",
                beat_numbers=(5, 6),
            ),
        ),
        (
            "cut",
            context,
            PersistGridCutCommand(
                episode_num=2,
                grid_index=3,
                grid_type="render",
                lookup_mode_key=None,
                mode_key="1x2",
                rows=1,
                cols=2,
                beat_numbers=(5, 6),
            ),
        ),
        (
            "preview",
            context,
            BuildGridSketchPreviewCommand(
                episode_num=2,
                grid_index=3,
                rows=1,
                cols=2,
                beat_numbers=(5, 6),
            ),
        ),
    ]


@pytest.mark.asyncio
async def test_grid_pool_use_cases_preserve_missing_pool() -> None:
    gateway = _Gateway(None)

    assert await GridPoolUseCases(gateway).list_pool(object(), 1) is None


@pytest.mark.parametrize(
    ("command", "message"),
    [
        (
            UploadGridImageCommand(
                episode_num=2,
                grid_index=1,
                filename="grid.png",
                content=b"grid",
                grid_type="other",
            ),
            "grid_type must be render or sketch",
        ),
        (
            UploadGridImageCommand(
                episode_num=2,
                grid_index=1,
                filename="grid.png",
                content=b"grid",
                beat_numbers="[",
            ),
            "invalid beat_numbers:",
        ),
        (
            UploadGridImageCommand(
                episode_num=2,
                grid_index=1,
                filename="grid.png",
                content=b"",
            ),
            "uploaded file is empty",
        ),
    ],
)
def test_upload_grid_rejects_invalid_inputs_before_persistence(
    command: UploadGridImageCommand,
    message: str,
) -> None:
    gateway = _Gateway(None)

    with pytest.raises(GridPoolUploadRejected) as raised:
        GridPoolUseCases(gateway).upload_grid(object(), command)

    assert message in str(raised.value)
    assert gateway.calls == []


@pytest.mark.parametrize(
    ("query", "message"),
    [
        (
            GridPromptQuery(
                episode_num=2,
                grid_index=1,
                grid_type="other",
            ),
            "grid_type must be render or sketch",
        ),
        (
            GridPromptQuery(
                episode_num=2,
                grid_index=1,
                beat_numbers="[",
            ),
            "invalid beat_numbers:",
        ),
    ],
)
def test_grid_prompt_rejects_invalid_inputs_before_lookup(
    query: GridPromptQuery,
    message: str,
) -> None:
    gateway = _Gateway(None)

    with pytest.raises(GridPoolPromptRejected) as raised:
        GridPoolUseCases(gateway).prompt(object(), query)

    assert message in str(raised.value)
    assert gateway.calls == []


def test_grid_preview_requires_positive_beat_numbers() -> None:
    gateway = _Gateway(None)

    with pytest.raises(GridPoolPreviewRejected, match="beat_numbers is required"):
        GridPoolUseCases(gateway).preview(
            object(),
            GridSketchPreviewCommand(
                episode_num=2,
                grid_index=1,
                rows=1,
                cols=1,
                beat_numbers=(0, -1),
            ),
        )

    assert gateway.calls == []
