from __future__ import annotations

import ast
from pathlib import Path
import re


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


def test_every_ai_anime_plugin_tool_has_a_frontend_chinese_display_name():
    plugin_text = (
        HERMES_ASSETS / "plugins" / "ai_anime" / "__init__.py"
    ).read_text(encoding="utf-8")
    display_names_text = (
        REPO_ROOT
        / "frontend"
        / "src"
        / "modules"
        / "ai_assistant"
        / "domain"
        / "toolDisplayName.ts"
    ).read_text(encoding="utf-8")
    plugin_names = set(re.findall(r'^\s{8}"(ai_anime_[a-z0-9_]+|question)",$', plugin_text, re.M))
    localized_names = set(
        re.findall(r"^\s{2}(ai_anime_[a-z0-9_]+|question):\s*\"[^\"]*[\u3400-\u9fff]", display_names_text, re.M)
    )

    assert plugin_names
    assert "question" in plugin_names
    assert plugin_names == localized_names


def test_continuous_episode_mode_reaches_delivery_without_manual_pause():
    run_modes = (
        HERMES_ASSETS / "skills" / "ai_anime" / "references" / "run-modes.md"
    ).read_text(encoding="utf-8")

    assert "连续自动推进只提交并等待一个父任务" in run_modes
    assert "ai_anime_run_production_workflow" in run_modes
    assert "ai_anime_wait_task" in run_modes
    assert "禁止根据 `pipeline/status.next_step`" in run_modes
    assert "不要求用户再发“继续”" in run_modes
    assert "恢复同一个完整生产目标" in run_modes
    assert "all_beats=true" in run_modes
    assert "在草图前先补齐本集视觉资产" in run_modes
    assert "pipeline/status.next_step=voice_assets" in run_modes
    assert "首帧 → 全局优化 → 声线复检" in run_modes


def test_episode_playbook_prepares_voices_before_full_production_sketches():
    episode = (
        HERMES_ASSETS / "skills" / "ai_anime" / "playbooks" / "episode.md"
    ).read_text(encoding="utf-8")

    assert "视觉资产、声线与配音模型前置，再依次执行草图" in episode
    assert "voice_asset_issues" in episode
    assert "只做静态分镜时不要求声线" in episode


def test_main_skill_and_pipeline_details_match_voice_gate_stage_order():
    skill = (
        HERMES_ASSETS / "skills" / "ai_anime" / "SKILL.md"
    ).read_text(encoding="utf-8")
    pipeline = (
        HERMES_ASSETS / "skills" / "ai_anime" / "references" / "pipeline-details.md"
    ).read_text(encoding="utf-8")

    assert "`声线与配音模型前置检查` → `逐 Beat 1x1 草图就绪`" in skill
    assert "`首帧 selected_regen` → `global_optimize_video` → `声线复检`" in skill
    assert "声线与配音模型前置、草图、AI 检测、首帧、全局优化、声线复检" in pipeline
    for guidance in (skill, pipeline):
        assert "pipeline/status.next_step=voice_assets" in guidance
        assert "voice_asset_issues" in guidance
        assert "只做静态分镜时不要求声线" in guidance
