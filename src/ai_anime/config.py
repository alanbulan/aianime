"""AI anime 配置模块。

独立的配置系统，不依赖 SuperScript。
"""

import os
import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from dotenv import load_dotenv
from ai_anime.official_defaults import (
    DEFAULT_GENERAL_TEXT_MODEL,
    DEFAULT_TEXT_MODEL_BY_ENV,
)

# 加载环境变量（必须在任何其他导入之前）
load_dotenv()

_TEXT_MODEL_IDEMPOTENCY_KEY: ContextVar[str] = ContextVar(
    "ai_anime_text_model_idempotency_key",
    default="",
)

def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def get_pydantic_model(
    model_name_override: str | None = None,
):
    """Return a PydanticAI model through the selected cloud/BYOK transport."""
    return get_newapi_text_pydantic_model(
        "MODEL_NAME",
        DEFAULT_GENERAL_TEXT_MODEL,
        model_name_override=model_name_override,
        model_name_override_is_internal=True,
        timeout_seconds_override=_env_float("MODEL_TIMEOUT", 120.0),
    )


def _clean_env_value(name: str | None) -> str | None:
    if not name:
        return None
    value = os.environ.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def get_newapi_text_model_name(model_env: str, default_model: str) -> str:
    """Return the logical newAPI text model for a path-specific task."""
    return _clean_env_value(model_env) or DEFAULT_TEXT_MODEL_BY_ENV.get(
        model_env, default_model
    )


def _get_newapi_text_model_profile(model_name: str):
    """Attach Gemini-compatible model profile while routing through newAPI."""
    normalized = (model_name or "").strip()
    if not normalized.startswith("gemini-") or "image" in normalized:
        return None

    from pydantic_ai.providers.openrouter import OpenRouterProvider

    return OpenRouterProvider.model_profile(f"google/{normalized}")


def _newapi_text_http_client_factory(
    *,
    timeout_seconds: float,
    omit_authorization: bool = False,
) -> Any:
    trust_env = _env_bool("NEWAPI_TEXT_TRUST_ENV", True)

    def factory():
        import httpx

        kwargs: dict[str, Any] = {"timeout": timeout_seconds}
        if not trust_env:
            kwargs["trust_env"] = False

        async def prepare_model_request(request: httpx.Request) -> None:
            if (
                omit_authorization
                and request.headers.get("Authorization") == "Bearer ai-anime-no-auth"
            ):
                request.headers.pop("Authorization", None)
            idempotency_key = _TEXT_MODEL_IDEMPOTENCY_KEY.get()
            if (
                idempotency_key
                and request.method.upper() not in {"GET", "HEAD", "OPTIONS"}
                and "Idempotency-Key" not in request.headers
            ):
                request.headers["Idempotency-Key"] = idempotency_key

        kwargs["event_hooks"] = {"request": [prepare_model_request]}
        return httpx.AsyncClient(**kwargs)

    return factory


def _newapi_text_openai_provider(
    *,
    api_key: str,
    base_url: str,
    timeout_seconds: float,
):
    from openai import AsyncOpenAI
    from pydantic_ai.providers.openai import OpenAIProvider

    class _LifecycleManagedOpenAIProvider(OpenAIProvider):
        def __init__(self) -> None:
            omit_authorization = not str(api_key or "").strip()
            http_client_factory = _newapi_text_http_client_factory(
                timeout_seconds=timeout_seconds,
                omit_authorization=omit_authorization,
            )
            http_client = http_client_factory()
            super().__init__(
                openai_client=AsyncOpenAI(
                    api_key=api_key or "ai-anime-no-auth",
                    base_url=base_url,
                    timeout=timeout_seconds,
                    max_retries=1,
                    http_client=http_client,
                ),
            )
            self._own_http_client = http_client
            self._http_client_factory = http_client_factory

    return _LifecycleManagedOpenAIProvider()


