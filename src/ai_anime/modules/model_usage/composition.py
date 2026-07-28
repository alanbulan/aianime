"""Model usage composition root."""

from ai_anime.modules.model_usage.application import GenerationCreditQueries, UsageMeter
from ai_anime.modules.model_usage.infrastructure import (
    ConfiguredGenerationModelCatalog,
    NoOpUsageMeter,
    RegisteredCreditQuote,
)
from ai_anime.ports import registry

_model_catalog = ConfiguredGenerationModelCatalog()
_credit_quote = RegisteredCreditQuote()


def generation_credit_queries() -> GenerationCreditQueries:
    return GenerationCreditQueries(_model_catalog, _credit_quote)


def get_usage_meter() -> UsageMeter:
    try:
        meter = registry.get_port("usage_meter")
    except registry.PortNotRegistered:
        return NoOpUsageMeter()
    if not hasattr(meter, "reserve_current_model_call_credit"):
        return NoOpUsageMeter()
    return meter
