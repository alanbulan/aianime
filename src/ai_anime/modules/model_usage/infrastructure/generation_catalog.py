"""Configured generation model catalog."""

from __future__ import annotations

import os

from ai_anime.modules.model_usage.domain import (
    InvalidGenerationCreditRequest,
    image_billing_params,
    merge_billing_params,
    resolve_labeled_value,
)


def _fixed_image_model(kind: str) -> str:
    if kind == "prop_reference":
        from ai_anime.generators.nanobanana_prop import (
            resolve_prop_reference_image_model,
        )

        return resolve_prop_reference_image_model()
    if kind == "scene_master":
        from ai_anime.generators.scene_reference_images import (
            resolve_scene_reference_image_model,
        )

        return resolve_scene_reference_image_model("master")
    if kind == "scene_reverse_master":
        from ai_anime.generators.scene_reference_images import (
            resolve_scene_reference_image_model,
        )

        return resolve_scene_reference_image_model("reverse_master")
    if kind == "scene_pano":
        from ai_anime.stage_asset_tasks import resolve_scene_360_image_model

        return resolve_scene_360_image_model()
    raise InvalidGenerationCreditRequest("invalid fixed image credit cost kind")


def _image_selection_model(selection: str) -> str:
    if not selection:
        raise InvalidGenerationCreditRequest("selection is required")

    from ai_anime.config import (
        IMAGE_GENERATION_SELECTIONS,
        character_image_selection_options,
    )

    clean_selection = resolve_labeled_value(
        selection,
        character_image_selection_options(),
        label_name="image selection",
    )
    if clean_selection not in IMAGE_GENERATION_SELECTIONS:
        raise InvalidGenerationCreditRequest("invalid image selection")
    return IMAGE_GENERATION_SELECTIONS[clean_selection]["model"]


def _video_backend_model(backend: str) -> str:
    if not backend:
        raise InvalidGenerationCreditRequest("video backend is required")

    from ai_anime.generators.huimengi import parse_huimeng_video_backend
    from ai_anime.generators.video_generator import (
        VideoBackend,
        newapi_video_backend_options,
        parse_newapi_video_backend,
    )

    clean_backend = backend
    newapi_model = parse_newapi_video_backend(clean_backend)
    huimeng_model = parse_huimeng_video_backend(clean_backend)
    backend_enum: VideoBackend | None = None
    if not newapi_model and not huimeng_model:
        try:
            backend_enum = VideoBackend(clean_backend)
        except ValueError:
            from ai_anime.generators.huimengi import huimeng_video_backend_options

            clean_backend = resolve_labeled_value(
                clean_backend,
                {
                    **newapi_video_backend_options(),
                    **huimeng_video_backend_options(),
                },
                label_name="video backend",
            )
            newapi_model = parse_newapi_video_backend(clean_backend)
            huimeng_model = parse_huimeng_video_backend(clean_backend)

    if newapi_model:
        return newapi_model
    if huimeng_model:
        return huimeng_model

    if backend_enum is None:
        try:
            backend_enum = VideoBackend(clean_backend)
        except ValueError as exc:
            raise InvalidGenerationCreditRequest("invalid video backend") from exc

    if backend_enum == VideoBackend.SEEDANCE_FAST:
        from ai_anime.config import SEEDANCE_FAST_MODEL

        return SEEDANCE_FAST_MODEL
    if backend_enum in {
        VideoBackend.SEEDANCE_PRO,
        VideoBackend.SEEDANCE_PRO_SILENT,
    }:
        from ai_anime.config import SEEDANCE_PRO_MODEL

        return SEEDANCE_PRO_MODEL
    if backend_enum == VideoBackend.SEEDANCE_2:
        from ai_anime.generators.video_generator import Seedance2VideoGenerator

        return Seedance2VideoGenerator.MODEL
    if backend_enum == VideoBackend.WAN26:
        from ai_anime.generators.video_generator import Wan26VideoGenerator

        return Wan26VideoGenerator.MODEL
    if backend_enum == VideoBackend.GROK_720:
        from ai_anime.generators.video_generator import GrokVideoGenerator

        return GrokVideoGenerator.MODEL

    raise InvalidGenerationCreditRequest("video backend has no credit model")


