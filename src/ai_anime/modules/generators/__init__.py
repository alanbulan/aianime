"""AI anime 生成器模块。

包含图像生成、语音合成、视频合成等功能。
"""

from .image_generator import (
    ImageGenResult,
    CommercialImageGenerator,
    create_image_generator,
    generate_character_reference_unified,
    generate_identity_image_unified,
)
from .tts_generator import (
    CommercialTTSGenerator,
    TTSResult,
    create_tts_generator,
)
from .video_composer import (
    KenBurnsEffect,
    MoviePyComposer,
    SceneAsset,
    VideoComposer,
    VideoResult,
    create_video_composer,
    adjust_video_duration,
    get_video_duration,
)
from .video_generator import (
    CommercialVideoGenerator,
    ShotReference,
    VideoGenResult,
    VideoGenStatus,
    VideoGeneratorBase,
    create_video_generator,
)
from .nanobanana_grid import (
    GridGenerationRequest,
    GridGenerationResult,
    NanoBananaGridGenerator,
    create_grid_generator,
    get_optimal_grid_size,
)
from .prompt_builder import (
    PromptMode,
    GridConfig,
    CharacterConfig,
    StyleConfig,
    PromptContext,
    PromptComponents,
    UnifiedPromptBuilder,
    create_prompt_context,
)
from .grid_splitter import (
    split_grid,
    split_grid_with_padding,
    detect_grid_layout,
    resize_frames_to_portrait,
    combine_to_grid,
)

__all__ = [
    # Image Generator
    "ImageGenResult",
    "CommercialImageGenerator",
    "create_image_generator",
    "generate_character_reference_unified",
    "generate_identity_image_unified",
    # TTS Generator
    "TTSResult",
    "CommercialTTSGenerator",
    "create_tts_generator",
    # Video Composer
    "SceneAsset",
    "VideoResult",
    "KenBurnsEffect",
    "VideoComposer",
    "MoviePyComposer",
    "create_video_composer",
    "adjust_video_duration",
    "get_video_duration",
    # Video Generator
    "VideoGenStatus",
    "VideoGenResult",
    "VideoGeneratorBase",
    "CommercialVideoGenerator",
    "ShotReference",
    "create_video_generator",
    # NanoBananaPro Grid Generator
    "GridGenerationRequest",
    "GridGenerationResult",
    "NanoBananaGridGenerator",
    "create_grid_generator",
    "get_optimal_grid_size",
    # Grid Splitter
    "split_grid",
    "split_grid_with_padding",
    "detect_grid_layout",
    "resize_frames_to_portrait",
    "combine_to_grid",
    # Unified Prompt Builder
    "PromptMode",
    "GridConfig",
    "CharacterConfig",
    "StyleConfig",
    "PromptContext",
    "PromptComponents",
    "UnifiedPromptBuilder",
    "create_prompt_context",
]
