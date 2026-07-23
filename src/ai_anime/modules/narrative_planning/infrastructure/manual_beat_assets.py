from __future__ import annotations

import re
from pathlib import Path


_BEAT_ASSET_RE = re.compile(r"^beat_(\d+)")


class LocalManualBeatAssetWorkspace:
    def __init__(self, project_dir: str | Path | None) -> None:
        self._project_dir = Path(project_dir) if project_dir else None

    def existing_beat_numbers(self, episode_number: int) -> set[int]:
        project_dir = self._project_dir
        if project_dir is None or not project_dir.exists():
            return set()

        ep_token = f"ep{episode_number:03d}"
        numbers: set[int] = set()
        try:
            episode_dirs = [
                path for path in project_dir.rglob(ep_token) if path.is_dir()
            ]
        except OSError:
            return numbers

        for episode_dir in episode_dirs:
            for path in episode_dir.rglob("beat_*"):
                match = _BEAT_ASSET_RE.match(path.name)
                if not match:
                    continue
                try:
                    numbers.add(int(match.group(1)))
                except ValueError:
                    continue
        return numbers

    def delete_beat_artifacts(
        self,
        episode_number: int,
        beat_number: int,
    ) -> None:
        project_dir = self._project_dir
        if project_dir is None:
            return

        ep_token = f"ep{episode_number:03d}"
        candidates = [
            project_dir / "sketches" / ep_token / f"beat_{beat_number:02d}.png",
            project_dir / "frames" / ep_token / f"beat_{beat_number:02d}.png",
            project_dir / "renders" / ep_token / f"beat_{beat_number:02d}.png",
        ]
        for path in candidates:
            try:
                if path.exists() and path.is_file():
                    path.unlink()
            except OSError:
                pass

        for root in [
            project_dir / "grids" / ep_token / "sketch" / "cells",
            project_dir / "grids" / ep_token / "render" / "cells",
        ]:
            if not root.exists():
                continue
            for path in root.glob(f"beat_{beat_number:02d}_*"):
                try:
                    if path.is_file():
                        path.unlink()
                except OSError:
                    pass


class LocalManualSketchCatalog:
    def __init__(self, sketches_dir: str | Path) -> None:
        self._sketches_dir = Path(sketches_dir)

    def exists(self, beat_number: int) -> bool:
        return (self._sketches_dir / f"beat_{beat_number:02d}.png").exists()


def choose_manual_sketch_mode_key(count: int) -> str:
    from ai_anime.generators.nanobanana_grid import sketch_scene_grid_split

    beats = [{"beat_number": index} for index in range(1, max(1, count) + 1)]
    return str(sketch_scene_grid_split(beats)[0]["mode_key"])


__all__ = [
    "LocalManualBeatAssetWorkspace",
    "LocalManualSketchCatalog",
    "choose_manual_sketch_mode_key",
]
