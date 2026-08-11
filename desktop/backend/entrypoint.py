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


def _run_runtime_smoke_check() -> int:
    """Verify that the packaged graph database can load and execute a query."""
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

    payload = {"ok": value == 1, "ladybug": True, "unicode": "中文 ⚠"}
    print(f"AI_ANIME_BACKEND_SMOKE {json.dumps(payload, ensure_ascii=False)}")
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    _configure_standard_streams()
    if "--runtime-smoke-check" in sys.argv[1:]:
        raise SystemExit(_run_runtime_smoke_check())

    from ai_anime.desktop_server import main

    raise SystemExit(main())
