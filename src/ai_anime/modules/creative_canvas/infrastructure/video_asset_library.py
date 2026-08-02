"""Local Creative Canvas video asset library adapters."""

from __future__ import annotations

import json
import uuid
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

from ai_anime.modules.creative_canvas.infrastructure.paths import freezone_root
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.seedance2_i2v.voice_clone import resolve_character_voice
from ai_anime.shared.infrastructure.project_stores import (
    make_sqlite_store_for_context,
)
from ai_anime.shared.project_media import make_static_url_for_context
from ai_anime.utils.path_resolver import (
    canonical_portrait_path,
    canonical_prop_reference_path,
    canonical_scene_master_path,
)


class LocalCreativeCanvasVideoAssetRepository:
    def list_items(self, project_dir: Path) -> tuple[Mapping[str, Any], ...]:
        path = self.path(project_dir)
        if not path.exists():
            return ()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return ()
        if not isinstance(data, list):
            return ()
        return tuple(dict(item) for item in data if isinstance(item, dict))

    def save_items(
        self,
        project_dir: Path,
        items: Sequence[Mapping[str, Any]],
    ) -> None:
        path = self.path(project_dir)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = [dict(item) for item in items]
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @staticmethod
    def path(project_dir: Path) -> Path:
        return freezone_root(project_dir) / "video_character_library.json"


StoreFactory = Callable[[ProjectContext], Awaitable[Any]]
StaticUrlBuilder = Callable[[ProjectContext, str, str | Path | None], str]


class ProjectCreativeCanvasMainlineVideoAssetSource:
    def __init__(
        self,
        store_factory: StoreFactory = make_sqlite_store_for_context,
        static_url_builder: StaticUrlBuilder = make_static_url_for_context,
    ) -> None:
        self._store_factory = store_factory
        self._static_url_builder = static_url_builder

    async def list_assets(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
    ) -> tuple[Mapping[str, Any], ...]:
        store = await self._store_factory(context)
        project_root = project_dir.resolve()

        def asset_url(asset_path: str | Path) -> str:
            path = Path(asset_path).resolve()
            if not path.exists():
                return ""
            try:
                relative_path = path.relative_to(project_root).as_posix()
            except ValueError:
                return ""
            return self._static_url_builder(
                context,
                relative_path,
                path,
            )

        assets: list[dict[str, Any]] = []
        for character in store.get_all_characters():
            name = str(getattr(character, "name", "") or "")
            if not name:
                continue
            portrait_url = asset_url(canonical_portrait_path(project_dir, name))
            if portrait_url:
                assets.append(
                    self._asset(
                        item_id=f"mainline:character:{name}",
                        name=name,
                        media="image",
                        source="character",
                        url=portrait_url,
                    )
                )
            voice = resolve_character_voice(
                project_dir=project_dir,
                character=character,
            )
            if voice.audio_path is not None:
                voice_url = asset_url(voice.audio_path)
                if voice_url:
                    assets.append(
                        self._asset(
                            item_id=f"mainline:voice:{name}",
                            name=name,
                            media="audio",
                            source="character",
                            url=voice_url,
                        )
                    )

        for scene in await store.list_scenes():
            name = str(getattr(scene, "name", "") or "")
            if not name:
                continue
            master_url = asset_url(canonical_scene_master_path(project_dir, name))
            if master_url:
                assets.append(
                    self._asset(
                        item_id=f"mainline:scene:{name}",
                        name=name,
                        media="image",
                        source="scene",
                        url=master_url,
                    )
                )

        for prop in await store.list_props():
            name = str(getattr(prop, "name", "") or "")
            if not name:
                continue
            reference_url = asset_url(canonical_prop_reference_path(project_dir, name))
            if reference_url:
                assets.append(
                    self._asset(
                        item_id=f"mainline:prop:{name}",
                        name=name,
                        media="image",
                        source="prop",
                        url=reference_url,
                    )
                )
        return tuple(assets)

    @staticmethod
    def _asset(
        *,
        item_id: str,
        name: str,
        media: str,
        source: str,
        url: str,
    ) -> dict[str, Any]:
        return {
            "id": item_id,
            "name": name,
            "media": media,
            "source": source,
            "url": url,
        }


class UuidCreativeCanvasVideoAssetIdGenerator:
    def new_id(self) -> str:
        return uuid.uuid4().hex[:12]


class SystemCreativeCanvasClock:
    def now_isoformat(self) -> str:
        return datetime.now().isoformat()


__all__ = [
    "LocalCreativeCanvasVideoAssetRepository",
    "ProjectCreativeCanvasMainlineVideoAssetSource",
    "SystemCreativeCanvasClock",
    "UuidCreativeCanvasVideoAssetIdGenerator",
]
