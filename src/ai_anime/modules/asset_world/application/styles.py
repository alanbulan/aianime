"""Application services for visual-style catalog and media workflows."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping
from urllib.parse import quote

from ai_anime.modules.asset_world.application.dto import (
    AnalyzeStyleCommand,
    CreateCustomStyleCommand,
    StyleFile,
    StyleScope,
)
from ai_anime.modules.asset_world.application.errors import (
    InvalidStyleInput,
    StyleRejected,
    StyleStorageFailed,
    UnsupportedStyleMedia,
)
from ai_anime.modules.asset_world.application.ports import (
    StyleCatalog,
    StyleImageAnalyzer,
    StylePreviewGenerator,
    StyleUsageMeter,
)
from ai_anime.modules.asset_world.domain import (
    PresetStyleDeletionForbidden,
    PresetStyleOverrideForbidden,
    UnsupportedStylePreviewType,
    ensure_custom_style_can_be_created,
    ensure_custom_style_can_be_deleted,
    style_preview_extension,
    validate_style_preview_media_type,
)


def _project_preview_url(project: str | None, preview_path: str | None) -> str | None:
    if not project or not preview_path:
        return None
    return (
        f"/api/v1/projects/{quote(project, safe='')}/media/"
        f"{quote(preview_path, safe='/')}"
    )


def _style_payload(style: Any) -> dict[str, Any]:
    if isinstance(style, Mapping):
        return dict(style)
    model_dump = getattr(style, "model_dump", None)
    if callable(model_dump):
        return dict(model_dump())
    return dict(vars(style))


class StyleCatalogUseCases:
    def __init__(self, catalog: StyleCatalog) -> None:
        self._catalog = catalog

    def list_styles(self, scope: StyleScope) -> list[dict[str, Any]]:
        styles = [
            dict(style)
            for style in self._catalog.list_all_styles(
                username=scope.username,
                project=scope.project_name,
            )
        ]
        for style in styles:
            if style.get("type") == "custom":
                style["preview_url"] = _project_preview_url(
                    scope.request_project,
                    style.get("preview_path"),
                )
        return styles

    def get_style(self, style_id: str, scope: StyleScope) -> dict[str, Any]:
        style = self._catalog.get_style(
            style_id,
            username=scope.username,
            project=scope.project_name,
        )
        if style is None:
            raise StyleRejected(f"Style '{style_id}' not found")

        payload = _style_payload(style)
        if not payload.get("is_preset"):
            payload["preview_url"] = _project_preview_url(
                scope.request_project,
                payload.get("preview_path"),
            )
        return payload

    def get_style_preview(self, style_id: str, scope: StyleScope) -> StyleFile:
        if self._catalog.get_preset(style_id) is not None:
            preview_path = self._catalog.preset_preview_path(style_id)
            if not preview_path.exists():
                raise StyleRejected(f"预设风格 '{style_id}' 暂无参考图")
            return StyleFile(
                path=preview_path,
                media_type="image/png",
                filename=f"preview_{style_id}.png",
            )

        style = self._catalog.get_style(
            style_id,
            username=scope.username,
            project=scope.project_name,
        )
        if style is None:
            raise StyleRejected(f"Style '{style_id}' not found")

        preview_path = getattr(style, "preview_path", None)
        if not scope.request_project or not preview_path or scope.project_dir is None:
            raise StyleRejected("自定义风格暂无参考图")
        resolved_path = self._catalog.resolve_project_preview_path(
            scope.project_dir,
            preview_path,
        )
        if resolved_path is None:
            raise StyleRejected("自定义风格参考图不存在")
        return StyleFile(path=resolved_path, media_type="image/*")

    def create_custom_style(
        self,
        command: CreateCustomStyleCommand,
        scope: StyleScope,
    ) -> None:
        try:
            ensure_custom_style_can_be_created(
                command.style_id,
                is_preset=self._catalog.get_preset(command.style_id) is not None,
            )
        except PresetStyleOverrideForbidden as exc:
            raise StyleRejected(str(exc)) from exc

        try:
            config_payload = dict(command.config or {})
            config_payload["id"] = command.style_id
            config_payload["name"] = (
                command.name
                or config_payload.get("name")
                or command.style_id
            )
            config = self._catalog.build_style_config(config_payload)
            if command.preview_path:
                if scope.project_dir is None:
                    raise ValueError("Project directory is required")
                config.preview_path = self._catalog.validate_style_preview_path(
                    scope.project_dir,
                    command.style_id,
                    str(command.preview_path),
                )
            elif scope.project_dir is not None:
                config.preview_path = self._catalog.find_style_preview(
                    scope.project_dir,
                    command.style_id,
                )
            success = self._catalog.save_custom_style(
                command.style_id,
                config,
                username=scope.username,
                project=scope.project_name,
            )
            if not success:
                raise StyleRejected("保存自定义风格失败")
        except StyleRejected:
            raise
        except ValueError as exc:
            raise InvalidStyleInput(str(exc)) from exc
        except Exception as exc:
            raise StyleRejected(str(exc)) from exc

    def ensure_custom_style_can_be_deleted(self, style_id: str) -> None:
        try:
            ensure_custom_style_can_be_deleted(
                is_preset=self._catalog.get_preset(style_id) is not None,
            )
        except PresetStyleDeletionForbidden as exc:
            raise StyleRejected(str(exc)) from exc

    def delete_custom_style(self, style_id: str, scope: StyleScope) -> None:
        success = self._catalog.delete_custom_style(
            style_id,
            username=scope.username,
            project=scope.project_name,
        )
        if not success:
            raise StyleRejected(f"Custom style '{style_id}' not found")

    def upload_style_preview(
        self,
        *,
        scope: StyleScope,
        style_id: str,
        content: bytes,
        filename: str | None,
        content_type: str | None,
    ) -> str:
        if not content:
            raise InvalidStyleInput("No preview image uploaded")
        if scope.project_dir is None:
            raise InvalidStyleInput("Project directory is required")
        try:
            extension = validate_style_preview_media_type(filename, content_type)
        except UnsupportedStylePreviewType as exc:
            raise UnsupportedStyleMedia(str(exc)) from exc

        try:
            staged_token = self._catalog.stage_style_preview(
                scope.project_dir,
                content,
                extension,
            )
            return self._catalog.finalize_style_preview(
                scope.project_dir,
                style_id,
                staged_token,
            )
        except ValueError as exc:
            raise InvalidStyleInput(str(exc)) from exc
        except OSError as exc:
            raise StyleStorageFailed("Failed to persist style preview") from exc


class StylePreviewUseCases:
    def __init__(
        self,
        catalog: StyleCatalog,
        generator: StylePreviewGenerator,
    ) -> None:
        self._catalog = catalog
        self._generator = generator

    async def generate_preview(
        self,
        *,
        style_id: str,
        scope: StyleScope,
        prompt: str,
        model: str,
    ) -> StyleFile:
        style = self._catalog.get_style(
            style_id,
            username=scope.username,
            project=scope.project_name,
        )
        if style is None:
            raise StyleRejected(f"Style '{style_id}' not found")

        try:
            paths = await self._generator.generate(
                prompt=prompt,
                style_id=style_id,
                model=model,
            )
        except Exception as exc:
            raise StyleRejected(f"Preview generation failed: {exc}") from exc
        if not paths:
            raise StyleRejected("No preview image generated")
        return StyleFile(
            path=Path(paths[0]),
            media_type="image/png",
            filename=f"preview_{style_id}.png",
        )


class AnalyzeStyle:
    def __init__(
        self,
        catalog: StyleCatalog,
        analyzer: StyleImageAnalyzer,
        usage_meter: StyleUsageMeter,
    ) -> None:
        self._catalog = catalog
        self._analyzer = analyzer
        self._usage_meter = usage_meter

    async def execute(
        self,
        command: AnalyzeStyleCommand,
        scope: StyleScope,
    ) -> dict[str, Any]:
        if not command.content:
            raise StyleRejected("No file uploaded")
        if scope.project_dir is None:
            raise StyleRejected("Project directory is required")

        preview_token = None
        try:
            if command.style_id.strip():
                preview_token = self._catalog.stage_style_preview(
                    scope.project_dir,
                    command.content,
                    style_preview_extension(command.filename),
                )
            if command.billing is not None:
                billing = command.billing
                self._usage_meter.set_llm_usage_context(
                    billing.billing_user_id,
                    project_id=billing.project_id,
                    resource_kind="script",
                    billing_metadata={
                        "billing_user_id": billing.billing_user_id,
                        "requester_user_id": billing.requester_user_id,
                        "project_owner_id": billing.project_owner_id,
                        "source": "style_analyzer",
                    },
                )
            result = await self._analyzer.analyze(
                command.content,
                mime_type=command.mime_type,
            )
        except Exception as exc:
            raise StyleRejected(f"Style analysis failed: {exc}") from exc
        finally:
            self._usage_meter.clear_llm_usage_context()

        data = dict(result)
        if preview_token:
            data["preview_token"] = preview_token
        return data
