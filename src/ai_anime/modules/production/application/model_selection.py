"""Shared production model selection used by HTTP routes and workflows."""

from __future__ import annotations

from ai_anime.modules.model_usage.public import resolve_model_for_role
from ai_anime.modules.model_usage.domain.model_route import (
    ModelRoute,
    resolve_model_route,
)
from ai_anime.modules.project_workspace.public import load_project_config


def resolve_video_generation_model(
    username: str,
    project: str,
    requested_model: str | None = None,
) -> str:
    return resolve_video_generation_route(
        username,
        project,
        requested_model,
    ).model


def resolve_video_generation_route(
    username: str,
    project: str,
    requested_model: str | None = None,
) -> ModelRoute:
    requested = str(requested_model or "").strip()
    if requested:
        return resolve_model_route(requested)
    configured = str(
        load_project_config(username, project).get("video_model") or ""
    ).strip()
    return resolve_model_route(
        configured or resolve_model_for_role("VIDEO_IMAGE_TO_VIDEO")
    )


def resolve_episode_video_resolution(
    requested_resolution: str | None,
    aspect_ratio: str,
) -> str:
    """Return the exact frame size shared by beat rendering and composition."""

    normalized = str(requested_resolution or "720p").strip().lower()
    if normalized in {"720", "720p", "720x1280", "1280x720"}:
        tier = "720"
    elif normalized in {"1080", "1080p", "1080x1920", "1920x1080"}:
        tier = "1080"
    else:
        raise ValueError(f"不支持的视频分辨率：{requested_resolution}")

    if str(aspect_ratio or "").strip() == "16:9":
        return "1920x1080" if tier == "1080" else "1280x720"
    return "1080x1920" if tier == "1080" else "720x1280"


__all__ = [
    "resolve_episode_video_resolution",
    "resolve_video_generation_model",
    "resolve_video_generation_route",
]
