"""Runtime settings for image, audio, and video production."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping, Sequence

from ai_anime.shared.infrastructure.video_encoding import VIDEO_CODEC
from ai_anime.shared.runtime_dotenv import load_project_dotenv
from ai_anime.shared.runtime_paths import OUTPUT_DIR

load_project_dotenv()

INDEXTTS2_TIMEOUT_SECONDS = float(
    os.environ.get("INDEXTTS2_TIMEOUT_SECONDS", "1800")
)
INDEXTTS2_RECORD_PROVIDER = "commercial"

IMAGE_DEFAULT_WIDTH = int(os.environ.get("IMAGE_DEFAULT_WIDTH", "1440"))
IMAGE_DEFAULT_HEIGHT = int(os.environ.get("IMAGE_DEFAULT_HEIGHT", "2560"))
IMAGE_DEFAULT_STYLE = os.environ.get(
    "IMAGE_DEFAULT_STYLE", "chinese_period_drama"
)

STYLE_REFERENCE_IMAGE_KEY = "style_reference_image_path"
# Legacy metadata key retained for compatibility. Runtime style presets never set it.
STYLE_TEXT_CONTRACT = """GLOBAL STYLE CONTRACT (TEXT-ONLY RENDERING GRAMMAR):
- Apply one invariant production technique to every named character regardless of gender or age: the same line-weight system, color-separation logic, lighting and shading method, material treatment, edge finish, and overall grade.
- "Eye rendering" and "hair rendering" mean technique only. They must never supply or alter eye geometry or color, hairstyle, hairline, bangs, hair length or color, or character-specific highlights.
- The project style never defines subject identity. It must not supply or copy a face, facial proportions, body silhouette, skin tone, hairstyle, clothing, accessories, pose, prop, environment, composition, or camera placement.
- Explicit task text, character and identity descriptions, costume and scene data, beat composition, and subject reference images outrank the project style.
- Keep different named characters visibly distinct. Do not homogenize one character toward another or invent the same hairstyle, facial structure, eyes, costume, or accessories for multiple characters merely to make their rendering style consistent."""

ImageReference = tuple[str, bytes, str]
ImageReferenceInput = bytes | tuple[bytes, str] | ImageReference


def get_style_preset(
    style: str | None = None,
    *,
    username: str | None = None,
    project_dir: str | None = None,
) -> dict:
    """Return a visual style using the Asset World catalog."""
    from ai_anime.modules.asset_world.public import StyleService

    style_id = style or IMAGE_DEFAULT_STYLE
    config = StyleService.get_style(
        style_id,
        username=username,
        project_dir=project_dir,
    )
    if not config:
        raise KeyError(f"Style '{style_id}' not found")
    return config.to_legacy_dict()


def apply_style_reference(
    prompt: str,
    reference_images: Sequence[ImageReferenceInput] | None,
    style_preset: Mapping[str, object],
    *,
    max_images: int = 10,
) -> tuple[str, list[ImageReferenceInput]]:
    """Apply project style as text while leaving subject references untouched.

    The legacy function name is retained for call-site compatibility. Style preview
    files are UI/analyzer inputs only and are never loaded or submitted here.
    """
    del max_images
    references = list(reference_images or [])
    style_instructions = str(style_preset.get("style_instructions") or "").strip()
    avoid_instructions = str(style_preset.get("avoid_instructions") or "").strip()
    style_tag = str(style_preset.get("style_tag") or "").strip()
    if not any((style_instructions, avoid_instructions, style_tag)):
        return prompt, references

    additions: list[str] = []
    if style_instructions and style_instructions not in prompt:
        additions.append(f"PROJECT VISUAL STYLE:\n{style_instructions}")
    if style_tag and style_tag not in prompt:
        additions.append(f"PROJECT STYLE TAG:\n{style_tag}")
    if avoid_instructions and avoid_instructions not in prompt:
        additions.append(f"PROJECT STYLE AVOID:\n{avoid_instructions}")
    if STYLE_TEXT_CONTRACT not in prompt:
        additions.append(STYLE_TEXT_CONTRACT)

    resolved_prompt = "\n\n".join(
        section for section in (prompt.rstrip(), *additions) if section
    )
    return resolved_prompt, references


def get_project_style_preset(
    project_dir: str | Path,
    style: str | None = None,
) -> tuple[str, dict]:
    """Resolve one project's selected global style from its output directory."""
    resolved_project_dir = Path(project_dir).resolve()
    style_id = str(style or "").strip()
    username: str | None = None
    if not style_id:
        try:
            relative = resolved_project_dir.relative_to(Path(OUTPUT_DIR).resolve())
        except ValueError:
            relative = Path()
        if len(relative.parts) >= 2:
            username, project = relative.parts[:2]
            from ai_anime.modules.project_workspace.public import load_project_config

            config = load_project_config(username, project)
            style_id = str(config.get("visual_style") or "").strip()
    style_id = style_id or IMAGE_DEFAULT_STYLE
    return style_id, get_style_preset(
        style_id,
        username=username,
        project_dir=str(resolved_project_dir),
    )


def get_style_labels() -> dict[str, str]:
    from ai_anime.modules.asset_world.public import StyleService

    return StyleService.get_style_labels()


