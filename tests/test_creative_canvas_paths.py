from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.creative_canvas.domain.canvas_identity import (
    is_valid_creative_canvas_id,
    require_creative_canvas_id,
)
from ai_anime.modules.creative_canvas.infrastructure.paths import canvas_path
from ai_anime.shared.project_media import resolve_project_media_path


def test_canvas_id_contract_accepts_only_stable_file_names(tmp_path: Path) -> None:
    assert is_valid_creative_canvas_id("canvas_01-draft") is True
    assert canvas_path(tmp_path, "canvas_01-draft") == (
        tmp_path / "freezone" / "canvases" / "canvas_01-draft.json"
    )

    with pytest.raises(ValueError, match="invalid canvas_id"):
        require_creative_canvas_id("../outside")


def test_resolve_project_static_url_decodes_quoted_relpath(tmp_path: Path) -> None:
    project_dir = tmp_path / "project"
    source = project_dir / "assets" / "characters" / "陈默" / "portrait.png"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"png")

    resolved = resolve_project_media_path(
        "/static/projects/01KSEFAPS6DM42P0HPASKYR4GM/"
        "assets/characters/%E9%99%88%E9%BB%98/portrait.png?v=123",
        project_dir,
    )

    assert resolved == source.resolve()
    assert resolved.exists()


def test_resolve_project_relative_url_decodes_quoted_relpath(tmp_path: Path) -> None:
    project_dir = tmp_path / "project"
    mask = project_dir / "freezone" / "_uploads" / "遮罩.png"
    mask.parent.mkdir(parents=True)
    mask.write_bytes(b"png")

    resolved = resolve_project_media_path(
        "/freezone/_uploads/%E9%81%AE%E7%BD%A9.png#mask",
        project_dir,
    )

    assert resolved == mask.resolve()


def test_resolve_project_media_still_rejects_encoded_traversal(
    tmp_path: Path,
) -> None:
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    with pytest.raises(ValueError, match="outside project"):
        resolve_project_media_path(
            "/static/projects/proj_123/%2E%2E/secret.png",
            project_dir,
        )
