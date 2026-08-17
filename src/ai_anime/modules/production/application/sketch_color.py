"""Sketch marker color assignment application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionEpisodeSource,
    ProductionRuntimePropMenuSource,
    ProductionSketchColorAssigner,
    ProductionSketchColorStore,
    ProductionSketchWorkspace,
)
from ai_anime.modules.production.domain.sketch_color import (
    apply_prop_marker_colors,
    global_prop_marker_colors,
    marker_color_change_requires_sketch_clean,
)


@dataclass(frozen=True)
class SketchColorAssignmentResult:
    identity_colors: dict[str, str]
    prop_colors: dict[str, str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "colors": self.identity_colors,
            "count": len(self.identity_colors),
            "prop_colors": self.prop_colors,
            "prop_count": len(self.prop_colors),
        }


class SketchColorMarkersMissing(Exception):
    pass


class SketchColorPersistenceFailed(RuntimeError):
    pass


def assign_complete_episode_identity_colors(
    color_assigner: ProductionSketchColorAssigner,
    *,
    characters: list[dict[str, Any]],
    beats: list[dict[str, Any]],
    episode: Any | None,
    existing_colors: dict[str, str] | None = None,
) -> dict[str, str]:
    """Assign beat marker colors and fill every planned episode identity."""

    colors = color_assigner.assign(
        [],
        beats,
        existing_colors=existing_colors,
    )
    planned_identity_ids = {
        str(identity_id or "").strip()
        for identity_id in (getattr(episode, "identity_ids", None) or [])
        if str(identity_id or "").strip()
    }
    missing_identity_ids = planned_identity_ids.difference(colors)
    if not missing_identity_ids:
        return colors

    planned_characters: list[dict[str, Any]] = []
    resolved_identity_ids: set[str] = set()
    for character in characters:
        identities = [
            identity
            for identity in (character.get("identities") or [])
            if str(identity.get("identity_id") or "").strip()
            in missing_identity_ids
        ]
        if identities:
            planned_characters.append({**character, "identities": identities})
            resolved_identity_ids.update(
                str(identity.get("identity_id") or "").strip()
                for identity in identities
            )
    unresolved = missing_identity_ids.difference(resolved_identity_ids)
    if unresolved:
        planned_characters.append(
            {
                "name": "",
                "identities": [
                    {"identity_id": identity_id}
                    for identity_id in sorted(unresolved)
                ],
            }
        )
    return color_assigner.assign(
        planned_characters,
        [],
        existing_colors=colors,
    )


class SketchColorAssignmentUseCases:
    def __init__(
        self,
        color_assigner: ProductionSketchColorAssigner,
        episodes: ProductionEpisodeSource,
        prop_menus: ProductionRuntimePropMenuSource,
        workspace: ProductionSketchWorkspace,
    ) -> None:
        self._color_assigner = color_assigner
        self._episodes = episodes
        self._prop_menus = prop_menus
        self._workspace = workspace

    async def assign(
        self,
        *,
        store: ProductionSketchColorStore,
        episode_num: int,
        beats: list[dict[str, Any]],
        output_dir: str | Path,
    ) -> SketchColorAssignmentResult:
        previous_colors = dict(store.get_sketch_colors(episode_num) or {})
        episode = self._episodes.episode_or_none(store, episode_num)
        characters = [
            {
                "name": str(getattr(character, "name", "") or ""),
                "identities": [
                    {
                        "identity_id": str(
                            getattr(identity, "identity_id", "") or ""
                        )
                    }
                    for identity in (getattr(character, "identities", None) or [])
                    if str(getattr(identity, "identity_id", "") or "").strip()
                ],
            }
            for character in (store.get_all_characters() or [])
        ]
        identity_colors = assign_complete_episode_identity_colors(
            self._color_assigner,
            characters=characters,
            beats=beats,
            episode=episode,
            existing_colors=previous_colors,
        )
        prop_menu = await self._prop_menus.for_episode(
            store,
            episode,
            beats,
        )
        previous_prop_colors = global_prop_marker_colors(
            beats,
            prop_menu=prop_menu,
            sketch_colors=previous_colors,
        )
        prop_colors = global_prop_marker_colors(
            beats,
            prop_menu=prop_menu,
            sketch_colors=identity_colors,
            assign_missing=True,
        )
        if not identity_colors and not prop_colors:
            raise SketchColorMarkersMissing

        try:
            if identity_colors:
                await store.set_sketch_colors(episode_num, identity_colors)
                persisted_colors = dict(store.get_sketch_colors(episode_num) or {})
                missing_persisted = set(identity_colors).difference(persisted_colors)
                if missing_persisted:
                    raise SketchColorPersistenceFailed(
                        "身份配色写入后校验失败："
                        + "、".join(sorted(missing_persisted))
                    )
            if prop_colors and prop_menu:
                await store.update_episode(
                    episode_num,
                    prop_menu=apply_prop_marker_colors(prop_menu, prop_colors),
                )
        except SketchColorPersistenceFailed:
            raise
        except Exception as exc:
            raise SketchColorPersistenceFailed(f"草图配色持久化失败：{exc}") from exc

        previous_markers = {
            **{
                f"identity:{key}": value
                for key, value in previous_colors.items()
            },
            **{f"prop:{key}": value for key, value in previous_prop_colors.items()},
        }
        current_markers = {
            **{f"identity:{key}": value for key, value in identity_colors.items()},
            **{f"prop:{key}": value for key, value in prop_colors.items()},
        }
        if marker_color_change_requires_sketch_clean(
            previous_markers,
            current_markers,
        ):
            self._workspace.clear_episode_sketches(output_dir, episode_num)

        return SketchColorAssignmentResult(
            identity_colors=identity_colors,
            prop_colors=prop_colors,
        )
