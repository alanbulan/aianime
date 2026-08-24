"""Character voice sample application use cases."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.errors import (
    CharacterVoiceNotFound,
    InvalidCharacterVoiceInput,
    UnsupportedCharacterVoiceSlot,
)
from ai_anime.modules.asset_world.application.ports import (
    CharacterVoiceFiles,
    CharacterVoiceRepository,
    CharacterVoiceUpload,
)
from ai_anime.modules.asset_world.domain.character_voice import (
    ALL_SLOTS,
    DEFAULT_SLOT,
    VOICE_SLOT_LABELS,
    voice_slot_metadata,
    voice_slot_update_fields,
)

MediaUrl = Callable[[str], str]


def character_voice_fields(character: Any, *, media_url: MediaUrl) -> dict[str, Any]:
    rel_path = getattr(character, "reference_audio_path", "") or ""
    return {
        "reference_audio_path": rel_path,
        "reference_audio_url": media_url(rel_path) if rel_path else "",
        "reference_audio_sha256": getattr(character, "reference_audio_sha256", "")
        or "",
        "reference_audio_updated_at": getattr(
            character, "reference_audio_updated_at", ""
        )
        or "",
        "voice_samples_by_age_group": getattr(
            character, "voice_samples_by_age_group", {}
        )
        or {},
    }


def identity_voice_fields(identity: Any, *, media_url: MediaUrl) -> dict[str, str]:
    rel_path = getattr(identity, "reference_audio_path", "") or ""
    return {
        "reference_audio_path": rel_path,
        "reference_audio_url": media_url(rel_path) if rel_path else "",
        "reference_audio_sha256": getattr(identity, "reference_audio_sha256", "") or "",
        "reference_audio_updated_at": getattr(
            identity, "reference_audio_updated_at", ""
        )
        or "",
    }


class CharacterVoiceUseCases:
    def __init__(self, files: CharacterVoiceFiles) -> None:
        self._files = files

    def list_samples(
        self,
        *,
        repository: CharacterVoiceRepository,
        character_name: str,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        character = self._character(repository, character_name)
        return {
            "character": character.name,
            "slots": [
                self._slot_payload(character, slot=slot, media_url=media_url)
                for slot in ALL_SLOTS
            ],
            "identities": [
                self._identity_payload(
                    character,
                    identity=identity,
                    media_url=media_url,
                )
                for identity in list(getattr(character, "identities", None) or [])
            ],
        }

    async def bind_sample(
        self,
        *,
        repository: CharacterVoiceRepository,
        project_dir: str | Path,
        character_name: str,
        slot: str,
        source_path: str | Path,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        character = self._character(repository, character_name)
        self._ensure_slot(slot)
        try:
            content, filename = self._files.read_source(source_path)
            metadata = self._files.persist(
                project_dir=project_dir,
                character_name=character_name,
                slot=slot,
                filename=filename,
                content=content,
            )
        except ValueError as exc:
            raise InvalidCharacterVoiceInput(str(exc)) from exc
        return await self._apply(
            repository=repository,
            character=character,
            slot=slot,
            metadata=metadata,
            media_url=media_url,
        )

    async def bind_identity_sample(
        self,
        *,
        repository: CharacterVoiceRepository,
        project_dir: str | Path,
        character_name: str,
        identity_id: str,
        source_path: str | Path,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        character = self._character(repository, character_name)
        identity = self._identity(character, identity_id)
        try:
            content, filename = self._files.read_source(source_path)
            metadata = self._files.persist_identity(
                project_dir=project_dir,
                character_name=character_name,
                identity_id=identity_id,
                filename=filename,
                content=content,
            )
        except ValueError as exc:
            raise InvalidCharacterVoiceInput(str(exc)) from exc
        return await self._apply_identity(
            repository=repository,
            character=character,
            identity=identity,
            metadata=metadata,
            media_url=media_url,
        )

    async def delete_identity_sample(
        self,
        *,
        repository: CharacterVoiceRepository,
        project_dir: str | Path,
        character_name: str,
        identity_id: str,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        character = self._character(repository, character_name)
        identity = self._identity(character, identity_id)
        self._files.clear_identity(
            project_dir=project_dir,
            character_name=character_name,
            identity_id=identity_id,
        )
        return await self._apply_identity(
            repository=repository,
            character=character,
            identity=identity,
            metadata=("", "", ""),
            media_url=media_url,
        )

    async def upload_sample(
        self,
        *,
        repository: CharacterVoiceRepository,
        project_dir: str | Path,
        character_name: str,
        slot: str,
        upload: CharacterVoiceUpload,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        character = self._character(repository, character_name)
        self._ensure_slot(slot)
        content = await upload.read()
        try:
            metadata = self._files.persist(
                project_dir=project_dir,
                character_name=character_name,
                slot=slot,
                filename=upload.filename or "",
                content=content,
            )
        except ValueError as exc:
            raise InvalidCharacterVoiceInput(str(exc)) from exc
        return await self._apply(
            repository=repository,
            character=character,
            slot=slot,
            metadata=metadata,
            media_url=media_url,
        )

    async def record_sample(
        self,
        *,
        repository: CharacterVoiceRepository,
        project_dir: str | Path,
        character_name: str,
        slot: str,
        data_url: str,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        character = self._character(repository, character_name)
        self._ensure_slot(slot)
        try:
            content, extension = self._files.decode_recording(data_url)
            metadata = self._files.persist(
                project_dir=project_dir,
                character_name=character_name,
                slot=slot,
                filename=f"recorded{extension}",
                content=content,
            )
        except ValueError as exc:
            raise InvalidCharacterVoiceInput(str(exc)) from exc
        return await self._apply(
            repository=repository,
            character=character,
            slot=slot,
            metadata=metadata,
            media_url=media_url,
        )

    async def trim_sample(
        self,
        *,
        repository: CharacterVoiceRepository,
        project_dir: str | Path,
        character_name: str,
        slot: str,
        source_path: str | Path,
        start_seconds: float,
        duration_seconds: float,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        character = self._character(repository, character_name)
        self._ensure_slot(slot)
        try:
            metadata = self._files.trim(
                project_dir=project_dir,
                character_name=character_name,
                slot=slot,
                source_path=source_path,
                start_seconds=start_seconds,
                duration_seconds=duration_seconds,
            )
        except ValueError as exc:
            raise InvalidCharacterVoiceInput(str(exc)) from exc
        return await self._apply(
            repository=repository,
            character=character,
            slot=slot,
            metadata=metadata,
            media_url=media_url,
        )

    async def delete_sample(
        self,
        *,
        repository: CharacterVoiceRepository,
        project_dir: str | Path,
        character_name: str,
        slot: str,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        character = self._character(repository, character_name)
        self._ensure_slot(slot)
        self._files.clear(
            project_dir=project_dir,
            character_name=character_name,
            slot=slot,
        )
        return await self._apply(
            repository=repository,
            character=character,
            slot=slot,
            metadata=("", "", ""),
            media_url=media_url,
        )

    @staticmethod
    def _character(
        repository: CharacterVoiceRepository,
        character_name: str,
    ) -> Any:
        character = repository.get_character(character_name)
        if character is None:
            raise CharacterVoiceNotFound(f"Character '{character_name}' not found")
        return character

    @staticmethod
    def _ensure_slot(slot: str) -> None:
        if slot not in ALL_SLOTS:
            raise UnsupportedCharacterVoiceSlot(f"Unsupported voice slot: {slot}")

    @staticmethod
    def _identity(character: Any, identity_id: str) -> Any:
        identity = next(
            (
                item
                for item in list(getattr(character, "identities", None) or [])
                if str(getattr(item, "identity_id", "") or "") == identity_id
            ),
            None,
        )
        if identity is None:
            raise CharacterVoiceNotFound(f"Identity '{identity_id}' not found")
        return identity

    @staticmethod
    def _slot_payload(
        character: Any,
        *,
        slot: str,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        metadata = voice_slot_metadata(character, slot)
        default_metadata = voice_slot_metadata(character, DEFAULT_SLOT)
        return {
            "slot": slot,
            "label": VOICE_SLOT_LABELS.get(slot, slot),
            "path": metadata.path,
            "url": media_url(metadata.path) if metadata.path else "",
            "sha256": metadata.sha256,
            "updated_at": metadata.updated_at,
            "inherited_from_default": slot != DEFAULT_SLOT
            and not metadata.path
            and bool(default_metadata.path),
            "required": slot == DEFAULT_SLOT,
        }

    @staticmethod
    def _identity_payload(
        character: Any,
        *,
        identity: Any,
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        path = str(getattr(identity, "reference_audio_path", "") or "")
        sha256 = str(getattr(identity, "reference_audio_sha256", "") or "")
        updated_at = str(getattr(identity, "reference_audio_updated_at", "") or "")
        age_group = str(getattr(identity, "age_group", "") or "")
        resolved = voice_slot_metadata(character, age_group)
        resolved_from = "age_group" if age_group in ALL_SLOTS[1:] else ""
        if path:
            resolved_path = path
            resolved_from = "identity"
        elif resolved_from and resolved.path:
            resolved_path = resolved.path
        else:
            resolved = voice_slot_metadata(character, DEFAULT_SLOT)
            resolved_path = resolved.path
            resolved_from = "character_default" if resolved_path else ""
        return {
            "identity_id": str(getattr(identity, "identity_id", "") or ""),
            "identity_name": str(getattr(identity, "identity_name", "") or ""),
            "age_group": age_group,
            "path": path,
            "url": media_url(path) if path else "",
            "sha256": sha256,
            "updated_at": updated_at,
            "resolved_path": resolved_path,
            "resolved_url": media_url(resolved_path) if resolved_path else "",
            "resolved_from": resolved_from,
        }

    async def _apply(
        self,
        *,
        repository: CharacterVoiceRepository,
        character: Any,
        slot: str,
        metadata: tuple[str, str, str],
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        path, sha256, updated_at = metadata
        fields = voice_slot_update_fields(
            character,
            slot,
            path=path,
            sha256=sha256,
            updated_at=updated_at,
        )
        await repository.update_character(character.name, **fields)
        for key, value in fields.items():
            setattr(character, key, value)
        return self._slot_payload(character, slot=slot, media_url=media_url)

    async def _apply_identity(
        self,
        *,
        repository: CharacterVoiceRepository,
        character: Any,
        identity: Any,
        metadata: tuple[str, str, str],
        media_url: MediaUrl,
    ) -> dict[str, Any]:
        path, sha256, updated_at = metadata
        fields = {
            "reference_audio_path": path,
            "reference_audio_sha256": sha256,
            "reference_audio_updated_at": updated_at,
        }
        await repository.update_character_identity(
            character.name,
            identity.identity_id,
            **fields,
        )
        for key, value in fields.items():
            setattr(identity, key, value)
        return self._identity_payload(
            character,
            identity=identity,
            media_url=media_url,
        )
