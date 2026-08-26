"""Adapter over the current project configuration persistence."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.story_intake.domain import SpineTemplate


class ProjectConfigSettings:
    def __init__(
        self,
        *,
        load_config: Callable[[str, str], dict[str, Any]],
        save_config: Callable[..., Any],
        default_aspect_ratio: Callable[[str | None], str],
    ) -> None:
        self._load_config = load_config
        self._save_config = save_config
        self._default_aspect_ratio = default_aspect_ratio

    def get_spine_template(
        self,
        username: str,
        project_name: str,
    ) -> SpineTemplate:
        configured = str(
            self._load_config(username, project_name).get("spine_template") or "drama"
        ).strip()
        return "narrated" if configured == "narrated" else "drama"

    def set_ingestion_configuration(
        self,
        username: str,
        project_name: str,
        *,
        spine_template: SpineTemplate | None,
        visual_style: str | None,
        narration_style: str | None,
        ethnicity: str | None,
    ) -> None:
        config = self._load_config(username, project_name)
        if spine_template is not None:
            config["spine_template"] = spine_template
            config["aspect_ratio"] = self._default_aspect_ratio(spine_template)
        if visual_style is not None:
            config["visual_style"] = visual_style
        if ethnicity is not None:
            config["ethnicity"] = ethnicity
        effective_spine_template = spine_template or str(
            config.get("spine_template") or "drama"
        )
        if narration_style is not None and effective_spine_template == "narrated":
            config["narration_style"] = narration_style
        self._save_config(username, project_name, config)
