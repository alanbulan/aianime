import json

from ai_anime.modules.ai_assistant.infrastructure import LocalAgentWorkspace


def _write_skill(path, content):
    path.mkdir(parents=True)
    (path / "SKILL.md").write_text(content, encoding="utf-8")


def test_agent_workspace_is_user_scoped_and_writes_claude_settings(
    monkeypatch,
    tmp_path,
):
    state_root = tmp_path / "state"
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(state_root))
    monkeypatch.setenv("AI_ANIME_API_URL", "http://127.0.0.1:9000/")
    workspace_adapter = LocalAgentWorkspace(repo_root=tmp_path / "repo")

    claude_workspace = workspace_adapter.ensure_claude(
        "admin",
        "project-a",
        "agent-token",
    )
    codex_workspace = workspace_adapter.ensure_codex("admin")

    expected = state_root / "admin" / ".chat_agents"
    assert claude_workspace == expected
    assert codex_workspace == expected
    settings_path = expected / ".claude" / "settings.local.json"
    assert json.loads(settings_path.read_text(encoding="utf-8")) == {
        "env": {
            "AI_ANIME_USERNAME": "admin",
            "AI_ANIME_AGENT_SCOPE": "user",
            "AI_ANIME_API_URL": "http://127.0.0.1:9000",
            "AI_ANIME_AGENT_TOKEN": "agent-token",
            "AI_ANIME_PROJECT_ID": "project-a",
        }
    }
    assert settings_path.read_text(encoding="utf-8").endswith("\n")
    assert (expected / ".claude" / "skills").is_dir()
    assert (expected / ".codex" / "skills").is_dir()


def test_home_claude_settings_do_not_include_project(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    workspace_adapter = LocalAgentWorkspace(repo_root=tmp_path / "repo")

    workspace = workspace_adapter.ensure_claude("admin", "")
    settings = json.loads(
        (workspace / ".claude" / "settings.local.json").read_text(encoding="utf-8")
    )

    assert "AI_ANIME_PROJECT_ID" not in settings["env"]


def test_agent_environment_preserves_process_values_and_sets_scope(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AI_ANIME_API_URL", "http://127.0.0.1:9001/")
    monkeypatch.setenv("INHERITED_AGENT_VALUE", "kept")
    workspace_adapter = LocalAgentWorkspace(repo_root=tmp_path / "repo")

    environment = workspace_adapter.build_environment(
        "admin",
        "project-a",
        "agent-token",
    )

    assert environment["INHERITED_AGENT_VALUE"] == "kept"
    assert environment["AI_ANIME_USERNAME"] == "admin"
    assert environment["AI_ANIME_AGENT_SCOPE"] == "user"
    assert environment["AI_ANIME_PROJECT_ID"] == "project-a"
    assert environment["AI_ANIME_API_URL"] == "http://127.0.0.1:9001"
    assert environment["AI_ANIME_AGENT_TOKEN"] == "agent-token"


def test_repo_claude_skill_source_precedes_codex_source(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    repo_root = tmp_path / "repo"
    _write_skill(repo_root / ".claude" / "skills" / "shared", "claude source")
    _write_skill(repo_root / ".codex" / "skills" / "shared", "codex source")
    workspace_adapter = LocalAgentWorkspace(repo_root=repo_root)

    workspace = workspace_adapter.ensure_codex("admin")

    copied = workspace / ".codex" / "skills" / "shared" / "SKILL.md"
    assert copied.read_text(encoding="utf-8") == "claude source"


def test_configured_ai_anime_skill_overrides_repo_source(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    repo_root = tmp_path / "repo"
    configured = tmp_path / "configured-skill"
    _write_skill(repo_root / ".claude" / "skills" / "ai_anime", "repo source")
    _write_skill(configured, "configured source")
    monkeypatch.setenv("CLAUDE_AI_ANIME_SKILL_PATH", str(configured))
    workspace_adapter = LocalAgentWorkspace(repo_root=repo_root)

    workspace = workspace_adapter.ensure_claude("admin", "project-a")

    copied = workspace / ".claude" / "skills" / "ai_anime" / "SKILL.md"
    assert copied.read_text(encoding="utf-8") == "configured source"


def test_existing_workspace_skill_is_not_overwritten(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    repo_root = tmp_path / "repo"
    source = repo_root / ".claude" / "skills" / "shared"
    _write_skill(source, "first version")
    workspace_adapter = LocalAgentWorkspace(repo_root=repo_root)

    workspace = workspace_adapter.ensure_claude("admin", "project-a")
    (source / "SKILL.md").write_text("second version", encoding="utf-8")
    workspace_adapter.ensure_claude("admin", "project-a")

    copied = workspace / ".claude" / "skills" / "shared" / "SKILL.md"
    assert copied.read_text(encoding="utf-8") == "first version"
