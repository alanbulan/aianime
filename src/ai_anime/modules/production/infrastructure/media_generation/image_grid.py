"""商业图片模型网格生成模块。

Sketch 模式按 beat 顺序分块生成网格，并通过当前 cloud/BYOK 访问配置
调用标准图片协议。

生成流程:
1. 从 beats 数据构建网格 Prompt
2. 调用当前商业图片模型生成网格图
3. 使用 grid_splitter 分割成独立分镜
4. 使用当前图片模型做高清修复
"""

import asyncio
import base64
import hashlib
import io as io
import json
import logging
import math
import mimetypes
import os
import re as re
import time as time
import uuid
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable, Dict, List, Optional, Tuple


from ai_anime.modules.production.infrastructure.media_generation_settings import (
    IMAGE_DEFAULT_STYLE as IMAGE_DEFAULT_STYLE,
    STYLE_REFERENCE_IMAGE_KEY as STYLE_REFERENCE_IMAGE_KEY,
    ImageReferenceInput as ImageReferenceInput,
    apply_style_reference,
    get_project_style_preset,
    get_style_preset as get_style_preset,
)
from ai_anime.modules.model_usage.public import (
    is_model_quota_error,
    model_protocol_error_message,
    runtime_model_capability,
)
from ai_anime.modules.production.infrastructure.media_generation.prompt_builder import (
    PromptComponents as PromptComponents,
    PromptContext as PromptContext,
    PromptMode as PromptMode,
    UnifiedPromptBuilder as UnifiedPromptBuilder,
    create_prompt_context as create_prompt_context,
)
from ai_anime.modules.production.infrastructure.media_generation.render_identity_guard import (
    render_ai_detection_error as render_ai_detection_error,
)
from ai_anime.modules.narrative_planning.public import beat_scene_id
from ai_anime.modules.asset_world.public import StyleService as StyleService
from ai_anime.modules.production.domain.detected_refs import (
    extract_char_identities_from_markers as extract_char_identities_from_markers,
)
from ai_anime.modules.production.domain.sketch_color import (
    global_prop_marker_colors as global_prop_marker_colors,
)
from ai_anime.shared.utils.asset_resolver import AssetResolver
from ai_anime.modules.model_usage.public import (
    infer_episode_from_path as infer_episode_from_path,
    infer_project_output_dir as infer_project_output_dir,
    record_image_request as record_image_request,
    update_image_request_status as update_image_request_status,
)
from ai_anime.modules.production.infrastructure.media_generation.grid_planning import (
    SINGLE_CELL_RENDER_MODE_KEY as SINGLE_CELL_RENDER_MODE_KEY,
    SINGLE_CELL_RENDER_MODE_BY_ASPECT as SINGLE_CELL_RENDER_MODE_BY_ASPECT,
    _beat_display_sort_key as _beat_display_sort_key,
    DEFAULT_SKETCH_ASPECT_RATIO as DEFAULT_SKETCH_ASPECT_RATIO,
    REGEN_MODE_CONFIGS as REGEN_MODE_CONFIGS,
    get_sketch_default_mode_key as get_sketch_default_mode_key,
    get_sketch_nxn_modes as get_sketch_nxn_modes,
    SKETCH_DEFAULT_MODE_KEY as SKETCH_DEFAULT_MODE_KEY,
    PLANNER_VERSION as PLANNER_VERSION,
    PlanEntry as PlanEntry,
    hash_plan as hash_plan,
    compute_input_fingerprint as compute_input_fingerprint,
    cell_aspect_ratio as cell_aspect_ratio,
    sketch_pass1_mode_key as sketch_pass1_mode_key,
    _sketch_cfg as _sketch_cfg,
    SKETCH_GRID_CONFIG as SKETCH_GRID_CONFIG,
    SKETCH_GRID_PLAN as SKETCH_GRID_PLAN,
    SKETCH_REGEN_MODE_KEYS as SKETCH_REGEN_MODE_KEYS,
    LOCATION_POOL_TEMPLATE as LOCATION_POOL_TEMPLATE,
    LANDSCAPE_RENDER_POOL_TEMPLATE as LANDSCAPE_RENDER_POOL_TEMPLATE,
    DEFAULT_POOL_TEMPLATE as DEFAULT_POOL_TEMPLATE,
    CHARACTER_POOL_2 as CHARACTER_POOL_2,
    CHARACTER_POOL_3 as CHARACTER_POOL_3,
    MANY_CHARS_REF_THRESHOLD as MANY_CHARS_REF_THRESHOLD,
    MANY_CHARS_MAX_CAPACITY as MANY_CHARS_MAX_CAPACITY,
    _cap_pool_for_many_chars as _cap_pool_for_many_chars,
    _count_batch_composite_chars as _count_batch_composite_chars,
    _smart_repack_beats as _smart_repack_beats,
    pad_to_aspect_ratio as pad_to_aspect_ratio,
    pack_beats as pack_beats,
    LOCATION_ASPECT_CONFIGS as LOCATION_ASPECT_CONFIGS,
    parse_regen_mode as parse_regen_mode,
    get_default_mode_for_grid as get_default_mode_for_grid,
    get_regen_modes_for_grid as get_regen_modes_for_grid,
    grid_mode_to_mode_key as grid_mode_to_mode_key,
    _single_cell_render_mode_key as _single_cell_render_mode_key,
    _render_pool_template_for_aspect as _render_pool_template_for_aspect,
    SHOT_GRID_CONFIGS as SHOT_GRID_CONFIGS,
    get_shot_grid_config as get_shot_grid_config,
    GridGenerationRequest as GridGenerationRequest,
    GridGenerationResult as GridGenerationResult,
    filter_character_map_for_beats as filter_character_map_for_beats,
    _has_director_image_ref as _has_director_image_ref,
    build_color_map_from_character_map as build_color_map_from_character_map,
    detect_panel_characters as detect_panel_characters,
    filter_character_map_by_sketch as filter_character_map_by_sketch,
    load_precomputed_panel_detected as load_precomputed_panel_detected,
    filter_character_map_by_precomputed as filter_character_map_by_precomputed,
    resolve_render_reference_order as resolve_render_reference_order,
    crop_sketch_panels as crop_sketch_panels,
    get_optimal_grid_size as get_optimal_grid_size,
    perfect_grid_split as perfect_grid_split,
    scene_grid_split as scene_grid_split,
    _merge_small_grids as _merge_small_grids,
    _pack_location_beats as _pack_location_beats,
    build_regen_plan as build_regen_plan,
    _get_beat_visual_composite_chars as _get_beat_visual_composite_chars,
    _flush_to_grids as _flush_to_grids,
    character_grid_split as character_grid_split,
    sketch_grid_split as sketch_grid_split,
    _coalesce_locations as _coalesce_locations,
    SKETCH_NXN_MODES as SKETCH_NXN_MODES,
)
from ai_anime.modules.production.infrastructure.media_generation.image_grid_generator import (
    ImageGridGenerator as ImageGridGenerator,
    _generation_beat_number as _generation_beat_number,
)

