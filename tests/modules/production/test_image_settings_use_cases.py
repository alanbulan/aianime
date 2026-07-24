from __future__ import annotations

from typing import Any

import pytest

from ai_anime.modules.production.application.image_settings import (
    ProductionImageSettingsRejected,
    ProductionImageSettingsUseCases,
    UpdateRenderImageSettingsCommand,
    UpdateSketchImageSettingsCommand,
)


class _Repository:
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.config = dict(config or {})
        self.saved: list[dict[str, Any]] = []

    def load(self, username: str, project: str) -> dict[str, Any]:
        return dict(self.config)

    def save(
        self,
        username: str,
        project: str,
        updates: dict[str, Any],
    ) -> None:
        self.config.update(updates)
        self.saved.append(dict(updates))


class _Selections:
    def options(self) -> dict[str, str]:
        return {"image-a": "Image A", "image-b": "Image B"}

    def normalize_render(self, value: str | None) -> str:
        return {"legacy": "image-a"}.get(value or "", value or "image-b")

    def normalize_sketch(self, value: str | None) -> str:
        return {"legacy": "image-b"}.get(value or "", value or "image-a")


def _use_cases(
    config: dict[str, Any] | None = None,
) -> tuple[ProductionImageSettingsUseCases, _Repository]:
    repository = _Repository(config)
    return ProductionImageSettingsUseCases(repository, _Selections()), repository


def test_settings_project_normalized_values_and_defaults() -> None:
    use_cases, _repository = _use_cases(
        {
            "render_image_selection": "legacy",
            "sketch_image_selection": "legacy",
        }
    )

    assert use_cases.render_settings("alice", "demo") == {
        "render_image_selection": "image-a",
        "options": {"image-a": "Image A", "image-b": "Image B"},
        "sketch_aspect_padding": True,
    }
    assert use_cases.sketch_settings("alice", "demo") == {
        "sketch_image_selection": "image-b",
        "options": {"image-a": "Image A", "image-b": "Image B"},
    }


def test_update_settings_persists_only_requested_values() -> None:
    use_cases, repository = _use_cases()

    use_cases.update_render_settings(
        "alice",
        "demo",
        UpdateRenderImageSettingsCommand(
            render_image_selection="image-b",
            sketch_aspect_padding=False,
        ),
    )
    use_cases.update_sketch_settings(
        "alice",
        "demo",
        UpdateSketchImageSettingsCommand(sketch_image_selection="image-a"),
    )

    assert repository.saved == [
        {
            "render_image_selection": "image-b",
            "sketch_aspect_padding": False,
        },
        {"sketch_image_selection": "image-a"},
    ]


@pytest.mark.parametrize(
    ("method", "command", "message"),
    [
        (
            "render",
            UpdateRenderImageSettingsCommand(render_image_selection="unknown"),
            "Invalid render_image_selection: unknown",
        ),
        (
            "sketch",
            UpdateSketchImageSettingsCommand(sketch_image_selection="unknown"),
            "Invalid sketch_image_selection: unknown",
        ),
    ],
)
def test_update_settings_rejects_unknown_selections(
    method: str,
    command: Any,
    message: str,
) -> None:
    use_cases, repository = _use_cases()

    with pytest.raises(ProductionImageSettingsRejected, match=message):
        if method == "render":
            use_cases.update_render_settings("alice", "demo", command)
        else:
            use_cases.update_sketch_settings("alice", "demo", command)

    assert repository.saved == []


def test_runtime_resolution_prefers_explicit_request() -> None:
    use_cases, _repository = _use_cases()
    config = {
        "render_image_selection": "image-a",
        "sketch_image_selection": "image-a",
        "sketch_aspect_padding": False,
    }

    assert use_cases.resolve_render_selection(config, "image-b") == "image-b"
    assert use_cases.resolve_sketch_selection(config, "image-b") == "image-b"
    assert use_cases.resolve_sketch_aspect_padding(config, None) is False
    assert use_cases.resolve_sketch_aspect_padding(config, True) is True
