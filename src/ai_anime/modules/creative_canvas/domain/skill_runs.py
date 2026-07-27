"""Creative Canvas skill-run domain policies."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote, urlsplit


@dataclass(frozen=True)
class InvalidCreativeCanvasSkillInputUrl(ValueError):
    code: str
    message: str
    user_action_hint: str

    def __str__(self) -> str:
        return self.message


def normalize_creative_canvas_skill_input_url(
    image_url: str,
    *,
    project_id: str,
    owner_username: str,
    project_name: str,
) -> str:
    """Validate project ownership and normalize API media URLs to project paths."""

    value = image_url.strip()
    if not value:
        return value
    parsed = urlsplit(value)
    path = parsed.path or value
    if parsed.scheme in {"http", "https"}:
        allowed_hosts = {"static.local", "localhost", "127.0.0.1"}
        if parsed.hostname not in allowed_hosts or not (
            path.startswith("/static/") or path.startswith("/api/v1/projects/")
        ):
            raise InvalidCreativeCanvasSkillInputUrl(
                code="skill_input_external_url_rejected",
                message="external image URLs are not accepted for skill runs",
                user_action_hint=(
                    "Use media stored in the current project before running the skill."
                ),
            )
    elif parsed.scheme:
        raise InvalidCreativeCanvasSkillInputUrl(
            code="skill_input_external_url_rejected",
            message="external image URLs are not accepted for skill runs",
            user_action_hint=(
                "Use media stored in the current project before running the skill."
            ),
        )

    if path.startswith("/api/v1/projects/"):
        parts = path.split("/", 6)
        if len(parts) < 7 or parts[5] != "media":
            raise InvalidCreativeCanvasSkillInputUrl(
                code="skill_input_media_url_unsupported",
                message="unsupported project API media URL",
                user_action_hint=(
                    "Use a project media URL returned by the AI anime API."
                ),
            )
        if unquote(parts[4]) != project_id:
            raise InvalidCreativeCanvasSkillInputUrl(
                code="skill_input_wrong_project_url",
                message="project media URL does not match current project",
                user_action_hint="Use media from the same project as the canvas.",
            )
        media_path = unquote(parts[6]).lstrip("/")
        if not media_path:
            raise InvalidCreativeCanvasSkillInputUrl(
                code="skill_input_media_path_missing",
                message="project media URL missing media path",
                user_action_hint="Use a complete project media URL.",
            )
        return f"/{media_path}"

    if path.startswith("/static/"):
        parts = path.split("/", 4)
        if len(parts) < 5:
            raise InvalidCreativeCanvasSkillInputUrl(
                code="skill_input_static_url_unsupported",
                message="unsupported static URL",
                user_action_hint="Use a static URL generated for this project.",
            )
        if parts[2] == "projects":
            if unquote(parts[3]) != project_id:
                raise InvalidCreativeCanvasSkillInputUrl(
                    code="skill_input_wrong_project_url",
                    message="project static URL does not match current project",
                    user_action_hint="Use media from the same project as the canvas.",
                )
            return value
        if unquote(parts[2]) != owner_username or unquote(parts[3]) != project_name:
            raise InvalidCreativeCanvasSkillInputUrl(
                code="skill_input_wrong_project_url",
                message="static URL does not match current project",
                user_action_hint="Use media from the same project as the canvas.",
            )
        return value

    if path.startswith("/api/"):
        raise InvalidCreativeCanvasSkillInputUrl(
            code="skill_input_media_url_unsupported",
            message="unsupported project API media URL",
            user_action_hint="Use a project media URL returned by the AI anime API.",
        )
    return value


def creative_canvas_skill_request_hash(payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        dict(payload),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def creative_canvas_skill_idempotency_record_id(
    skill_id: str,
    idempotency_key: str,
) -> str:
    return hashlib.sha256(f"{skill_id}\0{idempotency_key}".encode("utf-8")).hexdigest()


def creative_canvas_skill_background_reference_mode(
    parameters: Mapping[str, object],
) -> str:
    value = str(parameters.get("background_reference_mode") or "").strip()
    if value in {"material_only", "scene_anchor"}:
        return value
    if parameters.get("repair_background_perspective") is False:
        return "scene_anchor"
    return "material_only"


def creative_canvas_skill_status_from_task_status(status: str | None) -> str:
    if status == "completed":
        return "done"
    if status in {"failed", "cancelled"}:
        return status
    return status or "unknown"


def deterministic_creative_canvas_frame_review(
    *,
    episode: int | None,
    beat: int | None,
    frame_label: str,
) -> str:
    target_label = (
        "Canvas Beat Context"
        if episode is None or beat is None
        else f"Episode {episode}, Beat {beat}"
    )
    return (
        f"{target_label} frame review for {frame_label}: "
        "deterministic backend check completed. Verify composition, continuity, "
        "identity consistency, and whether visible details match the beat context."
    )


__all__ = [
    "InvalidCreativeCanvasSkillInputUrl",
    "creative_canvas_skill_background_reference_mode",
    "creative_canvas_skill_idempotency_record_id",
    "creative_canvas_skill_request_hash",
    "creative_canvas_skill_status_from_task_status",
    "deterministic_creative_canvas_frame_review",
    "normalize_creative_canvas_skill_input_url",
]
