"""Display-tool fallback orchestration."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any
from urllib.parse import quote

from ai_anime.modules.ai_assistant.application.ports import DisplayFallbackGateway
from ai_anime.modules.ai_assistant.domain import (
    character_identity_requests,
    display_candidate_beat,
    display_episode,
    is_display_tool_name,
    project_beat_image_specs,
    project_character_media_specs,
    project_episode_media_specs,
    project_scene_image_specs,
    project_sketch_candidate_specs,
)

logger = logging.getLogger("ai_anime.modules.ai_assistant.display_fallback")


class DisplayFallbacks:
    def __init__(self, gateway: DisplayFallbackGateway) -> None:
        self._gateway = gateway

    async def build(
        self,
        project: str,
        tool_name: str,
        args: dict[str, Any],
        *,
        token: str,
    ) -> list[dict[str, Any]]:
        if not project or not is_display_tool_name(tool_name):
            return []
        try:
            return await asyncio.to_thread(
                self._build,
                project,
                tool_name,
                args,
                token,
            )
        except Exception as exc:
            logger.info(
                "display fallback failed project=%s tool=%s args=%s error=%s",
                project,
                tool_name,
                json.dumps(args, ensure_ascii=False, sort_keys=True, default=str)[
                    :1000
                ],
                exc,
            )
            return []

    def _build(
        self,
        project: str,
        tool_name: str,
        args: dict[str, Any],
        token: str,
    ) -> list[dict[str, Any]]:
        api_project = str(args.get("project_id") or project).strip()
        project_q = quote(api_project, safe="")

        if tool_name in {"ai_anime_get_sketches", "ai_anime_get_first_frames"}:
            episode = display_episode(args)
            response = self._gateway.get(
                f"/api/v1/projects/{project_q}/episodes/{episode}/beats",
                token,
            )
            return project_beat_image_specs(tool_name, args, response)

        if tool_name == "ai_anime_get_sketch_candidates":
            episode = display_episode(args)
            beat = display_candidate_beat(args)
            if beat <= 0:
                return []
            response = self._gateway.get(
                f"/api/v1/projects/{project_q}/episodes/{episode}/beats/{beat}/sketch-candidates",
                token,
            )
            return project_sketch_candidate_specs(args, response)

        if tool_name == "ai_anime_get_scene_images":
            response = self._gateway.get(
                f"/api/v1/projects/{project_q}/scenes",
                token,
            )
            return project_scene_image_specs(args, response)

        if tool_name == "ai_anime_get_character_media":
            response = self._gateway.get(
                f"/api/v1/projects/{project_q}/characters",
                token,
            )
            identity_responses: dict[int, Any] = {}
            for character_index, name in character_identity_requests(args, response):
                try:
                    identity_responses[character_index] = self._gateway.get(
                        f"/api/v1/projects/{project_q}/characters/{quote(name, safe='')}/identities",
                        token,
                    )
                except Exception:
                    pass
            return project_character_media_specs(args, response, identity_responses)

        if tool_name == "ai_anime_get_episode_media":
            episode = display_episode(args)
            response = self._gateway.get(
                f"/api/v1/projects/{project_q}/episodes/{episode}/beats",
                token,
            )
            return project_episode_media_specs(args, response)

        return []


__all__ = ["DisplayFallbacks"]
