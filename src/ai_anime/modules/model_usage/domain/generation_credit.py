"""Generation credit quote rules."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

GenerationCreditKind = Literal[
    "model",
    "image_selection",
    "fixed_image",
    "video_backend",
    "beat_tts",
    "freezone_audio_music",
    "freezone_image_reverse_prompt",
    "freezone_story_script",
    "style_analyzer",
    "feature",
]
GenerationCreditSurface = Literal["ai_anime", "canvas"]


class InvalidGenerationCreditRequest(ValueError):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


@dataclass(frozen=True)
class CreditQuote:
    total_cost: int
    display: str
    unit: str = "call"
    unit_cost: int = 0
    quantity: int = 1
    params: dict | None = None


@dataclass(frozen=True)
class GenerationCreditCost:
    cost: int
    display: str
    unit: str | None = None
    unit_cost: int | None = None
    quantity: int | None = None
    params: dict | None = None


def clean_query_value(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def normalize_quantity(value: object) -> int:
    try:
        return max(int(value or 1), 0)
    except (TypeError, ValueError):
        return 1


def _image_model_supports_quality(model: str) -> bool:
    model_name = str(model or "").strip().lower()
    return (
        model_name in {"lingshan-g2", "gpt-image-2", "image-2", "image-2-official"}
        or "gpt-image" in model_name
    )


def image_billing_params(
    *,
    model: str,
    image_size: str = "",
    quality: str = "",
) -> dict[str, str]:
    params: dict[str, str] = {}
    clean_size = str(image_size or "").strip()
    if clean_size:
        params["size"] = clean_size
    clean_quality = str(quality or "").strip()
    if clean_quality and _image_model_supports_quality(model):
        params["quality"] = clean_quality
    return params


def merge_billing_params(defaults: Mapping, explicit: Mapping) -> dict:
    if not defaults:
        return dict(explicit)
    merged = dict(defaults)
    merged.update(explicit)
    return merged


def resolve_labeled_value(
    value: str,
    options: Mapping[str, str],
    *,
    label_name: str,
) -> str:
    clean_value = value.strip()
    if clean_value in options:
        return clean_value

    label_matches = [
        key for key, label in options.items() if label.strip() == clean_value
    ]
    if not label_matches:
        normalized_label = clean_value.casefold()
        label_matches = [
            key
            for key, label in options.items()
            if label.strip().casefold() == normalized_label
        ]
    if len(label_matches) != 1:
        detail = (
            f"ambiguous {label_name} label"
            if label_matches
            else f"invalid {label_name}"
        )
        raise InvalidGenerationCreditRequest(detail)
    return label_matches[0]


def generation_billing_kind(kind: str) -> str:
    if kind in {"image_selection", "fixed_image"}:
        return "image"
    if kind == "video_backend":
        return "video"
    if kind in {"beat_tts", "freezone_audio_music"}:
        return "audio"
    if kind in {
        "freezone_image_reverse_prompt",
        "freezone_story_script",
        "style_analyzer",
    }:
        return "text"
    if kind == "feature":
        return "feature"
    return "model"


def _video_billing_params(params: Mapping) -> dict[str, str]:
    resolution = str(params.get("resolution") or "").strip()
    return {"resolution": resolution} if resolution else {}


def normalize_billing_params(
    *,
    kind: str,
    surface: str,
    defaults: Mapping,
    explicit: Mapping,
) -> dict:
    if surface == "canvas":
        if kind == "video_backend":
            return _video_billing_params(explicit)
        return dict(explicit)

    if kind in {"fixed_image", "image_selection"}:
        return merge_billing_params(defaults, explicit)
    if kind == "video_backend":
        return _video_billing_params(explicit)
    return dict(explicit)


def build_generation_credit_cost(
    quote: CreditQuote,
    *,
    requested_quantity: int,
) -> GenerationCreditCost:
    total_cost = quote.total_cost
    if getattr(quote, "unit", "call") != "character":
        return GenerationCreditCost(cost=total_cost, display=str(total_cost))
    return GenerationCreditCost(
        cost=total_cost,
        display=str(total_cost),
        unit="character",
        unit_cost=getattr(quote, "unit_cost", 0),
        quantity=getattr(quote, "quantity", requested_quantity),
        params=getattr(quote, "params", None) or {},
    )
