"""Creative Canvas on-disk layout."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from ai_anime.modules.creative_canvas.domain.canvas_identity import (
    require_creative_canvas_id,
)


def freezone_root(project_dir: Path) -> Path:
    return project_dir / "freezone"


def uploads_dir(project_dir: Path) -> Path:
    return freezone_root(project_dir) / "_uploads"


def outputs_dir(project_dir: Path, task_type: str) -> Path:
    return freezone_root(project_dir) / "_outputs" / task_type


def output_path_for_job(project_dir: Path, task_type: str, job_id: str) -> Path:
    return outputs_dir(project_dir, task_type) / f"{job_id}.png"


def canvases_dir(project_dir: Path) -> Path:
    return freezone_root(project_dir) / "canvases"


def canvas_path(project_dir: Path, canvas_id: str) -> Path:
    require_creative_canvas_id(canvas_id)
    return canvases_dir(project_dir) / f"{canvas_id}.json"


def safe_upload_filename(original: str | None) -> str:
    """Sanitize a user-provided filename and prefix it with a timestamp."""
    base = (original or "upload").split("/")[-1].split("\\")[-1]
    base = re.sub(r"[^a-zA-Z0-9_\-.]", "_", base) or "upload"
    if "." not in base:
        base = f"{base}.png"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    return f"{timestamp}_{base}"
