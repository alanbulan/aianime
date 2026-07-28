from ai_anime.modules.asset_world.application.character_models import (
    CharacterIdentity,
    NovelCharacter,
)


def _identity(identity_name: str = "默认") -> CharacterIdentity:
    return CharacterIdentity(
        identity_id=f"谢铮_{identity_name}",
        character_name="谢铮",
        identity_name=identity_name,
    )


def test_character_identity_reference_lists_are_isolated() -> None:
    first = _identity("皇帝")
    second = _identity("和尚")

    first.reference_images.append("emperor.png")

    assert first.reference_images == ["emperor.png"]
    assert second.reference_images == []


def test_novel_character_identity_round_trip_uses_json_storage() -> None:
    character = NovelCharacter(name="谢铮")
    character.identities = [_identity("皇帝")]

    assert character.identities_json.startswith("[")
    assert [identity.model_dump() for identity in character.identities] == [
        _identity("皇帝").model_dump()
    ]
    assert character.get_identity("皇帝") is not None


def test_novel_character_accepts_voice_samples_dict_view() -> None:
    samples = {
        "youth": {
            "path": "assets/characters/谢铮/voice_sample.wav",
            "sha256": "abc123",
            "updated_at": "2026-07-29T00:00:00Z",
        }
    }

    character = NovelCharacter(
        name="谢铮",
        voice_samples_by_age_group=samples,
    )

    assert character.voice_samples_by_age_group == samples
