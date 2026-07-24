from pathlib import Path

import pytest


pytestmark = pytest.mark.m09


def test_api_routes_do_not_expose_dead_render_analyze_endpoint():
    routes_root = Path("src/ai_anime/api/routes")
    source = "\n".join(
        path.read_text(encoding="utf-8") for path in routes_root.glob("*.py")
    )

    assert not (routes_root / "generation.py").exists()
    assert "/render/analyze" not in source
    assert "analyze_render_auto_repair" not in source
    assert "RenderAutoRepairAnalyzer" not in source


def test_render_auto_repair_analyzer_code_is_removed():
    assert not Path("src/ai_anime/verification/render_auto_repair.py").exists()

    models_source = Path("src/ai_anime/verification/models.py").read_text(encoding="utf-8")
    prompts_source = Path("src/ai_anime/verification/prompts.py").read_text(encoding="utf-8")

    assert "RenderAutoRepairResult" not in models_source
    assert "RenderBeatReviewResult" not in models_source
    assert "RENDER_AUTO_REPAIR_PROMPT" not in prompts_source
    assert "RENDER_SINGLE_BEAT_REVIEW_PROMPT" not in prompts_source
