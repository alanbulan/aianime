"""Local file adapter for project-chat media projection."""

from __future__ import annotations

import base64
import binascii
import hashlib
import os
import re
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from ai_anime.shared.utils.static_urls import project_static_url


_CHAT_IMAGE_MEDIA = {
    "image/png": (".png", "PNG"),
    "image/jpeg": (".jpg", "JPEG"),
    "image/webp": (".webp", "WEBP"),
    "image/gif": (".gif", "GIF"),
}
_MAX_CHAT_IMAGE_BYTES = 20 * 1024 * 1024


class LocalProjectMediaFiles:
    def resolve_project_dir(
        self,
        username: str,
        project: str,
        project_dir: str | Path | None = None,
    ) -> Path:
        if project_dir is not None:
            return Path(project_dir)
        base_dir = self._output_root() / username / project
        for path in (
            base_dir,
            base_dir / "graph",
            base_dir / "assets",
            base_dir / "assets" / "characters",
            base_dir / "scripts",
            base_dir / "images",
            base_dir / "audio",
            base_dir / "videos",
            base_dir / "uploads",
        ):
            path.mkdir(parents=True, exist_ok=True)
        return base_dir

    @staticmethod
    def exists(project_dir: Path, relative_path: str) -> bool:
        return (project_dir / relative_path).exists()

    @staticmethod
    def static_url(
        project: str,
        project_dir: Path,
        relative_path: str,
    ) -> str:
        return project_static_url(
            project,
            relative_path,
            local_path=project_dir / relative_path,
        )

    @staticmethod
    def persist_inline_chat_image(
        project_dir: Path,
        *,
        content: str,
        filename: str | None,
        mime_type: str | None,
    ) -> str:
        declared_type = str(mime_type or "").strip().lower()
        header, separator, encoded = str(content or "").partition(",")
        match = re.fullmatch(r"data:([^;,]+);base64", header, flags=re.IGNORECASE)
        if not separator or match is None:
            raise ValueError("聊天图片不是有效的 base64 data URL")
        embedded_type = match.group(1).strip().lower()
        if declared_type and embedded_type != declared_type:
            raise ValueError("聊天图片的 MIME 类型不一致")
        media = _CHAT_IMAGE_MEDIA.get(embedded_type)
        if media is None:
            raise ValueError("聊天附件仅支持 PNG、JPEG、WebP 和 GIF 图片")
        try:
            payload = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError("聊天图片不是有效的 base64 数据") from exc
        if not payload:
            raise ValueError("聊天图片内容为空")
        if len(payload) > _MAX_CHAT_IMAGE_BYTES:
            raise ValueError("聊天图片不能超过 20 MB")

        extension, expected_format = media
        try:
            with Image.open(BytesIO(payload)) as image:
                actual_format = str(image.format or "").upper()
                image.verify()
        except (UnidentifiedImageError, OSError, SyntaxError) as exc:
            raise ValueError("聊天附件不是有效图片") from exc
        if actual_format != expected_format:
            raise ValueError("聊天图片内容与扩展类型不一致")

        stem = re.sub(r"[^\w.-]+", "_", Path(filename or "reference").stem)
        stem = stem.strip("._")[:48] or "reference"
        digest = hashlib.sha256(payload).hexdigest()[:16]
        relative = Path("uploads") / "assistant" / f"{stem}-{digest}{extension}"
        target = (project_dir / relative).resolve()
        root = project_dir.resolve()
        if not target.is_relative_to(root):
            raise ValueError("聊天图片路径无效")
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(payload)
        return relative.as_posix()

    @staticmethod
    def _output_root() -> Path:
        configured = os.environ.get("AI_ANIME_OUTPUT_DIR", "").strip()
        if configured:
            return Path(configured).expanduser()
        return Path(__file__).resolve().parents[5] / "output"


__all__ = ["LocalProjectMediaFiles"]
