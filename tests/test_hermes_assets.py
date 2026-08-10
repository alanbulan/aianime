from __future__ import annotations

import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
HERMES_ASSETS = REPO_ROOT / ".hermes"


def test_ai_anime_hermes_assets_are_bundled_and_use_current_contract_names():
    plugin = HERMES_ASSETS / "plugins" / "ai_anime" / "__init__.py"
    manifest = HERMES_ASSETS / "plugins" / "ai_anime" / "plugin.yaml"
    skill = HERMES_ASSETS / "skills" / "ai_anime" / "SKILL.md"

    plugin_text = plugin.read_text(encoding="utf-8")
    ast.parse(plugin_text)

    assert "name: ai_anime" in manifest.read_text(encoding="utf-8")
    assert "name: ai_anime" in skill.read_text(encoding="utf-8")
    assert '"ai_anime_pipeline_status"' in plugin_text
    assert 'requires_env=["AI_ANIME_API_URL", "AI_ANIME_AGENT_TOKEN"]' in plugin_text
    assert 'os.environ.get("AI_ANIME_DESKTOP_TOKEN", "").strip()' in plugin_text
    assert 'headers["X-AI-Anime-Desktop-Token"] = desktop_token' in plugin_text
    assert "_READ_RESULT_CLASSIFIER_PADDING" in plugin_text
    assert "_read_tool_result(" in plugin_text
    assert "dramaclaw" not in plugin_text.lower()
