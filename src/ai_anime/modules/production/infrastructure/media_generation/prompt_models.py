"""Prompt configuration models and shared prompt helpers."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, TypeAlias

from ai_anime.modules.asset_world.public import StyleService
from ai_anime.modules.production.infrastructure.media_generation_settings import (
    IMAGE_DEFAULT_STYLE,
    get_style_preset,
)


StyleRef: TypeAlias = "StyleConfig | str | None"


def _style_family(style_ref: StyleRef) -> str:
    direct = getattr(style_ref, "style_family", "")
    if direct:
        return direct
    style_name = getattr(style_ref, "style_name", style_ref)
    return StyleService.get_style_family(style_name or IMAGE_DEFAULT_STYLE)


def _is_animation_style(style_ref: StyleRef) -> bool:
    return _style_family(style_ref) == "animation"


def _animation_subtype(style_ref: StyleRef) -> str:
    direct = getattr(style_ref, "animation_subtype", "")
    if direct:
        return direct
    style_name = getattr(style_ref, "style_name", style_ref)
    return StyleService.get_animation_subtype(style_name or IMAGE_DEFAULT_STYLE)


def _animation_medium_label(style_ref: StyleRef) -> str:
    subtype = _animation_subtype(style_ref)
    if subtype == "3d":
        return "stylized 3D animation"
    if subtype == "hybrid":
        return "stylized hybrid mixed-media animation"
    return "stylized 2D animation"


class PromptMode(Enum):
    """提示词模式。"""

    RENDER = "render"  # Sketch + Render 模式
    SKETCH = "sketch"  # 草图模式
    ACTION_STORYBOARD = "action_storyboard"  # Action beat 分镜草图（5×5 连续动作序列）


@dataclass
class GridConfig:
    """网格配置。"""

    rows: int
    cols: int
    aspect_ratio: str = "1:1"  # "9:16", "1:1", "21:9"
    image_aspect_ratio: str = ""  # 实际图片比例（two-pass 时与 aspect_ratio 不同）
    is_portrait_panel: bool = False  # panel 是否为竖屏

    @property
    def total_panels(self) -> int:
        return self.rows * self.cols

    @property
    def panel_dimensions(self) -> tuple:
        """根据 aspect_ratio 和网格尺寸估算 panel 尺寸。"""
        # 基于常用配置
        if self.aspect_ratio == "9:16":
            if self.rows >= 4:
                total_width, total_height = 3072, 5504  # 4K
            else:
                total_width, total_height = 768, 1376  # 1K
        elif self.aspect_ratio == "21:9":
            total_width, total_height = 2560, 1097  # 2K
        elif self.aspect_ratio == "16:9":
            total_width, total_height = 3840, 2160  # 4K Sketch
        else:  # 1:1
            if self.rows >= 4:
                total_width, total_height = 4096, 4096  # 4K
            else:
                total_width, total_height = 2048, 2048  # 2K

        panel_width = total_width // self.cols
        panel_height = total_height // self.rows
        return panel_width, panel_height


@dataclass
class CharacterConfig:
    """角色配置。"""

    name: str
    face_prompt: str = ""
    base_prompt: str = ""
    appearance_details: str = ""
    gender: str = ""
    body_type: str = ""
    reference_path: Optional[str] = None
    reference_mode: str = "prompt_only"  # composite, portrait_only, prompt_only
    identity_appearances: dict = field(
        default_factory=dict
    )  # {"婚后时期": "灰粉色...", "少女时期": "白色校服..."}
    sketch_color: str = ""
    identity_sketch_colors: dict = field(
        default_factory=dict
    )  # {"婚后时期": "#4A90D9 ICE BLUE", ...}
    identity_ref_images: dict = field(
        default_factory=dict
    )  # {"幼年时期": "/path/to/portrait.png"}
    identity_face_prompts: dict = field(
        default_factory=dict
    )  # {"幼年时期": "六七岁幼童，圆润小脸..."}
    identity_body_types: dict = field(
        default_factory=dict
    )  # {"幼年时期": "petite child build"}


@dataclass
class StyleConfig:
    """风格配置。"""

    style_name: str = IMAGE_DEFAULT_STYLE
    project_dir: str = ""
    style_family: str = ""
    animation_subtype: str = ""
    style_keywords: str = ""
    avoid_keywords: str = ""
    color_palette: str = ""
    panel_tag: str = ""

    def __post_init__(self):
        if not self.style_keywords:
            preset = get_style_preset(
                self.style_name, project_dir=self.project_dir or None
            )
            self.style_keywords = preset.get("style_instructions", "")
            self.avoid_keywords = preset.get("avoid_instructions", "")
            self.panel_tag = preset.get("style_tag", self.panel_tag)
            # 移除与多角色 grid 冲突的指令
            if self.avoid_keywords:
                self.avoid_keywords = self.avoid_keywords.replace(
                    "Ensure only one character unless explicitly requested.", ""
                ).strip()
            if not self.style_family:
                self.style_family = preset.get("style_family", "")
            if not self.animation_subtype:
                self.animation_subtype = preset.get("animation_subtype", "")


@dataclass
class PromptContext:
    """提示词上下文。"""

    grid: GridConfig
    characters: Dict[str, CharacterConfig]
    style: StyleConfig
    beats: List[dict]
    mode: PromptMode
    ethnicity: str = "Chinese"
    sketch_path: Optional[str] = None
    panel_detected_keys: Optional[Dict[int, set]] = (
        None  # {panel_index(0-based): detected identity keys}
    )
    resolved_render_chars: List[str] = field(
        default_factory=list
    )  # Render 模式最终参考图顺序
    scene_refs: Dict[int, List[Any]] = field(
        default_factory=dict
    )  # {panel_index(1-based): [ResolvedAssetRef]}
    prop_asset_refs: Dict[int, List[Any]] = field(
        default_factory=dict
    )  # {panel_index(1-based): [ResolvedAssetRef]}
    sketch_colors: Dict[str, str] = field(
        default_factory=dict
    )  # 共享调色盘：identity_id → color
    prop_marker_colors: Dict[str, str] = field(
        default_factory=dict
    )  # global prop_id -> marker color
    registry_negative_clause: str = ""  # registry-driven negative prompt clauses
    image_model: str = ""


def default_ethnicity_instruction(ethnicity: str) -> str:
    value = (ethnicity or "").strip()
    if not value:
        return ""
    return (
        f"For people without identity references and without explicit ethnicity, nationality, "
        f"or regional description in the character, beat, scene, or reference image, default to {value}. "
        f"If any explicit source specifies another ethnicity or nationality, follow that explicit source."
    )


def _panel_ar_hint(aspect_ratio: str, rows: int, cols: int) -> str:
    """根据整图比例和网格几何，推算单面板的朝向提示。

    对于 NxN 网格，每个 panel 的比例 = 整图比例。
    """
    from math import gcd

    w_ratio, h_ratio = map(int, aspect_ratio.split(":"))
    # NxN 网格时 panel 比例 = 整图比例
    panel_w, panel_h = w_ratio, h_ratio
    if rows != cols:
        panel_w = w_ratio * rows
        panel_h = h_ratio * cols
    g = gcd(panel_w, panel_h)
    panel_w, panel_h = panel_w // g, panel_h // g
    panel_ar = panel_w / panel_h
    if panel_ar < 0.9:
        return f"{panel_w}:{panel_h} PORTRAIT - much taller than wide"
    elif panel_ar > 1.1:
        return f"{panel_w}:{panel_h} LANDSCAPE - wider than tall"
    return "SQUARE (1:1)"
