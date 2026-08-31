"""Compatibility facade for prompt models, components, and strategies."""

from typing import Any, Dict, List

from ai_anime.modules.production.infrastructure.media_generation_settings import (
    IMAGE_DEFAULT_STYLE,
)
from ai_anime.modules.production.infrastructure.media_generation.prompt_components import (
    PromptComponents as PromptComponents,
)
from ai_anime.modules.production.infrastructure.media_generation.prompt_models import (
    CharacterConfig as CharacterConfig,
    GridConfig as GridConfig,
    PromptContext as PromptContext,
    PromptMode as PromptMode,
    StyleConfig as StyleConfig,
    default_ethnicity_instruction as default_ethnicity_instruction,
)
from ai_anime.modules.production.infrastructure.media_generation.prompt_strategies import (
    ActionStoryboardStrategy as ActionStoryboardStrategy,
    RenderModeStrategy as RenderModeStrategy,
    SketchModeStrategy as SketchModeStrategy,
    UnifiedPromptBuilder as UnifiedPromptBuilder,
)

__all__ = [
    "ActionStoryboardStrategy",
    "CharacterConfig",
    "GridConfig",
    "PromptComponents",
    "PromptContext",
    "PromptMode",
    "RenderModeStrategy",
    "SketchModeStrategy",
    "StyleConfig",
    "UnifiedPromptBuilder",
    "create_prompt_context",
    "default_ethnicity_instruction",
]


def create_prompt_context(
    mode: PromptMode,
    beats: List[dict],
    rows: int,
    cols: int,
    character_map: Dict[str, dict] = None,
    style: str = None,
    ethnicity: str = "Chinese",
    aspect_ratio: str = None,
    is_portrait_panel: bool = None,
    image_aspect_ratio: str = "",
    panel_detected_keys: Dict[int, set] = None,
    scene_refs: Dict[int, List[Any]] = None,
    prop_asset_refs: Dict[int, List[Any]] = None,
    sketch_colors: Dict[str, str] = None,
    prop_marker_colors: Dict[str, str] = None,
    style_family: str = "",
    animation_subtype: str = "",
    project_dir: str = "",
    image_model: str = "",
) -> PromptContext:
    """创建提示词上下文的便捷函数。

    Args:
        mode: 提示词模式
        beats: Beat 数据列表
        rows: 网格行数
        cols: 网格列数
        character_map: 角色映射 {角色名: {...}}
        style: 风格名称
        ethnicity: 种族
        aspect_ratio: 宽高比（可选，自动推断）
        is_portrait_panel: 是否竖屏 panel（可选，自动推断）

    Returns:
        PromptContext 实例
    """
    # 自动推断 aspect_ratio 和 is_portrait_panel
    from ai_anime.modules.production.infrastructure.media_generation.image_grid import (
        REGEN_MODE_CONFIGS,
        SKETCH_GRID_CONFIG,
    )

    # Sketch 模式：使用独立配置
    if mode == PromptMode.SKETCH:
        if aspect_ratio is None:
            aspect_ratio = SKETCH_GRID_CONFIG["aspect_ratio"]
        if is_portrait_panel is None:
            w_ratio, h_ratio = map(int, aspect_ratio.split(":"))
            panel_ar = (w_ratio / cols) / (h_ratio / rows)
            is_portrait_panel = panel_ar < 0.9
    else:
        if aspect_ratio is None:
            # 从 REGEN_MODE_CONFIGS 查找匹配 (rows, cols) 的配置
            for _mk, _cfg in REGEN_MODE_CONFIGS.items():
                if _cfg["rows"] == rows and _cfg["cols"] == cols:
                    aspect_ratio = _cfg["aspect_ratio"]
                    break
            else:
                aspect_ratio = "1:1"

        if is_portrait_panel is None:
            w_ratio, h_ratio = map(int, aspect_ratio.split(":"))
            panel_ar = (w_ratio / cols) / (h_ratio / rows)
            is_portrait_panel = panel_ar < 0.9

    grid_config = GridConfig(
        rows=rows,
        cols=cols,
        aspect_ratio=aspect_ratio,
        image_aspect_ratio=image_aspect_ratio,
        is_portrait_panel=is_portrait_panel,
    )

    # 转换 character_map 为 CharacterConfig
    characters = {}
    if character_map:
        for char_name, info in character_map.items():
            input_mode = info.get("reference_mode", "prompt_only")
            characters[char_name] = CharacterConfig(
                name=char_name,
                face_prompt=info.get("face_prompt", ""),
                base_prompt=info.get("base_prompt", char_name),
                appearance_details=info.get("appearance_details", ""),
                gender=info.get("gender", ""),
                body_type=info.get("body_type", ""),
                reference_path=info.get("reference_path")
                or info.get("portrait_path")
                or info.get("ref_path"),
                reference_mode=input_mode,
                identity_appearances=info.get("identity_appearances", {}),
                sketch_color=info.get("sketch_color", ""),
                identity_sketch_colors=info.get("identity_sketch_colors", {}),
                identity_ref_images=info.get("identity_ref_images", {}),
                identity_face_prompts=info.get("identity_face_prompts", {}),
                identity_body_types=info.get("identity_body_types", {}),
            )

    # 创建风格配置
    style_config = StyleConfig(
        style_name=style or IMAGE_DEFAULT_STYLE,
        project_dir=project_dir,
        style_family=style_family,
        animation_subtype=animation_subtype,
    )

    return PromptContext(
        grid=grid_config,
        characters=characters,
        style=style_config,
        beats=beats,
        mode=mode,
        ethnicity=ethnicity,
        panel_detected_keys=panel_detected_keys,
        scene_refs=scene_refs or {},
        prop_asset_refs=prop_asset_refs or {},
        sketch_colors=sketch_colors or {},
        prop_marker_colors=prop_marker_colors or {},
        image_model=image_model,
    )
