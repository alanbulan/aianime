"""Configured generation model catalog."""

from __future__ import annotations

import os

from ai_anime.modules.model_usage.domain import (
    InvalidGenerationCreditRequest,
    image_billing_params,
    merge_billing_params,
)


def _image_selection_model(selection: str) -> str:
    clean_selection = selection.strip()
    if not clean_selection:
        raise InvalidGenerationCreditRequest("image model is required")
    return clean_selection


def _image_selection_billing_params(
    *,
    model: str,
    mode_key: str,
    image_role: str,
) -> dict:
    params: dict[str, str] = {}
    if mode_key:
        from ai_anime.modules.production.public import (
            REGEN_MODE_CONFIGS,
            normalize_image_size,
        )

        mode_config = REGEN_MODE_CONFIGS.get(mode_key)
        if mode_config is None:
            raise InvalidGenerationCreditRequest("invalid image mode key")
        params["size"] = normalize_image_size(str(mode_config.get("image_size") or ""))

    clean_role = image_role.lower()
    if clean_role == "sketch":
        from ai_anime.modules.production.public import OPENAI_SKETCH_IMAGE_QUALITY

        params = merge_billing_params(
            params,
            image_billing_params(
                model=model,
                quality=OPENAI_SKETCH_IMAGE_QUALITY,
            ),
        )
    elif clean_role in {"render", "character", "identity"}:
        from ai_anime.modules.production.public import OPENAI_IMAGE_QUALITY

        params = merge_billing_params(
            params,
            image_billing_params(
                model=model,
                image_size=("1K" if clean_role in {"character", "identity"} else ""),
                quality=OPENAI_IMAGE_QUALITY,
            ),
        )
    elif clean_role == "prop_reference":
        from ai_anime.modules.production.public import normalize_image_size
        from ai_anime.modules.production.public import PROP_REF_IMAGE_SIZE

        params = merge_billing_params(
            params,
            image_billing_params(
                model=model,
                image_size=normalize_image_size(PROP_REF_IMAGE_SIZE),
                quality="medium",
            ),
        )
    elif clean_role in {"scene_master", "scene_reverse_master"}:
        params = merge_billing_params(
            params,
            image_billing_params(
                model=model,
                image_size="1K",
                quality="medium",
            ),
        )
    elif clean_role == "scene_pano":
        params = merge_billing_params(
            params,
            image_billing_params(
                model=model,
                image_size=(os.environ.get("SCENE_360_IMAGE_SIZE") or "2K").strip(),
                quality=(
                    os.environ.get("SCENE_360_IMAGE_QUALITY")
                    or os.environ.get("HUIMENG_IMAGE_QUALITY")
                    or "medium"
                ).strip(),
            ),
        )
    return params


class ConfiguredGenerationModelCatalog:
    def resolve_model(self, *, kind: str, value: str) -> str:
        if kind in {"model", "video_model"}:
            if not value:
                raise InvalidGenerationCreditRequest("model is required")
            return value
        if kind == "image_selection":
            return _image_selection_model(value)
        if kind == "beat_tts":
            if not value:
                raise InvalidGenerationCreditRequest("audio model is required")
            return value
        if kind == "freezone_audio_music":
            if not value:
                raise InvalidGenerationCreditRequest("audio model is required")
            return value
        if kind == "freezone_image_reverse_prompt":
            from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
                resolve_model_for_role,
            )

            return resolve_model_for_role("TEXT")
        if kind == "freezone_story_script":
            if not value:
                raise InvalidGenerationCreditRequest("text model is required")
            return value
        if kind == "style_analyzer":
            from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
                resolve_model_for_role,
            )

            return resolve_model_for_role("TEXT")
        if kind == "feature":
            if not value:
                raise InvalidGenerationCreditRequest("feature key is required")
            return value
        raise InvalidGenerationCreditRequest("invalid generation credit cost kind")

    def default_billing_params(
        self,
        *,
        kind: str,
        value: str,
        model: str,
        mode_key: str,
        image_role: str,
    ) -> dict:
        if kind == "image_selection":
            return _image_selection_billing_params(
                model=model,
                mode_key=mode_key,
                image_role=image_role,
            )
        return {}
