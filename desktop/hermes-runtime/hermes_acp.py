"""Packaged entry point for the desktop-bundled Hermes ACP runtime."""

from __future__ import annotations

import sys

from acp_adapter.entry import main


def run() -> None:
    args = sys.argv[1:]
    if args[:1] == ["acp"]:
        args = args[1:]
    main(args)


if __name__ == "__main__":
    run()
