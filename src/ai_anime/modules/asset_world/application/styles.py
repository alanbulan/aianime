"""Application services for visual-style catalog and media workflows."""

from __future__ import annotations

import re
import shutil
import tempfile
import uuid
from mimetypes import guess_type
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import quote

from ai_anime.modules.asset_world.application.dto import (
    AnalyzeStyleCommand,
    CreateCustomStyleCommand,
    ScheduledAssetTask,
    StyleFile,
    StylePreviewGenerationTask,
    StyleAnalysisTask,
    StyleScope,
    UpdateCustomStyleCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    InvalidStyleInput,
    StyleAlreadyExists,
    StyleRejected,
    StyleStorageFailed,
    UnsupportedStyleMedia,
)
from ai_anime.modules.asset_world.application.ports import (
    StyleCatalog,
    StyleImageAnalyzer,
    StylePreviewGenerator,
    StyleTaskScheduler,
    StyleUsageMeter,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import task_config_scope
from ai_anime.modules.asset_world.domain import (
    PresetStyleDeletionForbidden,
    PresetStyleOverrideForbidden,
    UnsupportedStylePreviewType,
    ensure_custom_style_can_be_created,
    ensure_custom_style_can_be_deleted,
    style_preview_extension,
    validate_style_preview_media_type,
)


def _style_preview_url(style_id: str, preview_path: str | None) -> str | None:
    if not preview_path:
        return None
    return f"/api/v1/styles/{quote(style_id, safe='')}/preview"


def _style_payload(style: Any) -> dict[str, Any]:
    if isinstance(style, Mapping):
        return dict(style)
    model_dump = getattr(style, "model_dump", None)
    if callable(model_dump):
        return dict(model_dump())
    return dict(vars(style))


_STYLE_ID_PATTERN = re.compile(r"^[^/\\\x00-\x1f]{1,96}$")


def _resolve_custom_style_id(style_id: str) -> str:
    resolved = style_id.strip()
    if not resolved:
        return f"custom_{uuid.uuid4().hex[:16]}"
    if not _STYLE_ID_PATTERN.fullmatch(resolved) or resolved in {".", ".."}:
        raise InvalidStyleInput(
            "风格 ID 只能包含不带路径分隔符的普通字符，且长度不能超过 96 个字符"
        )
    return resolved


class StyleCatalogUseCases:
    def __init__(self, catalog: StyleCatalog) -> None:
        self._catalog = catalog

    def list_styles(self, scope: StyleScope) -> list[dict[str, Any]]:
        styles = [
            dict(style)
            for style in self._catalog.list_all_styles(
                username=scope.username,
            )
        ]
        for style in styles:
            if style.get("type") == "custom":
                style["preview_url"] = _style_preview_url(
                    str(style.get("id") or ""),
                    style.get("preview_path"),
                )
        return styles

    def get_style(self, style_id: str, scope: StyleScope) -> dict[str, Any]:
        style = self._catalog.get_style(
            style_id,
            username=scope.username,
        )
        if style is None:
            raise StyleRejected(f"Style '{style_id}' not found")

        payload = _style_payload(style)
        if not payload.get("is_preset"):
            payload["preview_url"] = _style_preview_url(
                style_id,
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
        )
        if style is None:
            raise StyleRejected(f"Style '{style_id}' not found")

        preview_path = getattr(style, "preview_path", None)
        if not preview_path:
            raise StyleRejected("自定义风格暂无参考图")
        resolved_path = self._catalog.resolve_style_preview_path(
            scope.username,
            preview_path,
        )
        if resolved_path is None:
            raise StyleRejected("自定义风格参考图不存在")
        return StyleFile(path=resolved_path, media_type="image/*")

    def create_custom_style(
        self,
        command: CreateCustomStyleCommand,
        scope: StyleScope,
    ) -> str:
        style_id = _resolve_custom_style_id(command.style_id)
        try:
            ensure_custom_style_can_be_created(
                style_id,
                is_preset=self._catalog.get_preset(style_id) is not None,
            )
        except PresetStyleOverrideForbidden as exc:
            raise StyleRejected(str(exc)) from exc

        try:
            if self._catalog.get_style(
                style_id,
                username=scope.username,
            ) is not None:
                raise StyleAlreadyExists(f"Style '{style_id}' already exists")
            config_payload = dict(command.config or {})
            config_payload["id"] = style_id
            config_payload["name"] = (
                command.name
                or config_payload.get("label")
                or style_id
            )
            config = self._catalog.build_style_config(config_payload)
            if command.preview_path:
                config.preview_path = self._catalog.validate_style_preview_path(
                    scope.username,
                    style_id,
                    str(command.preview_path),
                )
            else:
                discovered_preview = self._catalog.find_style_preview(scope.username, style_id)
                if discovered_preview:
                    config.preview_path = discovered_preview
            success = self._catalog.save_custom_style(
                style_id,
                config,
                username=scope.username,
            )
            if not success:
                raise StyleRejected("保存自定义风格失败")
            return style_id
        except StyleRejected:
            raise
        except ValueError as exc:
            raise InvalidStyleInput(str(exc)) from exc
        except Exception as exc:
            raise StyleRejected(str(exc)) from exc

    def update_custom_style(
        self,
        command: UpdateCustomStyleCommand,
        scope: StyleScope,
    ) -> str:
        style_id = _resolve_custom_style_id(command.style_id)
        if self._catalog.get_preset(style_id) is not None:
            raise StyleRejected(f"Cannot override preset style '{style_id}'")

        existing = self._catalog.get_style(
            style_id,
            username=scope.username,
        )
        if existing is None:
            raise StyleRejected(f"Style '{style_id}' not found")

        existing_payload = _style_payload(existing)
        config_payload = dict(command.config)
        config_payload.update(
            {
                "id": style_id,
                "name": command.name,
                "created_at": existing_payload.get("created_at"),
                "created_by": existing_payload.get("created_by"),
                "preview_path": existing_payload.get("preview_path"),
            }
        )
        try:
            config = self._catalog.build_style_config(config_payload)
            if not self._catalog.save_custom_style(
                style_id,
                config,
                username=scope.username,
            ):
                raise StyleRejected("保存自定义风格失败")
            return style_id
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
        try:
            extension = validate_style_preview_media_type(filename, content_type)
        except UnsupportedStylePreviewType as exc:
            raise UnsupportedStyleMedia(str(exc)) from exc

        try:
            staged_token = self._catalog.stage_style_preview(
                scope.username,
                content,
                extension,
            )
            preview_path = self._catalog.finalize_style_preview(
                scope.username,
                style_id,
                staged_token,
            )
            self._associate_custom_preview(
                scope=scope,
                style_id=style_id,
                preview_path=preview_path,
            )
            return preview_path
        except ValueError as exc:
            raise InvalidStyleInput(str(exc)) from exc
        except OSError as exc:
            raise StyleStorageFailed("Failed to persist style preview") from exc

    def _associate_custom_preview(
        self,
        *,
        scope: StyleScope,
        style_id: str,
        preview_path: str,
    ) -> None:
        if self._catalog.get_preset(style_id) is not None:
            raise InvalidStyleInput("Cannot replace a preset style preview")
        style = self._catalog.get_style(
            style_id,
            username=scope.username,
        )
        # The create-style form uploads into staging before the style record
        # exists. Creation discovers the published reference immediately
        # afterwards, so there is nothing to update in that case.
        if style is None:
            return
        if not self._catalog.update_custom_style_preview(
            style_id,
            preview_path,
            username=scope.username,
        ):
            raise StyleStorageFailed("Failed to associate style preview")


PREVIEW_SCRATCH_DIR_PREFIX = "style_preview_"


def _discard_preview_scratch_dir(generated_path: Path) -> None:
    """Remove the throwaway directory a preview generator wrote into.

    Deliberately conservative: only a ``style_preview_*`` directory located
    directly inside the system temp root is removed, so a generator that
    returns a path inside the project (or any other real location) is left
    untouched.
    """
    scratch_dir = generated_path.parent
    if not scratch_dir.name.startswith(PREVIEW_SCRATCH_DIR_PREFIX):
        return
    try:
        temp_root = Path(tempfile.gettempdir()).resolve()
        resolved = scratch_dir.resolve()
    except OSError:
        return
    if resolved.parent != temp_root:
        return
    shutil.rmtree(resolved, ignore_errors=True)


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
    ) -> StyleFile:
        style = self._catalog.get_style(
            style_id,
            username=scope.username,
        )
        if style is None:
            raise StyleRejected(f"Style '{style_id}' not found")
        if self._catalog.get_preset(style_id) is not None:
            raise StyleRejected("预设风格为只读，不能保存生成的参考图")
        if scope.project_dir is None:
            raise StyleRejected("Project directory is required")

        try:
            paths = await self._generator.generate(
                prompt=prompt,
                style_id=style_id,
                project_dir=scope.project_dir,
            )
        except Exception as exc:
            raise StyleRejected(f"Preview generation failed: {exc}") from exc
        if not paths:
            raise StyleRejected("No preview image generated")
        generated_path = Path(paths[0])
        if not generated_path.is_file():
            raise StyleRejected("Generated preview image does not exist")

        try:
            return self._persist_generated_preview(
                generated_path,
                style_id=style_id,
                scope=scope,
            )
        finally:
            # Generators hand back a path inside a throwaway scratch directory.
            # Nothing downstream owns it, so it leaks 1–3MB per generation
            # unless this layer removes it on every exit path.
            _discard_preview_scratch_dir(generated_path)

    def _persist_generated_preview(
        self,
        generated_path: Path,
        *,
        style_id: str,
        scope: StyleScope,
    ) -> StyleFile:
        extension = generated_path.suffix.lower() or ".png"
        try:
            staged_token = self._catalog.stage_style_preview(
                scope.username,
                generated_path.read_bytes(),
                extension,
            )
            preview_path = self._catalog.finalize_style_preview(
                scope.username,
                style_id,
                staged_token,
            )
            if not self._catalog.update_custom_style_preview(
                style_id,
                preview_path,
                username=scope.username,
            ):
                raise StyleRejected("保存风格参考图失败")
            persisted_path = self._catalog.resolve_style_preview_path(
                scope.username,
                preview_path,
            )
        except (OSError, ValueError) as exc:
            raise StyleRejected(f"保存风格参考图失败: {exc}") from exc
        if persisted_path is None:
            raise StyleRejected("保存后的风格参考图不存在")
        media_type = guess_type(persisted_path.name)[0] or "image/png"
        return StyleFile(
            path=persisted_path,
            media_type=media_type,
            filename=f"preview_{style_id}{persisted_path.suffix}",
        )


