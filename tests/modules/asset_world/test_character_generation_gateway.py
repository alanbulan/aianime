from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.dto import CharacterGenerationOptions
from ai_anime.modules.asset_world.infrastructure.character_generation import (
    UnifiedSynchronousCharacterGeneration,
)
from ai_anime.utils.path_resolver import (
    canonical_identity_costume_path,
    canonical_identity_path,
    canonical_identity_portrait_path,
    canonical_portrait_path,
)


@dataclass
class _Identity:
    identity_id: str = "秦_少年"
    identity_name: str = "少年/战损"
    appearance_details: str = "青衣佩剑"
    face_prompt: str = "清秀少年面容"
    age_group: str = "child"
    character_tag: str = "[Qin]"
    costume_image: str = ""
    portrait_image: str = ""


@dataclass
class _Character:
    name: str = "秦"
    face_prompt: str = "角色面容"
    age_group: str = "youth"


def _options() -> CharacterGenerationOptions:
    return CharacterGenerationOptions(
        style="period-drama",
        ethnicity="Chinese",
        model="image-model",
    )


@pytest.mark.asyncio
async def test_character_portrait_uses_canonical_path_and_preserves_old_content(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    character = _Character()
    target = canonical_portrait_path(tmp_path, character.name)
    target.parent.mkdir(parents=True)
    target.write_bytes(b"old-portrait")
    generated = tmp_path / "generated.png"
    generated.write_bytes(b"new-portrait")
    captured: dict = {}

    async def fake_generate(**kwargs):
        captured.update(kwargs)
        return [str(generated)]

    from ai_anime.generators import image_generator

    monkeypatch.setattr(
        image_generator,
        "generate_character_reference_unified",
        fake_generate,
    )

    result = await UnifiedSynchronousCharacterGeneration().generate_character_portrait(
        character=character,
        project_dir=tmp_path,
        output_dir=tmp_path / "output",
        options=_options(),
    )

    assert result == target
    assert target.read_bytes() == b"new-portrait"
    backups = list(target.parent.glob("portrait_*.png"))
    assert len(backups) == 1
    assert re.fullmatch(r"portrait_\d{14}\.png", backups[0].name)
    assert backups[0].read_bytes() == b"old-portrait"
    assert captured == {
        "character_name": "秦",
        "appearance_prompt": "角色面容",
        "style": "period-drama",
        "ethnicity": "Chinese",
        "model": "image-model",
        "output_dir": tmp_path / "output",
        "project_dir": str(tmp_path),
    }


@pytest.mark.asyncio
async def test_identity_portrait_uses_canonical_path_and_removes_temp_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    character = _Character()
    identity = _Identity()
    target = canonical_identity_portrait_path(
        tmp_path,
        character.name,
        identity.identity_name,
    )
    target.parent.mkdir(parents=True)
    target.write_bytes(b"old-portrait")
    captured: dict = {}
    temp_dir: Path | None = None

    async def fake_generate(**kwargs):
        nonlocal temp_dir
        captured.update(kwargs)
        temp_dir = Path(kwargs["output_dir"])
        generated = temp_dir / "generated.png"
        generated.write_bytes(b"new-portrait")
        return [str(generated)]

    import ai_anime.generators as generators

    monkeypatch.setattr(
        generators,
        "generate_character_reference_unified",
        fake_generate,
    )

    result = await UnifiedSynchronousCharacterGeneration().generate_identity_portrait(
        character=character,
        identity=identity,
        project_dir=tmp_path,
        options=_options(),
    )

    assert result == target
    assert target.read_bytes() == b"new-portrait"
    assert temp_dir is not None and not temp_dir.exists()
    backups = list(target.parent.glob("秦_少年_战损_portrait_*.png"))
    assert len(backups) == 1
    assert re.fullmatch(r"秦_少年_战损_portrait_\d{14}\.png", backups[0].name)
    assert backups[0].read_bytes() == b"old-portrait"
    assert captured["appearance_prompt"] == "清秀少年面容"
    assert captured["usage_scope"] == "character:秦:identity_portrait:少年/战损"
    assert captured["identity_name"] == "少年/战损"


@pytest.mark.asyncio
async def test_identity_portrait_removes_temp_directory_when_generator_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    temp_dir: Path | None = None

    async def fake_generate(**kwargs):
        nonlocal temp_dir
        temp_dir = Path(kwargs["output_dir"])
        raise RuntimeError("provider failed")

    import ai_anime.generators as generators

    monkeypatch.setattr(
        generators,
        "generate_character_reference_unified",
        fake_generate,
    )

    with pytest.raises(RuntimeError, match="provider failed"):
        await UnifiedSynchronousCharacterGeneration().generate_identity_portrait(
            character=_Character(),
            identity=_Identity(),
            project_dir=tmp_path,
            options=_options(),
        )

    assert temp_dir is not None and not temp_dir.exists()


def test_identity_assets_resolve_canonical_files_and_legacy_fields(
    tmp_path: Path,
) -> None:
    character = _Character()
    identity = _Identity(
        costume_image=str(tmp_path / "legacy-costume.png"),
        portrait_image=str(tmp_path / "legacy-portrait.png"),
    )
    portrait = canonical_portrait_path(tmp_path, character.name)
    costume = canonical_identity_costume_path(
        tmp_path,
        character.name,
        identity.identity_name,
    )
    identity_portrait = canonical_identity_portrait_path(
        tmp_path,
        character.name,
        identity.identity_name,
    )
    for path in (portrait, costume, identity_portrait):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"image")

    assets = UnifiedSynchronousCharacterGeneration().resolve_identity_assets(
        character=character,
        identity=identity,
        project_dir=tmp_path,
    )

    assert assets.character_portrait == str(portrait)
    assert assets.costume_image == str(costume)
    assert assets.identity_portrait == str(identity_portrait)
    assert assets.has_costume_image is True
    assert assets.has_identity_portrait is True


