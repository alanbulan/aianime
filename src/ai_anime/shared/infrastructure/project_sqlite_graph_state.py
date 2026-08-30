"""Project-wide in-memory graph-state projection over SQLite repositories."""

from __future__ import annotations

from typing import Any


def normalize_alias_lookup(value: str) -> str:
    """Normalize user-visible asset names for case-insensitive alias lookup."""
    return " ".join((value or "").replace("\u3000", " ").strip().lower().split())


class ProjectSQLiteGraphStateMixin:
    _normalize_alias_lookup = staticmethod(normalize_alias_lookup)

    async def load_graph_state(self) -> None:
        characters = await self.list_characters()
        episodes = await self.list_episodes()
        props = await self.list_props()

        self._characters.clear()
        self._characters.update({char.name: char for char in characters})
        self._episodes.clear()
        self._episodes.update({episode.number: episode for episode in episodes})
        self._props.clear()
        self._props.update({prop.name: prop for prop in props})
        self._alias_index.clear()
        for char in characters:
            for alias in char.aliases:
                self._alias_index[alias] = char.name

    def resolve_name(self, name: str) -> str:
        return self._alias_index.get(name, name)

    def get_character(self, name: str) -> Any | None:
        return self._characters.get(self.resolve_name(name))

    def get_episode(self, number: int) -> Any | None:
        return self._episodes.get(number)

    def get_cached_prop(self, name: str) -> Any | None:
        raw_name = str(name or "").strip()
        if not raw_name:
            return None
        prop = self._props.get(raw_name)
        if prop:
            return prop
        lookup = self._normalize_alias_lookup(raw_name)
        for candidate in self._props.values():
            if self._normalize_alias_lookup(candidate.name) == lookup:
                return candidate
            aliases = getattr(candidate, "aliases", []) or []
            if any(self._normalize_alias_lookup(alias) == lookup for alias in aliases):
                return candidate
        return None

    def get_all_characters(self) -> list[Any]:
        return list(self._characters.values())

    def get_all_episodes(self) -> list[Any]:
        return sorted(self._episodes.values(), key=lambda episode: episode.number)

    async def delete_project_data(self) -> None:
        """删除当前项目的所有 SQLite 项目事实。"""
        try:
            db = await self._ensure_db()
            await db.execute("DELETE FROM beats")
            await db.execute("DELETE FROM episodes")
            await db.execute("DELETE FROM characters")
            await db.execute("DELETE FROM scenes")
            await db.execute("DELETE FROM props")
            await db.commit()
            self._characters.clear()
            self._episodes.clear()
            self._props.clear()
            self._alias_index.clear()
        except Exception:
            self._characters.clear()
            self._episodes.clear()
            self._props.clear()
            self._alias_index.clear()
            raise

    @property
    def character_count(self) -> int:
        return len(self._characters)

    @property
    def episode_count(self) -> int:
        return len(self._episodes)

    @property
    def prop_count(self) -> int:
        return len(self._props)


__all__ = ["ProjectSQLiteGraphStateMixin", "normalize_alias_lookup"]
