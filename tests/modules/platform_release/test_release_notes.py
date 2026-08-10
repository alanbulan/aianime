from __future__ import annotations

import re
from pathlib import Path

from ai_anime.modules.platform_release.domain import (
    parse_release_notes,
    validate_version_marker,
)


def test_release_notes_parse_localized_highlights() -> None:
    body = """\
---
version: 1.1.3
attention: medium
---
# v1.1.3

## User-facing Highlights (zh)
- **中文标题**: 中文内容

## User-facing Highlights (en)
- **English title**: English body
"""

    zh = parse_release_notes(body, "v1.1.3", locale="zh")
    en = parse_release_notes(body, "v1.1.3", locale="en")

    assert zh.attention == "medium"
    assert [(item.title, item.body) for item in zh.items] == [
        ("中文标题", "中文内容")
    ]
    assert [(item.title, item.body) for item in en.items] == [
        ("English title", "English body")
    ]


def test_repository_release_notes_match_package_version() -> None:
    project = Path("pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'^version = "([^"]+)"', project, re.MULTILINE)
    assert match is not None
    version = match.group(1)
    body = Path("src/ai_anime/release-notes.md").read_text(encoding="utf-8")
    validate_version_marker(body, version)
    assert parse_release_notes(body, f"v{version}", locale="zh").items
    assert parse_release_notes(body, f"v{version}", locale="en").items
