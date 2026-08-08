"""Generation credit cost HTTP adapter."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.modules.model_usage.public import (
    GenerationCreditKind,
    GenerationCreditSurface,
    InvalidGenerationCreditRequest,
    generation_credit_queries,
)

router = APIRouter()


def _parse_billing_params(raw_params: object) -> dict:
    if not isinstance(raw_params, str):
        return {}
    clean_params = raw_params.strip()
    if not clean_params:
        return {}
    try:
        value = json.loads(clean_params)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="invalid billing params") from exc
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="billing params must be an object")
    return value


@router.get("/generation-credit-cost")
async def get_generation_credit_cost(
    kind: GenerationCreditKind = Query(...),
    surface: GenerationCreditSurface = Query("ai_anime"),
    value: str = Query("", max_length=256),
    params: str = Query("", max_length=2048),
    quantity: int = Query(1, ge=0, le=50_000_000),
    mode_key: str = Query("", max_length=128),
    image_role: str = Query("", max_length=64),
    user: dict = Depends(get_api_user),
) -> dict:
    """Return display-ready credit cost for one generation action or model."""
    del user
    try:
        cost = await generation_credit_queries().cost(
            kind=kind,
            surface=surface,
            value=value,
            params=_parse_billing_params(params),
            quantity=quantity,
            mode_key=mode_key,
            image_role=image_role,
        )
    except InvalidGenerationCreditRequest as exc:
        raise HTTPException(status_code=400, detail=exc.detail) from exc

    data = {"cost": cost.cost, "display": cost.display}
    if cost.unit == "character":
        data.update(
            {
                "unit": cost.unit,
                "unit_cost": cost.unit_cost,
                "quantity": cost.quantity,
                "params": cost.params,
            }
        )
    return {"ok": True, "data": data}
