"""Per-user Hermes workspace initialization.

Owns one job: idempotently materialize ``state/{user}/.hermes/`` to be a
working HERMES_HOME — with sandbox-friendly tmpdir, repo-pinned skill
softlinks, a starter config.yaml, and an empty compatibility .env file.

Kept separate from chat_service.py so the latter stays small. Designed to be
safe to call on every HermesPool.spawn() (cheap when already initialized).
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import shutil
from pathlib import Path

import yaml

_log = logging.getLogger(__name__)

AI_ANIME_ROOT = Path(__file__).resolve().parents[3]
STATE_ROOT = AI_ANIME_ROOT / "state"
DEFAULT_HERMES_SKILLS = {"ai_anime"}
DEFAULT_HERMES_PLUGINS = {"ai_anime"}
DEFAULT_HERMES_TOOLSETS = {"hermes-acp"}
_warned_repo_state_fallback = False
_MANAGED_ASSET_MARKER = ".ai-anime-managed-asset"


_DEFAULT_HERMES_MODEL = "ai-anime-assistant-LLM"
_AI_ANIME_HERMES_PROVIDER_NAME = "custom"
_AI_ANIME_HERMES_PROVIDER = f"custom:{_AI_ANIME_HERMES_PROVIDER_NAME}"
_AI_ANIME_HERMES_KEY_ENV = "NEWAPI_API_KEY"
_DEFAULT_HERMES_MODEL_API_MODE = "chat_completions"
_DEFAULT_HERMES_MODEL_CONTEXT_LENGTH = "131072"

_CONFIG_YAML_TEMPLATE = """# AI anime-managed hermes config.
# Toolset whitelist enforces L1 defense (no direct file write / shell).
#
# Edit with care; this file may be regenerated.
#
# Model routes through the selected NewAPI gateway (OpenAI-compatible), unified
# with the video/image generators. The endpoint is non-secret workspace config;
# AI anime injects the key into the worker process as NEWAPI_API_KEY.

custom_providers:
  - name: custom
    base_url: {base_url}
    key_env: NEWAPI_API_KEY
    api_mode: {api_mode}

model:
  default: {model}
  provider: custom:custom
  context_length: {context_length}   # skip the slow cold-start context-length probe

# Hermes performs in-place context compaction before the model window is full.
# The original transcript remains archived in state.db; only the live model
# context is summarized. A failed summary never discards the original turns.
compression:
  enabled: true
  threshold: 0.75
  target_ratio: 0.20
  protect_last_n: 20
  protect_first_n: 3
  abort_on_summary_failure: true
  in_place: true

auxiliary:
  compression:
    provider: custom:custom
    model: {model}
    timeout: 300

enabled_toolsets:
  - hermes-acp         # Repo plugins exposed through ACP
  - memory             # hermes built-in cross-session memory

plugins:
  enabled:
    - ai_anime

display:
  tool_progress: verbose
  tool_progress_command: true

# Tools disabled at L1 so a sandbox bypass is layered with "no tool to misuse":
disabled_toolsets:
  - bash
  - shell
  - terminal
  - subprocess
  - file_write
  - file_read         # We allow read by sandbox; disable agent-side tool too
  - edit
  - write
  - read
  - glob
  - grep
