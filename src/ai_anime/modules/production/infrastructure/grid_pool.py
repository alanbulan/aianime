"""Local episode grid image-pool adapter."""

from __future__ import annotations

import shutil
from collections.abc import Callable
from pathlib import Path

from ai_anime.generators import pool_indexer
from ai_anime.modules.production.application.grid_pool import (
    BeatSketchCandidates,
    BeatSketchCandidateView,
    GridPoolImageStale,
    GridPoolImageView,
    GridPoolListing,
    GridPoolSelectionRejected,
    RebuiltGridPool,
    SelectedGridPoolImage,
    SelectGridPoolImageCommand,
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

    @staticmethod
    async def _script_data(
        context: ProjectContext,
        episode_num: int,
    ) -> dict:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            return await store.get_script_as_dict(episode_num) or {}
        finally:
            await store.close()

    async def list_pool(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> GridPoolListing | None:
        grids_dir = self._grids_dir(context, episode_num)
        pool = pool_indexer.load_pool_index(grids_dir)
        if pool is None:
            return None

        script_data = await self._script_data(context, episode_num)
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

    async def sketch_candidates(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> BeatSketchCandidates:
        project_dir = Path(context.output_dir)
        grids_dir = self._grids_dir(context, episode_num)
        current_path = (
            project_dir
            / "sketches"
            / f"ep{episode_num:03d}"
            / f"beat_{beat_num:02d}.png"
        )
        current_sketch_url = ""
        if current_path.exists():
            current_sketch_url = self._media_url_builder(
                context,
                f"sketches/ep{episode_num:03d}/beat_{beat_num:02d}.png",
                local_path=current_path,
            )

        pool = pool_indexer.load_pool_index(grids_dir)
        if pool is None:
            return BeatSketchCandidates(
                episode=episode_num,
                beat=beat_num,
                current_sketch_url=current_sketch_url,
                candidates=(),
            )

        script_data = await self._script_data(context, episode_num)
        sketch_colors = script_data.get("sketch_colors", {}) or {}
        beat_hashes: dict[int, str] = {}
        for beat in script_data.get("beats", []) or []:
            raw_beat_num = beat.get("beat_number")
            try:
                parsed_beat_num = int(raw_beat_num)
            except (TypeError, ValueError):
                continue
            beat_hashes[parsed_beat_num] = pool_indexer.compute_beat_content_hash(
                beat,
                sketch_colors=sketch_colors,
            )

        candidates: list[BeatSketchCandidateView] = []
        for image in pool.images:
            if image.type != "sketch" or int(image.original_beat or 0) != beat_num:
                continue
            if not image.cell_path:
                continue
            cell_path = grids_dir / image.cell_path
            if not cell_path.exists():
                continue
            candidates.append(
                BeatSketchCandidateView(
                    id=image.id,
                    type="sketch",
                    mode=image.mode,
                    cell_path=image.cell_path,
                    url=self._media_url_builder(
                        context,
                        f"grids/ep{episode_num:03d}/{image.cell_path}",
                        local_path=cell_path,
                    ),
                    grid_path=image.grid_path,
                    grid_index=image.grid_index,
                    cell_index=image.cell_index,
                    row=image.row,
                    col=image.col,
                    original_beat=image.original_beat,
                    generated_at=(
                        image.generated_at.isoformat() if image.generated_at else ""
                    ),
                    stale=pool_indexer.is_pool_image_stale(
                        image,
                        beat_hashes,
                        None,
                    ),
                )
            )
        candidates.sort(
            key=lambda candidate: (candidate.generated_at, candidate.id),
            reverse=True,
        )
        return BeatSketchCandidates(
            episode=episode_num,
            beat=beat_num,
            current_sketch_url=current_sketch_url,
            candidates=tuple(candidates),
        )

    async def select(
        self,
        context: ProjectContext,
        command: SelectGridPoolImageCommand,
    ) -> SelectedGridPoolImage:
        project_dir = Path(context.output_dir)
        grids_dir = self._grids_dir(context, command.episode_num)
        pool = pool_indexer.load_pool_index(grids_dir)
        if pool is None:
            raise GridPoolSelectionRejected(
                "No pool index found. Generate grids first."
            )

        pool_image = pool.get_image(command.pool_id)
        if pool_image is None:
            raise GridPoolSelectionRejected(
                f"Pool ID '{command.pool_id}' not found in pool index"
            )

        if pool_image.type == "sketch":
            script_data = await self._script_data(context, command.episode_num)
            sketch_colors = script_data.get("sketch_colors", {}) or {}
            beats = script_data.get("beats", [])
            beat_hashes: dict[int, str] = {}
            beat_index = pool_image.original_beat - 1
            if 0 <= beat_index < len(beats):
                beat_hashes[pool_image.original_beat] = (
                    pool_indexer.compute_beat_content_hash(
                        beats[beat_index],
                        sketch_colors=sketch_colors,
                    )
                )
            if (
                pool_indexer.is_pool_image_stale(pool_image, beat_hashes, None)
                and not command.force
            ):
                raise GridPoolImageStale()

        cell_path = pool_image.cell_path
        if not cell_path:
            raise GridPoolSelectionRejected(
                f"Pool ID '{command.pool_id}' not found in pool index"
            )
        cell_full_path = grids_dir / cell_path
        if not cell_full_path.exists():
            raise GridPoolSelectionRejected(f"Cell image not found at {cell_path}")

        image_type = pool_image.type or "render"
        if image_type == "sketch":
            destination = (
                project_dir
                / "sketches"
                / f"ep{command.episode_num:03d}"
                / f"beat_{command.beat_num:02d}.png"
            )
            relative_path = (
                f"sketches/ep{command.episode_num:03d}/beat_{command.beat_num:02d}.png"
            )
        else:
            destination = (
                project_dir
                / "frames"
                / f"ep{command.episode_num:03d}"
                / f"beat_{command.beat_num:02d}.png"
            )
            relative_path = (
                f"frames/ep{command.episode_num:03d}/beat_{command.beat_num:02d}.png"
            )
            pool.beat_assignments[str(command.beat_num)] = cell_path

        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(cell_full_path), str(destination))
        media_url = self._media_url_builder(
            context,
            relative_path,
            local_path=destination,
        )
        pool_indexer.save_pool_index(pool, grids_dir)
        return SelectedGridPoolImage(
            beat_num=command.beat_num,
            pool_id=command.pool_id,
            image_type=image_type,
            sketch_url=media_url if image_type == "sketch" else None,
            frame_url=media_url if image_type != "sketch" else None,
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
