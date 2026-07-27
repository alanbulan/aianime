"""Stable application API exposed by Model Usage."""

from ai_anime.modules.model_usage.application import (
    CreditQuotePort,
    GenerationCreditQueries,
    GenerationModelCatalog,
)
from ai_anime.modules.model_usage.domain import (
    CreditQuote,
    GenerationCreditCost,
    GenerationCreditKind,
    GenerationCreditSurface,
    InvalidGenerationCreditRequest,
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
    "CreditQuote",
    "CreditQuotePort",
    "GenerationCreditCost",
    "GenerationCreditKind",
    "GenerationCreditQueries",
    "GenerationCreditSurface",
    "GenerationModelCatalog",
    "InvalidGenerationCreditRequest",
    "build_local_credit_quote",
    "generation_credit_queries",
]
