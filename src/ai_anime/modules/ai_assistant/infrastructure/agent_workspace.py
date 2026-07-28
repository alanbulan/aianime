"""Local user workspace for page-level AI agents."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from ai_anime.chat.runtime_config import load_api_url
from ai_anime.modules.ai_assistant.infrastructure.local_state import local_state_root


class LocalAgentWorkspace:
    def __init__(self, repo_root: Path | None = None) -> None:
        self._repo_root = (
            repo_root if repo_root is not None else Path(__file__).resolve().parents[5]
        )

    def ensure_claude(
        self,
        username: str,
        project: str,
        agent_token: str = "",
    ) -> Path:
        workspace = self._workspace(username)
        claude_dir = workspace / ".claude"
        skills_dir = claude_dir / "skills"
        skills_dir.mkdir(parents=True, exist_ok=True)
        payload = self._settings_payload(username, project, agent_token)
        (claude_dir / "settings.local.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self._sync_skills(skills_dir)
        return workspace

    def ensure_codex(self, username: str) -> Path:
        workspace = self._workspace(username)
        skills_dir = workspace / ".codex" / "skills"
        skills_dir.mkdir(parents=True, exist_ok=True)
        self._sync_skills(skills_dir)
        return workspace

    @staticmethod
    def build_environment(
        username: str,
        project: str,
        agent_token: str = "",
    ) -> dict[str, str]:
        env = os.environ.copy()
        env["AI_ANIME_USERNAME"] = username
        env["AI_ANIME_AGENT_SCOPE"] = "user"
        if project:
            env["AI_ANIME_PROJECT_ID"] = project
        env["AI_ANIME_API_URL"] = load_api_url()
        env["AI_ANIME_AGENT_TOKEN"] = agent_token
        return env

    @staticmethod
    def _workspace(username: str) -> Path:
        workspace = local_state_root() / username / ".chat_agents"
        workspace.mkdir(parents=True, exist_ok=True)
        return workspace

    @staticmethod
    def _settings_payload(
        username: str,
        project: str,
        agent_token: str,
    ) -> dict[str, dict[str, str]]:
        env = {
            "AI_ANIME_USERNAME": username,
            "AI_ANIME_AGENT_SCOPE": "user",
            "AI_ANIME_API_URL": load_api_url(),
            "AI_ANIME_AGENT_TOKEN": agent_token,
        }
        if project:
            env["AI_ANIME_PROJECT_ID"] = project
        return {"env": env}

    def _skill_sources(self) -> list[tuple[str, Path]]:
        sources: dict[str, Path] = {}
        for skills_root in (
            self._repo_root / ".claude" / "skills",
            self._repo_root / ".codex" / "skills",
        ):
            if not skills_root.exists():
                continue
            for child in sorted(skills_root.iterdir()):
                if child.is_dir() and (child / "SKILL.md").exists():
                    sources.setdefault(child.name, child)

        configured = os.environ.get("CLAUDE_AI_ANIME_SKILL_PATH", "").strip()
        if configured:
            sources["ai_anime"] = Path(configured).expanduser()
        return [(name, path) for name, path in sorted(sources.items()) if path.exists()]

    def _sync_skills(self, skills_dir: Path) -> None:
        for skill_name, source in self._skill_sources():
            destination = skills_dir / skill_name
            if not destination.exists():
                shutil.copytree(source, destination)
