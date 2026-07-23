"""Local image storage for character and identity uploads."""

from __future__ import annotations

import io
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image

from ai_anime.modules.asset_world.domain.character_assets import (
    safe_character_asset_name,
)
from ai_anime.modules.asset_world.infrastructure.character_asset_history import (
    backup_character_asset,
)
from ai_anime.utils.path_resolver import (
    canonical_identity_costume_path,
    canonical_identity_path,
    canonical_portrait_path,
)


def _decoded_rgb(content: bytes) -> Image.Image:
    return Image.open(io.BytesIO(content)).convert("RGB")


def _backup_with_seconds(path: Path) -> Path | None:
    if not path.exists():
        return None
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    backup = path.with_name(f"{path.stem}_{timestamp}{path.suffix}")
    shutil.copy(path, backup)
    return backup


def _save_png(
    image: Image.Image,
    target: Path,
    *,
    backup: str,
) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    if backup == "seconds":
        _backup_with_seconds(target)
    elif backup == "microseconds":
        backup_character_asset(target)
    image.save(str(target), format="PNG")
    return target


class LocalCharacterImageFiles:
    def save_character_portrait(
        self,
        project_dir: Path,
        character_name: str,
        content: bytes,
    ) -> Path:
        image = _decoded_rgb(content)
        return _save_png(
            image,
            canonical_portrait_path(project_dir, character_name),
            backup="seconds",
        )

    def save_identity_image(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        content: bytes,
    ) -> Path:
        image = _decoded_rgb(content)
        target = (
            project_dir
            / "assets"
            / "characters"
            / character_name
            / "identities"
            / f"{identity_name}.png"
        )
        return _save_png(image, target, backup="microseconds")

    def delete_identity_image(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> bool:
        target = canonical_identity_path(
            project_dir,
            character_name,
            identity_name,
        )
        if not target.exists():
            return False
        target.unlink()
        return True

    def save_identity_costume(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        content: bytes,
    ) -> Path:
        image = _decoded_rgb(content)
        safe_name = safe_character_asset_name(identity_name)
        target = (
            project_dir
            / "assets"
            / "characters"
            / character_name
            / "identities"
            / f"{safe_name}_costume.png"
        )
        return _save_png(image, target, backup="seconds")

    def delete_identity_costume(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        saved_path: str,
    ) -> bool:
        candidate_paths: list[Path] = []
        canonical = canonical_identity_costume_path(
            project_dir,
            character_name,
            identity_name,
        )
        if canonical.exists():
            candidate_paths.append(canonical)
        if saved_path.strip():
            candidate_paths.append(Path(saved_path.strip()))

        deleted = False
        seen: set[Path] = set()
        for path in candidate_paths:
            if path in seen:
                continue
            seen.add(path)
            if path.exists():
                path.unlink()
                deleted = True
        return deleted

    def save_identity_portrait(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        content: bytes,
    ) -> Path:
        image = _decoded_rgb(content)
        safe_name = safe_character_asset_name(identity_name)
        target = (
            project_dir
            / "assets"
            / "characters"
            / character_name
            / "identities"
            / f"{character_name}_{safe_name}_portrait.png"
        )
        return _save_png(image, target, backup="seconds")

    def count_identity_attempts(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> dict[str, int]:
        safe_name = safe_character_asset_name(identity_name)
        identities_dir = (
            project_dir / "assets" / "characters" / character_name / "identities"
        )
        image_attempts = len(
            [
                path
                for path in identities_dir.glob(f"{safe_name}*.png")
                if not path.name.endswith("_costume.png")
                and "_portrait" not in path.stem
            ]
        )
        portrait_attempts = len(
            list(identities_dir.glob(f"*{safe_name}_portrait*.png"))
        )
        return {
            "image_attempts": image_attempts,
            "portrait_attempts": portrait_attempts,
        }
