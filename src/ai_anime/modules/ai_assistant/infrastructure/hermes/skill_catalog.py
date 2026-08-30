"""Hermes slash-command catalog and direct Skill invocation bridge."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

import yaml

from ai_anime.modules.ai_assistant.infrastructure.hermes.hermes_workspace import (
    ensure_user_hermes_workspace,
)
from ai_anime.modules.ai_assistant.infrastructure.hermes.tool_catalog import (
    list_tool_catalog_for_home,
)


CORE_SLASH_COMMANDS: tuple[dict[str, str], ...] = (
    {"name": "help", "description": "查看可用命令和 Skills 的使用方式"},
    {
        "name": "model",
        "description": "选择仅对当前对话生效的模型路由",
    },
    {"name": "tools", "description": "查看当前助手实际可调用的工具"},
)

_CORE_COMMAND_NAMES = frozenset(item["name"] for item in CORE_SLASH_COMMANDS)
_UNSUPPORTED_RUNTIME_COMMAND_NAMES = frozenset(
    {"compact", "context", "queue", "reset", "steer", "version"}
)
_EXCLUDED_DIR_NAMES = frozenset(
    {
        ".git",
        ".github",
        ".hub",
        ".archive",
        ".venv",
        "venv",
        "node_modules",
        "site-packages",
        "__pycache__",
        ".tox",
        ".nox",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
    }
)
_SUPPORT_DIR_NAMES = frozenset({"references", "templates", "assets", "scripts"})
_INVALID_SLUG_CHARS = re.compile(r"[^a-z0-9-]")
_MULTIPLE_HYPHENS = re.compile(r"-{2,}")
_SKILL_COMMAND = re.compile(
    r"^/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$",
)
_LOCALIZED_SKILL_DESCRIPTIONS = {
    "ai-anime-pipeline-operations": (
        "按项目状态推进漫剧分集生产、素材完整性检查、失败恢复与精简剧本规划。"
    ),
}


def _parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    text = content.removeprefix("\ufeff")
    if not text.startswith("---"):
        return {}, text
    match = re.search(r"\n---\s*\n", text[3:])
    if match is None:
        return {}, text
    yaml_text = text[3 : match.start() + 3]
    body = text[match.end() + 3 :]
    try:
        parsed = yaml.safe_load(yaml_text)
    except yaml.YAMLError:
        parsed = None
    return (parsed if isinstance(parsed, dict) else {}), body


def _skill_slug(name: str) -> str:
    slug = name.strip().lower().replace(" ", "-").replace("_", "-")
    slug = _INVALID_SLUG_CHARS.sub("", slug)
    return _MULTIPLE_HYPHENS.sub("-", slug).strip("-")


def _skill_description(frontmatter: dict[str, Any], body: str, name: str) -> str:
    localized = _LOCALIZED_SKILL_DESCRIPTIONS.get(_skill_slug(name))
    if localized:
        return localized
    description = str(frontmatter.get("description") or "").strip()
    if description:
        return description
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#"):
            return line[:160]
    return f"调用 {name} Skill"


def _matches_platform(frontmatter: dict[str, Any]) -> bool:
    platforms = frontmatter.get("platforms")
    if not platforms:
        return True
    values = platforms if isinstance(platforms, list) else [platforms]
    aliases = {"macos": "darwin", "linux": "linux", "windows": "win32"}
    return any(
        sys.platform.startswith(aliases.get(str(value).strip().lower(), str(value).strip().lower()))
        for value in values
    )


def _is_support_copy(skill_md: Path) -> bool:
    parts = skill_md.parts
    for index, part in enumerate(parts[:-1]):
        if part not in _SUPPORT_DIR_NAMES or index == 0:
            continue
        if (Path(*parts[:index]) / "SKILL.md").is_file():
            return True
    return False


def _disabled_skill_names(home: Path) -> set[str]:
    try:
        config = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return set()
    skills = config.get("skills") if isinstance(config, dict) else None
    if not isinstance(skills, dict):
        return set()

    def names(value: Any) -> set[str]:
        if isinstance(value, str):
            return {value.strip()} if value.strip() else set()
        if isinstance(value, list):
            return {str(item).strip() for item in value if str(item).strip()}
        return set()

    disabled = names(skills.get("disabled"))
    platform_disabled = skills.get("platform_disabled")
    if isinstance(platform_disabled, dict):
        disabled.update(names(platform_disabled.get(sys.platform)))
        platform_alias = "windows" if sys.platform.startswith("win32") else (
            "macos" if sys.platform.startswith("darwin") else "linux"
        )
        disabled.update(names(platform_disabled.get(platform_alias)))
    return disabled


def _external_skill_roots(home: Path) -> list[Path]:
    try:
        config = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return []
    skills = config.get("skills") if isinstance(config, dict) else None
    raw_dirs = skills.get("external_dirs") if isinstance(skills, dict) else None
    if isinstance(raw_dirs, str):
        raw_dirs = [raw_dirs]
    if not isinstance(raw_dirs, list):
        return []
    roots: list[Path] = []
    for raw_dir in raw_dirs:
        candidate = Path(str(raw_dir)).expanduser()
        if not candidate.is_absolute():
            candidate = home / candidate
        if candidate.is_dir():
            roots.append(candidate)
    return roots


def _skill_entries(home: Path) -> list[dict[str, Any]]:
    roots = [home / "skills", *_external_skill_roots(home)]
    disabled = _disabled_skill_names(home)
    seen_names: set[str] = set()
    seen_slugs: set[str] = set()
    entries: list[dict[str, Any]] = []

    for root in roots:
        if not root.is_dir():
            continue
        for skill_md in sorted(root.rglob("SKILL.md")):
            if any(part in _EXCLUDED_DIR_NAMES for part in skill_md.parts):
                continue
            if _is_support_copy(skill_md):
                continue
            try:
                raw_content = skill_md.read_text(encoding="utf-8")
            except OSError:
                continue
            frontmatter, body = _parse_frontmatter(raw_content)
            if not _matches_platform(frontmatter):
                continue
            name = str(frontmatter.get("name") or skill_md.parent.name).strip()
            if not name or name in disabled or name in seen_names:
                continue
            slug = _skill_slug(name)
            if not slug or slug in _CORE_COMMAND_NAMES or slug in seen_slugs:
                continue
            seen_names.add(name)
            seen_slugs.add(slug)
            entries.append(
                {
                    "name": slug,
                    "skill_name": name,
                    "description": _skill_description(frontmatter, body, name),
                    "input_hint": "补充本次 Skill 的具体任务说明",
                    "kind": "skill",
                    "source": "user" if "_user" in skill_md.parts else "managed",
                    "skill_dir": skill_md.parent,
                    "body": body.strip(),
                }
            )
    return entries


def list_slash_commands_for_home(
    home: Path,
    *,
    include_project_tools: bool = True,
) -> list[dict[str, Any]]:
    tool_catalog = list_tool_catalog_for_home(
        home,
        include_project_tools=include_project_tools,
    )
    commands = [
        {
            **item,
            "kind": "command",
            **({"tools": tool_catalog} if item["name"] == "tools" else {}),
        }
        for item in CORE_SLASH_COMMANDS
    ]
    commands.extend(
        {
            key: str(value)
            for key, value in entry.items()
            if key not in {"skill_dir", "body", "skill_name"}
        }
        for entry in _skill_entries(home)
    )
    return commands


def list_slash_commands_for_user(
    username: str,
    *,
    include_project_tools: bool = True,
) -> list[dict[str, Any]]:
    return list_slash_commands_for_home(
        ensure_user_hermes_workspace(username),
        include_project_tools=include_project_tools,
    )


def merge_runtime_slash_commands(
    home: Path,
    runtime_commands: list[Any],
    *,
    include_project_tools: bool = True,
) -> list[dict[str, Any]]:
    runtime_by_name: dict[str, dict[str, Any]] = {}
    tool_catalog = list_tool_catalog_for_home(
        home,
        include_project_tools=include_project_tools,
    )
    for item in runtime_commands:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip().lstrip("/")
        if (
            not name
            or name not in _CORE_COMMAND_NAMES
            or name in _UNSUPPORTED_RUNTIME_COMMAND_NAMES
            or name in runtime_by_name
        ):
            continue
        runtime_by_name[name] = item
    merged = [
        (
            {
                **runtime_by_name.get(core["name"], core),
                "name": core["name"],
                "kind": "command",
                **({"tools": tool_catalog} if core["name"] == "tools" else {}),
            }
        )
        for core in CORE_SLASH_COMMANDS
    ]
    seen = {item["name"] for item in merged}
    for skill in list_slash_commands_for_home(
        home,
        include_project_tools=include_project_tools,
    ):
        if skill.get("kind") != "skill" or skill["name"] in seen:
            continue
        seen.add(skill["name"])
        merged.append(skill)
    return merged


def expand_skill_invocation(home: Path, prompt: str) -> str | None:
    match = _SKILL_COMMAND.fullmatch(prompt.strip())
    if match is None:
        return None
    slug = _skill_slug(match.group(1))
    if slug in _CORE_COMMAND_NAMES:
        return None
    entry = next(
        (item for item in _skill_entries(home) if item["name"] == slug),
        None,
    )
    if entry is None:
        return None

    skill_name = str(entry["skill_name"])
    skill_dir = Path(entry["skill_dir"])
    parts = [
        (
            f'[IMPORTANT: The user has invoked the "{skill_name}" skill, '
            "indicating they want you to follow its instructions. "
            "The full skill content is loaded below.]"
        ),
        "",
        str(entry["body"]),
        "",
        f"[Skill directory: {skill_dir}]",
    ]
    user_instruction = (match.group(2) or "").strip()
    if user_instruction:
        parts.extend(
            [
                "",
                "The user has provided the following instruction alongside "
                f"the skill invocation: {user_instruction}",
            ]
        )
    return "\n".join(parts)


__all__ = [
    "CORE_SLASH_COMMANDS",
    "expand_skill_invocation",
    "list_slash_commands_for_home",
    "list_slash_commands_for_user",
    "merge_runtime_slash_commands",
]