_STANDARD_IMAGE_VALID_QUALITIES = {"low", "medium", "high", "auto"}
_STANDARD_IMAGE_MIN_PIXELS = 655_360
_STANDARD_IMAGE_MAX_PIXELS = 8_294_400
_STANDARD_IMAGE_MAX_EDGE = 3840
_STANDARD_IMAGE_MAX_RATIO = 3.0
_STANDARD_IMAGE_MAX_FILE_BYTES = 10 * 1024 * 1024
_STANDARD_IMAGE_MAX_TOTAL_FILE_BYTES = 32 * 1024 * 1024
_STANDARD_IMAGE_MAX_FILES = 10
_STANDARD_IMAGE_EXTENSION_BY_MIME = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
logger = logging.getLogger(__name__)


def _provider_request_id_from_headers(headers: Any) -> str:
    if not headers:
        return ""
    return headers.get("x-request-id") or ""


IMAGE_GATEWAY_CONNECT_TIMEOUT_SECONDS = 15.0
IMAGE_GATEWAY_READ_TIMEOUT_SECONDS = 1200.0
IMAGE_GATEWAY_WRITE_TIMEOUT_SECONDS = 60.0
IMAGE_GATEWAY_POOL_TIMEOUT_SECONDS = 15.0
IMAGE_GATEWAY_TOTAL_TIMEOUT_SECONDS = 30 * 60.0


def _safe_header_summary(headers: Any) -> dict[str, str]:
    if not headers:
        return {}
    safe_keys = (
        "x-request-id",
        "x-ai-anime-route-source",
        "x-ai-anime-route-model",
        "x-ai-anime-route-role",
        "x-ai-anime-route-attempts",
        "cf-ray",
        "date",
    )
    summary: dict[str, str] = {}
    for key in safe_keys:
        value = str(headers.get(key) or "").strip()
        if value:
            summary[key] = value
    return summary


def _safe_request_context(
    *,
    endpoint: str,
    request_path: str,
    model: str,
    payload: dict[str, object],
    prompt: str,
    reference_image_count: int,
) -> dict[str, object]:
    return {
        "endpoint": f"{endpoint}/{request_path}",
        "model": model,
        "payload_keys": sorted(payload.keys()),
        "extra_fields": payload.get("extra_fields") or {},
        "reference_image_count": reference_image_count,
        "prompt_chars": len(prompt or ""),
        "prompt_sha256": hashlib.sha256((prompt or "").encode("utf-8")).hexdigest()[:16],
    }


def _context_for_error(context: dict[str, object]) -> str:
    return (
        f"model={context.get('model')}; "
        f"endpoint={context.get('endpoint')}; "
        f"payload_keys={context.get('payload_keys')}; "
        f"extra_fields={context.get('extra_fields')}; "
        f"reference_image_count={context.get('reference_image_count')}; "
        f"prompt_sha256={context.get('prompt_sha256')}"
    )


def _image_multipart_files(
    reference_images: list[bytes | tuple[bytes, str] | tuple[str, bytes, str]],
) -> list[tuple[str, tuple[str, bytes, str]]]:
    if len(reference_images) > _STANDARD_IMAGE_MAX_FILES:
        raise ValueError(
            f"image edits accepts at most {_STANDARD_IMAGE_MAX_FILES} reference images"
        )

    files: list[tuple[str, tuple[str, bytes, str]]] = []
    total_bytes = 0
    for index, image_ref in enumerate(reference_images, start=1):
        filename = f"reference-{index}.png"
        mime_type = "image/png"
        if isinstance(image_ref, tuple):
            if len(image_ref) == 3:
                filename = Path(str(image_ref[0] or filename)).name or filename
                content = bytes(image_ref[1])
                mime_type = str(image_ref[2] or "").strip().lower()
            elif len(image_ref) == 2:
                content = bytes(image_ref[0])
                hint = str(image_ref[1] or "").strip()
                if hint.lower().startswith("image/"):
                    mime_type = hint.lower()
                    extension = _STANDARD_IMAGE_EXTENSION_BY_MIME.get(
                        mime_type,
                        mimetypes.guess_extension(mime_type) or ".bin",
                    )
                    filename = f"reference-{index}{extension}"
                else:
                    filename = Path(hint).name or filename
                    mime_type = (
                        mimetypes.guess_type(filename)[0] or "application/octet-stream"
                    ).lower()
            else:
                raise ValueError(f"reference image {index} has an invalid tuple shape")
        else:
            content = bytes(image_ref)

        if not content:
            raise ValueError(f"reference image {index} is empty")
        if len(content) > _STANDARD_IMAGE_MAX_FILE_BYTES:
            raise ValueError(f"reference image {index} exceeds 10 MiB")
        total_bytes += len(content)
        if total_bytes > _STANDARD_IMAGE_MAX_TOTAL_FILE_BYTES:
            raise ValueError("reference images exceed the 32 MiB total limit")
        if not mime_type.startswith("image/"):
            raise ValueError(f"reference image {index} must use an image content type")
        files.append(("image", (filename, content, mime_type)))
    return files




class _InlineImagePart:
    """Provider-neutral image part used by the commercial image adapter."""

    def __init__(self, data: bytes, mime_type: str = "image/png"):
        self.inline_data = SimpleNamespace(data=data, mime_type=mime_type)