def list_available_styles() -> list[dict]:
    from ai_anime.modules.asset_world.public import StyleService

    return StyleService.list_all_styles()


TTS_MODEL = os.environ.get("TTS_MODEL", "").strip()
TTS_VOICE = os.environ.get("TTS_VOICE", "").strip()
TTS_SPEECH_RATE = float(os.environ.get("TTS_SPEECH_RATE", "1.0"))
TTS_RESPONSE_FORMAT = os.environ.get("TTS_RESPONSE_FORMAT", "mp3").strip()
TTS_TIMEOUT_SECONDS = float(os.environ.get("TTS_TIMEOUT_SECONDS", "600"))


def get_tts_config() -> dict:
    return {
        "model": TTS_MODEL,
        "voice": TTS_VOICE,
        "speech_rate": TTS_SPEECH_RATE,
        "response_format": TTS_RESPONSE_FORMAT,
        "timeout_seconds": TTS_TIMEOUT_SECONDS,
    }


FFMPEG_PATH = os.environ.get("FFMPEG_PATH", "ffmpeg")
VIDEO_FPS = int(os.environ.get("VIDEO_FPS", "30"))
VIDEO_WIDTH = int(os.environ.get("VIDEO_WIDTH", "1080"))
VIDEO_HEIGHT = int(os.environ.get("VIDEO_HEIGHT", "1920"))
VIDEO_AUDIO_CODEC = os.environ.get("VIDEO_AUDIO_CODEC", "aac")
VIDEO_BITRATE = os.environ.get("VIDEO_BITRATE", "4M")
KEN_BURNS_ZOOM_RANGE = (1.0, 1.15)
KEN_BURNS_PAN_SPEED = 0.02
DEFAULT_VIDEO_RESOLUTION = os.environ.get(
    "DEFAULT_VIDEO_RESOLUTION", "720p"
).strip()


def get_video_config() -> dict:
    return {
        "ffmpeg_path": FFMPEG_PATH,
        "fps": VIDEO_FPS,
        "width": VIDEO_WIDTH,
        "height": VIDEO_HEIGHT,
        "codec": VIDEO_CODEC,
        "audio_codec": VIDEO_AUDIO_CODEC,
        "bitrate": VIDEO_BITRATE,
        "ken_burns_zoom_range": KEN_BURNS_ZOOM_RANGE,
        "ken_burns_pan_speed": KEN_BURNS_PAN_SPEED,
    }


OPENAI_IMAGE_QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "medium")
OPENAI_SKETCH_IMAGE_QUALITY = os.environ.get(
    "OPENAI_SKETCH_IMAGE_QUALITY", "low"
)
GRID_MODE = os.environ.get("GRID_MODE", "1x1")
MODE_CONFIG = {
    "1x1": (1, 1, 1),
    "1x2": (1, 2, 2),
    "1x3": (1, 3, 3),
    "1x4": (1, 4, 4),
    "3x2": (3, 2, 6),
    "4x3": (4, 3, 12),
    "5x4": (5, 4, 20),
    "2x2": (2, 2, 4),
    "3x3": (3, 3, 9),
    "4x4": (4, 4, 16),
    "5x5": (5, 5, 25),
}
GRID_ROWS, GRID_COLS, GRID_BATCH_SIZE = MODE_CONFIG.get(
    GRID_MODE, (1, 1, 1)
)
GRID_TOTAL_PANELS = 25


def _image_provider_config(*, model_override: str | None = None) -> dict:
    from ai_anime.modules.model_usage.public import (
        get_effective_newapi_gateway_config,
    )

    model = str(model_override or "").strip()
    if not model:
        raise ValueError("image model is required")
    gateway = get_effective_newapi_gateway_config()
    return {
        "provider": "commercial",
        "access_mode": gateway.mode,
        "model": model,
    }


def get_grid_generation_config(
    model_override: str | None = None,
    image_size_override: str | None = None,
    model_selector_override: str | None = None,
    model_params_override: Mapping[str, object] | None = None,
) -> dict:
    provider_config = _image_provider_config(model_override=model_override)
    return {
        "provider": provider_config["provider"],
        "access_mode": provider_config["access_mode"],
        "model": provider_config["model"],
        "model_selector": str(model_selector_override or "").strip(),
        "model_params": dict(model_params_override or {}),
        "openai_image_quality": OPENAI_IMAGE_QUALITY,
        "openai_sketch_image_quality": OPENAI_SKETCH_IMAGE_QUALITY,
        "image_size": image_size_override or "1K",
        "mode": GRID_MODE,
        "rows": GRID_ROWS,
        "cols": GRID_COLS,
        "batch_size": GRID_BATCH_SIZE,
        "total_panels": GRID_TOTAL_PANELS,
    }


def get_sketch_generation_config(
    model_override: str | None = None,
    model_selector_override: str | None = None,
) -> dict:
    config = get_grid_generation_config(
        model_override=model_override,
        model_selector_override=model_selector_override,
    )
    config["openai_image_quality"] = OPENAI_SKETCH_IMAGE_QUALITY
    config["image_size"] = "1K"
    return config


def get_render_generation_config(
    model_override: str | None = None,
    model_selector_override: str | None = None,
) -> dict:
    return get_grid_generation_config(
        model_override=model_override,
        model_selector_override=model_selector_override,
    )
