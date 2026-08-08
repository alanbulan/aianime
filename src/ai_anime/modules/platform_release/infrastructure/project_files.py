"""Local filesystem and OSS project file delivery adapter."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

from ai_anime.modules.platform_release.application.project_files import (
    ProjectFileDelivery,
)
from ai_anime.modules.platform_release.domain import (
    ProjectDirectoryNotFound,
    ProjectFileNotFound,
    resolve_project_file_path,
)

logger = logging.getLogger("ai_anime.platform_release.project_files")


def _download_via_oss_enabled() -> bool:
    from ai_anime.shared.oss_settings import DOWNLOAD_VIA_OSS

    return DOWNLOAD_VIA_OSS


def _presign_download(path: Path) -> str | None:
    from ai_anime.shared.utils.oss_client import maybe_presign_existing_output

    return maybe_presign_existing_output(path)


def _presign_static(path: Path, version_key: int) -> str | None:
    from ai_anime.shared.utils.oss_client import maybe_presign_static

    return maybe_presign_static(path, version_key)


class LocalProjectFileGateway:
    def __init__(
        self,
        *,
        download_via_oss_enabled: Callable[[], bool] = _download_via_oss_enabled,
        presign_download: Callable[[Path], str | None] = _presign_download,
        presign_static: Callable[[Path, int], str | None] = _presign_static,
    ) -> None:
        self._download_via_oss_enabled = download_via_oss_enabled
        self._presign_download = presign_download
        self._presign_static = presign_static

    def resolve(
        self,
        *,
        project_dir: Path,
        file_path: str,
        as_download: bool,
    ) -> ProjectFileDelivery:
        if not project_dir.exists():
            raise ProjectDirectoryNotFound

        requested = resolve_project_file_path(project_dir, file_path)
        if not requested.exists() or not requested.is_file():
            raise ProjectFileNotFound

        presigned = self._presigned_url(requested, as_download=as_download)
        return ProjectFileDelivery(
            path=requested,
            redirect_url=presigned,
            download_name=requested.name if as_download else None,
        )

    def _presigned_url(self, requested: Path, *, as_download: bool) -> str | None:
        try:
            if as_download:
                if self._download_via_oss_enabled():
                    return self._presign_download(requested)
                return None
            return self._presign_static(requested, requested.stat().st_mtime_ns)
        except Exception:
            logger.debug("OSS presign skipped for %s", requested, exc_info=True)
            return None