def _newapi_text_openai_model(
    model_name: str,
    *,
    api_key: str,
    base_url: str,
    timeout_seconds: float,
    profile: Any,
):
    from contextlib import asynccontextmanager

    from pydantic_ai.models.openai import OpenAIChatModel

    class _AutoClosingOpenAIChatModel(OpenAIChatModel):
        async def request(self, *args: Any, **kwargs: Any) -> Any:
            token = _TEXT_MODEL_IDEMPOTENCY_KEY.set(str(uuid.uuid4()))
            try:
                async with self:
                    return await super().request(*args, **kwargs)
            finally:
                _TEXT_MODEL_IDEMPOTENCY_KEY.reset(token)

        @asynccontextmanager
        async def request_stream(self, *args: Any, **kwargs: Any):
            token = _TEXT_MODEL_IDEMPOTENCY_KEY.set(str(uuid.uuid4()))
            try:
                async with self:
                    async with super().request_stream(*args, **kwargs) as response:
                        yield response
            finally:
                _TEXT_MODEL_IDEMPOTENCY_KEY.reset(token)

    return _AutoClosingOpenAIChatModel(
        model_name,
        provider=_newapi_text_openai_provider(
            api_key=api_key,
            base_url=base_url,
            timeout_seconds=timeout_seconds,
        ),
        profile=profile,
    )


def get_newapi_text_pydantic_model(
    model_env: str,
    default_model: str,
    *,
    model_name_override: str | None = None,
    model_name_override_is_internal: bool = False,
    timeout_seconds_override: float | None = None,
):
    """Create a PydanticAI OpenAI-compatible model that routes through newAPI."""
    explicit_model = str(model_name_override or "").strip()
    logical_model = explicit_model or get_newapi_text_model_name(model_env, default_model)
    from ai_anime.model_access_policy import (
        resolve_internal_model_for_role,
        resolve_model_for_role,
    )

    model_name = (
        resolve_internal_model_for_role(logical_model, "TEXT")
        if model_name_override_is_internal or not explicit_model
        else resolve_model_for_role(logical_model, "TEXT")
    )
    api_key, base_url = get_newapi_runtime_credentials()
    if not base_url:
        raise ValueError("Model Base URL is not configured.")
    timeout_seconds = (
        float(timeout_seconds_override)
        if timeout_seconds_override is not None
        else _env_float(
            f"{model_env}_TIMEOUT_SECONDS",
            _env_float("NEWAPI_TEXT_TIMEOUT_SECONDS", 120.0),
        )
    )
    return _newapi_text_openai_model(
        model_name,
        api_key=api_key,
        base_url=base_url,
        timeout_seconds=timeout_seconds,
        profile=_get_newapi_text_model_profile(model_name),
    )


def get_newapi_text_pydantic_model_settings(
    thinking_env: str,
    default_thinking_level: str,
) -> dict | None:
    """Build PydanticAI model settings for a newAPI text task."""
    thinking_level = get_text_thinking_level(thinking_env, default_thinking_level)
    reasoning_effort = _normalize_openai_compat_reasoning_effort(thinking_level)
    if not reasoning_effort:
        return None
    return {"openai_reasoning_effort": reasoning_effort}


def get_superpower_pydantic_model(
    *,
    feature_model_env: str | None = None,
):
    """Return a task-selected model through the process model-access mode."""
    model_name_override = (
        _clean_env_value(feature_model_env)
        or _clean_env_value("SUPERPOWER_MODEL")
        or _clean_env_value("SUPERPOWER_MODEL_NAME")
    )
    return get_pydantic_model(model_name_override=model_name_override)


def get_pydantic_model_settings(
    *,
    max_tokens: int | None = None,
    thinking_level_override: str | None = None,
) -> dict | None:
    """Build settings for the OpenAI-compatible cloud/BYOK transport."""
    thinking_level = (
        thinking_level_override
        or os.environ.get("MODEL_THINKING_LEVEL")
        or "low"
    )

    settings: dict[str, object] = {}
    if max_tokens is not None:
        settings["max_tokens"] = max_tokens

    if thinking_level:
        reasoning_effort = _normalize_openai_compat_reasoning_effort(thinking_level)
        if reasoning_effort:
            settings["openai_reasoning_effort"] = reasoning_effort

    return settings or None


