from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from ai_anime.modules.asset_world.application.character_voice import (
    CharacterVoiceUseCases,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterVoiceNotFound,
    InvalidCharacterVoiceInput,
    UnsupportedCharacterVoiceSlot,
)


class _Repository:
    def __init__(self, *characters: Any) -> None:
        self.characters = {character.name: character for character in characters}
        self.updates: list[tuple[str, dict[str, Any]]] = []

    def get_character(self, name: str) -> Any | None:
        return self.characters.get(name)

    async def update_character(self, name: str, **updates: Any) -> bool:
        self.updates.append((name, updates))
        character = self.characters[name]
        for key, value in updates.items():
            setattr(character, key, value)
        return True

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates: Any,
    ) -> bool:
        self.updates.append((identity_id, updates))
        character = self.characters[character_name]
        identity = next(
            item for item in character.identities if item.identity_id == identity_id
        )
        for key, value in updates.items():
            setattr(identity, key, value)
        return True


class _Upload:
    def __init__(self, content: bytes, filename: str = "voice.wav") -> None:
        self.content = content
        self.filename = filename
        self.read_count = 0

    async def read(self) -> bytes:
        self.read_count += 1
        return self.content


class _Files:
    def __init__(self) -> None:
        self.persist_result = ("voices/sample.wav", "sample-sha", "sample-time")
        self.trim_result = ("voices/trimmed.mp3", "trim-sha", "trim-time")
        self.persist_calls: list[dict[str, Any]] = []
        self.trim_calls: list[dict[str, Any]] = []
        self.clear_calls: list[dict[str, Any]] = []
        self.persist_identity_calls: list[dict[str, Any]] = []
        self.clear_identity_calls: list[dict[str, Any]] = []
        self.decode_error: ValueError | None = None
        self.persist_error: ValueError | None = None
        self.trim_error: ValueError | None = None

    def decode_recording(self, data_url: str) -> tuple[bytes, str]:
        if self.decode_error:
            raise self.decode_error
        return data_url.encode(), ".wav"

    def read_source(self, source_path: str | Path) -> tuple[bytes, str]:
        return b"library-voice", Path(source_path).name

    def persist(self, **kwargs: Any) -> tuple[str, str, str]:
        self.persist_calls.append(kwargs)
        if self.persist_error:
            raise self.persist_error
        return self.persist_result

    def trim(self, **kwargs: Any) -> tuple[str, str, str]:
        self.trim_calls.append(kwargs)
        if self.trim_error:
            raise self.trim_error
        return self.trim_result

    def clear(self, **kwargs: Any) -> bool:
        self.clear_calls.append(kwargs)
        return True

    def persist_identity(self, **kwargs: Any) -> tuple[str, str, str]:
        self.persist_identity_calls.append(kwargs)
        return "voices/identity.wav", "identity-sha", "identity-time"

    def clear_identity(self, **kwargs: Any) -> bool:
        self.clear_identity_calls.append(kwargs)
        return True


