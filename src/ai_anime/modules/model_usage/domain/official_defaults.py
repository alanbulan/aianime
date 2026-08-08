"""Non-secret task defaults used when no local environment is present."""

DEFAULT_COGNEE_EMBEDDING_DIM = "1024"
DEFAULT_EMBEDDING_BATCH_SIZE = "10"

DEFAULT_FREEZONE_VISION_MODEL = "ai-anime-freezone-vision-LLM"
DEFAULT_VIDEO_PROMPT_OPTIMIZER_MODEL = "ai-anime-video-prompt-optimizer-LLM"
DEFAULT_BLOCK_WORLD_MODEL = "ai-anime-block-world-LLM"
DEFAULT_SCENE_OVERLAP_MODEL = "ai-anime-scene-overlap-vision-LLM"
DEFAULT_SCENE_SPATIAL_CONTRACT_MODEL = "ai-anime-scene-spatial-contract-LLM"
DEFAULT_GENERAL_TEXT_MODEL = "ai-anime-general-LLM"
DEFAULT_SCENE_VOXEL_MODEL = "ai-anime-scene-voxel-LLM"

DEFAULT_TEXT_MODEL_BY_ENV = {
    "MODEL_NAME": DEFAULT_GENERAL_TEXT_MODEL,
    "VOXEL_VLM_MODEL": DEFAULT_SCENE_VOXEL_MODEL,
    "HERMES_MODEL": "ai-anime-assistant-LLM",
    "GLOBAL_VIDEO_OPTIMIZER_MODEL": DEFAULT_VIDEO_PROMPT_OPTIMIZER_MODEL,
    "KEYFRAME_PROMPT_MODEL": DEFAULT_VIDEO_PROMPT_OPTIMIZER_MODEL,
    "SEEDANCE2_PROMPT_COMPOSER_MODEL": "ai-anime-seedance2-prompt-composer-LLM",
    "GLOBAL_VIDEO_IDENTITY_DETECTOR_MODEL": "ai-anime-video-identity-detector-LLM",
    "IDENTITY_PLANNER_CAST_MODEL": "ai-anime-identity-cast-planner-LLM",
    "IDENTITY_PLANNER_ANALYSIS_MODEL": "ai-anime-identity-analysis-planner-LLM",
    "IDENTITY_PLANNER_APPEARANCE_MODEL": "ai-anime-identity-appearance-writer-LLM",
    "LITERAL_BEAT_META_MODEL": "ai-anime-literal-beat-meta-LLM",
    "SCENE_BUILD_MODEL": "ai-anime-scene-builder-LLM",
    "EPISODE_SCENE_PLANNER_MODEL": "ai-anime-episode-scene-planner-LLM",
    "EPISODE_PROP_PLANNER_MODEL": "ai-anime-episode-prop-planner-LLM",
    "FREEZONE_VISION_MODEL": DEFAULT_FREEZONE_VISION_MODEL,
    "STYLE_ANALYZER_MODEL": "ai-anime-style-analyzer-LLM",
    "CONTENT_REWRITER_MODEL": "ai-anime-content-rewriter-LLM",
    "SCREENPLAY_NORMALIZER_MODEL": "ai-anime-screenplay-normalizer-LLM",
    "EPISODE_SCENE_RECONCILE_MODEL": "ai-anime-episode-scene-reconciler-LLM",
    "NARRATED_SCENE_ASSET_MODEL": "ai-anime-narrated-scene-asset-planner-LLM",
    "STAGING_PROP_MODEL": "ai-anime-staging-prop-planner-LLM",
}