class StylePreviewTaskUseCases:
    def __init__(self, catalog: StyleCatalog, scheduler: StyleTaskScheduler) -> None:
        self._catalog = catalog
        self._scheduler = scheduler

    async def schedule_preview(
        self,
        *,
        task_context: ProjectContext | None,
        scope: StyleScope,
        style_id: str,
        prompt: str,
    ) -> ScheduledAssetTask:
        style = self._catalog.get_style(
            style_id,
            username=scope.username,
        )
        if style is None:
            raise StyleRejected(f"Style '{style_id}' not found")
        if self._catalog.get_preset(style_id) is not None:
            raise StyleRejected("预设风格为只读，不能保存生成的参考图")
        if task_context is None:
            raise StyleRejected("风格参考图生成需要 project context")
        resolved_prompt = str(prompt or "").strip()
        if not resolved_prompt:
            raise StyleRejected("Style preview prompt is required")
        task_scope = task_config_scope("style_preview", {"style_id": style_id})
        task = StylePreviewGenerationTask(
            style_id=style_id,
            prompt=resolved_prompt,
            scope=task_scope,
        )
        receipt = await self._scheduler.enqueue_style_preview(task_context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            scope=task_scope,
            message=f"风格「{getattr(style, 'label', None) or getattr(style, 'name', None) or style_id}」参考图生成任务已进入队列",
        )

    async def schedule_analysis(
        self,
        *,
        task_context: ProjectContext | None,
        source_path: str | Path,
        mime_type: str,
        filename: str,
        style_id: str,
        scope: str,
    ) -> ScheduledAssetTask:
        if task_context is None:
            raise StyleRejected("风格分析需要 project context")
        task = StyleAnalysisTask(
            source_path=source_path,
            mime_type=mime_type,
            filename=filename,
            style_id=style_id,
            scope=scope,
        )
        receipt = await self._scheduler.enqueue_style_analysis(task_context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            scope=scope,
            message="视觉风格分析任务已进入队列",
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
                    scope.username,
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
