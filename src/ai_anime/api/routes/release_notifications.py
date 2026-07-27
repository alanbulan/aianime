"""Release notification feed route."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Query, Request

from ai_anime.api.auth import get_api_user
from ai_anime.api.schemas import OkResponse
from ai_anime.modules.platform_release.public import release_notification_queries

router = APIRouter()


@router.get("/release-notifications", response_model=OkResponse)
async def get_release_notifications(
    request: Request,
    locale: str | None = Query(default=None),
    _user: dict = Depends(get_api_user),
) -> OkResponse:
    feed = await release_notification_queries().current(
        locale_hint=locale or request.headers.get("accept-language"),
    )
    return OkResponse(data=asdict(feed))