def get_text_thinking_level(env_name: str, default: str) -> str:
    """Read a path-specific thinking level.

    Missing env vars use the caller default. Explicit empty env vars mean
    "do not send a thinking/reasoning setting" for that path.
    """
    return os.environ.get(env_name, default).strip()


_OPENAI_COMPAT_REASONING_EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}


def _normalize_openai_compat_reasoning_effort(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in _OPENAI_COMPAT_REASONING_EFFORTS else ""


def get_newapi_reasoning_kwargs(
    *,
    thinking_env: str | None = None,
    default_thinking_level: str | None = None,
) -> dict:
    """Build reasoning kwargs for OpenAI-compatible newAPI/Cognee calls.

    Explicit empty env values disable sending reasoning parameters.
    Both supported access modes use an OpenAI-compatible request shape.
    """
    if thinking_env and thinking_env in os.environ:
        thinking_level = os.environ.get(thinking_env, "").strip()
    elif default_thinking_level is not None:
        thinking_level = default_thinking_level
    else:
        thinking_level = os.environ.get("MODEL_THINKING_LEVEL", "").strip()
    reasoning_effort = _normalize_openai_compat_reasoning_effort(thinking_level)
    if not reasoning_effort:
        return {}
    return {
        "reasoning_effort": reasoning_effort,
        "allowed_openai_params": ["reasoning_effort"],
    }


# Redis 配置
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


# =============================================================================
# 基础配置
# =============================================================================

# 数据根目录，三类子目录 (output/state/runtime) 默认基于此目录派生
DATA_ROOT = os.path.abspath(os.environ.get("AI_ANIME_DATA_ROOT", "."))

# 使用绝对路径，确保 task worker 也能找到正确的目录
OUTPUT_DIR = os.path.abspath(
    os.environ.get("AI_ANIME_OUTPUT_DIR", os.path.join(DATA_ROOT, "output"))
)

# 状态文件目录 (data.db, cognee_system/, project_config.json)
STATE_DIR = os.path.abspath(
    os.environ.get("AI_ANIME_STATE_DIR", os.path.join(DATA_ROOT, "state"))
)

# 运行时临时目录 (日志、staging、temp panels)
RUNTIME_DIR = os.path.abspath(
    os.environ.get("AI_ANIME_RUNTIME_DIR", os.path.join(DATA_ROOT, "runtime"))
)

# =============================================================================
# OSS presign 配置
# =============================================================================

OSS_ENDPOINT = os.environ.get("OSS_ENDPOINT")
OSS_PUBLIC_ENDPOINT = os.environ.get("OSS_PUBLIC_ENDPOINT")
OSS_BUCKET = os.environ.get("OSS_BUCKET")
OSS_ACCESS_KEY_ID = os.environ.get("OSS_ACCESS_KEY_ID")
OSS_ACCESS_KEY_SECRET = os.environ.get("OSS_ACCESS_KEY_SECRET")
OSS_OBJECT_PREFIX = os.environ.get("OSS_OBJECT_PREFIX", "output")
DOWNLOAD_VIA_OSS = os.environ.get("DOWNLOAD_VIA_OSS", "1") not in {
    "0",
    "false",
    "False",
    "",
}
STATIC_VIA_OSS = os.environ.get("STATIC_VIA_OSS", "1") not in {
    "0",
    "false",
    "False",
    "",
}
OSS_STATIC_REQUIRE_READY = os.environ.get("OSS_STATIC_REQUIRE_READY", "1") not in {
    "0",
    "false",
    "False",
    "",
}
OSS_STATIC_READY_PROBE_ATTEMPTS = int(os.environ.get("OSS_STATIC_READY_PROBE_ATTEMPTS", "3"))
OSS_STATIC_READY_PROBE_DELAY_SECONDS = float(
    os.environ.get("OSS_STATIC_READY_PROBE_DELAY_SECONDS", "0.15")
)
OSS_PRESIGN_EXPIRES = int(os.environ.get("OSS_PRESIGN_EXPIRES", "900"))
OSS_STATIC_PRESIGN_EXPIRES = int(os.environ.get("OSS_STATIC_PRESIGN_EXPIRES", "3600"))


# =============================================================================
# IndexTTS2 配置
# =============================================================================

INDEXTTS2_TIMEOUT_SECONDS = float(os.environ.get("INDEXTTS2_TIMEOUT_SECONDS", "1800"))

def get_effective_newapi_gateway_config():
    """Return the selected cloud-proxy or BYOK runtime endpoint."""
    from ai_anime.model_gateway_settings import get_effective_newapi_config

    return get_effective_newapi_config()


def get_newapi_runtime_credentials() -> tuple[str, str]:
    """Resolve the single process-wide cloud-proxy or BYOK endpoint."""

    gateway = get_effective_newapi_gateway_config()
    return str(gateway.api_key or "").strip(), str(gateway.base_url or "").strip()


def get_model_access_json_transport() -> tuple[str, dict[str, str]]:
    """Return the process-wide model endpoint and JSON request headers."""
    api_key, base_url = get_newapi_runtime_credentials()
    if not base_url:
        raise ValueError("Model Base URL is not configured.")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return base_url.rstrip("/"), headers


def get_model_access_openai_client(*, timeout_seconds: float = 120.0):
    """Create one synchronous OpenAI-compatible model operation client."""
    import httpx
    from openai import OpenAI

    api_key, base_url = get_newapi_runtime_credentials()
    if not base_url:
        raise ValueError("Model Base URL is not configured.")

    event_hooks: dict[str, list[Any]] = {}
    if not api_key:

        def strip_placeholder_authorization(request: httpx.Request) -> None:
            if request.headers.get("Authorization") == "Bearer ai-anime-no-auth":
                request.headers.pop("Authorization", None)

        event_hooks["request"] = [strip_placeholder_authorization]

    http_client = httpx.Client(
        timeout=timeout_seconds,
        event_hooks=event_hooks,
    )
    return OpenAI(
        api_key=api_key or "ai-anime-no-auth",
        base_url=base_url,
        timeout=timeout_seconds,
        max_retries=1,
        default_headers={"Idempotency-Key": str(uuid.uuid4())},
        http_client=http_client,
    )


INDEXTTS2_RECORD_PROVIDER = "commercial"


IMAGE_DEFAULT_WIDTH = int(os.environ.get("IMAGE_DEFAULT_WIDTH", "1440"))
IMAGE_DEFAULT_HEIGHT = int(os.environ.get("IMAGE_DEFAULT_HEIGHT", "2560"))
IMAGE_DEFAULT_STYLE = os.environ.get("IMAGE_DEFAULT_STYLE", "chinese_period_drama")

# 风格预设统一由 src/ai_anime/styles/presets/*.json 提供。


def get_style_preset(
    style: str = None,
    *,
    username: str | None = None,
    project: str | None = None,
    project_dir: str | None = None,
) -> dict:
    """获取视觉风格预设配置。

    Args:
        style: 风格名称，默认使用 IMAGE_DEFAULT_STYLE

    Returns:
        风格预设字典
    """
    style = style or IMAGE_DEFAULT_STYLE

    from ai_anime.modules.asset_world.public import StyleService

    config = StyleService.get_style(
        style,
        username=username,
        project=project,
        project_dir=project_dir,
    )
    if not config:
        raise KeyError(f"Style '{style}' not found")
    return config.to_legacy_dict()


# =============================================================================
# LLM 临时媒体中转（给 newAPI/视觉模型拉取本地参考图）
# =============================================================================

MEDIA_RELAY_PROVIDER = os.environ.get("MEDIA_RELAY_PROVIDER", "aliyun_oss").strip().lower()
MEDIA_RELAY_TTL_SECONDS = int(os.environ.get("MEDIA_RELAY_TTL_SECONDS", "1800"))

OSS_RELAY_ENDPOINT = os.environ.get("OSS_RELAY_ENDPOINT", "oss-cn-chengdu.aliyuncs.com")
OSS_RELAY_BUCKET = os.environ.get("OSS_RELAY_BUCKET", "ai-anime-media-relay")
OSS_RELAY_AK = os.environ.get("OSS_RELAY_AK", "")
OSS_RELAY_SK = os.environ.get("OSS_RELAY_SK", "")

CLOUDINARY_RELAY_CLOUD_NAME = os.environ.get("CLOUDINARY_RELAY_CLOUD_NAME", "")
CLOUDINARY_RELAY_API_KEY = os.environ.get("CLOUDINARY_RELAY_API_KEY", "")
CLOUDINARY_RELAY_API_SECRET = os.environ.get("CLOUDINARY_RELAY_API_SECRET", "")
CLOUDINARY_RELAY_FOLDER = os.environ.get("CLOUDINARY_RELAY_FOLDER", "")


def get_style_labels() -> dict[str, str]:
    """获取风格 ID -> 显示标签的映射。

    Returns:
        {style_id: label} 字典
    """
    from ai_anime.modules.asset_world.public import StyleService

    return StyleService.get_style_labels()


def list_available_styles() -> list[dict]:
    """列出所有可用风格（预设 + 自定义）。

    Returns:
        风格列表，每项包含 {id, name, label, type}
    """
    from ai_anime.modules.asset_world.public import StyleService

    return StyleService.list_all_styles()


# =============================================================================
# 标准音频模型配置
# =============================================================================

TTS_MODEL = os.environ.get("TTS_MODEL", "").strip()
TTS_VOICE = os.environ.get("TTS_VOICE", "").strip()
TTS_SPEECH_RATE = float(os.environ.get("TTS_SPEECH_RATE", "1.0"))
TTS_RESPONSE_FORMAT = os.environ.get("TTS_RESPONSE_FORMAT", "mp3").strip()
TTS_TIMEOUT_SECONDS = float(os.environ.get("TTS_TIMEOUT_SECONDS", "600"))


def get_tts_config() -> dict:
    """获取 TTS 配置。"""
    return {
        "model": TTS_MODEL,
        "voice": TTS_VOICE,
        "speech_rate": TTS_SPEECH_RATE,
        "response_format": TTS_RESPONSE_FORMAT,
        "timeout_seconds": TTS_TIMEOUT_SECONDS,
    }


# =============================================================================
# 视频合成配置
# =============================================================================

FFMPEG_PATH = os.environ.get("FFMPEG_PATH", "ffmpeg")
VIDEO_FPS = int(os.environ.get("VIDEO_FPS", "30"))
VIDEO_WIDTH = int(os.environ.get("VIDEO_WIDTH", "1080"))
VIDEO_HEIGHT = int(os.environ.get("VIDEO_HEIGHT", "1920"))
VIDEO_CODEC = os.environ.get("VIDEO_CODEC", "libx264")
VIDEO_AUDIO_CODEC = os.environ.get("VIDEO_AUDIO_CODEC", "aac")
VIDEO_BITRATE = os.environ.get("VIDEO_BITRATE", "4M")

KEN_BURNS_ZOOM_RANGE = (1.0, 1.15)
KEN_BURNS_PAN_SPEED = 0.02

# =============================================================================
# AI 视频生成配置（图生视频）
# =============================================================================


DEFAULT_VIDEO_RESOLUTION = os.environ.get("DEFAULT_VIDEO_RESOLUTION", "720p").strip()


def get_video_config() -> dict:
    """获取视频配置。"""
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


# =============================================================================
# 图像生成配置（统一 commercial model access）
# =============================================================================

OPENAI_IMAGE_QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "medium")
OPENAI_SKETCH_IMAGE_QUALITY = os.environ.get("OPENAI_SKETCH_IMAGE_QUALITY", "low")

