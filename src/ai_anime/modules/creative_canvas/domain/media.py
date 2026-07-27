"""Creative Canvas media validation rules."""

from __future__ import annotations

import base64
import binascii

PNG_DATA_URL_PREFIX = "data:image/png;base64,"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_PNG_SCREENSHOT_BYTES = 20 * 1024 * 1024
DEFAULT_SCREENSHOT_LABEL = "3D viewer screenshot"


class InvalidCreativeCanvasPngScreenshot(ValueError):
    pass


class CreativeCanvasScreenshotTooLarge(ValueError):
    pass


def decode_png_screenshot(data_url: str | None) -> bytes:
    normalized = str(data_url or "").strip()
    if not normalized.startswith(PNG_DATA_URL_PREFIX):
        raise InvalidCreativeCanvasPngScreenshot("expected PNG data URL")
    try:
        payload = base64.b64decode(
            normalized[len(PNG_DATA_URL_PREFIX) :],
            validate=True,
        )
    except (binascii.Error, ValueError) as exc:
        raise InvalidCreativeCanvasPngScreenshot("invalid PNG data URL") from exc
    if not payload.startswith(PNG_SIGNATURE):
        raise InvalidCreativeCanvasPngScreenshot("screenshot payload is not PNG")
    if len(payload) > MAX_PNG_SCREENSHOT_BYTES:
        raise CreativeCanvasScreenshotTooLarge("screenshot is too large")
    return payload


def normalize_screenshot_label(label: str | None) -> str:
    return str(label or DEFAULT_SCREENSHOT_LABEL).strip() or DEFAULT_SCREENSHOT_LABEL
