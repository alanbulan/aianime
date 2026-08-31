"""Remote model-gateway quota error taxonomy."""

from __future__ import annotations

from typing import Any

REMOTE_MODEL_QUOTA_CODE = "INSUFFICIENT_CREDITS"
MODEL_QUOTA_EXCEEDED_MESSAGE = "云端模型配额不足，请联系管理员"


class ModelQuotaExceededError(RuntimeError):
    """Normalized remote-gateway rejection caused by exhausted quota."""

    def __init__(
        self,
        *,
        user_id: str,
        required_units: int,
        available_units: int,
    ) -> None:
        self.user_id = user_id
        self.required_units = int(required_units)
        self.available_units = int(available_units)
        super().__init__(
            f"remote model quota exhausted for user {user_id}: "
            f"required {self.required_units}, available {self.available_units}"
        )


class ModelQuotaExceededStop(BaseException):
    """Stop signal used to preserve a remote quota rejection through broad handlers."""

    def __init__(
        self,
        *,
        user_id: str = "",
        required_units: int = 0,
        available_units: int = 0,
    ) -> None:
        self.user_id = user_id
        self.required_units = int(required_units or 0)
        self.available_units = int(available_units or 0)
        super().__init__(MODEL_QUOTA_EXCEEDED_MESSAGE)


def iter_exception_chain(exc: BaseException | None):
    """Yield an exception and its explicit/implicit causes once each."""
    seen: set[int] = set()
    current = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def find_model_quota_error(
    exc: BaseException | None,
) -> ModelQuotaExceededError | None:
    for item in iter_exception_chain(exc):
        if isinstance(item, ModelQuotaExceededError):
            return item
    return None


def find_model_quota_stop(
    exc: BaseException | None,
) -> ModelQuotaExceededStop | None:
    for item in iter_exception_chain(exc):
        if isinstance(item, ModelQuotaExceededStop):
            return item
    return None


def is_model_quota_error(
    exc: BaseException | None = None, message: str = ""
) -> bool:
    """Recognize the stable quota code returned by the remote model gateway."""
    if (
        find_model_quota_error(exc) is not None
        or find_model_quota_stop(exc) is not None
    ):
        return True
    combined = " ".join(str(item) for item in iter_exception_chain(exc))
    if message:
        combined = f"{combined} {message}"
    normalized = combined.lower()
    return (
        "insufficient credits" in normalized
        or REMOTE_MODEL_QUOTA_CODE.lower() in normalized
    )


def model_quota_payload(exc: BaseException | None = None) -> dict[str, Any]:
    err = find_model_quota_error(exc)
    stop = find_model_quota_stop(exc)
    payload: dict[str, Any] = {
        "error_code": REMOTE_MODEL_QUOTA_CODE,
        "message": MODEL_QUOTA_EXCEEDED_MESSAGE,
    }
    if err is not None or stop is not None:
        source = err or stop
        payload.update(
            {
                "user_id": source.user_id,
                "required": source.required_units,
                "balance": source.available_units,
            }
        )
    return payload


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