# 网格生成模式配置
# 竖屏 Panel 模式（每格竖屏，适合 I2V）：
# "1x1" - 单张生成（1K 分辨率，panel 高度 1376）
# "1x3" - 横向三格（panel 高度 877，竖屏 0.78）
# "1x4" - 横向四格（panel 高度 1097，竖屏 0.58）官方推荐 3-4 panel comic
# "3x2" - 6 panels（panel 高度 1365 ✓，竖屏 0.84）
# "4x3" - 12 panels（panel 高度 1024 ✓，竖屏 0.75）最优
# "5x4" - 20 panels（panel 高度 819，竖屏 0.70）
# 正方形 Panel 模式：
# "2x2" - 紧凑四格
# "3x3" - 分批生成（更稳定）
# "4x4" - 分批生成（中等，panel 高度 1024 ✓）
# "5x5" - 批量生成，最大 25 面板
GRID_MODE = os.environ.get("GRID_MODE", "1x1")

# 网格尺寸配置表
# 格式: mode -> (rows, cols, batch_size)
MODE_CONFIG = {
    # 竖屏 Panel 模式（每格竖屏，适合 I2V）
    "1x1": (1, 1, 1),
    "1x2": (1, 2, 2),  # panel 0.89 竖屏
    "1x3": (1, 3, 3),  # panel 0.78 竖屏 ✓
    "1x4": (1, 4, 4),  # panel 0.58 竖屏 ✓ 官方推荐
    "3x2": (3, 2, 6),  # panel 0.84 竖屏, 高度 1365 ✓
    "4x3": (4, 3, 12),  # panel 0.75 竖屏 ✓ 最优
    "5x4": (5, 4, 20),  # panel 0.70 竖屏 ✓
    # 正方形 Panel 模式
    "2x2": (2, 2, 4),
    "3x3": (3, 3, 9),
    "4x4": (4, 4, 16),
    "5x5": (5, 5, 25),
}

