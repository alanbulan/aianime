"""Response schema for release notification endpoints."""

from typing import Any

from pydantic import BaseModel


class OkResponse(BaseModel):
    ok: bool = True
    data: Any = None


__all__ = ["OkResponse"]