def _infer_project_dir(*paths: str | None) -> Optional[Path]:
    for path_str in paths:
        if not path_str:
            continue
        path = Path(path_str)
        parts = list(path.parts)
        if "grids" in parts:
            grids_idx = parts.index("grids")
            if grids_idx > 0:
                return Path(*parts[:grids_idx])
    return None


def _resolve_scene_prop_asset_refs(
    project_dir: Optional[Path],
    beats: List[dict],
    *,
    episode_number: int | None = None,
    sketch: bool = False,
    use_director_refs: bool = False,
    include_pano_view_refs: bool = False,
    director_ref_beat_numbers: list[int] | None = None,
    director_control_frames_dir: str | Path | None = None,
    scene_menu: list[dict] | list | None = None,
    prop_menu: list[dict] | list | None = None,
    allow_beat_background_anchor: bool | None = None,
) -> tuple[dict[int, list], dict[int, list]]:
    if not project_dir:
        return {}, {}
    resolver = AssetResolver(
        project_dir,
        episode_number=episode_number,
        scene_menu=scene_menu,
        prop_menu=prop_menu,
        scene_reference_kind="sketch" if sketch else "render",
        use_director_refs=use_director_refs,
        include_pano_view_refs=include_pano_view_refs,
        director_ref_beat_numbers=director_ref_beat_numbers,
        director_control_frames_dir=director_control_frames_dir,
        allow_beat_background_anchor=allow_beat_background_anchor,
    )
    return resolver.resolve_all_for_beats(beats)


def normalize_image_size(size: str) -> str:
    """Normalize internal image-size labels for the standard image protocol."""
    return "1K" if str(size or "").strip() == "0.5K" else str(size or "").strip()


def _resolution_from_image_size(image_size: str | None) -> str:
    normalized = normalize_image_size(str(image_size or "").strip())
    lower = normalized.lower()
    return lower if lower in {"1k", "2k", "4k"} else ""


def _round_standard_edge(value: float) -> int:
    return max(16, int(math.ceil(value / 16.0)) * 16)


def resolve_standard_image_size(aspect_ratio: str = "1:1", image_size: str = "1K") -> str:
    """Map internal aspect/image-size labels to standard flexible size strings.

    Flexible-size image APIs require bounded dimensions: both edges are multiples
    of 16, max edge <= 3840, ratio <= 3:1,
    and total pixels within the valid range. "1K" here means the smallest valid
    draft size near a 1024px long edge.
    """

    ratio_text = str(aspect_ratio or "1:1").replace("-", ":")
    try:
        raw_w, raw_h = [float(part) for part in ratio_text.split(":", 1)]
        if raw_w <= 0 or raw_h <= 0:
            raise ValueError
    except Exception:
        raw_w, raw_h = 1.0, 1.0

    ratio = raw_w / raw_h
    if ratio > _STANDARD_IMAGE_MAX_RATIO:
        ratio = _STANDARD_IMAGE_MAX_RATIO
    elif ratio < 1.0 / _STANDARD_IMAGE_MAX_RATIO:
        ratio = 1.0 / _STANDARD_IMAGE_MAX_RATIO

    normalized_size = normalize_image_size(str(image_size or "1K"))
    long_edge = {
        "512": 1024,
        "0.5K": 1024,
        "1K": 1024,
        "2K": 2048,
        "4K": 3840,
    }.get(normalized_size, 1024)

    if ratio >= 1:
        width = float(long_edge)
        height = width / ratio
    else:
        height = float(long_edge)
        width = height * ratio

    pixel_count = width * height
    if pixel_count < _STANDARD_IMAGE_MIN_PIXELS:
        scale = math.sqrt(_STANDARD_IMAGE_MIN_PIXELS / pixel_count)
        width *= scale
        height *= scale
    elif pixel_count > _STANDARD_IMAGE_MAX_PIXELS:
        scale = math.sqrt(_STANDARD_IMAGE_MAX_PIXELS / pixel_count)
        width *= scale
        height *= scale

    width_i = min(_STANDARD_IMAGE_MAX_EDGE, _round_standard_edge(width))
    height_i = min(_STANDARD_IMAGE_MAX_EDGE, _round_standard_edge(height))

    if width_i * height_i < _STANDARD_IMAGE_MIN_PIXELS:
        scale = math.sqrt(_STANDARD_IMAGE_MIN_PIXELS / max(1, width_i * height_i))
        width_i = min(_STANDARD_IMAGE_MAX_EDGE, _round_standard_edge(width_i * scale))
        height_i = min(_STANDARD_IMAGE_MAX_EDGE, _round_standard_edge(height_i * scale))

    return f"{width_i}x{height_i}"


def _image_aspect_value(value: str | None) -> float | None:
    normalized = str(value or "").strip().replace("-", ":")
    try:
        raw_width, raw_height = normalized.split(":", 1)
        width = float(raw_width)
        height = float(raw_height)
    except (TypeError, ValueError):
        return None
    if (
        not math.isfinite(width)
        or not math.isfinite(height)
        or width <= 0
        or height <= 0
    ):
        return None
    return width / height


def resolve_catalog_image_size(
    aspect_ratio: str,
    size_options: tuple[str, ...],
    ratio_options: tuple[str, ...] = (),
) -> str:
    """Resolve a semantic aspect ratio to a catalog-declared exact size."""
    target_ratio = _image_aspect_value(aspect_ratio) or 1.0
    if len(ratio_options) == len(size_options):
        for index, option in enumerate(ratio_options):
            option_ratio = _image_aspect_value(option)
            if option_ratio is not None and math.isclose(
                option_ratio,
                target_ratio,
                rel_tol=1e-6,
            ):
                return size_options[index]

    def distance(option: str) -> float:
        width_text, height_text = option.split("x", 1)
        option_ratio = int(width_text) / int(height_text)
        return abs(math.log(option_ratio / target_ratio))

    return min(size_options, key=distance)


def normalize_image_quality(value: str | None, default: str = "medium") -> str:
    quality = str(value or default or "medium").strip().lower()
    return quality if quality in _STANDARD_IMAGE_VALID_QUALITIES else default




