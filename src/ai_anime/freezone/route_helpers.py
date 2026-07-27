"""Freezone 路由辅助函数。

把 `src/ai_anime/api/routes/freezone.py` 里的纯辅助逻辑抽离出来，
让路由文件更聚焦于接口本身。
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

from ai_anime.api.schemas import (
    FreezoneImageCameraConfig,
    FreezoneImageStyleConfig,
)
from ai_anime.config import IMAGE_GENERATION_SELECTIONS
from ai_anime.freezone.paths import resolve_static_url_to_path
from ai_anime.modules.creative_canvas.public import (
    DEFAULT_CREATIVE_CANVAS_IMAGE_MODEL,
    SUPPORTED_CREATIVE_CANVAS_IMAGE_PROVIDERS as SUPPORTED_FREEZONE_IMAGE_PROVIDERS,
    UnsupportedCreativeCanvasImageProvider,
    resolve_image_provider,
)
from ai_anime.task_identity import task_state_key

FREEZONE_DEFAULT_IMAGE_SELECTION = DEFAULT_CREATIVE_CANVAS_IMAGE_MODEL
FREEZONE_DEFAULT_IMAGE_MODEL = FREEZONE_DEFAULT_IMAGE_SELECTION
FREEZONE_IMAGE_CAMERA_OPTIONS = {
    "camera_bodies": [
        {"id": "panavision_dxl2", "label": "Panavision DXL2"},
        {"id": "arri_alexa_65", "label": "ARRI ALEXA 65"},
        {"id": "red_vraptor_xl", "label": "RED V-Raptor XL"},
        {"id": "sony_venice_2", "label": "Sony Venice 2"},
    ],
    "lenses": [
        {"id": "arri_signature_prime", "label": "Arri Signature Prime"},
        {"id": "cooke_s4i", "label": "Cooke S4/i"},
        {"id": "zeiss_supreme_prime", "label": "Zeiss Supreme Prime"},
        {"id": "panavision_primo_70", "label": "Panavision Primo 70"},
    ],
    "focal_lengths_mm": [8, 14, 24, 35, 50, 75, 125],
    "apertures": ["f/1.4", "f/2", "f/2.8", "f/4", "f/5.6", "f/8"],
}
FREEZONE_IMAGE_STYLE_TEMPLATES = [
    {
        "id": "three_oclock_2300",
        "label": "新古典插画 + 美式漫画黄金时代 + 新装饰线条",
        "author": "Three_o_clock",
        "category": "插画",
        "style_prompt": "neo-classical illustration, American golden-age comic influence, decorative linear design, elegant architecture, refined linework, ornamental contour rhythm, polished editorial illustration finish",
    },
    {
        "id": "three_oclock_1800",
        "label": "工笔风现代插画 + 新装饰主义特征",
        "author": "Three_o_clock",
        "category": "插画",
        "style_prompt": "gongbi-inspired modern illustration, delicate contour lines, decorative modernist pattern language, controlled flat color fields, graceful detailing, refined eastern editorial illustration",
    },
    {
        "id": "storybook_watercolor",
        "label": "欧式故事书水彩",
        "author": "builtin",
        "category": "插画",
        "style_prompt": "European storybook watercolor illustration, soft pigment bleeding, delicate paper texture, lyrical composition, gentle edges, warm narrative atmosphere",
    },
    {
        "id": "cinematic_realism",
        "label": "电影感写实",
        "author": "builtin",
        "category": "写实",
        "style_prompt": "cinematic realism, natural skin texture, controlled highlights, subtle film grain, dramatic but grounded lighting, premium production still quality",
    },
    {
        "id": "fashion_editorial",
        "label": "高定时尚大片",
        "author": "builtin",
        "category": "摄影",
        "style_prompt": "high-end fashion editorial photography, luxury styling, clean visual hierarchy, premium magazine finish, elegant dramatic lighting, polished cinematic portraiture",
    },
    {
        "id": "minimalist_ecommerce",
        "label": "极简电商棚拍",
        "author": "builtin",
        "category": "电商",
        "style_prompt": "minimalist e-commerce studio photography, clean backdrop, precise product separation, refined soft-box lighting, premium commercial clarity, neat modern brand presentation",
    },
    {
        "id": "wabi_sabi_product",
        "label": "侘寂风场景摄影",
        "author": "builtin",
        "category": "电商",
        "style_prompt": "wabi-sabi scene photography, restrained earthy palette, quiet texture emphasis, natural imperfections, soft window light, calm premium spatial styling",
    },
    {
        "id": "retro_hk_poster",
        "label": "复古港风电影海报",
        "author": "builtin",
        "category": "海报",
        "style_prompt": "retro Hong Kong movie poster aesthetic, saturated practical lights, moody urban nostalgia, dramatic cinematic contrast, vintage print texture, expressive composition",
    },
    {
        "id": "noir_monochrome",
        "label": "黑白黑色电影",
        "author": "builtin",
        "category": "摄影",
        "style_prompt": "film noir black-and-white photography, high contrast chiaroscuro, deep blacks, smoky atmosphere, hard rim lighting, classic silver-gelatin cinematic mood",
    },
    {
        "id": "cyberpunk_neon",
        "label": "赛博朋克霓虹电影感",
        "author": "builtin",
        "category": "概念",
        "style_prompt": "cyberpunk cinematic atmosphere, neon reflections, humid night surfaces, dense urban depth, futuristic signage glow, high-detail sci-fi production frame",
    },
    {
        "id": "anime_cel_shading",
        "label": "日系动画赛璐璐",
        "author": "builtin",
        "category": "动漫",
        "style_prompt": "anime cel-shaded illustration, clean line art, controlled color blocking, expressive face design, polished 2D production quality, crisp silhouette readability",
    },
    {
        "id": "shoujo_pastel",
        "label": "梦幻少女漫粉彩",
        "author": "builtin",
        "category": "动漫",
        "style_prompt": "dreamy shoujo pastel illustration, airy palette, glowing bloom, soft eyelashes, romantic floral atmosphere, delicate modern manga finish",
    },
    {
        "id": "guochao_ink_poster",
        "label": "国潮水墨海报",
        "author": "builtin",
        "category": "国风",
        "style_prompt": "guochao ink poster design, Chinese ink diffusion, calligraphic energy, layered red-black-gold palette, dramatic negative space, premium modern eastern poster style",
    },
    {
        "id": "tang_dynasty_epic",
        "label": "盛唐史诗美术",
        "author": "builtin",
        "category": "国风",
        "style_prompt": "Tang dynasty epic visual style, sumptuous costume detailing, monumental court atmosphere, ceremonial composition, rich gold-red-blue palette, historical cinematic grandeur",
    },
    {
        "id": "ukiyoe_modern",
        "label": "浮世绘现代重构",
        "author": "builtin",
        "category": "插画",
        "style_prompt": "modern ukiyo-e reinterpretation, elegant contour flow, flat yet sophisticated color planes, graphic wave and textile rhythm, vintage Japanese print sensibility",
    },
    {
        "id": "paper_cut_folk",
        "label": "剪纸民艺图形",
        "author": "builtin",
        "category": "平面",
        "style_prompt": "paper-cut folk art graphic style, bold silhouette layering, decorative symmetry, handcrafted edge rhythm, festive but refined flat design language",
    },
    {
        "id": "oil_painting_classical",
        "label": "古典油画质感",
        "author": "builtin",
        "category": "绘画",
        "style_prompt": "classical oil painting texture, layered brushwork, controlled varnish glow, museum-grade portrait lighting, painterly depth, rich tonal transitions",
    },
    {
        "id": "toy_render_premium",
        "label": "高端潮玩 3D 渲染",
        "author": "builtin",
        "category": "3D",
        "style_prompt": "premium collectible toy 3D render, smooth material fidelity, designer-toy proportion control, crisp studio highlights, polished commercial rendering finish",
    },
    {
        "id": "mecha_concept_art",
        "label": "机甲概念艺术",
        "author": "builtin",
        "category": "概念",
        "style_prompt": "high-detail mecha concept art, industrial surface breakup, cinematic scale cues, technical panel complexity, atmospheric perspective, premium entertainment design sheet quality",
    },
    {
        "id": "children_crayon",
        "label": "稚趣蜡笔绘本",
        "author": "builtin",
        "category": "儿童",
        "style_prompt": "children's crayon picture-book illustration, playful shape simplification, warm handmade texture, colorful wax stroke feel, friendly storytelling composition",
    },
    {
        "id": "sci_fi_brutalism",
        "label": "科幻粗野主义场景",
        "author": "builtin",
        "category": "概念",
        "style_prompt": "sci-fi brutalist environment design, monumental concrete geometry, austere futuristic scale, severe atmospheric lighting, hard-edged spatial rhythm, premium cinematic concept frame",
    },
    {
        "id": "japanese_street_snapshot",
        "label": "日系街拍胶片",
        "author": "builtin",
        "category": "摄影",
        "style_prompt": "Japanese street snapshot photography, soft film grain, natural candid framing, everyday city poetry, slightly faded color response, intimate documentary atmosphere",
    },
    {
        "id": "luxury_jewelry_macro",
        "label": "高级珠宝微距",
        "author": "builtin",
        "category": "电商",
        "style_prompt": "luxury jewelry macro photography, razor-sharp gem facets, elegant specular highlights, premium black-box lighting, ultra-clean metal finish, prestigious commercial beauty shot",
    },
    {
        "id": "game_card_splash",
        "label": "卡牌游戏立绘",
        "author": "builtin",
        "category": "游戏",
        "style_prompt": "heroic card-game splash art, dynamic silhouette hierarchy, dramatic color separation, polished fantasy rendering, collectible-grade character presentation, high-impact promotional composition",
    },
    {
        "id": "indie_film_16mm",
        "label": "独立电影 16mm",
        "author": "builtin",
        "category": "摄影",
        "style_prompt": "indie film 16mm aesthetic, tactile grain structure, natural available light, imperfect handheld intimacy, muted organic palette, emotionally grounded cinematic realism",
    },
    {
        "id": "nordic_home_lifestyle",
        "label": "北欧家居生活方式",
        "author": "builtin",
        "category": "家居",
        "style_prompt": "Nordic home lifestyle photography, bright but soft daylight, breathable negative space, warm neutral palette, natural wood and fabric texture, tasteful editorial domestic calm",
    },
    {
        "id": "dark_fantasy_painterly",
        "label": "暗黑奇幻厚涂",
        "author": "builtin",
        "category": "绘画",
        "style_prompt": "dark fantasy painterly illustration, heavy textured brushwork, ominous atmosphere, rich shadow masses, dramatic magical contrast, premium concept-painting finish",
    },
    {
        "id": "isometric_city_diagram",
        "label": "等距城市图解",
        "author": "builtin",
        "category": "平面",
        "style_prompt": "isometric city diagram illustration, clean architectural logic, compact urban layering, readable infographics structure, crisp vector-like detailing, polished editorial map aesthetic",
    },
    {
        "id": "vintage_food_ad",
        "label": "复古食品广告",
        "author": "builtin",
        "category": "广告",
        "style_prompt": "vintage food advertisement aesthetic, appetizing warm tones, cheerful retro styling, print-era graphic layout sensibility, nostalgic commercial polish, inviting tabletop hero shot",
    },
    {
        "id": "future_ui_blueprint",
        "label": "未来 UI 蓝图",
        "author": "builtin",
        "category": "科技",
        "style_prompt": "futuristic UI blueprint aesthetic, luminous interface geometry, technical line precision, holographic system layering, clean sci-fi information design, premium product vision presentation",
    },
]


def resolve_freezone_image_provider(provider: Optional[str], *, strict: bool = True) -> str:
    """把 Freezone 图片 provider 归一化到当前支持的 AI anime 范围内。"""
    try:
        return resolve_image_provider(provider, strict=strict)
    except UnsupportedCreativeCanvasImageProvider as exc:
        raise HTTPException(400, str(exc)) from exc


def new_freezone_job_id() -> str:
    return uuid.uuid4().hex[:16]


def resolve_url_list(project_dir: Path, urls: list[str]) -> list[str]:
    out: list[str] = []
    for u in urls:
        if not u:
            continue
        try:
            out.append(resolve_static_url_to_path(u, project_dir).as_posix())
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    return out


def accepted_job_response(
    *,
    task_type: str,
    username: str,
    project: str,
    job_id: str,
) -> dict:
    return {
        "ok": True,
        "data": {
            "task_type": task_type,
            "job_id": job_id,
            "task_key": task_state_key(task_type, username, project, episode=0, scope=job_id),
        },
    }


def get_freezone_image_camera_options() -> dict:
    return FREEZONE_IMAGE_CAMERA_OPTIONS


def get_freezone_image_style_templates() -> list[dict]:
    return list(FREEZONE_IMAGE_STYLE_TEMPLATES)


def build_camera_prompt(camera: Optional[FreezoneImageCameraConfig]) -> str:
    if camera is None:
        return ""

    parts: list[str] = []
    if str(camera.camera_body or "").strip():
        parts.append(str(camera.camera_body).strip())
    if str(camera.lens or "").strip():
        parts.append(str(camera.lens).strip())
    if camera.focal_length_mm:
        parts.append(f"{int(camera.focal_length_mm)}mm")
    if str(camera.aperture or "").strip():
        parts.append(str(camera.aperture).strip())
    if not parts:
        return ""

    return (
        "Camera setup:\n"
        f"- {' | '.join(parts)}\n"
        "- Preserve this camera language in framing, lens feel, depth rendition, and overall optical character where applicable."
    )


def merge_prompt_with_camera(prompt: str, camera: Optional[FreezoneImageCameraConfig]) -> str:
    camera_block = build_camera_prompt(camera)
    base = (prompt or "").strip()
    if base and camera_block:
        return f"{base}\n\n{camera_block}"
    if camera_block:
        return camera_block
    return base


def resolve_freezone_image_style_template(style: Optional[FreezoneImageStyleConfig]) -> Optional[dict]:
    if style is None:
        return None
    template_id = str(style.template_id or "").strip()
    if not template_id:
        return None
    for item in FREEZONE_IMAGE_STYLE_TEMPLATES:
        if item["id"] == template_id:
            return item
    raise HTTPException(400, f"unknown image style template: {template_id}")


def build_style_prompt(style: Optional[FreezoneImageStyleConfig]) -> str:
    template = resolve_freezone_image_style_template(style)
    if template is None:
        return ""
    return (
        "Style template:\n"
        f"- {template['label']} ({template['author']})\n"
        f"- {template['style_prompt']}"
    )


def merge_prompt_with_style_and_camera(
    prompt: str,
    style: Optional[FreezoneImageStyleConfig],
    camera: Optional[FreezoneImageCameraConfig],
) -> str:
    base = (prompt or "").strip()
    style_block = build_style_prompt(style)
    camera_block = build_camera_prompt(camera)
    parts = [part for part in [base, style_block, camera_block] if part]
    return "\n\n".join(parts)


def split_provider_and_model(
    provider: Optional[str],
    model: Optional[str],
    *,
    fallback_model: Optional[str] = None,
) -> tuple[Optional[str], Optional[str]]:
    """解析 Freezone 图片模型。"""
    model_text = str(model or "").strip()
    if model_text:
        if model_text in IMAGE_GENERATION_SELECTIONS:
            entry = IMAGE_GENERATION_SELECTIONS[model_text]
            return entry["provider"], entry["model"]

    if provider:
        return provider, model_text or fallback_model
    if model_text and "/" in model_text:
        provider_token, model_token = model_text.split("/", 1)
        if provider_token in SUPPORTED_FREEZONE_IMAGE_PROVIDERS:
            return provider_token, model_token or fallback_model
    return provider, model_text or fallback_model


def notes_suffix(*, style: str, notes: str, user_prompt: str) -> str:
    lines = [f"Style: {style}."]
    if notes.strip():
        lines.append(f"Extra notes: {notes.strip()}.")
    if user_prompt.strip():
        lines.append(f"User prompt:\n{user_prompt.strip()}")
    lines.extend(
        [
            "",
            "Hard requirements:",
            "- Production-ready AI anime asset candidate.",
            "- No text, watermark, UI frame, contact sheet, or collage unless explicitly requested.",
            "- Preserve useful identity / scene / prop cues from references.",
        ]
    )
    return "\n".join(lines)


def infer_scene_id_from_master_path(path: Path, project_dir: Path) -> str:
    try:
        rel_parts = path.relative_to(project_dir).parts
    except ValueError:
        rel_parts = path.parts
    for index in range(len(rel_parts) - 1):
        if rel_parts[index] == "scenes" and index + 1 < len(rel_parts):
            return rel_parts[index + 1]
    return path.parent.name or "the target scene"


def build_scene_360_prompt(scene_id: str) -> str:
    normalized_scene_id = (scene_id or "").strip() or "the target scene"
    return (
        f"Generate a 360-degree equirectangular panorama image in exact 2:1 "
        f"aspect ratio for scene `{normalized_scene_id}`.\n\n"
        "INPUT IMAGE ROLE:\n"
        "- Reference image 1 = MASTER VISUAL BIBLE.\n"
        "- It controls art style, material style, linework, color palette, lighting mood, and fixed scene design.\n"
        "- Reference image 1 is NOT the final camera view.\n"
        "- Do NOT copy its single frontal composition. Use it only as visual/style/material evidence while constructing a full 360-degree continuous environment.\n\n"
        "LAYER MODE: FULL ENVIRONMENT\n"
        "- Generate the complete environment and fixed fixtures only.\n"
        "- No people, no characters, no story action, and no temporary story props.\n\n"
        "PROJECTION REQUIREMENTS:\n"
        "- Correct equirectangular spherical panorama projection.\n"
        "- Output must be one continuous 2:1 panorama, suitable for a VR/360 panorama viewer.\n"
        "- Camera is fixed at the center of the scene at normal human eye height.\n"
        "- Full 360-degree environment around the camera.\n"
        "- Left and right edges must connect seamlessly with no visible seam.\n"
        "- Horizon must be level and centered.\n"
        "- Use normal VR panorama projection: no single flat wide shot, no cubemap atlas, no borders, no multi-panel sheet.\n"
        "- Geometry must remain stable after spherical wrapping.\n"
        "- Ceiling and floor poles must be clean continuous surfaces, with no black holes, labels, mirrors, sliced objects, or heavy stretching.\n\n"
        "NEGATIVE REQUIREMENTS:\n"
        "- Not a normal wide-angle illustration.\n"
        "- Not fisheye lens.\n"
        "- Not cubemap faces.\n"
        "- No labels, no UI, no watermark.\n"
        "- No broken seam, no duplicated doorway at seam, no mirrored left/right halves.\n"
        "- No photorealism drift if the reference is stylized."
    )


def resolve_upscale_dimensions(source_path: Path, scale_factor: int) -> tuple[int, int]:
    from PIL import Image

    with Image.open(source_path) as image:
        width, height = image.size
    if width <= 0 or height <= 0:
        raise HTTPException(400, f"invalid source image size: {source_path}")
    return width * scale_factor, height * scale_factor
