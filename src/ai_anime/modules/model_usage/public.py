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
    "ProviderInstrumentation",
    "UsageMeter",
    "billing_rule_not_configured_payload",
    "build_local_credit_quote",
    "build_local_usage_adapters",
    "find_billing_rule_not_configured_error",
    "find_insufficient_credits_error",
    "find_insufficient_credits_stop",
    "generation_credit_queries",
    "get_usage_meter",
    "install_provider_instrumentation",
    "insufficient_credits_payload",
    "is_insufficient_credits_error",
    "iter_exception_chain",
    "reset_model_call_reservation_active",
    "set_model_call_reservation_active",
]
