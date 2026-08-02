"""Storage-level errors and results for Creative Canvas documents."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


class CanvasStoreError(RuntimeError):
    """Base class for canvas storage errors."""


class CanvasCorruptError(CanvasStoreError):
    def __init__(self, message: str):
        super().__init__(message)


class CanvasBaseRevisionRequired(CanvasStoreError):
    def __init__(self):
        super().__init__("canvas base_revision is required")


class CanvasRevisionConflict(CanvasStoreError):
    def __init__(self, *, current_revision: int, base_revision: int | None):
        super().__init__("canvas revision conflict")
        self.current_revision = current_revision
        self.base_revision = base_revision


class CanvasIdempotencyConflict(CanvasStoreError):
    def __init__(self, *, client_save_id: str):
        super().__init__("canvas idempotency key reused for a different payload")
        self.client_save_id = client_save_id


class CanvasInvalidHistoryId(CanvasStoreError):
    def __init__(self):
        super().__init__("invalid history_id")


class CanvasHistoryNotFound(CanvasStoreError):
    def __init__(self):
        super().__init__("canvas history not found")


class DangerousEmptyCanvasOverwrite(CanvasStoreError):
    def __init__(self, *, old_nodes: int, new_nodes: int, save_source: str):
        super().__init__("dangerous empty canvas overwrite")
        self.old_nodes = old_nodes
        self.new_nodes = new_nodes
        self.save_source = save_source


@dataclass(frozen=True)
class CanvasSaveResult:
    payload: dict
    existing: dict | None
    backup_path: Path | None
    idempotent: bool = False
    response_cache: dict | None = None


@dataclass(frozen=True)
class CanvasRestoreResult:
    payload: dict
    existing: dict | None
    history_payload: dict
    backup_path: Path | None


@dataclass(frozen=True)
class CanvasDeleteResult:
    existing: dict | None
    deleted_path: Path | None


@dataclass(frozen=True)
class CanvasEnsureResult:
    payload: dict
    created: bool
