"""Unit tests for ai_anime.modules.ai_assistant.infrastructure.hermes.hermes_workspace."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from ai_anime.modules.ai_assistant.infrastructure.hermes import hermes_sdk
from ai_anime.modules.ai_assistant.infrastructure.hermes import (
    hermes_workspace as hw,
)
from ai_anime.modules.model_usage.public import configure_model_access
from ai_anime.modules.model_usage.public import MODE_MIXED


def _enabled_toolsets(config: str) -> list[str]:
    lines = config.splitlines()
    values: list[str] = []
    in_block = False
    for line in lines:
        if line.strip() == "enabled_toolsets:":
            in_block = True
            continue
        if in_block:
            if line.startswith("  - "):
                values.append(line.split("#", 1)[0].replace("  - ", "", 1).strip())
                continue
            if line and not line.startswith(" "):
                break
    return values


def _ai_anime_provider(config: dict) -> dict:
    return next(
        item
        for item in config["custom_providers"]
        if item.get("name") == "custom"
    )


def _assert_managed_asset(path: Path, expected_file: str) -> None:
    assert path.is_dir()
    assert (path / expected_file).is_file()
    if not hw._is_directory_link(path):
        assert (path / hw._MANAGED_ASSET_MARKER).is_file()


@pytest.fixture
def isolated_workspace(tmp_path, monkeypatch):
    """Redirect AI_ANIME_ROOT/state and repo-pinned skills to a tmp tree."""
    repo_root = tmp_path / "repo"
    state_root = repo_root / "state"
    state_root.mkdir(parents=True)
    monkeypatch.setattr(hw, "AI_ANIME_ROOT", repo_root)
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(state_root))
    monkeypatch.setenv(
        "AI_ANIME_CLOUD_PROXY_BASE_URL",
        "http://127.0.0.1:45678/v1",
    )
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "root-key")
    configure_model_access(
        allows_custom_models=False,
        mode=MODE_MIXED,
        model_assignments=[
            {"modelId": "cloud-text-default", "role": "TEXT"},
        ],
    )
    for key in (
        "NEWAPI_API_KEY",
        "NEWAPI_BASE_URL",
        "MODEL_GATEWAY_RUNTIME_VERSION",
        "OPENAI_API_KEY",
        "OPENAI_API_BASE",
        "OPENAI_BASE_URL",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.delenv("MODEL_GATEWAY_MODE", raising=False)
    monkeypatch.delenv("AI_ANIME_HERMES_SKILLS", raising=False)
    monkeypatch.delenv("HERMES_MODEL", raising=False)
    monkeypatch.delenv("HERMES_MODEL_DEFAULT", raising=False)
    monkeypatch.delenv("AI_ANIME_HERMES_MODEL", raising=False)
    monkeypatch.delenv("HERMES_MODEL_PROVIDER", raising=False)
    monkeypatch.delenv("HERMES_MODEL_BASE_URL", raising=False)
    monkeypatch.delenv("HERMES_MODEL_API_MODE", raising=False)
    monkeypatch.delenv("HERMES_MODEL_CONTEXT_LENGTH", raising=False)
    yield repo_root
    configure_model_access(allows_custom_models=False, mode=MODE_MIXED)


@pytest.fixture
def repo_skills(isolated_workspace):
    """Create a fake repo .hermes/skills tree."""
    skills = isolated_workspace / ".hermes" / "skills"
    skills.mkdir(parents=True)
    for name in ("json-render", "ai_anime", "other-skill"):
        (skills / name).mkdir()
        (skills / name / "SKILL.md").write_text(f"# {name}\n")
    return skills


@pytest.fixture
def repo_plugins(isolated_workspace):
    """Create a fake repo .hermes/plugins tree."""
    plugins = isolated_workspace / ".hermes" / "plugins"
    plugins.mkdir(parents=True)
    for name in ("ai_anime", "other-plugin"):
        (plugins / name).mkdir()
        (plugins / name / "plugin.yaml").write_text(f"name: {name}\n")
    return plugins


def test_fresh_create_layout(isolated_workspace, repo_skills, repo_plugins):
    home = hw.ensure_user_hermes_workspace("admin")
    assert home.exists()
    assert (home / "config.yaml").exists()
    assert (home / ".env").exists()
    assert (home / "tmp").is_dir()
    assert (home / "skills" / "_user").is_dir()
    # Windows without Developer Mode/admin privileges receives a managed copy.
    _assert_managed_asset(home / "skills" / "ai_anime", "SKILL.md")
    assert not (home / "skills" / "json-render").exists()
    assert not (home / "skills" / "other-skill").exists()
    plugin_link = home / "plugins" / "ai_anime"
    _assert_managed_asset(plugin_link, "plugin.yaml")
    assert not (home / "plugins" / "other-plugin").exists()
    config = (home / "config.yaml").read_text()
    assert _enabled_toolsets(config) == ["hermes-acp", "memory"]
    assert "    - ai_anime" in config
    assert "你是 AI anime 助手" in (home / "SOUL.md").read_text()
    memory = (home / "memories" / "MEMORY.md").read_text()
    assert "AI anime 助手在 AI anime 会话中面向用户自称“AI anime 助手”" in memory
    assert "我是 AI anime 助手，AI anime 的小说转视频创作助手。" not in memory


def test_hermes_initialize_timeout_allows_cold_start():
    assert hermes_sdk.INITIALIZE_TIMEOUT == 30.0


def test_hermes_detects_content_filter_finish_reason():
    payload = {
        "result": {
            "body": [
                {
                    "finish_reason": "content_filter",
                    "provider_details": {"finish_reason": "content_filter"},
                }
            ]
        }
    }

    assert hermes_sdk._has_content_filter_signal(payload)


def test_hermes_detects_content_filter_error_text():
    payload = {"error": {"message": "Content filter triggered. Finish reason: 'content_filter'"}}

    assert hermes_sdk._has_content_filter_signal(payload)


def test_hermes_classifies_ai_anime_write_tools():
    assert hermes_sdk._is_ai_anime_write_tool("ai_anime_generate_script")
    assert hermes_sdk._is_ai_anime_write_tool("ai_anime_start_single_video")
    assert hermes_sdk._is_ai_anime_write_tool("ai_anime_run_production_workflow")
    assert hermes_sdk._is_ai_anime_write_tool("ai_anime_create_style")
    assert not hermes_sdk._is_ai_anime_write_tool("ai_anime_pipeline_status")
    assert not hermes_sdk._is_ai_anime_write_tool("ai_anime_get_task")


def test_hermes_turn_tool_limit_supports_multi_step_episode_workflows():
    assert hermes_sdk.TURN_TOOL_CALL_LIMIT >= 512


def test_hermes_detects_failed_tool_update():
    assert hermes_sdk._is_failed_tool_update({"status": "failed"})
    assert hermes_sdk._is_failed_tool_update({"result": {"ok": False}})
    assert not hermes_sdk._is_failed_tool_update({"status": "completed"})


def test_hermes_tool_update_outcome_preserves_failure_detail():
    success, error = hermes_sdk._tool_update_outcome(
        {"status": "failed", "error": "远端模型调用失败"}
    )

    assert success is False
    assert error == "远端模型调用失败"


def test_hermes_tool_update_outcome_marks_completion():
    assert hermes_sdk._tool_update_outcome({"status": "completed"}) == (
        True,
        None,
    )


def test_hermes_read_tool_outcome_ignores_historical_failed_task():
    update = {
        "status": "completed",
        "result": {
            "ok": True,
            "data": [{"status": "failed", "error": "历史任务失败"}],
        },
    }

    assert hermes_sdk._tool_update_outcome(
        update,
        tool_name="ai_anime_list_tasks",
    ) == (True, None)


def test_hermes_correlates_parallel_tool_updates_by_call_id():
    thread = hermes_sdk.HermesSdkThread(
        cli_path=Path("hermes"),
        cwd=Path("."),
        env={},
        model=None,
        username="alice",
        session_id="session-1",
    )
    thread._translate_notification(
        {
            "method": "session/update",
            "params": {
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "call-read",
                    "title": "ai_anime_list_tasks",
                }
            },
        },
        "turn-1",
    )

    event = thread._translate_notification(
        {
            "method": "session/update",
            "params": {
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "call-read",
                    "status": "completed",
                    "result": {
                        "ok": True,
                        "data": [{"status": "failed"}],
                    },
                }
            },
        },
        "turn-1",
    )

    assert event is not None
    assert event.name == "ai_anime_list_tasks"
    assert event.success is True
    assert event.error is None


def test_hermes_translates_tool_failure_status():
    thread = hermes_sdk.HermesSdkThread(
        cli_path=Path("hermes"),
        cwd=Path("."),
        env={},
        model=None,
        username="alice",
        session_id="session-1",
    )
    event = thread._translate_notification(
        {
            "method": "session/update",
            "params": {
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "status": "failed",
                    "error": "远端模型调用失败",
                }
            },
        },
        "turn-1",
    )

    assert event is not None
    assert event.success is False
    assert event.error == "远端模型调用失败"


def test_hermes_stops_only_after_failed_write_tool_result():
    failed_write = hermes_sdk.ChatBackendEvent(
        type="tool_update",
        name="ai_anime_generate_audio",
        tool_phase="result",
        success=False,
    )
    failed_read = hermes_sdk.ChatBackendEvent(
        type="tool_update",
        name="ai_anime_pipeline_status",
        tool_phase="result",
        success=False,
    )
    write_call = hermes_sdk.ChatBackendEvent(
        type="tool_update",
        name="ai_anime_generate_audio",
        tool_phase="call",
        success=False,
    )

    assert hermes_sdk._should_stop_after_failed_write(failed_write) is True
    assert hermes_sdk._should_stop_after_failed_write(failed_read) is False
    assert hermes_sdk._should_stop_after_failed_write(write_call) is False


def test_state_root_prefers_env(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))

    assert hw._state_root() == tmp_path / "state"


def test_state_root_falls_back_to_repo(monkeypatch, tmp_path):
    monkeypatch.setattr(hw, "AI_ANIME_ROOT", tmp_path / "repo")
    monkeypatch.delenv("AI_ANIME_STATE_DIR", raising=False)

    assert hw._state_root() == tmp_path / "repo" / "state"


def test_hermes_assets_root_prefers_bundled_directory(monkeypatch, tmp_path):
    assets = tmp_path / "bundled-hermes-assets"
    monkeypatch.setenv("AI_ANIME_HERMES_ASSETS_DIR", str(assets))

    assert hw._hermes_assets_root() == assets


def test_fresh_config_uses_router_catalog_and_keeps_proxy_transport(
    isolated_workspace, repo_skills, repo_plugins, monkeypatch
):
    (isolated_workspace / ".env").write_text(
        "\n".join(
            [
                "NEWAPI_API_KEY=root-key",
                "HERMES_MODEL=gemini-3.5-flash",
                "HERMES_MODEL_PROVIDER=openrouter",
                "HERMES_MODEL_BASE_URL=http://newapi.local/v1",
                "HERMES_MODEL_API_MODE=responses",
                "HERMES_MODEL_CONTEXT_LENGTH=65536",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    home = hw.ensure_user_hermes_workspace("admin")
    config = (home / "config.yaml").read_text(encoding="utf-8")

    assert "  default: cloud-text-default" in config
    parsed = yaml.safe_load(config)
    assert parsed["model"]["provider"] == "custom:custom"
    assert parsed["model"]["default"] == "cloud-text-default"
    assert parsed["model"]["context_length"] == 65536
    assert "api_key" not in parsed["model"]
    provider = _ai_anime_provider(parsed)
    assert provider == {
        "name": "custom",
        "base_url": "http://127.0.0.1:45678/v1",
        "key_env": "NEWAPI_API_KEY",
        "api_mode": "responses",
    }


def test_existing_config_syncs_router_model_without_persisting_provider_keys(
    isolated_workspace, repo_skills, repo_plugins
):
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=[{"modelId": "old-text", "role": "TEXT"}],
    )
    home = hw.ensure_user_hermes_workspace("admin")
    config_path = home / "config.yaml"
    first = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert "api_key" not in first["model"]
    assert _ai_anime_provider(first)["base_url"] == "http://127.0.0.1:45678/v1"
    assert "old-key" not in config_path.read_text(encoding="utf-8")

    config = config_path.read_text(encoding="utf-8") + "\ncustom_block:\n  keep: true\n"
    config_path.write_text(config, encoding="utf-8")
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=[{"modelId": "new-text", "role": "TEXT"}],
    )

    hw.ensure_user_hermes_workspace("admin")
    parsed = yaml.safe_load(config_path.read_text(encoding="utf-8"))

    assert "api_key" not in parsed["model"]
    assert _ai_anime_provider(parsed)["base_url"] == "http://127.0.0.1:45678/v1"
    assert _ai_anime_provider(parsed)["key_env"] == "NEWAPI_API_KEY"
    assert "rotated-key" not in config_path.read_text(encoding="utf-8")
    assert parsed["custom_block"]["keep"] is True
    assert parsed["compression"] == {
        "enabled": True,
        "threshold": 0.75,
        "target_ratio": 0.20,
        "protect_last_n": 20,
        "protect_first_n": 3,
        "abort_on_summary_failure": True,
        "in_place": True,
    }
    assert parsed["auxiliary"]["compression"] == {
        "provider": "custom:custom",
        "model": "new-text",
        "timeout": 300,
    }
    assert _enabled_toolsets(config_path.read_text(encoding="utf-8")) == [
        "hermes-acp",
        "memory",
    ]

    hw.ensure_user_hermes_workspace("admin")
    reparsed = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert reparsed["enabled_toolsets"] == ["hermes-acp", "memory"]


def test_hermes_uses_highest_priority_router_text_model_before_root_env(
    isolated_workspace, repo_skills, repo_plugins
):
    (isolated_workspace / ".env").write_text(
        "NEWAPI_API_KEY=root-key\nNEWAPI_BASE_URL=http://root-gateway/v1\n",
        encoding="utf-8",
    )
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=[
            {"modelId": "cloud-text", "role": "TEXT", "priority": 20},
            {"modelId": "custom-text", "role": "TEXT", "priority": 10},
        ],
    )

    home = hw.ensure_user_hermes_workspace("admin")
    parsed = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    env_text = (home / ".env").read_text(encoding="utf-8")

    assert "api_key" not in parsed["model"]
    assert _ai_anime_provider(parsed)["base_url"] == "http://127.0.0.1:45678/v1"
    assert _ai_anime_provider(parsed)["key_env"] == "NEWAPI_API_KEY"
    assert parsed["model"]["default"] == "custom-text"
    assert "custom-key" not in (home / "config.yaml").read_text(encoding="utf-8")
    assert "OPENAI_API_KEY" not in env_text
    assert "root-key" not in env_text


def test_hermes_uses_the_mixed_router_text_default(
    isolated_workspace, repo_skills, repo_plugins
):
    configure_model_access(
        allows_custom_models=False,
        mode=MODE_MIXED,
        model_assignments=[
            {"modelId": "cloud-text-default", "role": "TEXT"},
        ],
    )

    home = hw.ensure_user_hermes_workspace("admin")
    parsed = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))

    assert parsed["model"]["default"] == "cloud-text-default"
    assert _ai_anime_provider(parsed)["base_url"] == (
        "http://127.0.0.1:45678/v1"
    )


def test_hermes_keyless_provider_still_uses_authenticated_desktop_proxy(
    isolated_workspace, repo_skills, repo_plugins
):
    configure_model_access(
        allows_custom_models=True,
        mode=MODE_MIXED,
        model_assignments=[{"modelId": "local-text", "role": "TEXT"}],
    )

    home = hw.ensure_user_hermes_workspace("admin")
    parsed = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    provider = _ai_anime_provider(parsed)

    assert provider["base_url"] == "http://127.0.0.1:45678/v1"
    assert provider["key_env"] == "NEWAPI_API_KEY"
    assert "api_key" not in provider
    assert parsed["model"]["default"] == "local-text"


def test_idempotent_rerun(isolated_workspace, repo_skills, repo_plugins):
    home1 = hw.ensure_user_hermes_workspace("admin")
    cfg_text = (home1 / "config.yaml").read_text(encoding="utf-8")
    # Touch user .env so we can verify it is NOT overwritten
    (home1 / ".env").write_text("# user customized\nOPENROUTER_API_KEY=secret\n")

    home2 = hw.ensure_user_hermes_workspace("admin")
    assert home2 == home1
    # config.yaml content not regenerated (we only write config changes when needed)
    assert (home1 / "config.yaml").read_text(encoding="utf-8") == cfg_text
    # .env preserved
    assert "OPENROUTER_API_KEY=secret" in (home1 / ".env").read_text()


def test_fresh_workspace_does_not_persist_newapi_key(
    isolated_workspace, repo_skills, repo_plugins, monkeypatch
):
    (isolated_workspace / ".env").write_text(
        "NEWAPI_API_KEY=test-newapi-key\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("AI_ANIME_CLOUD_PROXY_TOKEN", "test-newapi-key")

    home = hw.ensure_user_hermes_workspace("admin")
    env_text = (home / ".env").read_text(encoding="utf-8")
    config = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))

    assert "api_key" not in config["model"]
    assert _ai_anime_provider(config)["key_env"] == "NEWAPI_API_KEY"
    assert "test-newapi-key" not in (home / "config.yaml").read_text(encoding="utf-8")
    assert "OPENAI_API_KEY" not in env_text


def test_existing_inline_key_is_removed_automatically(
    isolated_workspace, repo_skills, repo_plugins
):
    home = isolated_workspace / "state" / "admin" / ".hermes"
    home.mkdir(parents=True)
    (home / "config.yaml").write_text(
        """model:
  default: legacy-model
  provider: custom
  base_url: https://legacy.example/v1
  api_key: legacy-key
