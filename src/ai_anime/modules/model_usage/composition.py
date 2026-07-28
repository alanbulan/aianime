"""Model usage composition root."""

from ai_anime.modules.model_usage.application import GenerationCreditQueries, UsageMeter
from ai_anime.modules.model_usage.infrastructure import (
    ConfiguredGenerationModelCatalog,
    RegisteredCreditQuote,
    resolve_registered_usage_meter,
)

_model_catalog = ConfiguredGenerationModelCatalog()
_credit_quote = RegisteredCreditQuote()


def generation_credit_queries() -> GenerationCreditQueries:
    return GenerationCreditQueries(_model_catalog, _credit_quote)


def get_usage_meter() -> UsageMeter:
    return resolve_registered_usage_meter()
