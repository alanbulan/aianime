"""Creative Canvas bootstrap application use case."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


class CreativeCanvasBootstrapCorrupt(RuntimeError):
    pass


class CreativeCanvasBootstrapBusy(RuntimeError):
    def __init__(self, canvas_id: str) -> None:
        self.canvas_id = canvas_id
        super().__init__(f"canvas lock busy: {canvas_id}")


@dataclass(frozen=True)
class InitializeCreativeCanvasCommand:
    project_dir: Path
    canvas_state_dir: Path
    project_id: str
    actor_id: str


@dataclass(frozen=True)
class CreativeCanvasBootstrapResult:
    freezone_dir: Path
    default_canvas_id: str
    default_canvas_created: bool
    default_canvas_revision: Any


class CreativeCanvasBootstrapStorage(Protocol):
    def initialize(
        self,
        command: InitializeCreativeCanvasCommand,
    ) -> CreativeCanvasBootstrapResult: ...


class CreativeCanvasBootstrapUseCases:
    def __init__(self, storage: CreativeCanvasBootstrapStorage) -> None:
        self._storage = storage

    def initialize(
        self,
        command: InitializeCreativeCanvasCommand,
    ) -> CreativeCanvasBootstrapResult:
        return self._storage.initialize(command)