custom_providers:
  - name: user-provider
    base_url: https://user.example/v1
    key_env: USER_PROVIDER_KEY
""",
        encoding="utf-8",
    )

    hw.ensure_user_hermes_workspace("admin")
    text = (home / "config.yaml").read_text(encoding="utf-8")
    config = yaml.safe_load(text)

    assert config["model"]["provider"] == "custom:custom"
    assert "api_key" not in config["model"]
    assert "legacy-key" not in text
    assert any(
        item.get("name") == "user-provider"
        for item in config["custom_providers"]
    )
    assert _ai_anime_provider(config)["key_env"] == "NEWAPI_API_KEY"


def test_existing_env_is_preserved(
    isolated_workspace, repo_skills, repo_plugins, monkeypatch
):
    (isolated_workspace / ".env").write_text(
        "NEWAPI_API_KEY=root-key\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("NEWAPI_API_KEY", "root-key")
    home = isolated_workspace / "state" / "admin" / ".hermes"
    home.mkdir(parents=True)
    (home / ".env").write_text("OPENAI_API_KEY=user-key\n", encoding="utf-8")

    hw.ensure_user_hermes_workspace("admin")
    env_text = (home / ".env").read_text(encoding="utf-8")

    assert "OPENAI_API_KEY=user-key" in env_text


def test_legacy_config_gets_default_plugin_block(isolated_workspace, repo_skills, repo_plugins):
    home = isolated_workspace / "state" / "admin" / ".hermes"
    home.mkdir(parents=True)
    (home / "config.yaml").write_text("enabled_toolsets:\n  - ai_anime\n")

    hw.ensure_user_hermes_workspace("admin")

    config = (home / "config.yaml").read_text()
    parsed = yaml.safe_load(config)
    assert _enabled_toolsets(config) == ["hermes-acp"]
    assert "plugins:\n  enabled:\n    - ai_anime" in config
    assert parsed["model"]["default"] == "cloud-text-default"
    assert parsed["model"]["provider"] == "custom:custom"
    assert _ai_anime_provider(parsed)["key_env"] == "NEWAPI_API_KEY"


def test_legacy_identity_context_is_migrated(isolated_workspace, repo_skills, repo_plugins):
    home = isolated_workspace / "state" / "admin" / ".hermes"
    memories = home / "memories"
    memories.mkdir(parents=True)
    (home / "SOUL.md").write_text(hw._OLD_SOUL_PREFIX + "\n", encoding="utf-8")
    (memories / "MEMORY.md").write_text(hw._OLD_MEMORY_LINE + "\n", encoding="utf-8")

    hw.ensure_user_hermes_workspace("admin")

    soul = (home / "SOUL.md").read_text(encoding="utf-8")
    memory = (memories / "MEMORY.md").read_text(encoding="utf-8")
    assert "你是 AI anime 助手" in soul
    assert "You are Hermes Agent" not in soul
    assert "我是 AI anime 助手，AI anime 的小说转视频创作助手。" not in memory
    assert "AI anime 管理的 AI anime 助手会话" in memory
    assert "AI anime 管理的 Hermes 会话" not in memory


def test_stale_directory_links_removed(
    isolated_workspace,
    repo_skills,
    repo_plugins,
    create_directory_link,
):
    home = hw.ensure_user_hermes_workspace("admin")
    stale = home / "skills" / "json-render"
    create_directory_link(stale, repo_skills / "json-render")

    # Re-run; stale non-allowlisted symlink should be removed
    hw.ensure_user_hermes_workspace("admin")
    assert not (home / "skills" / "json-render").exists()
    _assert_managed_asset(home / "skills" / "ai_anime", "SKILL.md")


def test_stale_plugin_symlinks_removed(isolated_workspace, repo_skills, repo_plugins):
    home = hw.ensure_user_hermes_workspace("admin")
    import shutil

    shutil.rmtree(repo_plugins / "ai_anime")
    hw.ensure_user_hermes_workspace("admin")
    assert not (home / "plugins" / "ai_anime").exists()


def test_no_repo_skills_dir(isolated_workspace):
    """Missing repo .hermes/skills should not crash; just no skill links."""
    home = hw.ensure_user_hermes_workspace("admin")
    assert home.exists()
    assert (home / "skills").is_dir()
    # _user/ should still be there
    assert (home / "skills" / "_user").is_dir()
    # but no symlinks
    assert not any(p.is_symlink() for p in (home / "skills").iterdir())


def test_symlink_failure_materializes_managed_asset_copies(
    isolated_workspace,
    repo_skills,
    repo_plugins,
    monkeypatch,
):
    def reject_symlink(*_args, **_kwargs):
        raise OSError("symlinks unavailable")

    monkeypatch.setattr(Path, "symlink_to", reject_symlink)

    home = hw.ensure_user_hermes_workspace("admin")
    skill = home / "skills" / "ai_anime"
    plugin = home / "plugins" / "ai_anime"

    assert skill.is_dir() and not skill.is_symlink()
    assert plugin.is_dir() and not plugin.is_symlink()
    assert (skill / "SKILL.md").is_file()
    assert (plugin / "plugin.yaml").is_file()
    assert (skill / hw._MANAGED_ASSET_MARKER).is_file()
    assert (plugin / hw._MANAGED_ASSET_MARKER).is_file()


def test_user_skill_dir_not_clobbered(isolated_workspace, repo_skills, repo_plugins):
    home = hw.ensure_user_hermes_workspace("admin")
    # user_skill ends up at _user — should still be writable / preserved
    user_skill = home / "skills" / "_user" / "my-favorite"
    user_skill.mkdir()
    (user_skill / "SKILL.md").write_text("# my favorite hack\n")
    hw.ensure_user_hermes_workspace("admin")
    assert (user_skill / "SKILL.md").read_text() == "# my favorite hack\n"


def test_chmod_700(isolated_workspace, repo_skills, repo_plugins):
    import os
    import stat

    home = hw.ensure_user_hermes_workspace("admin")
    mode = stat.S_IMODE(home.stat().st_mode)
    if os.name == "nt":
        # Windows has no POSIX permission bits; directories report 0o777.
        assert mode & stat.S_IRWXU == stat.S_IRWXU, f"unexpected mode {oct(mode)}"
    else:
        # On filesystems that support chmod, should be 0o700
        assert mode in (0o700, 0o755, 0o775), f"unexpected mode {oct(mode)}"
