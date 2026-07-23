"""Business rules for project visual styles."""

from __future__ import annotations

from pathlib import Path


STYLE_PREVIEW_MEDIA_TYPES = {
    ".png": frozenset({"image/png"}),
    ".jpg": frozenset({"image/jpeg"}),
    ".jpeg": frozenset({"image/jpeg"}),
    ".webp": frozenset({"image/webp"}),
    ".gif": frozenset({"image/gif"}),
}


class PresetStyleOverrideForbidden(ValueError):
    def __init__(self, style_id: str) -> None:
        super().__init__(f"Cannot override preset style '{style_id}'")


class PresetStyleDeletionForbidden(ValueError):
    def __init__(self) -> None:
        super().__init__("Cannot delete preset styles")


class UnsupportedStylePreviewType(ValueError):
    def __init__(self) -> None:
        super().__init__("Unsupported style preview image type")


def ensure_custom_style_can_be_created(style_id: str, *, is_preset: bool) -> None:
    if is_preset:
        raise PresetStyleOverrideForbidden(style_id)


def ensure_custom_style_can_be_deleted(*, is_preset: bool) -> None:
    if is_preset:
        raise PresetStyleDeletionForbidden


def style_preview_extension(filename: str | None) -> str:
    return Path(filename or "").suffix.lower() or ".png"


def validate_style_preview_media_type(
    filename: str | None,
    content_type: str | None,
) -> str:
    extension = style_preview_extension(filename)
    allowed_types = STYLE_PREVIEW_MEDIA_TYPES.get(extension)
    if allowed_types is None or (content_type or "").lower() not in allowed_types:
        raise UnsupportedStylePreviewType
    return extension
