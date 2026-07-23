"""认证端点。"""

import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ai_anime.api.auth import (
    AUTH_COOKIE_NAME,
    get_api_user,
    resolve_auth_cookie_from_request,
)
from ai_anime.modules.identity_access.public import (
    create_desktop_session,
    revoke_browser_session,
)
from ai_anime.shared.runtime_env import cookie_secure as runtime_cookie_secure

router = APIRouter()

_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60


class DesktopLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=512)


class DesktopAuthorizationRequest(BaseModel):
    code: str = Field(min_length=1, max_length=512)


def _cookie_secure() -> bool:
    return runtime_cookie_secure()


def _set_auth_cookie(response: Response, cookie_value: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=cookie_value,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        max_age=_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    # Mirror the cookie attributes used on set so CDN edges and Safari ITP
    # match it reliably. secure is echoed for the same reason.
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        samesite="lax",
        secure=_cookie_secure(),
    )


def _desktop_auth_enabled() -> bool:
    return os.environ.get("AI_ANIME_DESKTOP_MODE") == "1"


def _desktop_user_response(username: str) -> JSONResponse:
    response = JSONResponse(
        {
            "ok": True,
            "data": {
                "username": username,
                "role": "owner",
                "credit_balance": 0,
                "credential_kind": "user",
            },
        }
    )
    _set_auth_cookie(response, create_desktop_session(username))
    return response


@router.post("/auth/login")
async def login(payload: DesktopLoginRequest):
    if not _desktop_auth_enabled():
        raise HTTPException(status_code=404, detail="Not Found")
    username = payload.username.strip()
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    return _desktop_user_response(username)


@router.post("/auth/authorize")
async def authorize(payload: DesktopAuthorizationRequest):
    if not _desktop_auth_enabled():
        raise HTTPException(status_code=404, detail="Not Found")
    if not payload.code.strip():
        raise HTTPException(status_code=400, detail="Authorization code is required")
    username = os.environ.get("AI_ANIME_LOCAL_USERNAME", "").strip() or "authorized-user"
    return _desktop_user_response(username)


@router.post("/auth/logout")
async def logout(request: Request, user: dict = Depends(get_api_user)):  # noqa: ARG001
    """清除 HttpOnly cookie + 在控制平面启用时吊销会话。"""
    cookie_value = resolve_auth_cookie_from_request(request)
    if cookie_value:
        await revoke_browser_session(cookie_value)

    response = JSONResponse({"ok": True})
    _clear_auth_cookie(response)
    return response


@router.get("/auth/me")
async def me(user: dict = Depends(get_api_user)):
    credit_balance = 0
    user_id = str(user.get("user_id") or user.get("id") or "").strip()
    if user_id:
        from ai_anime.ports.registry import get_port

        balance = await get_port("usage_meter").get_user_credit_balance(user_id)
        credit_balance = balance if balance is not None else 0

    return JSONResponse(
        {
            "ok": True,
            "data": {
                "username": user["username"],
                "role": user["role"],
                "credit_balance": credit_balance,
                "credential_kind": user.get("credential_kind") or "user",
                "current_scope_kind": user.get("current_scope_kind"),
                "current_project_id": user.get("current_project_id"),
                "scopes": user.get("scopes"),
            },
        }
    )
