"""Stable application API exposed by Model Usage."""

from contextvars import Token

from ai_anime.modules.model_usage.application import (
    CreditQuotePort,
    GenerationCreditQueries,
    GenerationModelCatalog,
    ProviderInstrumentation,
    UsageMeter,
)
from ai_anime.modules.model_usage.domain import (
    BILLING_RULE_NOT_CONFIGURED_CODE,
    BILLING_RULE_NOT_CONFIGURED_MESSAGE,
    GENERATION_BILLING_UNITS,
    INSUFFICIENT_CREDITS_CODE,
    INSUFFICIENT_CREDITS_MESSAGE,
    BillingRuleNotConfiguredError,
    CreditQuote,
    GenerationCreditCost,
    GenerationCreditKind,
    GenerationCreditSurface,
    InvalidGenerationCreditRequest,
    InsufficientCreditsError,
    InsufficientCreditsStop,
    billing_rule_not_configured_payload,
    find_billing_rule_not_configured_error,
    find_insufficient_credits_error,
    find_insufficient_credits_stop,
    insufficient_credits_payload,
    is_insufficient_credits_error,
    iter_exception_chain,
)
from ai_anime.modules.model_usage.domain.official_defaults import (
    DEFAULT_BLOCK_WORLD_MODEL,
    DEFAULT_COGNEE_EMBEDDING_DIM,
    DEFAULT_EMBEDDING_BATCH_SIZE,
    DEFAULT_FREEZONE_VISION_MODEL,
    DEFAULT_GENERAL_TEXT_MODEL,
    DEFAULT_SCENE_OVERLAP_MODEL,
    DEFAULT_SCENE_SPATIAL_CONTRACT_MODEL,
    DEFAULT_SCENE_VOXEL_MODEL,
    DEFAULT_TEXT_MODEL_BY_ENV,
    DEFAULT_VIDEO_PROMPT_OPTIMIZER_MODEL,
)
from ai_anime.modules.model_usage.domain.model_route import (
    ModelRoute,
    resolve_model_route,
)
from ai_anime.modules.model_usage.infrastructure.audio_request_usage import (
    count_audio_scope_attempts,
    get_audio_request_usage_db_path,
    record_audio_generation_attempt,
    update_audio_generation_attempt,
)
from ai_anime.modules.model_usage.infrastructure.image_request_usage import (
    count_image_scope_attempts,
    get_image_request_usage_db_path,
    get_image_usage_summary,
    infer_episode_from_path,
    infer_project_output_dir,
    record_image_request,
    update_image_request_status,
)
from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
    MODEL_ACCESS_STDIN_ENV,
    RuntimeModelAccess,
    RuntimeModelAssignment,
    RuntimeModelCapability,
    configure_model_access,
    is_byok_allowed,
    load_model_access_from_stdin,
    model_access_configured,
    require_model_admin_token,
    resolve_model_assignment_for_role,
    resolve_model_for_role,
    runtime_model_access,
    runtime_model_capability,
    serialize_model_access_for_subprocess,
)
from ai_anime.modules.model_usage.infrastructure.model_audio_transport import (
    ModelAudioTransportError,
    ModelAudioWriteResult,
    write_model_audio_music,
    write_model_audio_speech,
    write_model_audio_voice_design,
)
from ai_anime.modules.model_usage.infrastructure.model_gateway_settings import (
    MODE_MIXED,
    EffectiveCogneeEmbeddingConfig,
    EffectiveNewApiConfig,
    build_model_gateway_status,
    get_effective_cognee_embedding_config,
    get_effective_newapi_config,
)
from ai_anime.modules.model_usage.infrastructure.model_runtime import (
    get_effective_newapi_gateway_config,
    get_model_access_json_transport,
    get_model_access_openai_client,
    get_newapi_reasoning_kwargs,
    get_newapi_runtime_credentials,
    get_newapi_text_pydantic_model,
    get_newapi_text_pydantic_model_settings,
    get_newapi_structured_output_litellm_kwargs,
    get_newapi_structured_output_model_settings,
    get_pydantic_model_settings,
)
from ai_anime.modules.model_usage.infrastructure.model_text_transport import (
    ModelTextTransportError,
    request_model_chat_content,
)
from ai_anime.modules.model_usage.infrastructure.video_request_usage import (
    count_video_beat_attempts,
    get_video_request_usage_db_path,
    get_video_usage_summary,
    record_video_request,
    update_video_request_status,
)


def build_local_credit_quote() -> CreditQuotePort:
    from ai_anime.modules.model_usage.infrastructure import LocalCreditQuote

    return LocalCreditQuote()


def build_local_usage_adapters() -> tuple[UsageMeter, ProviderInstrumentation]:
    from ai_anime.modules.model_usage.infrastructure import (
        NoOpProviderInstrumentation,
        NoOpUsageMeter,
    )

    return NoOpUsageMeter(), NoOpProviderInstrumentation()


