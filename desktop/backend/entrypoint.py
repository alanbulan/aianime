# Copyright (c) 2026 AI anime

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory


def _configure_standard_streams() -> None:
    """Keep frozen Windows stdout/stderr aligned with Electron's UTF-8 pipes."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="backslashreplace")


def _verify_cognee_resources() -> dict[str, int | bool]:
    """Load every packaged Cognee prompt and verify migration resources."""
    from cognee.infrastructure.llm.prompts import render_prompt
    from cognee.root_dir import get_absolute_path

    cognee_root = Path(get_absolute_path("."))
    prompt_directory = Path(get_absolute_path("./infrastructure/llm/prompts"))
    prompt_files = sorted(prompt_directory.glob("*.txt"))
    if len(prompt_files) < 50:
        raise RuntimeError(
            f"Incomplete Cognee prompt package: expected at least 50, found {len(prompt_files)}"
        )

    for prompt_file in prompt_files:
        render_prompt(prompt_file.name, {})

    required_resources = (
        cognee_root / "alembic.ini",
        cognee_root / "alembic" / "env.py",
        cognee_root / "alembic" / "script.py.mako",
        cognee_root / "infrastructure" / "llm" / "extraction" / "texts.json",
        cognee_root
        / "tasks"
        / "entity_completion"
        / "entity_extractors"
        / "regex_entity_config.json",
    )
    missing_resources = [str(path) for path in required_resources if not path.is_file()]
    if missing_resources:
        raise RuntimeError(f"Missing Cognee runtime resources: {missing_resources}")

    migration_files = sorted((cognee_root / "alembic" / "versions").glob("*.py"))
    if len(migration_files) < 20:
        raise RuntimeError(
            f"Incomplete Cognee migration package: expected at least 20, found {len(migration_files)}"
        )

    return {
        "cognee_prompts": True,
        "prompt_count": len(prompt_files),
        "cognee_migrations": True,
        "migration_count": len(migration_files),
    }


def _verify_litellm_resources() -> bool:
    """Verify the LiteLLM endpoint catalog used by the model router."""
    import litellm.containers

    containers_root = Path(litellm.containers.__file__).resolve().parent
    endpoints_file = containers_root / "endpoints.json"
    if not endpoints_file.is_file():
        raise RuntimeError(f"Missing LiteLLM endpoint catalog: {endpoints_file}")
    return True


def _run_runtime_smoke_check() -> int:
    """Verify packaged graph storage, Cognee resources, and UTF-8 output."""
    from ladybug import Connection, Database

    with TemporaryDirectory(prefix="ai-anime-backend-smoke-") as root:
        database = Database(str(Path(root) / "graph.lbug"))
        connection = Connection(database)
        try:
            result = connection.execute("RETURN 1 AS value")
            value = result.get_next()[0]
        finally:
            connection.close()
            database.close()

    cognee_resources = _verify_cognee_resources()
    payload = {
        "ok": value == 1,
        "ladybug": True,
        "unicode": "中文 ⚠",
        "litellm_resources": _verify_litellm_resources(),
        **cognee_resources,
    }
    print(f"AI_ANIME_BACKEND_SMOKE {json.dumps(payload, ensure_ascii=False)}")
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    _configure_standard_streams()
    if "--runtime-smoke-check" in sys.argv[1:]:
        raise SystemExit(_run_runtime_smoke_check())

    from ai_anime.desktop_server import main

    raise SystemExit(main())