async def generate_text_to_image(
    prompt: str,
    output_path: str,
    *,
    aspect_ratio: str = "1:1",
    image_size: str = "2K",
    quality: str | None = None,
    config: Optional[dict] = None,
    project_dir: str | Path | None = None,
    style: str | None = None,
) -> Path:
    """Generate one image through the current commercial model access."""
    return await _generate_image(
        prompt=prompt,
        reference_image_paths=[],
        output_path=output_path,
        aspect_ratio=aspect_ratio,
        image_size=image_size,
        quality=quality,
        config=config,
        project_dir=project_dir,
        style=style,
    )


async def generate_reference_edit_image(
    prompt: str,
    reference_images: list[str],
    output_path: str,
    *,
    aspect_ratio: str = "2:3",
    image_size: str = "2K",
    quality: str | None = None,
    config: Optional[dict] = None,
    project_dir: str | Path | None = None,
    style: str | None = None,
) -> Path:
    """Edit one image through the current commercial model access."""
    ref_paths = [path for path in reference_images if path and os.path.exists(path)]
    if not ref_paths:
        raise FileNotFoundError("No valid reference images provided for edit generation")
    return await _generate_image(
        prompt=prompt,
        reference_image_paths=ref_paths,
        output_path=output_path,
        aspect_ratio=aspect_ratio,
        image_size=image_size,
        quality=quality,
        config=config,
        project_dir=project_dir,
        style=style,
    )


async def _generate_image(
    *,
    prompt: str,
    reference_image_paths: list[str],
    output_path: str,
    aspect_ratio: str,
    image_size: str,
    quality: str | None,
    config: Optional[dict],
    project_dir: str | Path | None,
    style: str | None,
) -> Path:
    """Shared body for text-only and image-edit single-image generation."""
    generator = ImageGridGenerator(config=config)
    ref_paths = list(reference_image_paths or [])
    ref_bytes: list[bytes | tuple[str, bytes, str]] = [
        Path(path).read_bytes() for path in ref_paths
    ]
    effective_prompt = prompt
    negative_prompt = ""
    if project_dir is not None:
        _style_id, style_preset = get_project_style_preset(project_dir, style)
        style_instructions = str(style_preset.get("style_instructions") or "").strip()
        avoid_instructions = str(style_preset.get("avoid_instructions") or "").strip()
        negative_prompt = avoid_instructions
        style_sections = []
        if style_instructions and style_instructions not in effective_prompt:
            style_sections.append(f"PROJECT VISUAL STYLE:\n{style_instructions}")
        if avoid_instructions and avoid_instructions not in effective_prompt:
            style_sections.append(f"AVOID:\n{avoid_instructions}")
        if style_sections:
            effective_prompt = f"{effective_prompt.rstrip()}\n\n" + "\n\n".join(style_sections)
        effective_prompt, ref_bytes = apply_style_reference(
            effective_prompt,
            ref_bytes,
            style_preset,
        )
    image_bytes, _, error_detail = await _call_image_generation_api(
        prompt=effective_prompt,
        reference_images=ref_bytes or None,
        image_config={
            "model": generator.model,
            "model_selector": generator.model_selector,
            "model_params": generator.model_params,
            "aspect_ratio": aspect_ratio,
            "image_size": image_size,
            "quality": quality or generator.image_quality,
            "negative_prompt": negative_prompt,
        },
    )
    if not image_bytes:
        raise ValueError(
            f"Commercial image generation failed: {error_detail or 'empty image'}"
        )

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(image_bytes)
    return output


def _pick_nxn_mode(n: int, aspect_ratio: str = DEFAULT_SKETCH_ASPECT_RATIO):
    """选最小能装下 n beats 的 NxN 模式。"""
    modes = get_sketch_nxn_modes(aspect_ratio)
    for cap, mk, r, c in modes:
        if n <= cap:
            return mk, r, c, cap
    # fallback 到最大模式
    cap, mk, r, c = modes[-1]
    return mk, r, c, cap


def _group_beats_by_location(beats: List[dict]):
    """按 scene_id 字段分组 beats，保持出现顺序。返回 (scene_id, beats_list) 的列表。"""
    from collections import OrderedDict

    groups: OrderedDict = OrderedDict()
    for b in beats:
        loc = beat_scene_id(b) or "未知"
        groups.setdefault(loc, []).append(b)
    return list(groups.items())


def _is_space_map_beat(beat: dict) -> bool:
    visual = str((beat or {}).get("visual_description") or "").strip().lower()
    return (
        visual.startswith("[space_map")
        or visual.startswith("[space_anchor_map]")
        or visual.startswith("[absolute_layout_map]")
    )


def sketch_scene_grid_split(
    all_beats: List[dict],
    aspect_ratio: str = DEFAULT_SKETCH_ASPECT_RATIO,
) -> List[dict]:
    """Build the stable production plan: one independently generated Beat."""

    mode_key = get_sketch_default_mode_key(aspect_ratio)
    all_beats = [beat for beat in (all_beats or []) if not _is_space_map_beat(beat)]
    if not all_beats:
        return [
            {
                "scene_id": "",
                "rows": 1,
                "cols": 1,
                "mode_key": mode_key,
                "beats": [],
                "beat_numbers": [],
                "padding_count": 1,
            }
        ]

    result: list[dict] = []
    for beat in all_beats:
        beat_number = int(beat.get("beat_number") or 0)
        result.append(
            {
                "scene_id": beat_scene_id(beat) or "未知",
                "rows": 1,
                "cols": 1,
                "mode_key": mode_key,
                "beats": [beat],
                "beat_numbers": [beat_number],
                "padding_count": 0,
            }
        )
    return result


