"""Environment bootstrap helpers."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def project_root() -> Path:
    """Return the repository root for the installed source tree."""
    return Path(__file__).resolve().parents[3]


def load_project_dotenv(*, override: bool = False) -> None:
    """Load repo-level and cwd-level ``.env`` files.

    Runtime environment variables keep priority by default. This keeps local
    development convenient without making production depend on a dotenv file.
    """
    root = project_root()
    load_dotenv(root / ".env", override=override)
    load_dotenv(override=override)


__all__ = ["load_project_dotenv", "project_root"]
