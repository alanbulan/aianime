"""Local episode grid image-pool adapter."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from ai_anime.generators import pool_indexer
from ai_anime.modules.production.application.grid_pool import (
    GridPoolImageView,
    GridPoolListing,
    RebuiltGridPool,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared import project_media
from ai_anime.shared.infrastructure import project_stores


class LocalGridPoolGateway:
    def __init__(
        self,
        media_url_builder: Callable[..., str] = project_media.make_project_static_url,
    ) -> None:
        self._media_url_builder = media_url_builder

    @staticmethod
    def _grids_dir(context: ProjectContext, episode_num: int) -> Path:
        return Path(context.output_dir) / "grids" / f"ep{episode_num:03d}"

    async def list_pool(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> GridPoolListing | None:
        grids_dir = self._grids_dir(context, episode_num)
        pool = pool_indexer.load_pool_index(grids_dir)
        if pool is None:
            return None

        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            script_data = await store.get_script_as_dict(episode_num) or {}
            sketch_colors = script_data.get("sketch_colors", {}) or {}
            beat_hashes: dict[int, str] = {}
            for beat in script_data.get("beats", []):
                beat_num = beat.get("beat_number")
                if beat_num is not None:
                    beat_hashes[beat_num] = pool_indexer.compute_beat_content_hash(
                        beat,
                        sketch_colors=sketch_colors,
                    )

            images = tuple(
                self._image_view(
                    context,
                    episode_num,
                    grids_dir,
                    image,
                    beat_hashes,
                )
                for image in pool.images
            )
            return GridPoolListing(
                episode=pool.episode,
                modes=dict(pool.modes),
                images=images,
                beat_assignments=dict(pool.beat_assignments),
            )
        finally:
            await store.close()

    def _image_view(
        self,
        context: ProjectContext,
        episode_num: int,
        grids_dir: Path,
        image,
        beat_hashes: dict[int, str],
    ) -> GridPoolImageView:
        cell_url = ""
        if image.cell_path:
            cell_url = self._media_url_builder(
                context,
                f"grids/ep{episode_num:03d}/{image.cell_path}",
                local_path=grids_dir / image.cell_path,
            )
        grid_url = ""
        if image.grid_path:
            grid_url = self._media_url_builder(
                context,
                f"grids/ep{episode_num:03d}/{image.grid_path}",
                local_path=grids_dir / image.grid_path,
            )
        return GridPoolImageView(
            id=image.id,
            mode=image.mode,
            grid_index=image.grid_index,
            cell_index=image.cell_index,
            grid_path=image.grid_path,
            cell_path=image.cell_path,
            row=image.row,
            col=image.col,
            original_beat=image.original_beat,
            generated_at=(
                image.generated_at.isoformat() if image.generated_at else None
            ),
            type=image.type,
            content_hash=image.content_hash,
            beat_content_hash=image.beat_content_hash,
            cell_url=cell_url,
            grid_url=grid_url,
            stale=pool_indexer.is_pool_image_stale(
                image,
                beat_hashes,
                None,
            ),
        )

    def rebuild(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> RebuiltGridPool:
        grids_dir = self._grids_dir(context, episode_num)
        grids_dir.mkdir(parents=True, exist_ok=True)
        pool = pool_indexer.rebuild_pool_index(
            episode_grids_dir=grids_dir,
            episode=episode_num,
            split_cells=True,
        )
        return RebuiltGridPool(
            episode=pool.episode,
            image_count=len(pool.images),
            mode_count=len(pool.modes),
        )
