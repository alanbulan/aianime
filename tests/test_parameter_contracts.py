from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_anime.api.routes.creative_canvas.image_schemas import FreezoneUpscaleRequest
from ai_anime.api.routes.creative_canvas.skills_schemas import FreezoneScene360Request
from ai_anime.api.routes.creative_canvas.video_schemas import (
    FreezoneVideoComposeRequest,
)
from ai_anime.api.routes.production.render_schemas import RenderPlanRequest
from ai_anime.api.routes.production.video_schemas import (
    GlobalOptimizeRequest,
    SingleVideoRequest,
    VideoComposeRequest,
)


def test_removed_parameter_contracts_are_rejected_instead_of_silently_ignored() -> None:
    with pytest.raises(ValidationError, match="scale_factor"):
        FreezoneUpscaleRequest.model_validate(
            {
                "source_url": "/static/source.png",
                "model": "image-model",
                "scale_factor": 4,
            }
        )
    with pytest.raises(ValidationError, match="cover_url"):
        FreezoneVideoComposeRequest.model_validate({"cover_url": "/static/cover.png"})
    with pytest.raises(ValidationError, match="sketch_aspect_padding"):
        RenderPlanRequest.model_validate(
            {
                "beat_indices": [1],
                "aspect_mode": "9:16",
                "sketch_aspect_padding": True,
            }
        )
    with pytest.raises(ValidationError, match="cover_url"):
        VideoComposeRequest.model_validate({"cover_url": "/static/cover.png"})


def test_scene_360_rejects_an_unsupported_quality_value() -> None:
    with pytest.raises(ValidationError, match="quality"):
        FreezoneScene360Request.model_validate(
            {
                "reference_url": "/static/scene.png",
                "model": "image-model",
                "quality": "ultra",
            }
        )


@pytest.mark.parametrize(
    "payload",
    [
        {"mode": "keyframe"},
        {"duration": 0},
    ],
)
def test_single_video_rejects_noncanonical_generation_parameters(
    payload: dict,
) -> None:
    with pytest.raises(ValidationError):
        SingleVideoRequest.model_validate(payload)


def test_global_video_optimization_rejects_an_unknown_language() -> None:
    with pytest.raises(ValidationError, match="language"):
        GlobalOptimizeRequest.model_validate({"language": "ja"})
