"""Local Creative Canvas media adapters."""

import uuid
from pathlib import Path

from ai_anime.modules.creative_canvas.infrastructure.paths import (
    output_path_for_job,
    safe_upload_filename,
    uploads_dir,
)
from ai_anime.modules.creative_canvas.application.media import (
    StoreCreativeCanvasUploadCommand,
    StoredCreativeCanvasMedia,
)
from ai_anime.shared.utils.static_urls import project_static_url


def _stored_media(
    project_id: str, project_dir: Path, target: Path
) -> StoredCreativeCanvasMedia:
    relative_path = target.relative_to(project_dir).as_posix()
    return StoredCreativeCanvasMedia(
        filename=target.name,
        relative_path=relative_path,
        url=project_static_url(project_id, relative_path, local_path=target),
        size=target.stat().st_size,
    )


class LocalCreativeCanvasMediaStorage:
    def save_upload(
        self,
        command: StoreCreativeCanvasUploadCommand,
    ) -> StoredCreativeCanvasMedia:
        target_dir = uploads_dir(command.project_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        filename = safe_upload_filename(command.original_filename)
        target = target_dir / filename
        target.write_bytes(command.contents)
        return _stored_media(command.project_id, command.project_dir, target)

    def save_screenshot(
        self,
        *,
        project_id: str,
        project_dir: Path,
        screenshot_id: str,
        payload: bytes,
    ) -> StoredCreativeCanvasMedia:
        target = output_path_for_job(project_dir, "three_d_viewer", screenshot_id)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        return _stored_media(project_id, project_dir, target)


class FreezoneJobIdGenerator:
    def new_id(self) -> str:
        return uuid.uuid4().hex[:16]
