"""Packaged entry point for the desktop-bundled Hermes ACP runtime."""

from __future__ import annotations

import sys

from acp_adapter.entry import main
from ai_anime_acp_runtime import install_ai_anime_acp_runtime


def run() -> None:
    install_ai_anime_acp_runtime()
    args = sys.argv[1:]
    if args[:1] == ["acp"]:
        args = args[1:]
    main(args)


if __name__ == "__main__":
    run()
