"""In-memory block-world model used by the DirectorWorld generator."""

from __future__ import annotations

from typing import Dict, Iterable, Tuple

try:
    from .ai_anime_voxel_palette import VOXEL_SEMANTIC_PALETTE, normalize_block_type
except ImportError:  # pragma: no cover - allows direct script execution
    from ai_anime_voxel_palette import VOXEL_SEMANTIC_PALETTE, normalize_block_type


Coord = Tuple[int, int, int]


PALETTE: Dict[str, Dict[str, str]] = VOXEL_SEMANTIC_PALETTE


class BlockWorld:
    def __init__(self, palette: Dict[str, Dict[str, str]] | None = None) -> None:
        self.palette = palette if palette is not None else PALETTE
        self.blocks: Dict[Coord, str] = {}

    def safe_set_block(self, x: int, y: int, z: int, block_type: str) -> None:
        block_type = normalize_block_type(block_type)
        if block_type not in self.palette:
            raise ValueError(f"Unknown block type: {block_type}")
        self.blocks[(int(x), int(y), int(z))] = block_type

    def safe_fill(
        self,
        x1: int,
        y1: int,
        z1: int,
        x2: int,
        y2: int,
        z2: int,
        block_type: str,
        *,
        mode: str = "replace",
    ) -> None:
        block_type = normalize_block_type(block_type)
        if block_type not in self.palette:
            raise ValueError(f"Unknown block type: {block_type}")
        min_x, max_x = sorted((int(x1), int(x2)))
        min_y, max_y = sorted((int(y1), int(y2)))
        min_z, max_z = sorted((int(z1), int(z2)))
        for x in range(min_x, max_x + 1):
            for y in range(min_y, max_y + 1):
                for z in range(min_z, max_z + 1):
                    if mode == "keep" and (x, y, z) in self.blocks:
                        continue
                    if mode == "hollow":
                        surface = (
                            x in (min_x, max_x)
                            or y in (min_y, max_y)
                            or z in (min_z, max_z)
                        )
                        if not surface:
                            continue
                    self.blocks[(x, y, z)] = block_type

    def remove(self, coords: Iterable[Coord]) -> None:
        for coord in coords:
            self.blocks.pop(coord, None)

    def sorted_blocks(self) -> list[dict[str, int | str]]:
        return [
            {"x": x, "y": y, "z": z, "type": block_type}
            for (x, y, z), block_type in sorted(self.blocks.items())
        ]

    def bounds(self) -> dict[str, list[int]]:
        if not self.blocks:
            return {"min": [0, 0, 0], "max": [0, 0, 0]}
        xs = [coord[0] for coord in self.blocks]
        ys = [coord[1] for coord in self.blocks]
        zs = [coord[2] for coord in self.blocks]
        return {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]}
