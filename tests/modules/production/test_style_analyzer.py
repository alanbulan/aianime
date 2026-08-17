import pytest
from pydantic import ValidationError

from ai_anime.modules.production.infrastructure.media_generation.style_analyzer import (
    StyleAnalysisResult,
    StyleAnalyzer,
)


def test_style_analysis_result_includes_runtime_style_branch() -> None:
    result = StyleAnalysisResult(
        style_instructions="Create clean cel animation.",
        avoid_instructions="FORBIDDEN: photorealism.",
        style_tag="CLEAN CEL ANIME",
        style_family="animation",
        animation_subtype="2d",
        suggested_name="Clean Cel Anime",
        suggested_label="清透赛璐璐动画",
    )

    assert result.model_dump()["style_family"] == "animation"
    assert result.model_dump()["animation_subtype"] == "2d"
    assert '"style_family"' in StyleAnalyzer.ANALYSIS_PROMPT
    assert '"animation_subtype"' in StyleAnalyzer.ANALYSIS_PROMPT


@pytest.mark.parametrize(
    ("style_family", "animation_subtype"),
    [
        ("illustration", "flat"),
        ("live_action", "2d"),
        ("animation", ""),
    ],
)
def test_style_analysis_result_rejects_invalid_style_branch(
    style_family: str,
    animation_subtype: str,
) -> None:
    with pytest.raises(ValidationError):
        StyleAnalysisResult(
            style_instructions="Create a polished image.",
            avoid_instructions="FORBIDDEN: artifacts.",
            style_tag="POLISHED",
            style_family=style_family,
            animation_subtype=animation_subtype,
            suggested_name="Polished",
            suggested_label="精致风格",
        )