def _character(**overrides: Any) -> SimpleNamespace:
    values = {
        "name": "秦",
        "reference_audio_path": "voices/default.wav",
        "reference_audio_sha256": "default-sha",
        "reference_audio_updated_at": "default-time",
        "voice_samples_by_age_group": {},
        "identities": [],
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _media_url(path: str) -> str:
    return f"/media/{path}"


def test_decode_recording_delegates_to_file_adapter() -> None:
    result = CharacterVoiceUseCases(_Files()).decode_recording("recorded-voice")

    assert result == (b"recorded-voice", ".wav")


def test_decode_recording_maps_file_validation_error() -> None:
    files = _Files()
    files.decode_error = ValueError("录音数据无效")

    with pytest.raises(InvalidCharacterVoiceInput, match="录音数据无效"):
        CharacterVoiceUseCases(files).decode_recording("invalid-recording")


def test_list_samples_preserves_slot_order_and_default_inheritance() -> None:
    character = _character(
        voice_samples_by_age_group={
            "child": {
                "path": "voices/child.wav",
                "sha256": "child-sha",
                "updated_at": "child-time",
            }
        }
    )
    result = CharacterVoiceUseCases(_Files()).list_samples(
        repository=_Repository(character),
        character_name="秦",
        media_url=_media_url,
    )

    slots = {item["slot"]: item for item in result["slots"]}
    assert list(slots) == ["default", "child", "youth", "middle", "elder"]
    assert slots["default"]["url"] == "/media/voices/default.wav"
    assert slots["child"]["inherited_from_default"] is False
    assert slots["youth"]["inherited_from_default"] is True


def test_list_samples_exposes_identity_voice_resolution_order() -> None:
    identity = SimpleNamespace(
        identity_id="秦_少年",
        identity_name="少年",
        age_group="child",
        reference_audio_path="",
        reference_audio_sha256="",
        reference_audio_updated_at="",
    )
    character = _character(
        identities=[identity],
        voice_samples_by_age_group={
            "child": {
                "path": "voices/child.wav",
                "sha256": "child-sha",
                "updated_at": "child-time",
            }
        },
    )

    result = CharacterVoiceUseCases(_Files()).list_samples(
        repository=_Repository(character),
        character_name="秦",
        media_url=_media_url,
    )

    identity_voice = result["identities"][0]
    assert identity_voice["identity_id"] == "秦_少年"
    assert identity_voice["resolved_from"] == "age_group"
    assert identity_voice["resolved_path"] == "voices/child.wav"


@pytest.mark.asyncio
async def test_upload_rejects_missing_character_before_reading_file() -> None:
    upload = _Upload(b"voice")

    with pytest.raises(CharacterVoiceNotFound, match="Character '秦' not found"):
        await CharacterVoiceUseCases(_Files()).upload_sample(
            repository=_Repository(),
            project_dir=Path("project"),
            character_name="秦",
            slot="default",
            upload=upload,
            media_url=_media_url,
        )

    assert upload.read_count == 0


@pytest.mark.asyncio
async def test_upload_rejects_unknown_slot_before_reading_file() -> None:
    upload = _Upload(b"voice")

    with pytest.raises(UnsupportedCharacterVoiceSlot, match="Unsupported voice slot"):
        await CharacterVoiceUseCases(_Files()).upload_sample(
            repository=_Repository(_character()),
            project_dir=Path("project"),
            character_name="秦",
            slot="teen",
            upload=upload,
            media_url=_media_url,
        )

    assert upload.read_count == 0


@pytest.mark.asyncio
async def test_upload_updates_default_voice_metadata() -> None:
    character = _character(
        reference_audio_path="",
        reference_audio_sha256="",
        reference_audio_updated_at="",
    )
    repository = _Repository(character)
    files = _Files()
    upload = _Upload(b"voice-bytes")

    result = await CharacterVoiceUseCases(files).upload_sample(
        repository=repository,
        project_dir=Path("project"),
        character_name="秦",
        slot="default",
        upload=upload,
        media_url=_media_url,
    )

    assert result["url"] == "/media/voices/sample.wav"
    assert repository.updates == [
        (
            "秦",
            {
                "reference_audio_path": "voices/sample.wav",
                "reference_audio_sha256": "sample-sha",
                "reference_audio_updated_at": "sample-time",
            },
        )
    ]
    assert files.persist_calls[0]["content"] == b"voice-bytes"


@pytest.mark.asyncio
async def test_record_updates_only_requested_age_group_slot() -> None:
    character = _character(
        voice_samples_by_age_group={
            "child": {
                "path": "voices/child.wav",
                "sha256": "child-sha",
                "updated_at": "child-time",
            }
        }
    )
    repository = _Repository(character)
    files = _Files()
    files.persist_result = ("voices/youth.wav", "youth-sha", "youth-time")

    result = await CharacterVoiceUseCases(files).record_sample(
        repository=repository,
        project_dir=Path("project"),
        character_name="秦",
        slot="youth",
        data_url="data:audio/wav;base64,dm9pY2U=",
        media_url=_media_url,
    )

    samples = repository.updates[0][1]["voice_samples_by_age_group"]
    assert samples["child"]["sha256"] == "child-sha"
    assert samples["youth"]["sha256"] == "youth-sha"
    assert result["slot"] == "youth"


@pytest.mark.asyncio
async def test_trim_maps_file_validation_errors_to_application_error() -> None:
    files = _Files()
    files.trim_error = ValueError("裁剪时间参数无效")

    with pytest.raises(InvalidCharacterVoiceInput, match="裁剪时间参数无效"):
        await CharacterVoiceUseCases(files).trim_sample(
            repository=_Repository(_character()),
            project_dir=Path("project"),
            character_name="秦",
            slot="default",
            source_path="voices/default.wav",
            start_seconds=0,
            duration_seconds=4,
            media_url=_media_url,
        )


@pytest.mark.asyncio
async def test_delete_archives_file_and_removes_age_group_metadata() -> None:
    character = _character(
        voice_samples_by_age_group={
            "elder": {
                "path": "voices/elder.wav",
                "sha256": "elder-sha",
                "updated_at": "elder-time",
            }
        }
    )
    repository = _Repository(character)
    files = _Files()

    result = await CharacterVoiceUseCases(files).delete_sample(
        repository=repository,
        project_dir=Path("project"),
        character_name="秦",
        slot="elder",
        media_url=_media_url,
    )

    assert files.clear_calls == [
        {
            "project_dir": Path("project"),
            "character_name": "秦",
            "slot": "elder",
        }
    ]
    assert repository.updates == [("秦", {"voice_samples_by_age_group": {}})]
    assert result["path"] == ""


@pytest.mark.asyncio
async def test_bind_reusable_voice_to_slot() -> None:
    character = _character(reference_audio_path="")
    repository = _Repository(character)
    files = _Files()

    result = await CharacterVoiceUseCases(files).bind_sample(
        repository=repository,
        project_dir=Path("project"),
        character_name="秦",
        slot="default",
        source_path=Path("account/reference.wav"),
        media_url=_media_url,
    )

    assert files.persist_calls[0]["content"] == b"library-voice"
    assert result["path"] == "voices/sample.wav"


@pytest.mark.asyncio
async def test_bind_and_clear_identity_voice_restores_inheritance() -> None:
    identity = SimpleNamespace(
        identity_id="秦_老年",
        identity_name="老年",
        age_group="elder",
        reference_audio_path="",
        reference_audio_sha256="",
        reference_audio_updated_at="",
    )
    character = _character(identities=[identity])
    repository = _Repository(character)
    files = _Files()
    use_cases = CharacterVoiceUseCases(files)

    bound = await use_cases.bind_identity_sample(
        repository=repository,
        project_dir=Path("project"),
        character_name="秦",
        identity_id="秦_老年",
        source_path=Path("account/reference.wav"),
        media_url=_media_url,
    )
    assert bound["resolved_from"] == "identity"

    cleared = await use_cases.delete_identity_sample(
        repository=repository,
        project_dir=Path("project"),
        character_name="秦",
        identity_id="秦_老年",
        media_url=_media_url,
    )
    assert cleared["resolved_from"] == "character_default"
    assert files.clear_identity_calls[0]["identity_id"] == "秦_老年"
