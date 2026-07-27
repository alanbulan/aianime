"""Creative Canvas skill input validation and output targeting."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ai_anime.modules.creative_canvas.application.skill_catalog import (
    ResolvedSkillInput,
    SkillDefinition,
    SkillInputAcceptSpec,
)
from ai_anime.modules.creative_canvas.application.skill_run_contracts import (
    reject_creative_canvas_skill_run as _reject,
)
from ai_anime.modules.creative_canvas.domain.canvas_documents import (
    detected_reference_ids_from_beat_context_data,
    first_text_value,
)
from ai_anime.modules.creative_canvas.domain.mainline_generation import (
    is_standalone_beat_context,
)
from ai_anime.modules.creative_canvas.domain.skill_runs import (
    InvalidCreativeCanvasSkillInputUrl,
    normalize_creative_canvas_skill_input_url,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _input_extra(input_item: ResolvedSkillInput, field: str) -> Any:
    return getattr(input_item, field, None) or (input_item.model_extra or {}).get(field)


def _dict_extra(input_item: ResolvedSkillInput, field: str) -> dict[str, Any]:
    value = _input_extra(input_item, field)
    return value if isinstance(value, dict) else {}


def _input_mainline_contexts(input_item: ResolvedSkillInput) -> list[dict[str, Any]]:
    contexts = _input_extra(input_item, "mainline_context")
    if not isinstance(contexts, list):
        return []
    return [context for context in contexts if isinstance(context, dict)]


def _inferred_slot_target_from_input(
    input_item: ResolvedSkillInput,
) -> dict[str, Any] | None:
    if input_item.slot_target:
        return input_item.slot_target
    for context in _input_mainline_contexts(input_item):
        kind = str(context.get("kind") or "").strip()
        role = str(context.get("role") or "").strip()
        scene_id = first_text_value(context, ("sceneId", "scene_id", "scene"))
        if kind == "scene" and scene_id and role in {"scene_master", "scene_reverse_master"}:
            return {"kind": role, "scene_id": scene_id}
        identity_id = first_text_value(
            context,
            ("identityId", "identity_id", "character"),
        )
        if kind == "identity" and identity_id:
            return {
                "kind": "portrait" if role == "portrait" else "identity",
                "identity_id": identity_id,
            }
        prop_id = first_text_value(context, ("propId", "prop_id"))
        if kind == "prop" and prop_id:
            return {"kind": "prop", "prop_id": prop_id}
        if kind in {"sketch", "frame", "selected_background", "director_combined"}:
            try:
                episode = int(context.get("episode") or 0)
                beat = int(context.get("beat") or 0)
            except (TypeError, ValueError):
                episode = beat = 0
            if episode > 0 and beat > 0:
                return {"kind": kind, "episode": episode, "beat": beat}

    source = _dict_extra(input_item, "freezone_source") or _dict_extra(
        input_item,
        "__freezone_source",
    )
    role = str(source.get("role") or "").strip()
    meta = source.get("meta") if isinstance(source.get("meta"), dict) else {}
    scene_id = first_text_value(meta, ("scene_id", "scene", "scene_name", "name"))
    if scene_id and role in {"scene_master", "scene_reverse_master"}:
        return {"kind": role, "scene_id": scene_id}
    identity_id = first_text_value(meta, ("identity_id", "identityId", "character"))
    if identity_id and role in {"identity", "portrait"}:
        return {"kind": role, "identity_id": identity_id}
    prop_id = first_text_value(meta, ("prop_id", "propId"))
    if prop_id and role == "prop":
        return {"kind": "prop", "prop_id": prop_id}
    return None


def _slot_target_for_input(
    input_item: ResolvedSkillInput | None,
) -> dict[str, Any] | None:
    if input_item is None:
        return None
    inferred = _inferred_slot_target_from_input(input_item)
    if inferred and not input_item.slot_target:
        input_item.slot_target = inferred
    return inferred


def _reference_target_for_input(
    input_item: ResolvedSkillInput | None,
) -> dict[str, Any] | None:
    if input_item is None:
        return None
    return _dict_extra(input_item, "reference_target") or _slot_target_for_input(input_item)


def _required_image_url(input_item: ResolvedSkillInput, role: str) -> str:
    image_url = (input_item.image_url or "").strip()
    if not image_url:
        _reject(
            "validation",
            code="skill_input_missing_field",
            category="validation",
            message=f"input role {role!r} missing field 'image_url'",
            user_action_hint=(
                "Connect an image node that has a concrete project media URL."
            ),
        )
    return image_url


def _canvas_reference_from_input(
    input_item: ResolvedSkillInput,
    role: str,
) -> dict[str, Any]:
    reference_target = _reference_target_for_input(input_item) or {}
    return {
        "role": role,
        "image_url": _required_image_url(input_item, role),
        "slot_kind": str(reference_target.get("kind") or ""),
        "identity_id": str(reference_target.get("identity_id") or "").strip(),
        "prop_id": str(reference_target.get("prop_id") or "").strip(),
    }


def _canvas_references_from_inputs(
    grouped: Mapping[str, Sequence[ResolvedSkillInput]],
    role: str,
) -> list[dict[str, Any]]:
    return [
        _canvas_reference_from_input(input_item, role)
        for input_item in grouped.get(role) or []
    ]


def _filter_canvas_references_by_beat_context(
    items: list[dict[str, Any]],
    beat_input: ResolvedSkillInput | None,
    role: str,
) -> list[dict[str, Any]]:
    beat_context = (beat_input.beat_context if beat_input else None) or {}
    if not isinstance(beat_context, dict):
        return items
    allowed = detected_reference_ids_from_beat_context_data(beat_context, role)
    if allowed is None:
        return items

    def reference_id(item: Mapping[str, Any]) -> str:
        key = "identity_id" if role == "identity" else "prop_id"
        return str(item.get(key) or "").strip()

    return [
        item
        for item in items
        if not (item_id := reference_id(item)) or item_id in allowed
    ]


def _input_media_kind(input_item: ResolvedSkillInput) -> str:
    media_kind = str(input_item.media_kind or "").strip()
    if media_kind:
        return media_kind
    if input_item.image_url:
        return "image"
    if input_item.text:
        return "text"
    return ""


def _validate_skill_input_accepts(
    *,
    input_item: ResolvedSkillInput,
    input_spec_role: str,
    accepts: SkillInputAcceptSpec,
) -> None:
    if accepts.node_types and input_item.node_type not in accepts.node_types:
        _reject(
            "validation",
            code="skill_input_node_type_rejected",
            category="validation",
            message=(
                f"input role {input_spec_role!r} does not accept "
                f"node_type {input_item.node_type!r}"
            ),
            user_action_hint="Connect a node type accepted by this skill input.",
        )
    for field in accepts.has_field:
        if _input_extra(input_item, field) in (None, "", [], {}):
            _reject(
                "validation",
                code="skill_input_missing_field",
                category="validation",
                message=f"input role {input_spec_role!r} missing field {field!r}",
                user_action_hint="Use a source node that includes the required field.",
            )
    if accepts.media_kinds:
        media_kind = _input_media_kind(input_item)
        if media_kind not in accepts.media_kinds:
            _reject(
                "validation",
                code="skill_input_media_kind_rejected",
                category="validation",
                message=(
                    f"input role {input_spec_role!r} does not accept media kind "
                    f"{media_kind!r}"
                ),
                user_action_hint="Connect media whose type matches this skill input.",
            )
    provenance_required = bool(
        accepts.canonical_slot_kinds or accepts.candidate_origin_skill_ids
    )
    if not provenance_required:
        return
    slot_target = _slot_target_for_input(input_item) or {}
    candidate_origin = input_item.candidate_origin or {}
    slot_kind = str(slot_target.get("kind") or "")
    origin_skill_id = str(candidate_origin.get("skill_id") or "")
    has_slot_match = bool(
        accepts.canonical_slot_kinds and slot_kind in accepts.canonical_slot_kinds
    )
    has_candidate_match = bool(
        accepts.candidate_origin_skill_ids
        and origin_skill_id in accepts.candidate_origin_skill_ids
    )
    has_plain_media_match = bool(accepts.media_kinds and _input_media_kind(input_item))
    if not (has_slot_match or has_candidate_match or has_plain_media_match):
        _reject(
            "validation",
            code="skill_input_origin_rejected",
            category="validation",
            message=(
                f"input role {input_spec_role!r} does not match accepted "
                "slot/candidate origins"
            ),
            user_action_hint=(
                "Connect a canonical slot or candidate produced by an accepted skill."
            ),
        )


def _episode_and_beat_from_input(
    input_item: ResolvedSkillInput | None,
) -> tuple[int, int]:
    beat_context = (input_item.beat_context if input_item else None) or {}
    try:
        episode = int(beat_context.get("episode") or beat_context.get("episode_number") or 0)
        beat = int(beat_context.get("beat") or beat_context.get("beat_number") or 0)
    except (TypeError, ValueError):
        _reject(
            "validation",
            code="skill_input_beat_context_invalid",
            category="validation",
            message="beat_context must include numeric episode and beat",
            user_action_hint="Connect a Beat Context node with episode and beat values.",
        )
    if episode <= 0 or beat <= 0:
        _reject(
            "validation",
            code="skill_input_beat_context_invalid",
            category="validation",
            message="beat_context must include positive episode and beat",
            user_action_hint=(
                "Connect a Beat Context node with positive episode and beat values."
            ),
        )
    return episode, beat


def group_and_validate_creative_canvas_skill_inputs(
    skill: SkillDefinition,
    resolved_inputs: Sequence[ResolvedSkillInput],
    *,
    project_id: str,
    context: ProjectContext,
) -> dict[str, list[ResolvedSkillInput]]:
    specs_by_role = {item.role: item for item in skill.inputs}
    grouped: dict[str, list[ResolvedSkillInput]] = {}
    for input_item in resolved_inputs:
        spec = specs_by_role.get(input_item.role)
        if spec is None:
            _reject(
                "validation",
                code="skill_input_unknown_role",
                category="validation",
                message=f"unknown input role {input_item.role!r}",
                user_action_hint=(
                    "Reconnect the input to one of the skill node's listed handles."
                ),
            )
        image_url = (input_item.image_url or "").strip()
        if image_url:
            try:
                input_item.image_url = normalize_creative_canvas_skill_input_url(
                    image_url,
                    project_id=project_id,
                    owner_username=context.owner_username,
                    project_name=context.project_name,
                )
            except InvalidCreativeCanvasSkillInputUrl as exc:
                _reject(
                    "validation",
                    code=exc.code,
                    category="validation",
                    message=exc.message,
                    user_action_hint=exc.user_action_hint,
                )
        _validate_skill_input_accepts(
            input_item=input_item,
            input_spec_role=spec.role,
            accepts=spec.accepts,
        )
        if input_item.role == "beat_context" and not is_standalone_beat_context(
            input_item.beat_context
        ):
            _episode_and_beat_from_input(input_item)
        grouped.setdefault(input_item.role, []).append(input_item)
    for spec in skill.inputs:
        items = grouped.get(spec.role, [])
        if spec.required and not items:
            _reject(
                "validation",
                code="skill_input_missing_required",
                category="validation",
                message=f"missing required input role {spec.role!r}",
                user_action_hint="Connect the missing input role before running the skill.",
            )
        if spec.cardinality == "single" and len(items) > 1:
            _reject(
                "validation",
                code="skill_input_cardinality_exceeded",
                category="validation",
                message=f"input role {spec.role!r} accepts only one value",
                user_action_hint=(
                    "Remove extra edges from this single-value input role."
                ),
            )
    return grouped


def _single_input(
    grouped: Mapping[str, Sequence[ResolvedSkillInput]],
    role: str,
) -> ResolvedSkillInput | None:
    items = grouped.get(role) or []
    return items[0] if items else None


def _required_input(
    grouped: Mapping[str, Sequence[ResolvedSkillInput]],
    role: str,
) -> ResolvedSkillInput:
    input_item = _single_input(grouped, role)
    if input_item is None:
        _reject(
            "validation",
            code="skill_input_missing_required",
            category="validation",
            message=f"missing required input role {role!r}",
            user_action_hint="Connect the missing input role before running the skill.",
        )
    return input_item


def _slot_target_from_inputs(
    grouped: Mapping[str, Sequence[ResolvedSkillInput]],
) -> dict[str, Any] | None:
    beat_item = _single_input(grouped, "beat_context")
    beat_target = _slot_target_for_input(beat_item)
    if beat_target:
        return beat_target
    if beat_item and not is_standalone_beat_context(beat_item.beat_context):
        episode, beat = _episode_and_beat_from_input(beat_item)
        return {"episode": episode, "beat": beat}
    for role in ("sketch", "frame", "scene_master", "background"):
        slot_target = _slot_target_for_input(_single_input(grouped, role))
        if slot_target:
            return slot_target
    return None


def _skill_output_slot_target(
    output_role: str,
    grouped: Mapping[str, Sequence[ResolvedSkillInput]],
) -> dict[str, Any] | None:
    beat_item = _single_input(grouped, "beat_context")
    if is_standalone_beat_context(beat_item.beat_context if beat_item else None):
        return None
    beat_roles = {
        "current_sketch_candidate": "sketch",
        "current_frame_candidate": "frame",
        "selected_background": "selected_background",
        "director_combined": "director_render",
    }
    if output_role in beat_roles and beat_item:
        episode, beat = _episode_and_beat_from_input(beat_item)
        return {"kind": beat_roles[output_role], "episode": episode, "beat": beat}
    if output_role == "scene_360_candidate":
        scene_master_slot = _slot_target_for_input(_single_input(grouped, "scene_master"))
        scene_id = (
            scene_master_slot.get("scene_id")
            if isinstance(scene_master_slot, dict)
            else None
        )
        if scene_id:
            return {"kind": "scene_director_pano_360", "scene_id": scene_id}
    return _slot_target_from_inputs(grouped)


def creative_canvas_skill_output_metadata(
    skill: SkillDefinition,
    grouped: Mapping[str, Sequence[ResolvedSkillInput]],
    *,
    auto_commit: bool = False,
) -> dict[str, Any]:
    output = skill.outputs[0]
    return {
        "role": output.role,
        "media_type": output.media_type,
        "node_type": output.node_type,
        "pushable": output.pushable,
        "slot_target": _skill_output_slot_target(output.role, grouped),
        "auto_commit": bool(auto_commit),
    }


__all__ = [
    "creative_canvas_skill_output_metadata",
    "group_and_validate_creative_canvas_skill_inputs",
]