def find_sketch_for_beat_range(
    sketch_dir: str, beat_start: int, beat_end: int
) -> Optional[Tuple[str, int, int]]:
    """在草图目录中查找覆盖指定 beat 范围的草图文件。

    Args:
        sketch_dir: 草图目录路径
        beat_start: 起始 beat 编号（1-based）
        beat_end: 结束 beat 编号（1-based，含）

    Returns:
        (文件路径, rows, cols) 或 None。
        文件命名约定: sketch_b{start}-{end}_{rows}x{cols}.jpg
    """
    candidates = []
    for f in Path(sketch_dir).glob("sketch_b*_*x*.jpg"):
        name = f.stem  # e.g., "sketch_b1-25_5x5"
        try:
            parts = name.split("_b")[1].split("_")
            s, e = parts[0].split("-")
            r, c = parts[1].split("x")
            file_start, file_end = int(s), int(e)
            if file_start <= beat_start and beat_end <= file_end:
                span = file_end - file_start
                candidates.append((span, str(f), int(r), int(c)))
        except (IndexError, ValueError):
            continue
    if not candidates:
        return None
    # 选择覆盖范围最小的（最精确匹配）
    candidates.sort(key=lambda x: x[0])
    _, path, rows, cols = candidates[0]
    return path, rows, cols


