"""Local adapters for character identities."""

from __future__ import annotations

import inspect
import logging
import shutil
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from ai_anime.freezone.paths import resolve_static_url_to_path
from ai_anime.modules.asset_world.application.character_models import CharacterIdentity
from ai_anime.modules.asset_world.application.dto import (
    CreateIdentityCommand,
    IdentityAssetPaths,
    ImportedCharacterIdentityAsset,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterAlreadyExists,
    CharacterIdentityAssetSourceNotFound,
    CharacterNotFound,
    InvalidCharacterInput,
)
from ai_anime.modules.asset_world.domain.character_identity import identity_id_for
from ai_anime.modules.asset_world.infrastructure.asset_metadata import (
    newest_updated_at,
    tree_updated_at,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure.project_stores import make_sqlite_store_for_context
from ai_anime.shared.project_media import make_static_url_for_context
from ai_anime.utils.path_resolver import (
    canonical_identity_path,
    compute_identity_costume_path,
    compute_identity_path,
    compute_identity_portrait_path,
)


logger = logging.getLogger(__name__)

StoreFactory = Callable[[ProjectContext], Awaitable[Any]]
StaticUrlBuilder = Callable[[ProjectContext, str, Path | None], str]


class PydanticCharacterIdentityFactory:
    def create(
        self,
        character_name: str,
        command: CreateIdentityCommand,
    ) -> CharacterIdentity:
        return CharacterIdentity(
            identity_id=identity_id_for(character_name, command.identity_name),
            character_name=character_name,
            identity_name=command.identity_name,
            age_group=command.age_group,
            appearance_details=command.appearance_details,
            face_prompt=command.face_prompt,
            source=command.source,
        )


class LocalCharacterIdentityAssets:
    def paths(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> IdentityAssetPaths:
        if not identity_name:
            return IdentityAssetPaths()
        return IdentityAssetPaths(
            image=compute_identity_path(
                project_dir,
                character_name,
                identity_name,
            ),
            costume=compute_identity_costume_path(
                project_dir,
                character_name,
                identity_name,
            ),
            portrait=compute_identity_portrait_path(
                project_dir,
                character_name,
                identity_name,
            ),
        )

    def updated_at(
        self,
        character: Any,
        identity: Any,
        paths: IdentityAssetPaths,
    ) -> str:
        return newest_updated_at(
            getattr(identity, "updated_at", ""),
            getattr(character, "updated_at", ""),
            tree_updated_at(paths.image),
            tree_updated_at(paths.costume),
            tree_updated_at(paths.portrait),
        )


class LocalCharacterIdentityAssetImporter:
    def __init__(
        self,
        store_factory: StoreFactory | None = None,
        static_url_builder: StaticUrlBuilder | None = None,
    ) -> None:
        self._store_factory = store_factory
        self._static_url_builder = static_url_builder

    async def import_asset(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        source_url: str,
        character_name: str,
        identity: Any,
    ) -> ImportedCharacterIdentityAsset:
        try:
            source_path = resolve_static_url_to_path(source_url, project_dir)
        except ValueError as exc:
            raise InvalidCharacterInput(str(exc)) from exc
        if not source_path.exists():
            raise CharacterIdentityAssetSourceNotFound(
                f"source file not found: {source_path}"
            )

        store = await (self._store_factory or make_sqlite_store_for_context)(context)
        target_path: Path | None = None
        try:
            character = store.get_character(character_name)
            if character is None:
                raise CharacterNotFound(f"character not found: {character_name}")

            identity_id = str(identity.identity_id)
            if any(
                existing.identity_id == identity_id for existing in character.identities
            ):
                raise CharacterAlreadyExists(f"identity already exists: {identity_id}")
            target_path = canonical_identity_path(
                project_dir,
                character_name,
                identity_id,
            )
            if target_path.exists():
                raise CharacterAlreadyExists(
                    f"identity image already exists: {identity_id}"
                )

            target_path.parent.mkdir(parents=True, exist_ok=True)
            self._persist_png(source_path, target_path)
            try:
                await store.add_character_identity(character_name, identity)
            except ValueError as exc:
                self._rollback_import(target_path)
                raise CharacterAlreadyExists(str(exc)) from exc
            except Exception:
                self._rollback_import(target_path)
                raise
        finally:
            await _close_store(store)

        relative_path = target_path.relative_to(project_dir).as_posix()
        return ImportedCharacterIdentityAsset(
            target_path=target_path,
            target_url=(self._static_url_builder or make_static_url_for_context)(
                context,
                relative_path,
                target_path,
            ),
        )

    @staticmethod
    def _persist_png(source_path: Path, target_path: Path) -> None:
        try:
            from PIL import Image

            with Image.open(source_path) as image:
                image.convert("RGB").save(target_path, format="PNG")
        except Exception:  # noqa: BLE001 - preserve arbitrary imported images
            shutil.copy2(source_path, target_path)

    @staticmethod
    def _rollback_import(target_path: Path) -> None:
        try:
            target_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("failed to rollback copied identity image: %s", target_path)


async def _close_store(store: Any) -> None:
    close = getattr(store, "close", None)
    if not close:
        return
    closed = close()
    if inspect.isawaitable(closed):
        await closed
