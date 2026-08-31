"""Model usage domain rules."""

from ai_anime.modules.model_usage.domain.quota_errors import (
    MODEL_QUOTA_EXCEEDED_MESSAGE,
    REMOTE_MODEL_QUOTA_CODE,
    ModelQuotaExceededError,
    ModelQuotaExceededStop,
    find_model_quota_error,
    find_model_quota_stop,
    is_model_quota_error,
    iter_exception_chain,
    model_quota_payload,
)
__all__ = [
    "MODEL_QUOTA_EXCEEDED_MESSAGE",
    "REMOTE_MODEL_QUOTA_CODE",
    "ModelQuotaExceededError",
    "ModelQuotaExceededStop",
    "find_model_quota_error",
    "find_model_quota_stop",
    "is_model_quota_error",
    "iter_exception_chain",
    "model_quota_payload",
]
