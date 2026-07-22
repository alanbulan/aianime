"""Non-secret official defaults used when no local environment is present."""

import os

OFFICIAL_NEWAPI_BASE_URL = (
    os.environ.get("AI_ANIME_CLOUD_API_URL", "").strip().rstrip("/")
    or "https://api.ai-anime.invalid/v1"
)

DEFAULT_COGNEE_LLM_PROVIDER = "newapi"
DEFAULT_COGNEE_LLM_MODEL = "ai-anime-cognee-LLM"
DEFAULT_COGNEE_EMBEDDING_PROVIDER = "newapi"
DEFAULT_COGNEE_EMBEDDING_MODEL = "ai-anime-cognee-embedding"
DEFAULT_COGNEE_EMBEDDING_DIM = "1024"
DEFAULT_EMBEDDING_BATCH_SIZE = "10"

DEFAULT_FREEZONE_TRANSLATION_MODEL = "ai-anime-freezone-translator-LLM"
DEFAULT_FREEZONE_STORY_SCRIPT_MODEL = "ai-anime-freezone-story-script-writer-LLM"
DEFAULT_FREEZONE_VISION_MODEL = "ai-anime-freezone-vision-LLM"
DEFAULT_VIDEO_PROMPT_OPTIMIZER_MODEL = "ai-anime-video-prompt-optimizer-LLM"

DEFAULT_TEXT_MODEL_BY_ENV = {
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
    "FREEZONE_TRANSLATION_MODEL": DEFAULT_FREEZONE_TRANSLATION_MODEL,
    "FREEZONE_STORY_SCRIPT_MODEL": DEFAULT_FREEZONE_STORY_SCRIPT_MODEL,
    "FREEZONE_VISION_MODEL": DEFAULT_FREEZONE_VISION_MODEL,
    "STYLE_ANALYZER_MODEL": "ai-anime-style-analyzer-LLM",
    "CONTENT_REWRITER_MODEL": "ai-anime-content-rewriter-LLM",
    "SCREENPLAY_NORMALIZER_MODEL": "ai-anime-screenplay-normalizer-LLM",
    "EPISODE_SCENE_RECONCILE_MODEL": "ai-anime-episode-scene-reconciler-LLM",
    "NARRATED_SCENE_ASSET_MODEL": "ai-anime-narrated-scene-asset-planner-LLM",
    "STAGING_PROP_MODEL": "ai-anime-staging-prop-planner-LLM",
    "COGNEE_LLM_MODEL": DEFAULT_COGNEE_LLM_MODEL,
}
