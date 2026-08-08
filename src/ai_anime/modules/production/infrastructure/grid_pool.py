"""Local episode grid image-pool adapter."""

from __future__ import annotations

import re
import shutil
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from ai_anime.modules.production.infrastructure.media_generation import nanobanana_grid, pool_indexer
from ai_anime.modules.production.application.grid_pool import (
    BeatSketchCandidates,
    BeatSketchCandidateView,
    BuildGridSketchPreviewCommand,
    CutGridResult,
    GridPoolCutRejected,
    GridPoolImageStale,
    GridPoolImageView,
    GridPoolListing,
    GridPoolPreviewRejected,
    GridPoolSelectionRejected,
    GridPoolUploadRejected,
    GridPrompt,
    GridSketchPreview,
    GridPoolPromptRejected,
    LocateGridPromptQuery,
    PersistGridCutCommand,
    PersistGridImageCommand,
    RebuiltGridPool,
    SelectedGridPoolImage,
    SelectGridPoolImageCommand,
    UploadedBeatPoolImage,
    UploadedGridImage,
    UploadBeatPoolImageCommand,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared import project_media
from ai_anime.shared.infrastructure import project_stores
from ai_anime.shared.utils.media_io import decode_uploaded_rgb_image


def _safe_grid_token(value: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.:-]+", "_", value.strip())
    return token.strip("._-") or "grid"


def _uploaded_grid_filename(command: PersistGridImageCommand) -> str:
    beats_slug = "-".join(str(beat) for beat in command.beat_numbers) or "manual"
    return (
        f"{_safe_grid_token(command.grid_type)}_"
        f"{_safe_grid_token(command.mode_key)}_{beats_slug}_"
        f"grid_upload.{command.extension}"
    )


def _safe_grids_file(grids_dir: Path, relative_path: str) -> Path | None:
    if not relative_path:
        return None
    try:
        candidate = (grids_dir / relative_path).resolve()
        root = grids_dir.resolve()
    except Exception:
        return None
    if root == candidate or root not in candidate.parents:
        return None
    return candidate


def _find_pool_grid_entry(
    pool: Any,
    *,
    grid_type: str,
    mode_key: str | None,
    beat_numbers: list[int],
    grid_index: int,
) -> Any | None:
    if pool is None:
        return None
    if mode_key and beat_numbers:
        entry = pool.find_grid(grid_type, mode_key, beat_numbers)
        if entry is not None:
            return entry

    image_grid_paths = {
        image.grid_path
        for image in getattr(pool, "images", [])
        if image.type == grid_type
        and image.grid_index == grid_index
        and (not beat_numbers or image.original_beat in beat_numbers)
        and image.grid_path
    }
    for entry in getattr(pool, "grids", []):
        if entry.type != grid_type:
            continue
        if mode_key and entry.mode_key != mode_key:
            continue
        if beat_numbers and set(entry.beat_nums) != set(beat_numbers):
            continue
        if not image_grid_paths or entry.grid_path in image_grid_paths:
            return entry
    return None


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

    def upload(
        self,
        context: ProjectContext,
        command: UploadBeatPoolImageCommand,
    ) -> UploadedBeatPoolImage:
        try:
            image = decode_uploaded_rgb_image(command.content)
        except ValueError as exc:
            raise GridPoolUploadRejected(str(exc)) from exc
        project_dir = Path(context.output_dir)
        image_type = command.image_type
        if image_type == "sketch":
            canonical_path = (
                project_dir
                / "sketches"
                / f"ep{command.episode_num:03d}"
                / f"beat_{command.beat_num:02d}.png"
            )
            relative_path = (
                f"sketches/ep{command.episode_num:03d}/beat_{command.beat_num:02d}.png"
            )
        else:
            canonical_path = (
                project_dir
                / "frames"
                / f"ep{command.episode_num:03d}"
                / f"beat_{command.beat_num:02d}.png"
            )
            relative_path = (
                f"frames/ep{command.episode_num:03d}/beat_{command.beat_num:02d}.png"
            )
        canonical_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(canonical_path, format="PNG")

        grids_dir = self._grids_dir(context, command.episode_num)
        pool = pool_indexer.load_pool_index(grids_dir) or pool_indexer.build_pool_index(
            grids_dir,
            command.episode_num,
        )
        upload_dir = grids_dir / image_type
        upload_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        cell_path = upload_dir / f"beat_{command.beat_num:02d}_t{timestamp}.png"
        image.save(cell_path, format="PNG")

        pool_image = pool_indexer.add_cell_with_dedup(
            pool,
            cell_path,
            grids_dir,
            command.beat_num,
            timestamp,
            img_type=image_type,
            mode="upload",
            grid_index=0,
            cell_index=0,
            grid_path="",
            row=0,
            col=0,
        )
        if pool_image is None:
            pool_id = f"beat_{command.beat_num:02d}_t{timestamp}_{image_type}"
            assignment_path = None
        else:
            pool_id = pool_image.id
            assignment_path = pool_image.cell_path
        if image_type != "sketch" and assignment_path:
            pool.beat_assignments[str(command.beat_num)] = assignment_path
        pool_indexer.save_pool_index(pool, grids_dir)

        media_url = self._media_url_builder(
            context,
            relative_path,
            local_path=canonical_path,
        )
        return UploadedBeatPoolImage(
            beat_num=command.beat_num,
            pool_id=pool_id,
            sketch_url=media_url if image_type == "sketch" else None,
            frame_url=media_url if image_type != "sketch" else None,
        )

    def upload_grid(
        self,
        context: ProjectContext,
        command: PersistGridImageCommand,
    ) -> UploadedGridImage:
        grids_dir = self._grids_dir(context, command.episode_num)
        upload_dir = grids_dir / "custom"
        upload_dir.mkdir(parents=True, exist_ok=True)
        grid_path = upload_dir / _uploaded_grid_filename(command)
        grid_path.write_bytes(command.content)
        grid_relative_path = grid_path.relative_to(grids_dir).as_posix()

        pool = pool_indexer.load_pool_index(grids_dir) or pool_indexer.build_pool_index(
            grids_dir,
            command.episode_num,
        )
        beat_numbers = list(command.beat_numbers)
        entry = (
            pool.find_grid(command.grid_type, command.mode_key, beat_numbers)
            if beat_numbers
            else None
        )
        if entry is None:
            pool_indexer.register_grid_entry(
                pool=pool,
                grid_type=command.grid_type,
                mode_key=command.mode_key,
                beat_nums=beat_numbers,
                preset="custom",
                grid_path=grid_relative_path,
                prompt_path="",
            )
        else:
            entry.grid_path = grid_relative_path
            entry.preset = "custom"
            entry.generated_at = datetime.now()

        for image in pool.images:
            if (
                image.type != command.grid_type
                or image.grid_index != command.grid_index
            ):
                continue
            if beat_numbers and image.original_beat not in beat_numbers:
                continue
            image.grid_path = grid_relative_path
            image.mode = command.mode_key

        pool_indexer.save_pool_index(pool, grids_dir)
        grid_url = self._media_url_builder(
            context,
            f"grids/ep{command.episode_num:03d}/{grid_relative_path}",
            local_path=grid_path,
        )
        return UploadedGridImage(
            grid_index=command.grid_index,
            grid_type=command.grid_type,
            mode_key=command.mode_key,
            beat_numbers=command.beat_numbers,
            grid_path=grid_relative_path,
            grid_url=grid_url,
        )

    def prompt(
        self,
        context: ProjectContext,
        query: LocateGridPromptQuery,
    ) -> GridPrompt:
        grids_dir = self._grids_dir(context, query.episode_num)
        pool = pool_indexer.load_pool_index(grids_dir)
        if not pool:
            raise GridPoolPromptRejected("No pool index found. Generate grids first.")
        beat_numbers = list(query.beat_numbers)
        entry = _find_pool_grid_entry(
            pool,
            grid_type=query.grid_type,
            mode_key=query.mode_key,
            beat_numbers=beat_numbers,
            grid_index=query.grid_index,
        )
        if entry is None:
            raise GridPoolPromptRejected("Grid prompt metadata not found")

        prompt_candidates: list[str] = []
        if entry.prompt_path:
            prompt_candidates.append(entry.prompt_path)
        if beat_numbers and entry.mode_key:
            beats_slug = "-".join(str(beat) for beat in beat_numbers)
            prompt_candidates.append(
                f"{entry.preset}/{query.grid_type}_{entry.mode_key}_"
                f"{beats_slug}_prompt.txt"
            )
        for relative_path in prompt_candidates:
            prompt_path = _safe_grids_file(grids_dir, relative_path)
            if prompt_path and prompt_path.exists():
                return GridPrompt(
                    grid_index=query.grid_index,
                    grid_type=query.grid_type,
                    mode_key=entry.mode_key,
                    beat_numbers=tuple(entry.beat_nums),
                    prompt=prompt_path.read_text(encoding="utf-8"),
                    prompt_path=prompt_path.relative_to(grids_dir).as_posix(),
                )
        raise GridPoolPromptRejected("Prompt file not found for this grid")

    def cut(
        self,
        context: ProjectContext,
        command: PersistGridCutCommand,
    ) -> CutGridResult:
        project_dir = Path(context.output_dir)
        grids_dir = self._grids_dir(context, command.episode_num)
        if not grids_dir.exists():
            raise GridPoolCutRejected(
                f"No grids directory for episode {command.episode_num}"
            )

        beat_numbers = list(command.beat_numbers)
        pool = pool_indexer.load_pool_index(grids_dir)
        entry = _find_pool_grid_entry(
            pool,
            grid_type=command.grid_type,
            mode_key=command.lookup_mode_key,
            beat_numbers=beat_numbers,
            grid_index=command.grid_index,
        )
        grid_image_path: Path | None = None
        if entry is not None:
            entry_path = _safe_grids_file(grids_dir, entry.grid_path)
            if entry_path and entry_path.exists():
                grid_image_path = entry_path

        if grid_image_path is None:
            grid_files = sorted(grids_dir.glob("*.png")) + sorted(
                grids_dir.glob("*.jpg")
            )
            if command.grid_index < 0 or command.grid_index >= len(grid_files):
                raise GridPoolCutRejected(
                    f"Grid index {command.grid_index} out of range "
                    f"(total: {len(grid_files)})"
                )
            grid_image_path = grid_files[command.grid_index]

        if command.grid_type == "render":
            promote_dir = project_dir / "frames" / f"ep{command.episode_num:03d}"
        else:
            promote_dir = project_dir / "sketches"
        promote_dir.mkdir(parents=True, exist_ok=True)
        result = pool_indexer.save_grid_and_split(
            grid_image_path=str(grid_image_path),
            episode_grids_dir=str(grids_dir),
            grid_type=command.grid_type,
            mode_key=command.mode_key,
            beat_nums=beat_numbers,
            preset="custom",
            rows=command.rows,
            cols=command.cols,
            ts=datetime.now().strftime("%Y%m%d%H%M%S"),
            promote_dir=promote_dir,
            force_promote=command.grid_type == "render",
        )
        return CutGridResult(
            grid_index=command.grid_index,
            added=result.get("added", 0),
            skipped=result.get("skipped", 0),
        )

    def preview(
        self,
        context: ProjectContext,
        command: BuildGridSketchPreviewCommand,
    ) -> GridSketchPreview:
        grids_dir = self._grids_dir(context, command.episode_num)
        beat_numbers = list(command.beat_numbers)
        paths = pool_indexer.build_beat_sketch_paths(grids_dir, beat_numbers)
        pool = pool_indexer.load_pool_index(grids_dir)
        if pool:
            latest_pool_paths: dict[int, tuple[float, str]] = {}
            for image in pool.images:
                if image.type != "sketch" or not image.cell_path:
                    continue
                beat_num = int(image.original_beat)
                if beat_num not in beat_numbers:
                    continue
                cell_path = grids_dir / image.cell_path
                if not cell_path.exists():
                    continue
                generated_at = (
                    image.generated_at.timestamp() if image.generated_at else 0.0
                )
                current = latest_pool_paths.get(beat_num)
                if current is None or generated_at > current[0]:
                    latest_pool_paths[beat_num] = (generated_at, str(cell_path))
            paths = {
                **{
                    beat: path
                    for beat, (_generated_at, path) in latest_pool_paths.items()
                },
                **paths,
            }
        if not paths:
            raise GridPoolPreviewRejected("No sketch images found for requested beats")

        beats_slug = "_".join(str(beat) for beat in beat_numbers[:8])
        output_path = (
            grids_dir / f"sketch_thumb_grid{command.grid_index}_{beats_slug}_"
            f"{command.rows}x{command.cols}.jpg"
        )
        preview_path = Path(
            nanobanana_grid.crop_sketch_panels(
                str(grids_dir),
                beat_numbers,
                command.rows,
                command.cols,
                str(output_path),
                beat_sketch_paths=paths,
            )
        )
        try:
            relative_path = preview_path.relative_to(grids_dir)
        except ValueError as exc:
            raise GridPoolPreviewRejected(
                "Sketch preview path escaped episode grids directory"
            ) from exc
        return GridSketchPreview(
            grid_index=command.grid_index,
            rows=command.rows,
            cols=command.cols,
            beat_numbers=command.beat_numbers,
            preview_path=str(relative_path),
            preview_url=self._media_url_builder(
                context,
                f"grids/ep{command.episode_num:03d}/{relative_path}",
                local_path=preview_path,
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