async def _call_image_generation_api(
    *,
    prompt: str,
    reference_images: list[bytes | tuple[bytes, str] | tuple[str, bytes, str]] | None = None,
    image_config: dict | None = None,
    trace: dict[str, str] | None = None,
) -> tuple[bytes | None, str, str]:
    """Call the model gateway's standard image-generation API."""
    import httpx

    from ai_anime.modules.model_usage.public import get_model_access_json_transport
    from ai_anime.modules.model_usage.public import resolve_model_for_role

    model_role = "IMAGE_EDIT" if reference_images else "IMAGE_GENERATION"
    image_config = image_config or {}
    clean_model = (
        str(image_config.get("model") or "").strip()
        or resolve_model_for_role(model_role)
    )
    model_selector = str(image_config.get("model_selector") or "").strip()

    try:
        endpoint, headers = get_model_access_json_transport(
            model_role,
            model_selector or None,
        )
    except ValueError as exc:
        return None, "", str(exc)

    aspect_ratio = str(image_config.get("aspect_ratio") or "1:1").strip() or "1:1"
    image_size = normalize_image_size(str(image_config.get("image_size") or "1K"))
    capability = runtime_model_capability(clean_model) or runtime_model_capability(
        model_selector
    )
    size = resolve_standard_image_size(aspect_ratio, image_size)
    if capability is not None and capability.image_size_options:
        requested_ratio = _image_aspect_value(aspect_ratio)
        supported_ratios = tuple(
            option_ratio
            for option in capability.image_ratio_options
            if (option_ratio := _image_aspect_value(option)) is not None
        )
        if requested_ratio is None or (
            supported_ratios
            and not any(
                math.isclose(option, requested_ratio, rel_tol=1e-6)
                for option in supported_ratios
            )
        ):
            return (
                None,
                "",
                f"模型 {clean_model} 不支持图片画幅 {aspect_ratio}；"
                f"可选：{', '.join(capability.image_ratio_options)}",
            )
        size = resolve_catalog_image_size(
            aspect_ratio,
            capability.image_size_options,
            capability.image_ratio_options,
        )
    extra_fields: dict[str, object] = {
        "aspect_ratio": aspect_ratio,
        "image_size": image_size,
    }
    resolution = _resolution_from_image_size(image_size)
    if resolution:
        extra_fields["resolution"] = resolution

    model_params = dict(image_config.get("model_params") or {})

    payload: dict[str, object] = {
        "model": clean_model,
        "prompt": prompt,
        "size": size,
        "n": 1,
        "response_format": "b64_json",
        "extra_fields": extra_fields,
    }
    if capability is not None and "quality" in capability.extra_parameter_names:
        quality = normalize_image_quality(
            str(image_config.get("quality") or ""),
            default="medium",
        )
        payload["quality"] = quality
        extra_fields["quality"] = quality
    negative_prompt = str(image_config.get("negative_prompt") or "").strip()
    if (
        negative_prompt
        and capability is not None
        and "negative_prompt" in capability.extra_parameter_names
    ):
        payload["negative_prompt"] = negative_prompt
    for key, value in model_params.items():
        if key == "quality":
            continue
        payload[key] = value

    request_path = "images/generations"
    multipart_files: list[tuple[str, tuple[str, bytes, str]]] = []
    if reference_images:
        request_path = "images/edits"
        try:
            multipart_files = _image_multipart_files(reference_images)
        except (TypeError, ValueError) as exc:
            return None, "", str(exc)

    request_context = _safe_request_context(
        endpoint=endpoint,
        request_path=request_path,
        model=clean_model,
        payload=payload,
        prompt=prompt,
        reference_image_count=len(multipart_files),
    )
    logger.info("AI anime API image request: %s", request_context)
    def _record_trace(
        *,
        provider_request_id: str = "",
        response_id: str = "",
    ) -> None:
        if trace is None:
            return
        if provider_request_id:
            trace["request_id"] = provider_request_id
        if response_id:
            trace["response_id"] = response_id

    provider_request_id = ""
    try:
        request_headers = dict(headers)
        request_headers["Idempotency-Key"] = str(uuid.uuid4())

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=IMAGE_GATEWAY_CONNECT_TIMEOUT_SECONDS,
                read=IMAGE_GATEWAY_READ_TIMEOUT_SECONDS,
                write=IMAGE_GATEWAY_WRITE_TIMEOUT_SECONDS,
                pool=IMAGE_GATEWAY_POOL_TIMEOUT_SECONDS,
            ),
            follow_redirects=True,
        ) as client:
            logger.info("AI anime API image POST start: %s", request_context.get("endpoint"))
            async with asyncio.timeout(IMAGE_GATEWAY_TOTAL_TIMEOUT_SECONDS):
                if multipart_files:
                    request_headers.pop("Content-Type", None)
                    form_fields = {
                        key: (
                            json.dumps(value, ensure_ascii=False, separators=(",", ":"))
                            if isinstance(value, (dict, list))
                            else str(value)
                        )
                        for key, value in payload.items()
                    }
                    response = await client.post(
                        f"{endpoint}/{request_path}",
                        headers=request_headers,
                        data=form_fields,
                        files=multipart_files,
                    )
                else:
                    response = await client.post(
                        f"{endpoint}/{request_path}",
                        headers=request_headers,
                        json=payload,
                    )
            logger.info(
                "AI anime API image POST response: status=%s bytes=%s",
                getattr(response, "status_code", "?"),
                (getattr(response, "headers", None) or {}).get("content-length", "?"),
            )
            response.raise_for_status()
            response_headers = getattr(response, "headers", {}) or {}
            provider_request_id = _provider_request_id_from_headers(response_headers)
            try:
                result = response.json()
            except (TypeError, ValueError) as exc:
                return None, "", f"AI anime API Images response is not valid JSON: {exc}"
            if not isinstance(result, dict):
                return None, "", "AI anime API Images response must be an object"
            logger.info(
                "AI anime API image POST parsed: data_count=%d keys=%s",
                len(result.get("data") or []),
                sorted(result.keys())[:5],
            )
            provider_request_id = (
                provider_request_id
                or str(result.get("request_id") or result.get("requestId") or "").strip()
            )
            response_id = str(result.get("id") or "").strip()
            _record_trace(provider_request_id=provider_request_id, response_id=response_id)
            protocol_error = model_protocol_error_message(result)
            if protocol_error:
                request_context_text = (
                    f"request_id={provider_request_id}; " if provider_request_id else ""
                )
                return (
                    None,
                    "",
                    f"AI anime API Images protocol error: "
                    f"{request_context_text}{protocol_error}",
                )

            data = result.get("data") or []
            if not isinstance(data, list) or not data:
                return None, "", f"AI anime API Images response missing data: {sorted(result.keys())}"

            first = data[0] or {}
            if not isinstance(first, dict):
                return None, "", "AI anime API Images data[0] must be an object"
            image_b64 = first.get("b64_json") or ""
            if image_b64:
                image_bytes = base64.b64decode(image_b64)
                return image_bytes, "", ""

            image_url = first.get("url") or first.get("image_url") or ""
            if image_url.startswith("data:image"):
                _, b64_data = image_url.split(",", 1)
                image_bytes = base64.b64decode(b64_data)
                return image_bytes, "", ""
            if image_url:
                # Model Gateway 返 URL 而非 b64 时,要二次 GET 拉图。这个 await 是常见的
                # 图片已生成但任务仍在等待下载是常见挂起点，使用独立短超时。
                # (60s),避免落入主生成请求的长读取超时。
                # 加 phase log 让 hang 时能定位卡在哪。
                logger.info("AI anime API image GET url start: %s", image_url[:120])
                async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as fetch:
                    image_response = await fetch.get(image_url)
                logger.info(
                    "AI anime API image GET url done: status=%d bytes=%d",
                    image_response.status_code,
                    len(image_response.content),
                )
                image_response.raise_for_status()
                image_bytes = image_response.content
                return image_bytes, "", ""

            return None, "", f"AI anime API Images response missing b64_json/url: {first}"
    except TimeoutError:
        timeout_minutes = int(IMAGE_GATEWAY_TOTAL_TIMEOUT_SECONDS // 60)
        logger.warning(
            "AI anime API image request exceeded absolute timeout: %s minutes; %s",
            timeout_minutes,
            _context_for_error(request_context),
        )
        return None, "", f"请求超时：图片生成超过 {timeout_minutes} 分钟，已中止"
    except httpx.HTTPStatusError as exc:
        body = (exc.response.text or "")[:2000]
        status_code = exc.response.status_code
        response_headers = getattr(exc.response, "headers", {}) or {}
        safe_headers = _safe_header_summary(response_headers)
        request_id = _provider_request_id_from_headers(response_headers) or provider_request_id
        error_context = _context_for_error(request_context)
        header_context = (
            f"request_id={request_id}; headers={safe_headers}; "
            if request_id or safe_headers
            else ""
        )
        logger.warning(
            "AI anime API image failed: status=%s; %s%s; body=%s",
            status_code,
            header_context,
            error_context,
            body,
        )
        if status_code in {502, 503, 504}:
            request_reference = f"，请求编号：{request_id}" if request_id else ""
            reason = "请求超时" if status_code == 504 else "暂时不可用"
            route_attempts = str(response_headers.get("x-ai-anime-route-attempts") or "").strip()
            attempts_text = f"，统一路由已尝试 {route_attempts} 次" if route_attempts else ""
            route_source = str(response_headers.get("x-ai-anime-route-source") or "").strip()
            service = {
                "cloud": "云端图片生成服务",
                "byok": "BYOK 图片生成服务",
            }.get(route_source, "图片生成服务")
            return (
                None,
                "",
                f"{service}{reason}（HTTP {status_code}）"
                f"{request_reference}{attempts_text}。",
            )
        return (
            None,
            "",
            f"HTTP {status_code}: {header_context}{error_context}; body={body}",
        )
    except Exception as exc:
        if is_model_quota_error(exc):
            raise
        error_context = _context_for_error(request_context)
        detail = f"{type(exc).__name__}: {exc!r}; {error_context}"
        logger.warning("AI anime API image request exception: %s", detail)
        return None, "", f"请求异常: {detail}"


_SELECTED_REGEN_DEFAULT_MAX_CONCURRENCY = 3
_SELECTED_REGEN_MAX_CONCURRENCY = 4
_SELECTED_REGEN_DEFAULT_MAX_ATTEMPTS = 2
_SELECTED_REGEN_HEARTBEAT_INTERVAL_SECONDS = 15.0
_SELECTED_REGEN_RETRYABLE_ERROR_MARKERS = (
    "http 429",
    "http 502",
    "http 503",
    "http 504",
    "http 524",
    "connecterror",
    "connecttimeout",
    "connection reset",
    "pooltimeout",
    "readtimeout",
    "remoteprotocolerror",
    "server disconnected",
    "too many requests",
    "请求超时",
    "暂时不可用",
    "连接中断",
)


def _selected_regen_checkpoint_path(output_path: str) -> Path:
    output = Path(output_path)
    return output.parent / "prompts" / f"{output.stem}.completed.json"


def _selected_regen_output_is_valid(output_path: str) -> bool:
    output = Path(output_path)
    try:
        if not output.is_file() or output.stat().st_size <= 0:
            return False
    except OSError:
        return False
    try:
        from PIL import Image

        with Image.open(output) as image:
            image.verify()
    except (OSError, ValueError):
        return False
    return True


def _selected_regen_checkpoint_matches(
    *,
    output_path: str,
    resume_token: str,
    mode_key: str,
    beat_numbers: list[int],
) -> bool:
    if not resume_token or not _selected_regen_output_is_valid(output_path):
        return False
    checkpoint_path = _selected_regen_checkpoint_path(output_path)
    try:
        payload = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict):
        return False
    try:
        checkpoint_beats = [int(value) for value in payload.get("beat_numbers") or []]
    except (TypeError, ValueError):
        return False
    return (
        str(payload.get("resume_token") or "") == resume_token
        and str(payload.get("mode_key") or "") == mode_key
        and checkpoint_beats == beat_numbers
    )


