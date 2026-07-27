"""Project file delivery queries."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class ProjectFileDelivery:
    path: Path
    redirect_url: str | None
    download_name: str | None


class ProjectFileGateway(Protocol):
    def resolve(
        self,
        *,
        project_dir: Path,
        file_path: str,
        as_download: bool,
    ) -> ProjectFileDelivery: ...


class ProjectFileQueries:
    def __init__(self, gateway: ProjectFileGateway) -> None:
        self._gateway = gateway

    def resolve(
        self,
        *,
        project_dir: Path,
        file_path: str,
        as_download: bool,
    ) -> ProjectFileDelivery:
        return self._gateway.resolve(
            project_dir=project_dir,
            file_path=file_path,
            as_download=as_download,
        )
