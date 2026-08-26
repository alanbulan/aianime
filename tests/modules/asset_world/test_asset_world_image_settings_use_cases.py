from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.errors import (
    InvalidImageSelection,
    UnsupportedImageSourceKind,
)
from ai_anime.modules.asset_world.application.dto import CharacterGenerationOptions
from ai_anime.modules.asset_world.application.image_settings import (
    ImageSettingsUseCases,
)


class _Store:
    def __init__(self, values: dict[tuple[str, str, str], str] | None = None) -> None:
        self.values = values or {}

    def get(self, username: str, project: str, key: str) -> str:
        return self.values.get((username, project, key), "")

    def set(self, username: str, project: str, key: str, value: str) -> None:
        self.values[(username, project, key)] = value


class _GenerationSettings:
    def __init__(
        self,
        *,
        effective: dict | None = None,
        stored: dict | None = None,
    ) -> None:
        self.effective_config = effective or {}
        self.stored_config = stored or {}

    def effective(self, username: str, project: str) -> dict:
        return self.effective_config

    def stored(self, username: str, project: str) -> dict:
        return self.stored_config


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
    generation_settings: _GenerationSettings | None = None,
    usage: _Usage | None = None,
) -> ImageSettingsUseCases:
    return ImageSettingsUseCases(
        store or _Store(),
        generation_settings or _GenerationSettings(),
        usage or _Usage(),
    )


def test_character_selection_returns_saved_catalog_code_unchanged() -> None:
    store = _Store(
        {
            ("alice", "demo", "character_image_selection"): "shared-model",
        }
    )
    use_cases = _use_cases(store)

    assert use_cases.get_character_selection("alice", "demo") == {
        "character_image_selection": "shared-model",
    }

    store.values[("alice", "demo", "character_image_selection")] = "legacy-character"
    assert use_cases.get_character_selection("alice", "demo") == {
        "character_image_selection": "legacy-character",
    }


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
        match="character image model is required",
    ):
        use_cases.update_character_selection("alice", "demo", "  ")


def test_asset_selection_uses_kind_specific_key_then_character_default() -> None:
    store = _Store(
        {
            ("alice", "demo", "character_image_selection"): "legacy-shared",
            ("alice", "demo", "scene_image_selection"): "legacy-asset",
        }
    )
    use_cases = _use_cases(store)

    assert use_cases.get_asset_selection("alice", "demo", "character") == {
        "asset_kind": "character",
        "image_source_selection": "legacy-shared",
    }
    assert (
        use_cases.get_asset_selection("alice", "demo", "scene")[
            "image_source_selection"
        ]
        == "legacy-asset"
    )
    assert use_cases.get_asset_selection("alice", "demo", "prop") == {
        "asset_kind": "prop",
        "image_source_selection": "legacy-shared",
    }
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
        match="asset image model is required",
    ):
        use_cases.update_asset_selection(
            "alice",
            "demo",
            "scene",
            " ",
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


def test_character_model_falls_back_to_global_priority_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_roles: list[str] = []

    def resolve(role: str) -> str:
        requested_roles.append(role)
        return "highest-priority-model"

    monkeypatch.setattr(
        "ai_anime.modules.asset_world.application.image_settings.resolve_model_for_role",
        resolve,
    )
    use_cases = _use_cases()

    options = use_cases.character_generation_options(
        "alice",
        "demo",
        requested_style=None,
        requested_model=None,
    )

    assert options.model == "highest-priority-model"
    assert options.model_selector == ""
    assert requested_roles == ["IMAGE_GENERATION"]


def test_character_model_uses_lowest_configured_priority() -> None:
    from ai_anime.modules.model_usage.public import configure_model_access

    configure_model_access(
        allows_custom_models=True,
        mode="mixed",
        model_assignments=[
            {
                "modelId": "cloud-image",
                "role": "IMAGE_GENERATION",
                "priority": 100,
            },
            {
                "modelId": "byok-image",
                "role": "IMAGE_GENERATION",
                "priority": 1,
            },
        ],
    )

    options = _use_cases().character_generation_options(
        "alice",
        "demo",
        requested_style=None,
        requested_model=None,
    )

    assert options.model == "byok-image"
    assert options.model_selector == ""


def test_identity_image_falls_back_to_image_edit_priority_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_roles: list[str] = []

    def resolve(role: str) -> str:
        requested_roles.append(role)
        return "highest-priority-edit-model"

    monkeypatch.setattr(
        "ai_anime.modules.asset_world.application.image_settings.resolve_model_for_role",
        resolve,
    )
    use_cases = _use_cases()

    options = use_cases.character_generation_options(
        "alice",
        "demo",
        requested_style=None,
        requested_model=None,
        fallback_role="IMAGE_EDIT",
    )

    assert options.model == "highest-priority-edit-model"
    assert options.model_selector == ""
    assert requested_roles == ["IMAGE_EDIT"]


def test_character_model_reports_structured_missing_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def reject(_role: str) -> str:
        raise PermissionError("missing")

    monkeypatch.setattr(
        "ai_anime.modules.asset_world.application.image_settings.resolve_model_for_role",
        reject,
    )

    with pytest.raises(
        InvalidImageSelection,
        match="文生图模型缺失：当前未配置可用的 IMAGE_GENERATION 云端或 BYOK 模型",
    ) as caught:
        _use_cases().character_generation_options(
            "alice",
            "demo",
            requested_style=None,
            requested_model=None,
        )

    assert getattr(caught.value, "code", "") == "model_prereq_required"
    assert getattr(caught.value, "action_required", False) is True


def test_character_generation_options_merge_effective_project_defaults() -> None:
    store = _Store(
        {
            ("alice", "demo", "character_image_selection"): "shared-model",
        }
    )
    settings = _GenerationSettings(
        effective={
            "visual_style": "project-style",
            "ethnicity": "project-ethnicity",
        }
    )
    use_cases = _use_cases(store, settings)

    assert use_cases.character_generation_options(
        "alice",
        "demo",
        requested_style=None,
        requested_model=None,
    ) == CharacterGenerationOptions(
        style="project-style",
        ethnicity="project-ethnicity",
        model="shared-model",
    )
    assert use_cases.character_generation_options(
        "alice",
        "demo",
        requested_style="request-style",
        requested_model="request-model",
        requested_ethnicity="request-ethnicity",
    ) == CharacterGenerationOptions(
        style="request-style",
        ethnicity="request-ethnicity",
        model="request-model",
    )


def test_project_style_preserves_visual_and_legacy_config_precedence() -> None:
    settings = _GenerationSettings(
        stored={
            "visual_style": "visual-style",
            "project_style": "legacy-style",
        }
    )
    use_cases = _use_cases(generation_settings=settings)

    assert use_cases.project_style("alice", "demo") == "visual-style"
    settings.stored_config["visual_style"] = ""
    assert use_cases.project_style("alice", "demo") == "legacy-style"
    settings.stored_config.clear()
    assert use_cases.project_style("alice", "demo") == ""


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