def _write_selected_regen_checkpoint(
    *,
    output_path: str,
    resume_token: str,
    mode_key: str,
    beat_numbers: list[int],
) -> None:
    if not resume_token or not _selected_regen_output_is_valid(output_path):
        return
    checkpoint_path = _selected_regen_checkpoint_path(output_path)
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = checkpoint_path.with_suffix(f"{checkpoint_path.suffix}.tmp")
    temp_path.write_text(
        json.dumps(
            {
                "schema": 1,
                "resume_token": resume_token,
                "mode_key": mode_key,
                "beat_numbers": beat_numbers,
                "output_file": Path(output_path).name,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    os.replace(temp_path, checkpoint_path)


def _selected_regen_error_is_retryable(error: str | None) -> bool:
    normalized = str(error or "").strip().lower()
    return bool(normalized) and any(
        marker in normalized for marker in _SELECTED_REGEN_RETRYABLE_ERROR_MARKERS
    )


async def regenerate_selected_beats(
    selected_beats: List[dict],
    mode_key: str,
    character_map: Dict[str, dict],
    style: str,
    output_dir: str,
    scene_menu: list[dict] | list | None = None,
    prop_menu: list[dict] | list | None = None,
    sketch_colors: dict[str, str] | None = None,
    ethnicity: str = "Chinese",
    is_sketch: bool = False,
    sketch_dir: str = "",
    episode_grids_dir: str = "",
    beat_sketch_paths_override: dict[int, str] | None = None,
    scene_refs_override: dict[int, list[Any]] | None = None,
    prop_refs_override: dict[int, list[Any]] | None = None,
    sketch_aspect_padding: bool = False,
    force_image_size: Optional[str] = None,
    generator_config: Optional[dict] = None,
    max_concurrency: int = _SELECTED_REGEN_DEFAULT_MAX_CONCURRENCY,
    max_attempts: int = _SELECTED_REGEN_DEFAULT_MAX_ATTEMPTS,
    heartbeat_interval_seconds: float = _SELECTED_REGEN_HEARTBEAT_INTERVAL_SECONDS,
    resume_token: str = "",
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
    grid_completed_callback: Callable[[dict[str, Any]], None] | None = None,
) -> List[GridGenerationResult]:
    """再生选中的 beats（支持 render 和 sketch 模式）。

    从 REGEN_MODE_CONFIGS[mode_key] 读取 rows, cols, aspect_ratio, image_size，
    使用 perfect_grid_split 分割后逐 grid 调用 generate_grid。

    Args:
        selected_beats: 选中的 beat 数据列表
        mode_key: 再生模式 key，如 "1x1_9-16", "2x2_1-1"
        character_map: 角色映射
        style: 风格
        output_dir: 输出目录
        ethnicity: 种族
        is_sketch: 是否为草图模式
        sketch_dir: 草图目录
        sketch_aspect_padding: 草图补白到目标比例

    Returns:
        GridGenerationResult 列表
    """
    rows, cols, aspect_ratio, image_size = parse_regen_mode(mode_key)
    capacity = rows * cols

    # 分割 beats
    num_grids = math.ceil(len(selected_beats) / capacity)
    grid_splits = [mode_key] * num_grids
    logger.info(
        f"[RegenBeats] mode={mode_key}, beats={len(selected_beats)}, "
        f"splits={grid_splits}, aspect_ratio={aspect_ratio}"
    )

    generator = create_grid_generator(config=generator_config)
    results: list[GridGenerationResult | None] = [None] * num_grids
    pending_grids: list[dict[str, Any]] = []
    beat_offset = 0
    reused_count = 0

    def emit_grid_completed(
        item: dict[str, Any],
        result: GridGenerationResult,
        *,
        reused: bool,
    ) -> None:
        if grid_completed_callback is None:
            return
        grid_completed_callback(
            {
                "grid_index": int(item["grid_index"]),
                "result": result,
                "beats": list(item["beats"]),
                "beat_numbers": list(item["beat_numbers"]),
                "rows": int(item["rows"]),
                "cols": int(item["cols"]),
                "reused": reused,
            }
        )

    for grid_idx, split_mk in enumerate(grid_splits, start=1):
        split_cfg = REGEN_MODE_CONFIGS[split_mk]
        g_rows, g_cols = split_cfg["rows"], split_cfg["cols"]
        grid_beat_count = split_cfg["capacity"]
        beat_start_index = beat_offset
        grid_beats = selected_beats[beat_offset : beat_offset + grid_beat_count]
        beat_offset += grid_beat_count

        # 输出路径
        output_path = str(Path(output_dir) / f"regen_{mode_key}_g{grid_idx:02d}.png")

        # 提取 beat 编号用于 location_beat_numbers
        beat_numbers = [_generation_beat_number(b, i) for i, b in enumerate(grid_beats)]

        if _selected_regen_checkpoint_matches(
            output_path=output_path,
            resume_token=resume_token,
            mode_key=mode_key,
            beat_numbers=beat_numbers,
        ):
            reused_result = GridGenerationResult(
                success=True,
                grid_image_path=output_path,
                generation_time=0.0,
                beat_start_index=beat_start_index,
                beat_count=len(grid_beats),
                grid_rows=g_rows,
                grid_cols=g_cols,
            )
            results[grid_idx - 1] = reused_result
            emit_grid_completed(
                {
                    "grid_index": grid_idx,
                    "beats": grid_beats,
                    "beat_numbers": beat_numbers,
                    "rows": g_rows,
                    "cols": g_cols,
                },
                reused_result,
                reused=True,
            )
            reused_count += 1
            continue

        # 从图片池构建 per-beat 草图路径
        grid_beat_sketch_paths = None
        if episode_grids_dir and not is_sketch:
            from ai_anime.modules.production.infrastructure.media_generation.pool_indexer import (
                build_beat_sketch_paths,
            )

            grid_beat_sketch_paths = build_beat_sketch_paths(episode_grids_dir, beat_numbers)
        if beat_sketch_paths_override and not is_sketch:
            grid_beat_sketch_paths = {
                int(beat_num): str(path)
                for beat_num, path in beat_sketch_paths_override.items()
                if int(beat_num) in {int(value) for value in beat_numbers}
            }

        pending_grids.append(
            {
                "grid_index": grid_idx,
                "split_mode_key": split_mk,
                "rows": g_rows,
                "cols": g_cols,
                "beats": grid_beats,
                "beat_numbers": beat_numbers,
                "beat_start_index": beat_start_index,
                "output_path": output_path,
                "beat_sketch_paths": grid_beat_sketch_paths,
            }
        )

    total_count = num_grids
    completed_count = reused_count
    active_count = 0

    def emit_progress(event: str, **details: Any) -> None:
        if progress_callback is None:
            return
        payload = {
            "event": event,
            "completed": completed_count,
            "total": total_count,
            "active": active_count,
            "reused": reused_count,
            **details,
        }
        try:
            progress_callback(payload)
        except Exception:
            logger.exception("Selected regeneration progress callback failed")

    if reused_count:
        emit_progress("resumed")
    if not pending_grids:
        emit_progress("finished")
        return [result for result in results if result is not None]

    concurrency = min(
        max(1, int(max_concurrency or _SELECTED_REGEN_DEFAULT_MAX_CONCURRENCY)),
        _SELECTED_REGEN_MAX_CONCURRENCY,
        len(pending_grids),
    )
    attempts = min(max(1, int(max_attempts or 1)), 3)
    semaphore = asyncio.Semaphore(concurrency)

    async def generate_one(item: dict[str, Any]) -> None:
        nonlocal active_count, completed_count
        grid_index = int(item["grid_index"])
        async with semaphore:
            active_count += 1
            emit_progress("started", grid_index=grid_index)
            try:
                result: GridGenerationResult | None = None
                for attempt in range(1, attempts + 1):
                    result = await generator.generate_grid(
                        beats=item["beats"],
                        character_map=character_map,
                        scene_menu=scene_menu,
                        prop_menu=prop_menu,
                        sketch_colors=sketch_colors,
                        style=style,
                        output_path=item["output_path"],
                        ethnicity=ethnicity,
                        rows=item["rows"],
                        cols=item["cols"],
                        sketch=is_sketch,
                        sketch_dir=sketch_dir if not is_sketch else "",
                        location_beat_numbers=item["beat_numbers"],
                        mode_key=item["split_mode_key"],
                        beat_sketch_paths=item["beat_sketch_paths"],
                        scene_refs_override=scene_refs_override,
                        prop_refs_override=prop_refs_override,
                        sketch_aspect_padding=sketch_aspect_padding,
                        force_image_size=force_image_size,
                    )
                    if result.success or attempt >= attempts:
                        break
                    if not _selected_regen_error_is_retryable(result.error):
                        break
                    emit_progress(
                        "retry",
                        grid_index=grid_index,
                        attempt=attempt + 1,
                        max_attempts=attempts,
                        error=str(result.error or ""),
                    )
                    await asyncio.sleep(min(2.0**attempt, 5.0))

                if result is None:
                    raise RuntimeError(f"网格 {grid_index} 未返回生成结果")
                result.beat_start_index = int(item["beat_start_index"])
                result.beat_count = len(item["beats"])
                result.grid_rows = int(item["rows"])
                result.grid_cols = int(item["cols"])
                results[grid_index - 1] = result
                if result.success and result.grid_image_path:
                    try:
                        _write_selected_regen_checkpoint(
                            output_path=result.grid_image_path,
                            resume_token=resume_token,
                            mode_key=mode_key,
                            beat_numbers=item["beat_numbers"],
                        )
                    except OSError:
                        logger.exception(
                            "Could not persist selected regeneration checkpoint: grid=%s",
                            grid_index,
                        )
                    emit_grid_completed(item, result, reused=False)
                if result.success:
                    logger.info(
                        f"[RegenBeats] Grid {grid_index} 成功: "
                        f"{result.grid_image_path}"
                    )
                else:
                    logger.info(f"[RegenBeats] Grid {grid_index} 失败: {result.error}")
            finally:
                active_count = max(0, active_count - 1)

            completed_count += 1
            emit_progress(
                "completed",
                grid_index=grid_index,
                success=bool(result.success),
                error=str(result.error or ""),
            )

    async def heartbeat() -> None:
        interval = max(0.1, float(heartbeat_interval_seconds))
        while completed_count < total_count:
            await asyncio.sleep(interval)
            if completed_count < total_count:
                emit_progress("heartbeat")

    grid_tasks = [asyncio.create_task(generate_one(item)) for item in pending_grids]
    heartbeat_task = (
        asyncio.create_task(heartbeat()) if heartbeat_interval_seconds > 0 else None
    )
    try:
        await asyncio.gather(*grid_tasks)
    except BaseException:
        for task in grid_tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*grid_tasks, return_exceptions=True)
        raise
    finally:
        if heartbeat_task is not None:
            heartbeat_task.cancel()
            await asyncio.gather(heartbeat_task, return_exceptions=True)

    emit_progress("finished")
    return [result for result in results if result is not None]


def create_grid_generator(config: Optional[dict] = None) -> ImageGridGenerator:
    """使用当前商业模型访问配置创建网格生成器。"""
    return ImageGridGenerator(config=config)


ImageGridGenerator = ImageGridGenerator
call_image_generation_api = _call_image_generation_api
