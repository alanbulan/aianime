"""Credit quote adapter backed by the process port registry."""

from ai_anime.modules.model_usage.application import CreditQuotePort
from ai_anime.modules.model_usage.domain import CreditQuote
from ai_anime.shared.ports.registry import get_port


class RegisteredCreditQuote:
    async def generation_credit_quote(
        self,
        *,
        kind: str,
        model: str,
        params: dict,
        quantity: int,
    ) -> CreditQuote:
        credit_quote: CreditQuotePort = get_port("credit_quote")
        return await credit_quote.generation_credit_quote(
            kind=kind,
            model=model,
            params=params,
            quantity=quantity,
        )
