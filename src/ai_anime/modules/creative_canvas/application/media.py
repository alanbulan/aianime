"""Creative Canvas media application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ai_anime.modules.creative_canvas.domain import (
    decode_png_screenshot,
    normalize_screenshot_label,
)


@dataclass(frozen=True)
class StoreCreativeCanvasUploadCommand:
    project_id: str
    project_dir: Path
    original_filename: str | None
    contents: bytes


@dataclass(frozen=True)
class SaveCreativeCanvasScreenshotCommand:
    project_id: str
    project_dir: Path
    data_url: str
    node_id: str | None = None
    label: str | None = None


@dataclass(frozen=True)
class StoredCreativeCanvasMedia:
    filename: str
    relative_path: str
    url: str
    size: int


@dataclass(frozen=True)
class CreativeCanvasUploadResult:
    filename: str
    url: str
    size: int


@dataclass(frozen=True)
class CreativeCanvasScreenshotResult:
    screenshot_id: str
    label: str
    node_id: str | None
    relative_path: str
    url: str
    size: int


class CreativeCanvasMediaStorage(Protocol):
    def save_upload(
        self,
        command: StoreCreativeCanvasUploadCommand,
    ) -> StoredCreativeCanvasMedia: ...

    def save_screenshot(
        self,
        *,
        project_id: str,
        project_dir: Path,
        screenshot_id: str,
        payload: bytes,
    ) -> StoredCreativeCanvasMedia: ...


class CreativeCanvasJobIdGenerator(Protocol):
    def new_id(self) -> str: ...


class CreativeCanvasMediaUseCases:
    def __init__(
        self,
        storage: CreativeCanvasMediaStorage,
        job_ids: CreativeCanvasJobIdGenerator,
    ) -> None:
        self._storage = storage
        self._job_ids = job_ids

    def upload(
        self,
        command: StoreCreativeCanvasUploadCommand,
    ) -> CreativeCanvasUploadResult:
        stored = self._storage.save_upload(command)
        return CreativeCanvasUploadResult(
            filename=stored.filename,
            url=stored.url,
            size=stored.size,
        )

    def save_screenshot(
        self,
        command: SaveCreativeCanvasScreenshotCommand,
    ) -> CreativeCanvasScreenshotResult:
        payload = decode_png_screenshot(command.data_url)
        screenshot_id = self._job_ids.new_id()
        stored = self._storage.save_screenshot(
            project_id=command.project_id,
            project_dir=command.project_dir,
            screenshot_id=screenshot_id,
            payload=payload,
        )
        return CreativeCanvasScreenshotResult(
            screenshot_id=screenshot_id,
            label=normalize_screenshot_label(command.label),
            node_id=command.node_id,
            relative_path=stored.relative_path,
            url=stored.url,
            size=stored.size,
        )
