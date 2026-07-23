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

    def set_spine_template(
        self,
        username: str,
        project_name: str,
        spine_template: SpineTemplate,
    ) -> None:
        config = self._load_config(username, project_name)
        config["spine_template"] = spine_template
        config["aspect_ratio"] = self._default_aspect_ratio(spine_template)
        self._save_config(username, project_name, config)