def generation_credit_queries() -> GenerationCreditQueries:
    from ai_anime.modules.model_usage.composition import (
        generation_credit_queries as build,
    )

    return build()


def get_usage_meter() -> UsageMeter:
    from ai_anime.modules.model_usage.composition import get_usage_meter as resolve

    return resolve()


def install_provider_instrumentation() -> None:
    from ai_anime.modules.model_usage.infrastructure.provider_instrumentation import (
        install_provider_instrumentation as install,
    )

    install()


def reset_model_call_reservation_active(token: Token) -> None:
    from ai_anime.modules.model_usage.infrastructure.runtime_context import (
        reset_model_call_reservation_active as reset,
    )

    reset(token)


def set_model_call_reservation_active(active: bool) -> Token:
    from ai_anime.modules.model_usage.infrastructure.runtime_context import (
        set_model_call_reservation_active as set_active,
    )

    return set_active(active)


__all__ = [
    "BILLING_RULE_NOT_CONFIGURED_CODE",
    "BILLING_RULE_NOT_CONFIGURED_MESSAGE",
    "BillingRuleNotConfiguredError",
    "CreditQuote",
    "CreditQuotePort",
    "DEFAULT_BLOCK_WORLD_MODEL",
    "DEFAULT_COGNEE_EMBEDDING_DIM",
    "DEFAULT_EMBEDDING_BATCH_SIZE",
    "DEFAULT_FREEZONE_VISION_MODEL",
    "DEFAULT_GENERAL_TEXT_MODEL",
    "DEFAULT_SCENE_OVERLAP_MODEL",
    "DEFAULT_SCENE_SPATIAL_CONTRACT_MODEL",
    "DEFAULT_SCENE_VOXEL_MODEL",
    "DEFAULT_TEXT_MODEL_BY_ENV",
    "DEFAULT_VIDEO_PROMPT_OPTIMIZER_MODEL",
    "EffectiveCogneeEmbeddingConfig",
    "EffectiveNewApiConfig",
    "GenerationCreditCost",
    "GenerationCreditKind",
    "GenerationCreditQueries",
    "GenerationCreditSurface",
    "GenerationModelCatalog",
    "GENERATION_BILLING_UNITS",
    "INSUFFICIENT_CREDITS_CODE",
    "INSUFFICIENT_CREDITS_MESSAGE",
    "InvalidGenerationCreditRequest",
    "InsufficientCreditsError",
    "InsufficientCreditsStop",
    "MODE_MIXED",
    "MODEL_ACCESS_STDIN_ENV",
    "ModelAudioTransportError",
    "ModelAudioWriteResult",
    "ModelRoute",
    "ModelTextTransportError",
    "ProviderInstrumentation",
    "RuntimeModelAccess",
    "RuntimeModelAssignment",
    "RuntimeModelCapability",
    "UsageMeter",
    "billing_rule_not_configured_payload",
    "build_local_credit_quote",
    "build_local_usage_adapters",
    "build_model_gateway_status",
    "configure_model_access",
    "count_audio_scope_attempts",
    "count_image_scope_attempts",
    "count_video_beat_attempts",
    "find_billing_rule_not_configured_error",
    "find_insufficient_credits_error",
    "find_insufficient_credits_stop",
    "generation_credit_queries",
    "get_audio_request_usage_db_path",
    "get_effective_cognee_embedding_config",
    "get_effective_newapi_config",
    "get_effective_newapi_gateway_config",
    "get_image_request_usage_db_path",
    "get_image_usage_summary",
    "get_model_access_json_transport",
    "get_model_access_openai_client",
    "get_newapi_reasoning_kwargs",
    "get_newapi_runtime_credentials",
    "get_newapi_text_pydantic_model",
    "get_newapi_text_pydantic_model_settings",
    "get_newapi_structured_output_litellm_kwargs",
    "get_newapi_structured_output_model_settings",
    "get_pydantic_model_settings",
    "get_usage_meter",
    "get_video_request_usage_db_path",
    "get_video_usage_summary",
    "infer_episode_from_path",
    "infer_project_output_dir",
    "install_provider_instrumentation",
    "insufficient_credits_payload",
    "is_insufficient_credits_error",
    "iter_exception_chain",
    "is_byok_allowed",
    "load_model_access_from_stdin",
    "model_access_configured",
    "record_audio_generation_attempt",
    "record_image_request",
    "record_video_request",
    "request_model_chat_content",
    "require_model_admin_token",
    "reset_model_call_reservation_active",
    "resolve_model_assignment_for_role",
    "resolve_model_for_role",
    "resolve_model_route",
    "runtime_model_access",
    "runtime_model_capability",
    "serialize_model_access_for_subprocess",
    "set_model_call_reservation_active",
    "update_audio_generation_attempt",
    "update_image_request_status",
    "update_video_request_status",
    "write_model_audio_music",
    "write_model_audio_speech",
    "write_model_audio_voice_design",
]
