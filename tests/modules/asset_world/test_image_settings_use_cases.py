from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.errors import (
    InvalidImageSelection,
    UnsupportedImageSourceKind,
)
from ai_anime.modules.asset_world.application.image_settings import (
    ImageSettingsUseCases,
)


class _Catalog:
    def character_options(self) -> dict[str, str]:
        return {
            "character-model": "Character Model",
            "shared-model": "Shared Model",
        }

    def asset_options(self) -> dict[str, str]:
        return {
            "shared-model": "Shared Model",
            "asset-model": "Asset Model",
        }

    def normalize_character_selection(self, value: str) -> str:
        if value in self.character_options():
            return value
        return {
            "legacy-character": "character-model",
            "legacy-shared": "shared-model",
        }.get(value, "character-model")

    def normalize_asset_selection(self, value: str) -> str:
        if value in self.asset_options():
            return value
        return {"legacy-asset": "asset-model"}.get(value, "shared-model")

    def default_character_selection(self) -> str:
        return "character-model"


class _Store:
    def __init__(self, values: dict[tuple[str, str, str], str] | None = None) -> None:
        self.values = values or {}

    def get(self, username: str, project: str, key: str) -> str:
        return self.values.get((username, project, key), "")

    def set(self, username: str, project: str, key: str, value: str) -> None:
        self.values[(username, project, key)] = value


class _Usage:
    def __init__(self) -> None:
        self.calls: list[tuple[Path, tuple[str, ...]]] = []

    def summary(
        self,
        project_output_dir: str | Path,
        *,
        task_types: tuple[str, ...],
    ) -> dict:
        self.calls.append((Path(project_output_dir), task_types))
        return {"total_requests": 3, "today_requests": 1}


def _use_cases(
    store: _Store | None = None,
    usage: _Usage | None = None,
) -> ImageSettingsUseCases:
    return ImageSettingsUseCases(_Catalog(), store or _Store(), usage or _Usage())


def test_character_selection_uses_saved_value_and_normalizes_legacy_value() -> None:
    store = _Store(
        {
            ("alice", "demo", "character_image_selection"): "shared-model",
        }
    )
    use_cases = _use_cases(store)

    assert use_cases.get_character_selection("alice", "demo") == {
        "character_image_selection": "shared-model",
        "options": {
            "character-model": "Character Model",
            "shared-model": "Shared Model",
        },
    }

    store.values[("alice", "demo", "character_image_selection")] = "legacy-character"
    assert (
        use_cases.get_character_selection("alice", "demo")["character_image_selection"]
        == "character-model"
    )


def test_character_selection_update_validates_and_persists() -> None:
    store = _Store()
    use_cases = _use_cases(store)

    data = use_cases.update_character_selection(
        "alice",
        "demo",
        " shared-model ",
    )

    assert store.values[("alice", "demo", "character_image_selection")] == (
        "shared-model"
    )
    assert data["character_image_selection"] == "shared-model"
    with pytest.raises(
        InvalidImageSelection,
        match="Invalid character_image_selection: missing",
    ):
        use_cases.update_character_selection("alice", "demo", "missing")


def test_asset_selection_uses_kind_specific_keys_and_character_fallback() -> None:
    store = _Store(
        {
            ("alice", "demo", "character_image_selection"): "legacy-shared",
            ("alice", "demo", "scene_image_selection"): "legacy-asset",
        }
    )
    use_cases = _use_cases(store)

    assert use_cases.get_asset_selection("alice", "demo", "character") == {
        "asset_kind": "character",
        "image_source_selection": "shared-model",
        "options": {
            "shared-model": "Shared Model",
            "asset-model": "Asset Model",
        },
    }
    assert (
        use_cases.get_asset_selection("alice", "demo", "scene")[
            "image_source_selection"
        ]
        == "asset-model"
    )
    assert use_cases.normalize_asset_kind(" PROP ") == "prop"
    with pytest.raises(
        UnsupportedImageSourceKind,
        match="Unsupported image source kind: video",
    ):
        use_cases.normalize_asset_kind("video")


def test_asset_selection_update_validates_and_persists_kind_key() -> None:
    store = _Store()
    use_cases = _use_cases(store)

    data = use_cases.update_asset_selection(
        "alice",
        "demo",
        "prop",
        " asset-model ",
    )

    assert store.values[("alice", "demo", "prop_image_selection")] == "asset-model"
    assert data["image_source_selection"] == "asset-model"
    with pytest.raises(
        InvalidImageSelection,
        match="Invalid image_source_selection: character-model",
    ):
        use_cases.update_asset_selection(
            "alice",
            "demo",
            "scene",
            "character-model",
        )


def test_character_model_prefers_explicit_request_then_project_selection() -> None:
    store = _Store(
        {
            ("alice", "demo", "character_image_selection"): "shared-model",
        }
    )
    use_cases = _use_cases(store)

    assert (
        use_cases.resolve_character_model("alice", "demo", " explicit-model ")
        == "explicit-model"
    )
    assert use_cases.resolve_character_model("alice", "demo", None) == "shared-model"


def test_character_usage_is_limited_to_portrait_and_identity_tasks(
    tmp_path: Path,
) -> None:
    usage = _Usage()
    use_cases = _use_cases(usage=usage)

    assert use_cases.get_character_usage(tmp_path) == {
        "total_requests": 3,
        "today_requests": 1,
    }
    assert usage.calls == [
        (tmp_path, ("character_portrait", "identity_image")),
    ]