def _fixed_image_billing_params(value: str, *, model: str) -> dict:
    if value == "scene_pano":
        image_size = (os.environ.get("SCENE_360_IMAGE_SIZE") or "2K").strip()
        quality = (
            os.environ.get("SCENE_360_IMAGE_QUALITY")
            or os.environ.get("HUIMENG_IMAGE_QUALITY")
            or "medium"
        ).strip()
        return image_billing_params(
            model=model,
            image_size=image_size,
            quality=quality,
        )
    if value in {"scene_master", "scene_reverse_master"}:
        return image_billing_params(
            model=model,
            image_size="1K",
            quality="low",
        )
    if value == "prop_reference":
        from ai_anime.generators.nanobanana_grid import normalize_image_size
        from ai_anime.generators.nanobanana_prop import PROP_REF_IMAGE_SIZE

        return image_billing_params(
            model=model,
            image_size=normalize_image_size(PROP_REF_IMAGE_SIZE, provider="newapi"),
            quality="medium",
        )
    return {}


def _image_selection_billing_params(
    *,
    model: str,
    mode_key: str,
    image_role: str,
) -> dict:
    params: dict[str, str] = {}
    if mode_key:
        from ai_anime.generators.nanobanana_grid import (
            REGEN_MODE_CONFIGS,
            normalize_image_size,
        )

        mode_config = REGEN_MODE_CONFIGS.get(mode_key)
        if mode_config is None:
            raise InvalidGenerationCreditRequest("invalid image mode key")
        params["size"] = normalize_image_size(
            str(mode_config.get("image_size") or ""),
            "newapi",
        )

    clean_role = image_role.lower()
    if clean_role == "sketch":
        from ai_anime.config import OPENAI_SKETCH_IMAGE_QUALITY

        params = merge_billing_params(
            params,
            image_billing_params(
                model=model,
                quality=OPENAI_SKETCH_IMAGE_QUALITY,
            ),
        )
    elif clean_role in {"render", "character", "identity"}:
        from ai_anime.config import OPENAI_IMAGE_QUALITY

        params = merge_billing_params(
            params,
            image_billing_params(
                model=model,
                image_size=("1K" if clean_role in {"character", "identity"} else ""),
                quality=OPENAI_IMAGE_QUALITY,
            ),
        )
    return params


class ConfiguredGenerationModelCatalog:
    def resolve_model(self, *, kind: str, value: str) -> str:
        if kind == "model":
            if not value:
                raise InvalidGenerationCreditRequest("model is required")
            return value
        if kind == "image_selection":
            return _image_selection_model(value)
        if kind == "fixed_image":
            if not value:
                raise InvalidGenerationCreditRequest("fixed image kind is required")
            return _fixed_image_model(value)
        if kind == "video_backend":
            return _video_backend_model(value)
        if kind == "beat_tts":
            from ai_anime.config import INDEXTTS2_RECORD_MODEL

            return INDEXTTS2_RECORD_MODEL.strip()
        if kind == "freezone_audio_music":
            return "LingShan-MU-11"
        if kind == "freezone_image_reverse_prompt":
            from ai_anime.freezone.vision_gateway import resolve_freezone_vision_model

            return resolve_freezone_vision_model()
        if kind == "freezone_story_script":
            from ai_anime.modules.creative_canvas.public import (
                resolve_creative_canvas_story_script_model,
            )

            return resolve_creative_canvas_story_script_model(value or None)["model"]
        if kind == "style_analyzer":
            from ai_anime.config import get_newapi_text_model_name

            return get_newapi_text_model_name(
                "STYLE_ANALYZER_MODEL",
                "gemini-3.5-flash",
            )
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
        if kind == "fixed_image":
            return _fixed_image_billing_params(value, model=model)
        if kind == "image_selection":
            return _image_selection_billing_params(
                model=model,
                mode_key=mode_key,
                image_role=image_role,
            )
        return {}
