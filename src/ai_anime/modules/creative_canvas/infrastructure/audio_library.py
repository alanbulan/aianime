"""Local Creative Canvas audio-library adapter."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from typing import Any

from ai_anime.modules.creative_canvas.infrastructure.audio_voice_store import (
    create_user_audio_voice,
    list_user_audio_voices,
    resolve_user_audio_voice,
)
from ai_anime.modules.creative_canvas.domain import (
    CREATIVE_CANVAS_AUDIO_AGE_GROUP_LABELS,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.project_config import (
    load_effective_narration_style_for_voice,
    load_narrator_reference_audio,
)
from ai_anime.modules.seedance2_i2v.public import resolve_character_voice
from ai_anime.shared.infrastructure.project_stores import (
    make_sqlite_store_for_context,
)
from ai_anime.shared.project_media import make_static_url_for_context


StoreFactory = Callable[[ProjectContext], Awaitable[Any]]
NarratorReferenceLoader = Callable[[str, str], Mapping[str, str]]
NarrationStyleLoader = Callable[[str, str], str]
UserVoiceLister = Callable[[str], list[dict]]
UserVoiceCreator = Callable[..., Mapping[str, Any]]
UserVoiceResolver = Callable[[str, str], Any]
CharacterVoiceResolver = Callable[..., Any]
StaticUrlBuilder = Callable[[ProjectContext, str, str | Path | None], str]


class LocalCreativeCanvasAudioLibraryGateway:
    def __init__(
        self,
        *,
        store_factory: StoreFactory = make_sqlite_store_for_context,
        narrator_reference_loader: NarratorReferenceLoader = (
            load_narrator_reference_audio
        ),
        narration_style_loader: NarrationStyleLoader = (
            load_effective_narration_style_for_voice
        ),
        user_voice_lister: UserVoiceLister = list_user_audio_voices,
        user_voice_creator: UserVoiceCreator = create_user_audio_voice,
        user_voice_resolver: UserVoiceResolver = resolve_user_audio_voice,
        character_voice_resolver: CharacterVoiceResolver = resolve_character_voice,
        static_url_builder: StaticUrlBuilder = make_static_url_for_context,
    ) -> None:
        self._store_factory = store_factory
        self._narrator_reference_loader = narrator_reference_loader
        self._narration_style_loader = narration_style_loader
        self._user_voice_lister = user_voice_lister
        self._user_voice_creator = user_voice_creator
        self._user_voice_resolver = user_voice_resolver
        self._character_voice_resolver = character_voice_resolver
        self._static_url_builder = static_url_builder

    async def list_references(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        account_username: str,
    ) -> Mapping[str, Any]:
        owner_username = context.owner_username
        project_name = context.project_name
        narrator_descriptor = self._narrator_reference_loader(
            owner_username,
            project_name,
        )
        narration_style = self._narration_style_loader(
            owner_username,
            project_name,
        )
        user_voices = self._attach_user_voice_media_urls(
            context.project_id,
            self._user_voice_lister(account_username),
        )

        store = await self._store_factory(context)
        try:
            characters = list(await store.list_characters())
        finally:
            close = getattr(store, "close", None)
            if close:
                await close()

        narrator = self._reference_payload(
            context=context,
            project_dir=project_dir,
            scope="project_narrator",
            label="项目解说人声线",
            path=narrator_descriptor.get("path", ""),
            sha256=narrator_descriptor.get("sha256", ""),
            updated_at=narrator_descriptor.get("updated_at", ""),
        )
        character_payloads = [
            self._character_audio_refs(
                context=context,
                project_dir=project_dir,
                character=character,
            )
            for character in characters
        ]
        available = [narrator] if narrator["exists"] else []
        available.extend(item for item in user_voices if item["exists"])
        for character in character_payloads:
            available.extend(item for item in character["voices"] if item["exists"])
            for item in character["identities"]:
                if item["exists"]:
                    available.append(item)
                resolved = item.get("resolved")
                if isinstance(resolved, dict) and resolved.get("exists"):
                    available.append(resolved)

        return {
            "narration_style": narration_style,
            "narrator": narrator,
            "characters": character_payloads,
            "user_voices": user_voices,
            "available": available,
        }

    def create_voice(
        self,
        *,
        context: ProjectContext,
        account_username: str,
        name: str,
        filename: str | None,
        content: bytes,
        mime_type: str,
    ) -> Mapping[str, Any]:
        voice = self._user_voice_creator(
            username=account_username,
            name=name,
            filename=filename,
            content=content,
            mime_type=mime_type,
        )
        return self._attach_user_voice_media_urls(context.project_id, [dict(voice)])[0]

    def resolve_voice(
        self,
        *,
        account_username: str,
        voice_id: str,
    ) -> Path:
        resolved = self._user_voice_resolver(account_username, voice_id)
        return Path(resolved.audio_path)

    def _reference_payload(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        scope: str,
        label: str,
        path: str,
        sha256: str = "",
        updated_at: str = "",
        character_name: str = "",
        identity_id: str = "",
        identity_name: str = "",
        slot: str = "",
        age_group: str = "",
    ) -> dict[str, Any]:
        stored_path = str(path or "").strip()
        candidate = Path(stored_path)
        if stored_path and not candidate.is_absolute():
            candidate = project_dir / candidate

        url = ""
        if stored_path and candidate.exists():
            project_root = project_dir.resolve()
            resolved_candidate = candidate.resolve()
            try:
                relative_path = resolved_candidate.relative_to(project_root).as_posix()
            except ValueError:
                pass
            else:
                url = self._static_url_builder(
                    context,
                    relative_path,
                    resolved_candidate,
                )

        return {
            "scope": scope,
            "label": label,
            "path": stored_path,
            "url": url,
            "exists": bool(url),
            "sha256": str(sha256 or ""),
            "updated_at": str(updated_at or ""),
            "character_name": character_name,
            "identity_id": identity_id,
            "identity_name": identity_name,
            "slot": slot,
            "age_group": age_group,
        }

    @staticmethod
    def _voice_media_url(project_id: str, voice_id: str) -> str:
        safe_project_id = str(project_id or "").strip()
        safe_voice_id = str(voice_id or "").strip()
        return (
            f"/api/v1/projects/{safe_project_id}/freezone/audio/voices/"
            f"{safe_voice_id}/media"
        )

    @classmethod
    def _attach_user_voice_media_urls(
        cls,
        project_id: str,
        voices: list[dict],
    ) -> list[dict]:
        payloads: list[dict] = []
        for item in voices:
            voice = dict(item)
            voice_id = str(voice.get("voice_id") or "").strip()
            voice["url"] = (
                cls._voice_media_url(project_id, voice_id)
                if voice_id and voice.get("exists")
                else ""
            )
            payloads.append(voice)
        return payloads

    def _character_audio_refs(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        character: Any,
    ) -> dict[str, Any]:
        character_name = str(getattr(character, "name", "") or "")
        voices = [
            self._reference_payload(
                context=context,
                project_dir=project_dir,
                scope="character_default",
                label=f"{character_name} · 默认声线",
                path=str(getattr(character, "reference_audio_path", "") or ""),
                sha256=str(getattr(character, "reference_audio_sha256", "") or ""),
                updated_at=str(
                    getattr(character, "reference_audio_updated_at", "") or ""
                ),
                character_name=character_name,
                slot="default",
                age_group=str(getattr(character, "age_group", "") or ""),
            )
        ]

        samples = getattr(character, "voice_samples_by_age_group", None) or {}
        if isinstance(samples, dict):
            for slot, slot_label in CREATIVE_CANVAS_AUDIO_AGE_GROUP_LABELS.items():
                entry = samples.get(slot)
                if not isinstance(entry, dict):
                    entry = {}
                voices.append(
                    self._reference_payload(
                        context=context,
                        project_dir=project_dir,
                        scope="character_age_group",
                        label=f"{character_name} · {slot_label}声线",
                        path=str(entry.get("path", "") or ""),
                        sha256=str(entry.get("sha256", "") or ""),
                        updated_at=str(entry.get("updated_at", "") or ""),
                        character_name=character_name,
                        slot=slot,
                        age_group=slot,
                    )
                )

        identities = []
        for identity in list(getattr(character, "identities", None) or []):
            identity_id = str(getattr(identity, "identity_id", "") or "")
            identity_name = str(getattr(identity, "identity_name", "") or "")
            age_group = str(getattr(identity, "age_group", "") or "")
            direct = self._reference_payload(
                context=context,
                project_dir=project_dir,
                scope="identity",
                label=f"{character_name} · {identity_name or identity_id}声线",
                path=str(getattr(identity, "reference_audio_path", "") or ""),
                sha256=str(getattr(identity, "reference_audio_sha256", "") or ""),
                updated_at=str(
                    getattr(identity, "reference_audio_updated_at", "") or ""
                ),
                character_name=character_name,
                identity_id=identity_id,
                identity_name=identity_name,
                age_group=age_group,
            )
            resolved = self._character_voice_resolver(
                project_dir=project_dir,
                character=character,
                identity=identity,
            )
            resolved_path = ""
            if resolved.audio_path is not None:
                try:
                    resolved_path = (
                        Path(resolved.audio_path).relative_to(project_dir).as_posix()
                    )
                except ValueError:
                    resolved_path = str(resolved.audio_path)
            direct["resolved"] = (
                self._reference_payload(
                    context=context,
                    project_dir=project_dir,
                    scope="identity_resolved",
                    label=f"{character_name} · {identity_name or identity_id}实际声线",
                    path=resolved_path,
                    sha256=resolved.sha256,
                    character_name=character_name,
                    identity_id=identity_id,
                    identity_name=identity_name,
                    slot=resolved.tier or "",
                    age_group=age_group,
                )
                if resolved.audio_path is not None
                else None
            )
            identities.append(direct)

        available_count = sum(1 for item in voices if item["exists"])
        for item in identities:
            if item["exists"]:
                available_count += 1
            resolved = item.get("resolved")
            if isinstance(resolved, dict) and resolved.get("exists"):
                available_count += 1

        return {
            "character_name": character_name,
            "is_main": bool(getattr(character, "is_main", False)),
            "age_group": str(getattr(character, "age_group", "") or ""),
            "voices": voices,
            "identities": identities,
            "available_count": available_count,
        }


__all__ = ["LocalCreativeCanvasAudioLibraryGateway"]
