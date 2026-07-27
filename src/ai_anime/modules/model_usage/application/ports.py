"""Model usage outbound ports."""

from __future__ import annotations

from typing import Protocol

from ai_anime.modules.model_usage.domain import CreditQuote


class GenerationModelCatalog(Protocol):
    def resolve_model(self, *, kind: str, value: str) -> str: ...

    def default_billing_params(
        self,
        *,
        kind: str,
        value: str,
        model: str,
        mode_key: str,
        image_role: str,
    ) -> dict: ...


class CreditQuotePort(Protocol):
    async def generation_credit_quote(
        self,
        *,
        kind: str,
        model: str,
        params: dict,
        quantity: int,
    ) -> CreditQuote: ...