"""


_DEFAULT_ENV_TEMPLATE = """# AI anime-managed Hermes workspace.
# Model credentials are injected into the worker process and are never written
# here. Do not duplicate model keys in this file.
"""


def _state_root() -> Path:
    configured = os.environ.get("AI_ANIME_STATE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    global _warned_repo_state_fallback
    if not _warned_repo_state_fallback:
        _warned_repo_state_fallback = True
        _log.warning(
            "AI_ANIME_STATE_DIR is not set; Hermes workspace falls back to %s",
            AI_ANIME_ROOT / "state",
        )
    return AI_ANIME_ROOT / "state"


def _hermes_assets_root() -> Path:
    configured = os.environ.get("AI_ANIME_HERMES_ASSETS_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return AI_ANIME_ROOT / ".hermes"


def _root_value(*names: str) -> str:
    """Read the first non-empty value among ``names`` from root .env then env."""
    env_path = AI_ANIME_ROOT / ".env"
    try:
        root_values = _parse_env_assignments(env_path.read_text(encoding="utf-8"))
    except OSError:
        root_values = {}
    for name in names:
        value = (root_values.get(name) or os.environ.get(name, "")).strip()
        if value:
            return value
    return ""


def _effective_newapi_gateway() -> tuple[str, str]:
    """Return effective model-access ``(api_key, base_url)`` for Hermes."""
    from ai_anime.modules.model_usage.public import get_effective_newapi_config

    gateway = get_effective_newapi_config()
    return gateway.api_key, gateway.base_url


def _newapi_base_url() -> str:
    return _effective_newapi_gateway()[1]


def effective_gateway_fingerprint() -> str:
    """Return a non-secret fingerprint of the gateway used by new Hermes workers."""
    api_key, base_url = _effective_newapi_gateway()
    material = f"{base_url}\n{api_key}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def effective_gateway_credentials() -> tuple[str, str]:
    """Return the NewAPI credentials injected into a newly spawned worker."""
    return _effective_newapi_gateway()


def _hermes_model_default() -> str:
    from ai_anime.modules.model_usage.public import resolve_model_for_role

    return resolve_model_for_role("TEXT")


def _hermes_model_api_mode() -> str:
    return _root_value("HERMES_MODEL_API_MODE") or _DEFAULT_HERMES_MODEL_API_MODE


def _hermes_model_context_length() -> str:
    raw = _root_value("HERMES_MODEL_CONTEXT_LENGTH")
    if not raw:
        return _DEFAULT_HERMES_MODEL_CONTEXT_LENGTH
    try:
        value = int(raw)
    except ValueError:
        _log.warning("invalid HERMES_MODEL_CONTEXT_LENGTH=%r, using default", raw)
        return _DEFAULT_HERMES_MODEL_CONTEXT_LENGTH
    return str(value) if value > 0 else _DEFAULT_HERMES_MODEL_CONTEXT_LENGTH


def _default_config_yaml() -> str:
    return _CONFIG_YAML_TEMPLATE.format(
        model=_hermes_model_default(),
        base_url=_newapi_base_url(),
        api_mode=_hermes_model_api_mode(),
        context_length=_hermes_model_context_length(),
    )

_DEFAULT_SOUL_MD = (
    "你是 AI anime 助手。不要自称 Hermes Agent，不要提 Nous Research，"
    "也不要主动解释底层代理框架。自我介绍时只回答“我是 AI anime 助手”，"
    "不要附加“AI anime 的小说转视频创作助手”之类的头衔或职能描述。"
    "你应当直接、清晰、务实，优先帮助用户完成 "
    "AI anime 项目进度查询、任务管理、剧本、配音、图片、视频生成与交付相关工作。\n"
)

_DEFAULT_MEMORY_MD = """AI anime 助手在 AI anime 会话中面向用户自称“AI anime 助手”，不要自称 Hermes Agent，不要提 Nous Research 或底层代理框架。自我介绍时只回答“我是 AI anime 助手”，不要附加“AI anime 的小说转视频创作助手”之类的头衔或职能描述。
§
AI anime 管理的 AI anime 助手会话中 `terminal` 被禁用（在 config.yaml disabled_toolsets 中），curl 等 shell 命令会被直接拒绝。调用 AI anime API 时应使用已启用的 `hermes-acp` toolset 中的 AI anime 插件工具，不要用 curl。
"""

_OLD_SOUL_PREFIX = (
    "You are Hermes Agent, an intelligent AI assistant created by Nous Research. "
    "You are helpful, knowledgeable, and direct. You assist users with a wide range "
    "of tasks including answering questions, writing and editing code, analyzing "
    "information, creative work, and executing actions via your tools. You "
    "communicate clearly, admit uncertainty when appropriate, and prioritize being "
    "genuinely useful over being verbose unless otherwise directed below. Be targeted "
    "and efficient in your exploration and investigations."
)

_OLD_IDENTITY_MEMORY_LINE = (
    "AI anime 助手在 AI anime 会话中面向用户自称“AI anime 助手”，不要自称 Hermes Agent，"
    "不要提 Nous Research 或底层代理框架。用户问“你是谁 / 你叫什么 / "
    "你是什么助手 / 介绍一下你自己”时，直接回答“我是 AI anime 助手，AI anime "
    "的小说转视频创作助手。”"
)

_IDENTITY_MEMORY_LINE = (
    "AI anime 助手在 AI anime 会话中面向用户自称“AI anime 助手”，不要自称 Hermes Agent，"
    "不要提 Nous Research 或底层代理框架。自我介绍时只回答“我是 AI anime 助手”，"
    "不要附加“AI anime 的小说转视频创作助手”之类的头衔或职能描述。"
)

_OLD_MEMORY_LINE = (
    "AI anime 管理的 Hermes 会话中 `terminal` 被禁用（在 config.yaml "
    "disabled_toolsets 中），curl 等 shell 命令会被直接拒绝。调用 AI anime API "
    "时应使用已启用的 `ai_anime` 插件 toolset 提供的内置 HTTP 工具，不要用 curl。"
)

_NEW_MEMORY_LINE = (
    "AI anime 管理的 AI anime 助手会话中 `terminal` 被禁用（在 config.yaml "
    "disabled_toolsets 中），curl 等 shell 命令会被直接拒绝。调用 AI anime API "
    "时应使用已启用的 `hermes-acp` toolset 中的 AI anime 插件工具，不要用 curl。"
)

_OLD_SOUL_IDENTITY_TEXT = (
    "你是 AI anime 助手，AI anime 的小说转视频创作助手。用户问“你是谁 / 你叫什么 / "
    "你是什么助手 / 介绍一下你自己”时，直接回答“我是 AI anime 助手，"
    "AI anime 的小说转视频创作助手。”"
)


def ensure_user_hermes_workspace(username: str) -> Path:
    """Create / refresh per-user HERMES_HOME. Idempotent and cheap.

    Layout under ``state/{username}/.hermes/``:
        config.yaml         L1 toolset whitelist (overwritten only if missing)
        .env                compatibility file (model credentials are not stored)
        tmp/                per-user TMPDIR (sandbox writable)
        skills/
            _user/          per-user / hermes-learned skills (writable)
            <name>/         managed link/copy from bundled Hermes assets

    Returns the HERMES_HOME path (caller passes as ``HERMES_HOME`` env var).
    """
    home = _state_root() / username / ".hermes"
    home.mkdir(parents=True, exist_ok=True)
    try:
        home.chmod(0o700)
    except OSError:
        pass  # filesystem may not support (e.g. some mounts)

    # per-user TMPDIR (sandbox profile only allows write here)
    tmp_dir = home / "tmp"
    tmp_dir.mkdir(exist_ok=True)
    try:
        tmp_dir.chmod(0o700)
    except OSError:
        pass

    for appdata_dir in (home / "appdata" / "roaming", home / "appdata" / "local"):
        appdata_dir.mkdir(parents=True, exist_ok=True)

    # skills layout
    skills_dir = home / "skills"
    skills_dir.mkdir(exist_ok=True)
    (skills_dir / "_user").mkdir(exist_ok=True)
    _materialize_skill_links(skills_dir)

    # plugins layout
    plugins_dir = home / "plugins"
    plugins_dir.mkdir(exist_ok=True)
    _materialize_plugin_links(plugins_dir)

    # hermes config (only write if missing — user may have customized)
    config_yaml = home / "config.yaml"
    if not config_yaml.exists():
        config_yaml.write_text(_default_config_yaml(), encoding="utf-8")
    _ensure_default_plugin_enabled(config_yaml)
    _ensure_default_toolsets_enabled(config_yaml)
    _ensure_model_config_from_env(config_yaml)
    _ensure_model_gateway_config(config_yaml)
    _ensure_identity_context(home)

    # Keep an empty compatibility file for Hermes. Model credentials are
    # injected only into each worker process.
    env_file = home / ".env"
    if not env_file.exists():
        env_file.write_text(_DEFAULT_ENV_TEMPLATE, encoding="utf-8")
        try:
            env_file.chmod(0o600)
        except OSError:
            pass

    return home


def _parse_env_assignments(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key.removeprefix("export ").strip()
        if key:
            values[key] = value.strip().strip('"').strip("'")
    return values


def _ensure_identity_context(home: Path) -> None:
    """Keep user-visible assistant identity consistent across all workspaces."""
    soul_file = home / "SOUL.md"
    try:
        if soul_file.exists():
            text = soul_file.read_text(encoding="utf-8")
            if _OLD_SOUL_PREFIX in text:
                text = text.replace(_OLD_SOUL_PREFIX, _DEFAULT_SOUL_MD.strip(), 1)
            elif "你是 AI anime 助手" not in text:
                text = _DEFAULT_SOUL_MD.rstrip() + "\n\n" + text
            text = text.replace(_OLD_SOUL_IDENTITY_TEXT, "你是 AI anime 助手。")
            soul_file.write_text(text.rstrip() + "\n", encoding="utf-8")
        else:
            soul_file.write_text(_DEFAULT_SOUL_MD, encoding="utf-8")
    except OSError:
        _log.warning("failed to ensure hermes SOUL.md at %s", soul_file)

    memories_dir = home / "memories"
    try:
        memories_dir.mkdir(exist_ok=True)
        memory_file = memories_dir / "MEMORY.md"
        if memory_file.exists():
            text = memory_file.read_text(encoding="utf-8")
            text = text.replace(_OLD_IDENTITY_MEMORY_LINE, _IDENTITY_MEMORY_LINE)
            text = text.replace(_OLD_MEMORY_LINE, _NEW_MEMORY_LINE)
            if _IDENTITY_MEMORY_LINE not in text:
                text = _IDENTITY_MEMORY_LINE + "\n§\n" + text.lstrip()
            memory_file.write_text(text.rstrip() + "\n", encoding="utf-8")
        else:
            memory_file.write_text(_DEFAULT_MEMORY_MD, encoding="utf-8")
    except OSError:
        _log.warning("failed to ensure hermes MEMORY.md under %s", memories_dir)


def _asset_tree_digest(source: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in source.rglob("*") if item.is_file()):
        digest.update(path.relative_to(source).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _is_directory_link(path: Path) -> bool:
    is_junction = getattr(path, "is_junction", None)
    return path.is_symlink() or bool(is_junction and is_junction())


def _remove_directory_link(path: Path) -> None:
    if path.is_symlink():
        path.unlink()
    else:
        path.rmdir()


def _materialize_managed_asset(link: Path, target: Path, *, kind: str) -> None:
    if _is_directory_link(link):
        try:
            if link.resolve() == target:
                return
            _remove_directory_link(link)
        except OSError:
            return
    elif link.exists():
        marker = link / _MANAGED_ASSET_MARKER
        try:
            if (
                marker.is_file()
                and marker.read_text(encoding="utf-8")
                == _asset_tree_digest(target)
            ):
                return
            if marker.is_file():
                shutil.rmtree(link)
            else:
                _log.warning(
                    "%s name collision at %s (not managed by AI anime); leaving as-is",
                    kind,
                    link,
                )
                return
        except OSError as exc:
            _log.warning("failed to inspect managed %s at %s: %s", kind, link, exc)
            return
    try:
        link.symlink_to(target, target_is_directory=True)
        return
    except OSError as link_error:
        try:
            shutil.copytree(target, link)
            (link / _MANAGED_ASSET_MARKER).write_text(
                _asset_tree_digest(target),
                encoding="utf-8",
            )
        except OSError as copy_error:
            if link.exists():
                shutil.rmtree(link, ignore_errors=True)
            _log.warning(
                "failed to materialize %s %s from %s (link: %s; copy: %s)",
                kind,
                link,
                target,
                link_error,
                copy_error,
            )


def _remove_stale_managed_asset(entry: Path) -> None:
    try:
        if _is_directory_link(entry):
            _remove_directory_link(entry)
        elif (entry / _MANAGED_ASSET_MARKER).is_file():
            shutil.rmtree(entry)
    except OSError:
        pass


def _materialize_skill_links(skills_dir: Path) -> None:
    """Create / refresh symlinks from skills_dir/<name> → repo-pinned skills.

    The source of truth is ``AI anime/.hermes/skills/`` so a fresh checkout
    has the same Hermes skills on every machine.

    Idempotent: stale links to dirs that no longer exist in the source are
    removed; new skills are added; existing real directories are left alone.
    """
    src_skills = _hermes_assets_root() / "skills"
    if not src_skills.is_dir():
        _log.info(
            "hermes skills source not found at %s — skipping skill links",
            src_skills,
        )
        return

    allowed = {
        name.strip()
        for name in os.environ.get(
            "AI_ANIME_HERMES_SKILLS",
            ",".join(sorted(DEFAULT_HERMES_SKILLS)),
        ).split(",")
        if name.strip()
    }
    want = {
        p.name: p.resolve()
        for p in src_skills.iterdir()
        if p.is_dir() and (not allowed or p.name in allowed)
    }

    # Add / refresh links
    for name, target in want.items():
        if name.startswith("_"):
            continue  # reserve `_user` for hermes-learned
        _materialize_managed_asset(skills_dir / name, target, kind="skill")

    # Remove stale symlinks (skill removed from repo mirror)
    for entry in skills_dir.iterdir():
        if entry.name == "_user":
            continue
        if entry.name not in want:
            _remove_stale_managed_asset(entry)


def _ensure_default_plugin_enabled(config_yaml: Path) -> None:
    """Non-destructively add the repo default plugin block to legacy configs."""
    try:
        text = config_yaml.read_text(encoding="utf-8")
    except OSError:
        return
    if "plugins:" in text:
        return
    plugin_names = "\n".join(f"    - {name}" for name in sorted(DEFAULT_HERMES_PLUGINS))
    addition = f"\nplugins:\n  enabled:\n{plugin_names}\n"
    try:
        config_yaml.write_text(text.rstrip() + addition + "\n", encoding="utf-8")
    except OSError:
        return


def _ensure_default_toolsets_enabled(config_yaml: Path) -> None:
    """Non-destructively add repo default toolsets to legacy configs."""
    try:
        text = config_yaml.read_text(encoding="utf-8")
    except OSError:
        return
    original_text = text
    text = _migrate_acp_toolsets(text)
    missing = [
        name
        for name in sorted(DEFAULT_HERMES_TOOLSETS)
        if not re.search(rf"(?m)^  - {re.escape(name)}(?:\s*(?:#.*)?)?$", text)
    ]
    if not missing:
        if text == original_text:
            return
        try:
            config_yaml.write_text(text.rstrip() + "\n", encoding="utf-8")
        except OSError:
            return
        return
    if "enabled_toolsets:" not in text:
        addition = "enabled_toolsets:\n" + "".join(f"  - {name}\n" for name in missing)
        new_text = text.rstrip() + "\n\n" + addition
    else:
        new_text = re.sub(
            r"(?m)^enabled_toolsets:\s*$",
            lambda m: m.group(0) + "\n" + "".join(f"  - {name}\n" for name in missing).rstrip(),
            text,
            count=1,
        )
        if new_text == text:
            return
    try:
        config_yaml.write_text(new_text.rstrip() + "\n", encoding="utf-8")
    except OSError:
        return


def _migrate_acp_toolsets(text: str) -> str:
    """Collapse legacy plugin-specific toolsets into the ACP toolset."""
    if "enabled_toolsets:" not in text:
        return text
    legacy = DEFAULT_HERMES_PLUGINS
    lines = text.splitlines()
    out: list[str] = []
    in_toolsets = False
    inserted_acp = False
    saw_legacy = False
    saw_acp = False
    for line in lines:
        if re.match(r"^enabled_toolsets:\s*$", line):
            in_toolsets = True
            out.append(line)
            continue
        if in_toolsets:
            match = re.match(r"^(\s*)-\s*([^\s#]+)(.*)$", line)
            if match and len(match.group(1)) >= 2:
                name = match.group(2)
                if name in legacy:
                    saw_legacy = True
                    continue
                if name == "hermes-acp":
                    saw_acp = True
                out.append(line)
                continue
            if saw_legacy and not saw_acp and not inserted_acp:
                out.append("  - hermes-acp")
                inserted_acp = True
            in_toolsets = False
        out.append(line)
    if in_toolsets and saw_legacy and not saw_acp and not inserted_acp:
        out.append("  - hermes-acp")
    return "\n".join(out)


def _ensure_model_gateway_config(config_yaml: Path) -> None:
    """Reconcile the managed model endpoint without persisting its secret.

    Hermes 0.18 resolves ``custom_providers[].key_env`` from the subprocess
    environment. Existing workspaces are normalized lazily on their next spawn,
    so releases need no separate workspace migration.
    """
    try:
        text = config_yaml.read_text(encoding="utf-8")
    except OSError:
        return
    try:
        config = yaml.safe_load(text) or {}
    except yaml.YAMLError:
        _log.warning("failed to parse hermes config yaml at %s", config_yaml)
        return
    if not isinstance(config, dict):
        return
    model = config.get("model")
    if not isinstance(model, dict):
        model = {}
        config["model"] = model
    changed = False
    desired_model = {
        "default": _hermes_model_default(),
        "provider": _AI_ANIME_HERMES_PROVIDER,
        "context_length": int(_hermes_model_context_length()),
    }
    for key, value in desired_model.items():
        if model.get(key) != value:
            model[key] = value
            changed = True
    for secret_or_legacy_key in ("api_key", "api", "base_url"):
        if secret_or_legacy_key in model:
            model.pop(secret_or_legacy_key, None)
            changed = True

    providers = config.get("custom_providers")
    if not isinstance(providers, list):
        providers = []
        config["custom_providers"] = providers
        changed = True
    managed_provider = next(
        (
            item
            for item in providers
            if isinstance(item, dict)
            and str(item.get("name") or "").strip().lower()
            == _AI_ANIME_HERMES_PROVIDER_NAME
        ),
        None,
    )
    if managed_provider is None:
        managed_provider = {"name": _AI_ANIME_HERMES_PROVIDER_NAME}
        providers.append(managed_provider)
        changed = True
    api_key, base_url = _effective_newapi_gateway()
    desired_provider = {
        "name": _AI_ANIME_HERMES_PROVIDER_NAME,
        "base_url": base_url,
        "api_mode": _hermes_model_api_mode(),
    }
    if api_key:
        desired_provider["key_env"] = _AI_ANIME_HERMES_KEY_ENV
    for key, value in desired_provider.items():
        if managed_provider.get(key) != value:
            managed_provider[key] = value
            changed = True
    for secret_key in ("api_key", "api"):
        if secret_key in managed_provider:
            managed_provider.pop(secret_key, None)
            changed = True
    if not api_key and "key_env" in managed_provider:
        managed_provider.pop("key_env", None)
        changed = True

    compression = config.get("compression")
    if not isinstance(compression, dict):
        compression = {}
        config["compression"] = compression
        changed = True
    desired_compression = {
        "enabled": True,
        "threshold": 0.75,
        "target_ratio": 0.20,
        "protect_last_n": 20,
        "protect_first_n": 3,
        "abort_on_summary_failure": True,
        "in_place": True,
    }
    for key, value in desired_compression.items():
        if compression.get(key) != value:
            compression[key] = value
            changed = True

    auxiliary = config.get("auxiliary")
    if not isinstance(auxiliary, dict):
        auxiliary = {}
        config["auxiliary"] = auxiliary
        changed = True
    auxiliary_compression = auxiliary.get("compression")
    if not isinstance(auxiliary_compression, dict):
        auxiliary_compression = {}
        auxiliary["compression"] = auxiliary_compression
        changed = True
    desired_auxiliary_compression = {
        "provider": _AI_ANIME_HERMES_PROVIDER,
        "model": _hermes_model_default(),
        "timeout": 300,
    }
    for key, value in desired_auxiliary_compression.items():
        if auxiliary_compression.get(key) != value:
            auxiliary_compression[key] = value
            changed = True
    if not changed:
        return
    try:
        config_yaml.write_text(_dump_hermes_config_yaml(config), encoding="utf-8")
    except OSError:
        _log.warning("failed to sync managed model gateway into %s", config_yaml)


class _IndentedSafeDumper(yaml.SafeDumper):
    def increase_indent(self, flow: bool = False, indentless: bool = False):
        return super().increase_indent(flow, False)


def _dump_hermes_config_yaml(config: dict) -> str:
    return yaml.dump(
        config,
        Dumper=_IndentedSafeDumper,
        allow_unicode=True,
        sort_keys=False,
    )


def _ensure_model_config_from_env(config_yaml: Path) -> None:
    """Reconcile Hermes with the selected cloud catalog or BYOK text model."""
    overrides: dict[str, object] = {"default": _hermes_model_default()}
    api_mode = _root_value("HERMES_MODEL_API_MODE")
    if api_mode:
        overrides["api_mode"] = api_mode
    context_length = _root_value("HERMES_MODEL_CONTEXT_LENGTH")
    if context_length:
        overrides["context_length"] = int(_hermes_model_context_length())
    if not overrides:
        return
    try:
        text = config_yaml.read_text(encoding="utf-8")
    except OSError:
        return
    try:
        config = yaml.safe_load(text) or {}
    except yaml.YAMLError:
        _log.warning("failed to parse hermes config yaml at %s", config_yaml)
        return
    if not isinstance(config, dict):
        return
    config_model = config.setdefault("model", {})
    if not isinstance(config_model, dict):
        config_model = {}
        config["model"] = config_model
    changed = False
    for key, value in overrides.items():
        if config_model.get(key) != value:
            config_model[key] = value
            changed = True
    if not changed:
        return
    try:
        config_yaml.write_text(_dump_hermes_config_yaml(config), encoding="utf-8")
    except OSError:
        _log.warning("failed to apply hermes model env overrides to %s", config_yaml)


def _materialize_plugin_links(plugins_dir: Path) -> None:
    """Create / refresh symlinks from plugins_dir/<name> → repo-pinned plugins."""
    src_plugins = _hermes_assets_root() / "plugins"
    if not src_plugins.is_dir():
        _log.info(
            "hermes plugins source not found at %s — skipping plugin links",
            src_plugins,
        )
        return

    allowed = {
        name.strip()
        for name in os.environ.get(
            "AI_ANIME_HERMES_PLUGINS",
            ",".join(sorted(DEFAULT_HERMES_PLUGINS)),
        ).split(",")
        if name.strip()
    }
    want = {
        p.name: p.resolve()
        for p in src_plugins.iterdir()
        if p.is_dir() and (not allowed or p.name in allowed)
    }

    for name, target in want.items():
        if name.startswith("_"):
            continue
        _materialize_managed_asset(plugins_dir / name, target, kind="plugin")

    for entry in plugins_dir.iterdir():
        if entry.name not in want:
            _remove_stale_managed_asset(entry)


__all__ = [
    "effective_gateway_credentials",
    "effective_gateway_fingerprint",
    "ensure_user_hermes_workspace",
]