@pytest.mark.asyncio
async def test_identity_image_prepares_canonical_output_and_passes_generator_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    character = _Character()
    identity = _Identity()
    gateway = UnifiedSynchronousCharacterGeneration()
    target = canonical_identity_path(
        tmp_path,
        character.name,
        identity.identity_name,
    )
    target.parent.mkdir(parents=True)
    target.write_bytes(b"old-identity")
    captured: dict = {}

    async def fake_generate(**kwargs):
        captured.update(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"new-identity")
        return {"success": True}

    from ai_anime.generators import image_generator

    monkeypatch.setattr(
        image_generator,
        "generate_identity_image_unified",
        fake_generate,
    )

    output = gateway.prepare_identity_image_output(
        character=character,
        identity=identity,
        project_dir=tmp_path,
    )
    result = await gateway.generate_identity_image(
        character=character,
        identity=identity,
        project_dir=tmp_path,
        output_path=output,
        identity_prompt="清秀少年面容\n青衣佩剑",
        reference_image_path=str(tmp_path / "identity_portrait.png"),
        costume_image_path=str(tmp_path / "costume.png"),
        options=_options(),
        usage_scope="character:秦:identity:少年/战损",
    )

    assert output == target
    assert result == {"success": True}
    assert target.read_bytes() == b"new-identity"
    backups = list(target.parent.glob("少年_战损_*.png"))
    assert len(backups) == 1
    assert re.fullmatch(r"少年_战损_\d{14}\.png", backups[0].name)
    assert backups[0].read_bytes() == b"old-identity"
    assert captured == {
        "character_name": "秦",
        "identity_prompt": "清秀少年面容\n青衣佩剑",
        "reference_image_path": str(tmp_path / "identity_portrait.png"),
        "output_path": str(target),
        "character_tag": "[Qin]",
        "ethnicity": "Chinese",
        "style": "period-drama",
        "model": "image-model",
        "project_dir": str(tmp_path),
        "costume_image_path": str(tmp_path / "costume.png"),
        "usage_task_type": "identity_image",
        "usage_scope": "character:秦:identity:少年/战损",
        "identity_name": "少年/战损",
    }
