from datetime import datetime
import os

from ai_anime.modules.production.infrastructure.grid_pool_models import (
    PoolImage,
    PoolIndex,
)
from ai_anime.modules.production.infrastructure.media_generation.pool_indexer import (
    compute_beat_content_hash,
    compute_image_hash,
    save_pool_index,
    stale_canonical_sketch_numbers,
)
from ai_anime.shared.utils.path_resolver import (
    canonical_scene_master_path,
    canonical_scene_reverse_master_path,
)


def test_scene_asset_change_invalidates_promoted_sketch(tmp_path) -> None:
    beat = {
        "beat_number": 1,
        "visual_description": "空旷办公室里的远景",
        "scene_ref": {"scene_id": "公司办公区"},
        "time_of_day": "夜晚",
    }
    master = canonical_scene_master_path(tmp_path, "公司办公区")
    reverse = canonical_scene_reverse_master_path(tmp_path, "公司办公区")
    canonical = tmp_path / "sketches" / "ep001" / "beat_01.png"
    cell = tmp_path / "grids" / "ep001" / "sketch" / "beat_01_t1.png"
    for path, content in (
        (master, b"master-v1"),
        (reverse, b"reverse-v1"),
        (canonical, b"sketch-v1"),
        (cell, b"sketch-v1"),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    base_time = 1_800_000_000
    os.utime(master, (base_time, base_time))
    os.utime(reverse, (base_time, base_time))
    os.utime(canonical, (base_time + 10, base_time + 10))
    pool = PoolIndex(
        episode=1,
        images=[
            PoolImage(
                id="beat_01_t1_sketch",
                mode="1x1",
                grid_index=1,
                cell_index=1,
                grid_path="grid.png",
                cell_path="sketch/beat_01_t1.png",
                row=0,
                col=0,
                original_beat=1,
                generated_at=datetime.now(),
                type="sketch",
                content_hash=compute_image_hash(cell),
                beat_content_hash=compute_beat_content_hash(
                    beat,
                    project_dir=tmp_path,
                ),
            )
        ],
    )
    save_pool_index(pool, tmp_path / "grids" / "ep001")

    assert stale_canonical_sketch_numbers(tmp_path, 1, [beat]) == []

    master.write_bytes(b"master-v2")
    os.utime(master, (base_time + 20, base_time + 20))

    assert stale_canonical_sketch_numbers(tmp_path, 1, [beat]) == [1]


def test_legacy_hash_uses_asset_mtime_fallback(tmp_path) -> None:
    beat = {
        "beat_number": 1,
        "visual_description": "办公室远景",
        "scene_ref": {"scene_id": "公司办公区"},
    }
    master = canonical_scene_master_path(tmp_path, "公司办公区")
    canonical = tmp_path / "sketches" / "ep001" / "beat_01.png"
    cell = tmp_path / "grids" / "ep001" / "sketch" / "beat_01_t1.png"
    for path in (master, canonical, cell):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x")
    base_time = 1_800_000_000
    os.utime(canonical, (base_time, base_time))
    os.utime(master, (base_time + 10, base_time + 10))
    pool = PoolIndex(
        episode=1,
        images=[
            PoolImage(
                id="legacy",
                mode="1x1",
                grid_index=1,
                cell_index=1,
                grid_path="grid.png",
                cell_path="sketch/beat_01_t1.png",
                row=0,
                col=0,
                original_beat=1,
                type="sketch",
                content_hash=compute_image_hash(cell),
                beat_content_hash=compute_beat_content_hash(beat),
            )
        ],
    )
    save_pool_index(pool, tmp_path / "grids" / "ep001")

    assert stale_canonical_sketch_numbers(tmp_path, 1, [beat]) == [1]
