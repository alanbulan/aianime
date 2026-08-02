"""Generation credit cost query."""

from __future__ import annotations

from collections.abc import Mapping

from ai_anime.modules.model_usage.application.ports import (
    CreditQuotePort,
    GenerationModelCatalog,
)
from ai_anime.modules.model_usage.domain import (
    GenerationCreditCost,
    InvalidGenerationCreditRequest,
    build_generation_credit_cost,
    clean_query_value,
    generation_billing_kind,
    normalize_billing_params,
    normalize_quantity,
)


class GenerationCreditQueries:
    def __init__(
        self,
        model_catalog: GenerationModelCatalog,
        credit_quote: CreditQuotePort,
    ) -> None:
        self._model_catalog = model_catalog
        self._credit_quote = credit_quote

    async def cost(
        self,
        *,
        kind: object,
        surface: object,
        value: object,
        params: Mapping,
        quantity: object,
        mode_key: object,
        image_role: object,
    ) -> GenerationCreditCost:
        clean_kind = clean_query_value(kind)
        clean_value = clean_query_value(value)
        clean_surface = "canvas" if surface == "canvas" else "ai_anime"
        clean_mode_key = clean_query_value(mode_key)
        clean_image_role = clean_query_value(image_role)
        model = self._model_catalog.resolve_model(
            kind=clean_kind,
            value=clean_value,
        )
        if not model:
            raise InvalidGenerationCreditRequest("generation model is not configured")

        defaults: dict = {}
        if clean_surface != "canvas" and clean_kind == "image_selection":
            defaults = self._model_catalog.default_billing_params(
                kind=clean_kind,
                value=clean_value,
                model=model,
                mode_key=clean_mode_key,
                image_role=clean_image_role,
            )
        normalized_quantity = normalize_quantity(quantity)
        quote = await self._credit_quote.generation_credit_quote(
            kind=generation_billing_kind(clean_kind),
            model=model,
            params=normalize_billing_params(
                kind=clean_kind,
                surface=clean_surface,
                defaults=defaults,
                explicit=params,
            ),
            quantity=normalized_quantity,
        )
        return build_generation_credit_cost(
            quote,
            requested_quantity=normalized_quantity,
        )
