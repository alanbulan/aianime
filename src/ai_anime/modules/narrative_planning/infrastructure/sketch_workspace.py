from __future__ import annotations

from pathlib import Path

from ai_anime.shared.utils.path_resolver import PathResolver


class LocalSketchWorkspace:
    def clear_episode_sketches(
        self,
        output_dir: str | Path,
        episode_num: int,
    ) -> None:
        PathResolver(str(output_dir), episode_num).clean_sketches()
