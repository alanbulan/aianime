"""Creative Canvas skill catalog HTTP adapters."""

from fastapi import APIRouter, Depends

from ai_anime.api.auth import get_api_user
from ai_anime.modules.creative_canvas.public import (
    creative_canvas_skill_catalog_queries,
)

router = APIRouter()


@router.get("/freezone/skills", tags=["freezone-skills"])
async def freezone_skills(user: dict = Depends(get_api_user)):
    skills = creative_canvas_skill_catalog_queries().list_skills()
    return {"ok": True, "data": [skill.model_dump(mode="json") for skill in skills]}
