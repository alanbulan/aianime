from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.platform_release.domain import (
    ProjectDirectoryNotFound,
    ProjectFileAccessDenied,
    ProjectFileNotFound,
    resolve_project_file_path,
)
from ai_anime.modules.platform_release.infrastructure import LocalProjectFileGateway


def test_project_file_path_rejects_traversal(tmp_path: Path) -> None:
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    assert resolve_project_file_path(project_dir, "media/video.mp4") == (
        project_dir / "media" / "video.mp4"
    )
    with pytest.raises(ProjectFileAccessDenied):
        resolve_project_file_path(project_dir, "../secret.txt")


def test_project_file_gateway_reports_missing_project_and_file(tmp_path: Path) -> None:
    gateway = LocalProjectFileGateway()

    with pytest.raises(ProjectDirectoryNotFound):
        gateway.resolve(
            project_dir=tmp_path / "missing",
            file_path="video.mp4",
            as_download=False,
        )

    project_dir = tmp_path / "project"
    project_dir.mkdir()
    with pytest.raises(ProjectFileNotFound):
        gateway.resolve(
            project_dir=project_dir,
            file_path="missing.mp4",
            as_download=False,
        )


def test_project_file_gateway_preserves_download_and_inline_delivery(
    tmp_path: Path,
) -> None:
    project_dir = tmp_path / "project"
    media = project_dir / "media" / "video.mp4"
    media.parent.mkdir(parents=True)
    media.write_bytes(b"video")
    gateway = LocalProjectFileGateway(
        download_via_oss_enabled=lambda: True,
        presign_download=lambda _path: "https://cdn.example/download",
        presign_static=lambda _path, _version: "https://cdn.example/preview",
    )

    download = gateway.resolve(
        project_dir=project_dir,
        file_path="media/video.mp4",
        as_download=True,
    )
    preview = gateway.resolve(
        project_dir=project_dir,
        file_path="media/video.mp4",
        as_download=False,
    )

    assert download.redirect_url == "https://cdn.example/download"
    assert download.download_name == "video.mp4"
    assert preview.redirect_url == "https://cdn.example/preview"
    assert preview.download_name is None
