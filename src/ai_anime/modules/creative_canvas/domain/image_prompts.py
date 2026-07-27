"""Creative Canvas image catalog and prompt rules."""

from __future__ import annotations

from ai_anime.modules.creative_canvas.domain.image_editing import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
)

CREATIVE_CANVAS_IMAGE_CAMERA_OPTIONS = {
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
CREATIVE_CANVAS_IMAGE_STYLE_TEMPLATES = [
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


class UnknownCreativeCanvasImageStyleTemplate(ValueError):
    pass


def creative_canvas_image_camera_options() -> dict:
    return CREATIVE_CANVAS_IMAGE_CAMERA_OPTIONS


def creative_canvas_image_style_templates() -> list[dict]:
    return list(CREATIVE_CANVAS_IMAGE_STYLE_TEMPLATES)


def build_image_camera_prompt(
    camera: CreativeCanvasImageCameraConfig | None,
) -> str:
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


def resolve_creative_canvas_image_style_template(
    style: CreativeCanvasImageStyleConfig | None,
) -> dict | None:
    if style is None:
        return None
    template_id = str(style.template_id or "").strip()
    if not template_id:
        return None
    for item in CREATIVE_CANVAS_IMAGE_STYLE_TEMPLATES:
        if item["id"] == template_id:
            return item
    raise UnknownCreativeCanvasImageStyleTemplate(
        f"unknown image style template: {template_id}"
    )


def build_image_style_prompt(style: CreativeCanvasImageStyleConfig | None) -> str:
    template = resolve_creative_canvas_image_style_template(style)
    if template is None:
        return ""
    return (
        "Style template:\n"
        f"- {template['label']} ({template['author']})\n"
        f"- {template['style_prompt']}"
    )


def merge_image_prompt_with_style_and_camera(
    prompt: str,
    style: CreativeCanvasImageStyleConfig | None,
    camera: CreativeCanvasImageCameraConfig | None,
) -> str:
    base = (prompt or "").strip()
    style_block = build_image_style_prompt(style)
    camera_block = build_image_camera_prompt(camera)
    parts = [part for part in [base, style_block, camera_block] if part]
    return "\n\n".join(parts)