# 网格尺寸配置（根据 GRID_MODE 自动设置）
if GRID_MODE in MODE_CONFIG:
    GRID_ROWS, GRID_COLS, GRID_BATCH_SIZE = MODE_CONFIG[GRID_MODE]
else:
    # 默认使用 1x1
    GRID_ROWS, GRID_COLS, GRID_BATCH_SIZE = 1, 1, 1
GRID_TOTAL_PANELS = 25  # 动态优化时的最大面板数


def _image_provider_config(
    *,
    model_override: str | None = None,
) -> dict:
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
) -> dict:
    """Resolve an image model through the selected cloud/BYOK runtime."""
    provider_config = _image_provider_config(
        model_override=model_override,
    )

    return {
        "provider": provider_config["provider"],
        "access_mode": provider_config["access_mode"],
        "model": provider_config["model"],
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
) -> dict:
    """Resolve the sketch image model through the selected runtime."""
    config = get_grid_generation_config(
        model_override=model_override,
    )
    config["openai_image_quality"] = OPENAI_SKETCH_IMAGE_QUALITY
    config["image_size"] = "1K"
    return config


def get_render_generation_config(
    model_override: str | None = None,
) -> dict:
    """获取首帧渲染图像配置。"""
    return get_grid_generation_config(
        model_override=model_override,
    )


