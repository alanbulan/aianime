from __future__ import annotations

from pathlib import Path

from ai_anime.modules.narrative_planning.application.ports import (
    ProjectMediaResource,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.project_media import make_static_url_for_context
from ai_anime.utils.media_io import get_audio_duration_async


_MEDIA_LAYOUT = {
    "sketch": ("sketches", ".png"),
    "frame": ("frames", ".png"),
    "video": ("videos/beats", ".mp4"),
    "audio": ("audio", ".mp3"),
}


class LocalEpisodeBeatMediaCatalog:
    def __init__(self, project_dir: str | Path) -> None:
        self._project_dir = Path(project_dir)

    def locate(
        self,
        episode_number: int,
        beat_number: int,
    ) -> dict[str, ProjectMediaResource]:
        episode_tag = f"ep{episode_number:03d}"
        resources: dict[str, ProjectMediaResource] = {}
        for media_kind, (relative_root, extension) in _MEDIA_LAYOUT.items():
            filename = f"beat_{beat_number:02d}{extension}"
            relative_path = f"{relative_root}/{episode_tag}/{filename}"
            local_path = self._project_dir / Path(relative_path)
            if local_path.exists():
                resources[media_kind] = ProjectMediaResource(
                    relative_path=relative_path,
                    local_path=local_path,
                )
        return resources


class ProjectContextMediaUrlBuilder:
    def __init__(self, context: ProjectContext) -> None:
        self._context = context

    def build(self, resource: ProjectMediaResource) -> str:
        return make_static_url_for_context(
            self._context,
            resource.relative_path,
            local_path=resource.local_path,
        )


class AsyncAudioDurationProbe:
    async def read(self, audio_path: Path) -> float:
        return await get_audio_duration_async(str(audio_path))


__all__ = [
    "AsyncAudioDurationProbe",
    "LocalEpisodeBeatMediaCatalog",
    "ProjectContextMediaUrlBuilder",
]
