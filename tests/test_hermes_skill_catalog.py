from pathlib import Path

from ai_anime.modules.ai_assistant.infrastructure.hermes.skill_catalog import (
    expand_skill_invocation,
    list_slash_commands_for_home,
    merge_runtime_slash_commands,
)
from ai_anime.modules.ai_assistant.infrastructure.hermes.tool_catalog import (
    list_tool_catalog_for_home,
)


def _write_skill(
    home: Path,
    relative_dir: str,
    *,
    name: str,
    description: str,
    body: str = "# Instructions\nFollow this workflow.",
) -> Path:
    skill_dir = home / "skills" / relative_dir
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_md = skill_dir / "SKILL.md"
    skill_md.write_text(
        "---\n"
        f"name: {name}\n"
        f'description: "{description}"\n'
        "---\n\n"
        f"{body}\n",
        encoding="utf-8",
    )
    return skill_md


def test_catalog_lists_core_commands_and_discovered_skills(tmp_path: Path) -> None:
    _write_skill(
        tmp_path,
        "ai_anime",
        name="ai_anime",
        description="AI anime workflow",
    )
    _write_skill(
        tmp_path,
        "_user/my-favorite",
        name="My Favorite",
        description="User workflow",
    )

    commands = list_slash_commands_for_home(tmp_path)
    by_name = {item["name"]: item for item in commands}

    assert "help" not in by_name
    assert by_name["model"]["kind"] == "command"
    assert "queue" not in by_name
    assert {"context", "reset", "compact", "version"}.isdisjoint(by_name)
    assert by_name["ai-anime"] == {
        "name": "ai-anime",
        "description": "AI anime workflow",
        "input_hint": "补充本次 Skill 的具体任务说明",
        "kind": "skill",
        "source": "managed",
    }
    assert by_name["my-favorite"]["source"] == "user"
    assert len(by_name["tools"]["tools"]) == 15


def test_tool_catalog_is_complete_and_scope_aware() -> None:
    repo_home = Path(__file__).resolve().parents[1] / ".hermes"

    project_tools = list_tool_catalog_for_home(
        repo_home,
        include_project_tools=True,
    )
    home_tools = list_tool_catalog_for_home(
        repo_home,
        include_project_tools=False,
    )

    assert len(project_tools) == 59
    assert len(home_tools) == 15
    assert len({tool["name"] for tool in project_tools}) == 59
    assert all(
        tool["label"]
        and tool["description"]
        and tool["category"]
        and tool["source"]
        for tool in project_tools
    )
    project_by_name = {tool["name"]: tool for tool in project_tools}
    assert project_by_name["question"]["category"] == "确认与决策"
    assert project_by_name["ai_anime_start_single_video"]["source"] == "AI anime"
    assert project_by_name["ai_anime_optimize_video_prompt"]["source"] == "AI anime"
    assert "question" not in {tool["name"] for tool in home_tools}


def test_catalog_honors_disabled_skills_and_ignores_support_copies(
    tmp_path: Path,
) -> None:
    _write_skill(
        tmp_path,
        "disabled",
        name="disabled",
        description="Disabled",
    )
    _write_skill(
        tmp_path,
        "outer",
        name="outer",
        description="Outer",
    )
    _write_skill(
        tmp_path,
        "outer/references/copied",
        name="copied",
        description="Copied support package",
    )
    (tmp_path / "config.yaml").write_text(
        "skills:\n  disabled:\n    - disabled\n",
        encoding="utf-8",
    )

    names = {item["name"] for item in list_slash_commands_for_home(tmp_path)}

    assert "outer" in names
    assert "disabled" not in names
    assert "copied" not in names


def test_skill_invocation_loads_full_body_and_preserves_user_instruction(
    tmp_path: Path,
) -> None:
    _write_skill(
        tmp_path,
        "ai_anime",
        name="ai_anime",
        description="AI anime workflow",
        body="# Workflow\nUse the production workflow tool.",
    )

    expanded = expand_skill_invocation(tmp_path, "/ai-anime 继续完成第一集")

    assert expanded is not None
    assert 'invoked the "ai_anime" skill' in expanded
    assert "Use the production workflow tool." in expanded
    assert "description: \"AI anime workflow\"" not in expanded
    assert expanded.endswith("skill invocation: 继续完成第一集")
    assert expand_skill_invocation(tmp_path, "/help") is None
    assert expand_skill_invocation(tmp_path, "/missing do work") is None


def test_runtime_command_update_keeps_discovered_skills(tmp_path: Path) -> None:
    _write_skill(
        tmp_path,
        "ai_anime",
        name="ai_anime",
        description="AI anime workflow",
    )

    merged = merge_runtime_slash_commands(
        tmp_path,
        [{"name": "compact", "description": "Compact context"}],
    )

    by_name = {item["name"]: item for item in merged}

    assert list(by_name) == ["model", "tools", "ai-anime"]
    assert "compact" not in by_name
    assert by_name["ai-anime"] == {
        "name": "ai-anime",
        "description": "AI anime workflow",
        "input_hint": "补充本次 Skill 的具体任务说明",
        "kind": "skill",
        "source": "managed",
    }


def test_catalog_localizes_known_legacy_pipeline_skill(tmp_path: Path) -> None:
    _write_skill(
        tmp_path,
        "legacy",
        name="ai-anime-pipeline-operations",
        description="Status-driven AI anime episode production.",
    )

    command = next(
        item
        for item in list_slash_commands_for_home(tmp_path)
        if item["name"] == "ai-anime-pipeline-operations"
    )

    assert command["description"] == (
        "按项目状态推进漫剧分集生产、素材完整性检查、失败恢复与精简剧本规划。"
    )