# =============================================================================
# 草图（Sketch）路径管理
# =============================================================================


def get_sketch_dir(project_name: str, episode: int) -> str:
    """获取整集草图存放目录。

    Args:
        project_name: 项目名称（如 admin/test1）
        episode: 集数

    Returns:
        草图目录路径，如 output/admin/test1/grids/ep001/sketch
    """
    base_dir = os.path.abspath(os.path.join(OUTPUT_DIR, project_name))
    return os.path.join(base_dir, "grids", f"ep{episode:03d}", "sketch")


def get_sketch_path(project_name: str, episode: int, sketch_index: int = 1) -> str:
    """获取整集草图路径（已弃用，保留向后兼容）。

    新模式下草图文件名为 sketch_b{start}-{end}_{rows}x{cols}.jpg，
    建议使用 list_sketch_files() 遍历草图目录。

    Args:
        project_name: 项目名称（如 admin/test1）
        episode: 集数
        sketch_index: 草图索引（1-based），默认为 1

    Returns:
        草图目录路径（新模式下返回目录而非具体文件）
    """
    return get_sketch_dir(project_name, episode)


def list_sketch_files(project_name: str, episode: int) -> list[str]:
    """列出指定集的所有草图文件。

    支持新命名约定: sketch_b{start}-{end}_{rows}x{cols}.jpg

    Args:
        project_name: 项目名称
        episode: 集数

    Returns:
        草图文件路径列表（按文件名排序）
    """
    sketch_dir = get_sketch_dir(project_name, episode)
    if not os.path.exists(sketch_dir):
        return []

    import glob

    pattern = os.path.join(sketch_dir, "sketch_b*_*x*.jpg")
    files = glob.glob(pattern)
    return sorted(files)


