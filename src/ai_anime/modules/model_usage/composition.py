"""Model usage composition root."""

from ai_anime.modules.model_usage.application import GenerationCreditQueries
from ai_anime.modules.model_usage.infrastructure import (
    ConfiguredGenerationModelCatalog,
    RegisteredCreditQuote,
)

_model_catalog = ConfiguredGenerationModelCatalog()
_credit_quote = RegisteredCreditQuote()


def generation_credit_queries() -> GenerationCreditQueries:
    return GenerationCreditQueries(_model_catalog, _credit_quote)
