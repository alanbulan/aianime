"""Stable application API exposed by Model Usage."""

from ai_anime.modules.model_usage.application import (
    CreditQuotePort,
    GenerationCreditQueries,
    GenerationModelCatalog,
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


def generation_credit_queries() -> GenerationCreditQueries:
    from ai_anime.modules.model_usage.composition import (
        generation_credit_queries as build,
    )

    return build()


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
    "billing_rule_not_configured_payload",
    "build_local_credit_quote",
    "find_billing_rule_not_configured_error",
    "find_insufficient_credits_error",
    "find_insufficient_credits_stop",
    "generation_credit_queries",
    "insufficient_credits_payload",
    "is_insufficient_credits_error",
    "iter_exception_chain",
]