# =============================================================================
# 项目管理
# =============================================================================


def get_project_dir(project_name: str) -> str:
    """获取项目输出目录。"""
    return os.path.join(OUTPUT_DIR, project_name)


def ensure_project_dirs(project_name: str) -> dict[str, str]:
    """确保项目目录结构存在，返回资源目录路径。

    `project_name` 可为 `username/project` 或历史单目录格式 `project`。
    当包含用户名时，会同时确保 output/state/runtime 三类目录存在。
    """
    base_dir = os.path.abspath(get_project_dir(project_name))

    parts = project_name.split("/", 1)
    if len(parts) == 2:
        from ai_anime.utils.project_paths import ProjectPaths

        paths = ProjectPaths(parts[0], parts[1])
        paths.ensure_dirs()
        paths.bootstrap_from_legacy_output()

    dirs = {
        "base": base_dir,
        "graph": os.path.join(base_dir, "graph"),
        "assets": os.path.join(base_dir, "assets"),
        "characters": os.path.join(base_dir, "assets", "characters"),
        "scripts": os.path.join(base_dir, "scripts"),
        "images": os.path.join(base_dir, "images"),
        "frames": os.path.join(base_dir, "frames"),  # 首帧图片
        "audio": os.path.join(base_dir, "audio"),
        "videos": os.path.join(base_dir, "videos"),
    }

    for path in dirs.values():
        os.makedirs(path, exist_ok=True)

    return dirs


def ensure_project_dirs_at_paths(
    *,
    output_dir: str | os.PathLike[str],
    state_dir: str | os.PathLike[str],
    runtime_dir: str | os.PathLike[str],
) -> dict[str, str]:
    """Ensure project directories from registry paths without legacy bootstrap."""
    base_dir = os.path.abspath(os.fspath(output_dir))
    dirs = {
        "base": base_dir,
        "graph": os.path.join(base_dir, "graph"),
        "assets": os.path.join(base_dir, "assets"),
        "characters": os.path.join(base_dir, "assets", "characters"),
        "scripts": os.path.join(base_dir, "scripts"),
        "images": os.path.join(base_dir, "images"),
        "frames": os.path.join(base_dir, "frames"),
        "audio": os.path.join(base_dir, "audio"),
        "videos": os.path.join(base_dir, "videos"),
        "state": os.path.abspath(os.fspath(state_dir)),
        "runtime": os.path.abspath(os.fspath(runtime_dir)),
        "logs": os.path.join(os.path.abspath(os.fspath(runtime_dir)), "logs"),
        "staging": os.path.join(os.path.abspath(os.fspath(runtime_dir)), "staging"),
        "temp_sketch_panels": os.path.join(
            os.path.abspath(os.fspath(runtime_dir)),
            "temp_sketch_panels",
        ),
    }

    for path in dirs.values():
        os.makedirs(path, exist_ok=True)

    return dirs
