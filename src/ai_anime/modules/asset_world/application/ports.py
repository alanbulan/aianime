"""Ports required by Asset & World style use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence


class StyleCatalog(Protocol):
    def list_all_styles(
        self,
        *,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> list[dict[str, Any]]: ...

    def get_style(
        self,
        style_id: str,
        *,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> Any | None: ...

    def get_preset(self, style_id: str) -> Any | None: ...

    def build_style_config(self, payload: Mapping[str, Any]) -> Any: ...

    def validate_style_preview_path(
        self,
        project_dir: str | Path,
        style_id: str,
        preview_path: str,
    ) -> str: ...

    def find_style_preview(
        self,
        project_dir: str | Path,
        style_id: str,
    ) -> str | None: ...

    def save_custom_style(
        self,
        style_id: str,
        config: Any,
        *,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool: ...

    def delete_custom_style(
        self,
        style_id: str,
        *,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool: ...

    def stage_style_preview(
        self,
        project_dir: str | Path,
        content: bytes,
        extension: str,
    ) -> str: ...

    def finalize_style_preview(
        self,
        project_dir: str | Path,
        style_id: str,
        staged_path: str,
    ) -> str: ...

    def preset_preview_path(self, style_id: str) -> Path: ...

    def resolve_project_preview_path(
        self,
        project_dir: str | Path,
        preview_path: str,
    ) -> Path | None: ...


class StylePreviewGenerator(Protocol):
    async def generate(
        self,
        *,
        prompt: str,
        style_id: str,
        model: str,
    ) -> Sequence[str | Path]: ...


class StyleImageAnalyzer(Protocol):
    async def analyze(
        self,
        content: bytes,
        *,
        mime_type: str,
    ) -> Mapping[str, Any]: ...


class StyleUsageMeter(Protocol):
    def set_llm_usage_context(
        self,
        user_id: str,
        *,
        project_id: str | None = None,
        resource_kind: str | None = None,
        billing_metadata: dict[str, Any] | None = None,
    ) -> None: ...

    def clear_llm_usage_context(self) -> None: ...
